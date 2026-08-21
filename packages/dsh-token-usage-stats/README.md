# @lmber/dsh-token-usage-stats

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 token 用量统计的第三方插件：自动记录每次模型调用的 token 消耗，并在设置页提供独立的查看界面。

安装不需要改动 DSH 源码，配置持久保存在 `$DSH_HOME`，重启后继续生效。

## 功能

- 每次模型调用自动追加一条记录到 JSONL 账本
- 设置页内独立的「Token 使用统计」面板
- 按今日 / 本周 / 本月 / 全部筛选，也支持自定义日期范围
- SVG 柱状图展示消耗趋势：按天 / 按月切换；悬停柱子弹出精确数值
- MVP 饼图展示模型用量占比 Top 10 + 其余模型合并，颜色取自主题调色板
- 大数字自动换算单位（`k / M / B / T`），卡片、表格、图例、悬停提示统一缩写
- 每行提供商 / 模型统计表带彩色色块，卡片与表格均随 DSH 明暗主题换色
- 进入面板时拉取一次，需要更新时手动点「刷新」

## 安装

```sh
dsh plugin --profile web add @lmber/dsh-token-usage-stats
```

然后重启 DSH。插件自带自挂载配置（`dsh.bundle.patch`），装上即生效，不需要手写任何 cordis 配置。

打开设置，左侧应出现「Token 使用统计」一栏。

## 卸载

```sh
dsh plugin --profile web remove @lmber/dsh-token-usage-stats
```

重启后插件及其设置页消失。账本文件会保留，需要的话手动删除。

## 账本位置

默认写入 `$DSH_HOME/token-usage-ledger.jsonl`（`DSH_HOME` 未设置时为 `~/.dsh`）。

要换个位置，在 profile 的 `cordis.patch.yml` 里覆盖 `config`：

```yaml
- id: token-usage-stats
  config:
    ledgerPath: /path/to/token-usage-ledger.jsonl
```

## 数据格式

每行一条 JSON 记录：

```json
{
  "type": "model-call",
  "ts": 1787102662243,
  "iso": "2026-08-19T01:24:22.243Z",
  "sessionId": "session-xxx",
  "provider": "deepseek-official",
  "model": "deepseek-chat",
  "inputTokens": 1000,
  "outputTokens": 500,
  "cacheReadTokens": 0,
  "cacheWriteTokens": 0,
  "reasoningTokens": 0,
  "totalTokens": 1500
}
```

`totalTokens` 是计费 token 总量：`inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens`。这四项互不重叠，其中 `inputTokens` 只含未命中缓存的输入。`reasoningTokens` 已包含在 `outputTokens` 内，单独记录供参考，不重复计入总量。

账本是纯 JSONL，可以直接用其他工具分析：

```sh
# 总调用次数
wc -l < ~/.dsh/token-usage-ledger.jsonl
```

## HTTP 接口

主机端注册了一个只读路由，浏览器界面通过它取数据，也可以自己调用：

```
GET /api/token-usage-stats?range=day|week|month|all
GET /api/token-usage-stats?from=YYYY-MM-DD&to=YYYY-MM-DD
```

`from`/`to` 按本地时区解析，含首尾两天，两者都可省略。返回聚合后的 JSON，非法参数返回 400。

柱状图的数据来自分桶时间序列接口：

```
GET /api/token-usage-stats/series?granularity=day|hour|month&limit=N
```

- `granularity`：默认 `day`。`hour` 把每个本地日按 0..23 时切桶；`day` 每天一桶；`month` 每月一桶。
- `limit`：可选正整数，只返回最新 N 桶（按时间戳降序），超出部分丢弃。卡片默认请求 `day`/`month` 各 14。
- 响应 `{granularity, buckets}`，每个桶 `{key, ts, tokens, calls}`，桶窗口按本地日历对齐。
- 非法 `granularity` 或非法 `limit` 返回 400。

该路由绑定在 DSH web 服务器上，跟随其监听地址（默认仅本机 `127.0.0.1`）。它没有独立鉴权，与 DSH web 界面本身共享同一信任范围 —— 如果把 DSH 暴露到非本机地址，这份用量数据同样会被暴露。

## 兼容性

依赖 DSH 的 `session/event` 事件流、`webServer` 服务和 `settings.section` 插槽。DSH 尚未正式发版，这些接口仍可能变动；插件在这些接口变更后可能需要同步更新。

`webServer` 服务缺失时（例如 headless profile）只记录账本，不注册 HTTP 路由。

## 已知限制

- 统计基于插件安装后产生的记录，装之前的历史调用无法追溯。
- 账本只追加不轮转，长期使用会持续增长，需要时自行归档。
- 面板不自动刷新，需手动点「刷新」。
- 账本目前约 7 天历史：按月粒度只会得到 1 根柱子；按周列表则显示最近 14 天逐日柱子，周内无跨周合并。

## License

MIT
