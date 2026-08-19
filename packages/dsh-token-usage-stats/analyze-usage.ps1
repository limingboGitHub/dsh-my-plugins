# Token Usage Statistics - Quick Analysis Script
# 快速分析 token 使用统计的 PowerShell 脚本

param(
    # The ledger lives in the DSH home directory, matching lib/index.js.
    [string]$LedgerPath = $(if ($env:DSH_HOME) { Join-Path $env:DSH_HOME 'token-usage-ledger.jsonl' }
                           else { Join-Path $env:USERPROFILE '.dsh\token-usage-ledger.jsonl' })
)

if (-not (Test-Path $LedgerPath)) {
    Write-Host "❌ 账本文件不存在: $LedgerPath" -ForegroundColor Red
    Write-Host "请先运行 DSH 并进行一些对话以生成记录。" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n📊 Token Usage Statistics Report" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# 读取所有记录
$records = Get-Content $LedgerPath | ForEach-Object {
    try { $_ | ConvertFrom-Json } catch { $null }
} | Where-Object { $_ -ne $null }

if ($records.Count -eq 0) {
    Write-Host "`n⚠️  没有找到有效记录" -ForegroundColor Yellow
    exit 0
}

# 总体统计
Write-Host "`n📈 总体统计" -ForegroundColor Green
Write-Host ("-" * 60)
$totalCalls = $records.Count
$totalTokens = ($records | Measure-Object -Property totalTokens -Sum).Sum
$totalInput = ($records | Measure-Object -Property inputTokens -Sum).Sum
$totalOutput = ($records | Measure-Object -Property outputTokens -Sum).Sum
$totalCacheRead = ($records | Measure-Object -Property cacheReadTokens -Sum).Sum
$totalCacheWrite = ($records | Measure-Object -Property cacheWriteTokens -Sum).Sum

Write-Host "总调用次数:      " -NoNewline; Write-Host $totalCalls.ToString("N0") -ForegroundColor White
Write-Host "总 Token 数:     " -NoNewline; Write-Host $totalTokens.ToString("N0") -ForegroundColor White
Write-Host "  - Input:       " -NoNewline; Write-Host $totalInput.ToString("N0") -ForegroundColor Gray
Write-Host "  - Output:      " -NoNewline; Write-Host $totalOutput.ToString("N0") -ForegroundColor Gray
Write-Host "  - Cache Read:  " -NoNewline; Write-Host $totalCacheRead.ToString("N0") -ForegroundColor Gray
Write-Host "  - Cache Write: " -NoNewline; Write-Host $totalCacheWrite.ToString("N0") -ForegroundColor Gray

# 按 Provider 统计
Write-Host "`n🔌 按 Provider 统计" -ForegroundColor Green
Write-Host ("-" * 60)
$byProvider = $records | Group-Object provider | ForEach-Object {
    [PSCustomObject]@{
        Provider = $_.Name
        Calls = $_.Count
        TotalTokens = ($_.Group | Measure-Object -Property totalTokens -Sum).Sum
        AvgTokens = [math]::Round(($_.Group | Measure-Object -Property totalTokens -Average).Average, 0)
    }
} | Sort-Object TotalTokens -Descending

$byProvider | Format-Table -AutoSize

# 按 Model 统计
Write-Host "🤖 按 Model 统计" -ForegroundColor Green
Write-Host ("-" * 60)
$byModel = $records | ForEach-Object {
    [PSCustomObject]@{
        Model = "$($_.provider)/$($_.model)"
        Tokens = $_.totalTokens
    }
} | Group-Object Model | ForEach-Object {
    [PSCustomObject]@{
        Model = $_.Name
        Calls = $_.Count
        TotalTokens = ($_.Group | Measure-Object -Property Tokens -Sum).Sum
        AvgTokens = [math]::Round(($_.Group | Measure-Object -Property Tokens -Average).Average, 0)
    }
} | Sort-Object TotalTokens -Descending

$byModel | Format-Table -AutoSize

# 时间范围
Write-Host "📅 时间范围" -ForegroundColor Green
Write-Host ("-" * 60)
$firstRecord = $records | Sort-Object ts | Select-Object -First 1
$lastRecord = $records | Sort-Object ts | Select-Object -Last 1
Write-Host "首次记录: " -NoNewline; Write-Host $firstRecord.iso -ForegroundColor White
Write-Host "最新记录: " -NoNewline; Write-Host $lastRecord.iso -ForegroundColor White

# 最近 5 次调用
Write-Host "`n🕐 最近 5 次调用" -ForegroundColor Green
Write-Host ("-" * 60)
$records | Sort-Object ts -Descending | Select-Object -First 5 | ForEach-Object {
    $time = ([DateTime]$_.iso).ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "$time | " -NoNewline -ForegroundColor Gray
    Write-Host "$($_.provider)/$($_.model) | " -NoNewline -ForegroundColor Cyan
    Write-Host "$($_.totalTokens.ToString('N0')) tokens" -ForegroundColor White
}

Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "✅ 分析完成！账本文件: $LedgerPath" -ForegroundColor Green
Write-Host ""
