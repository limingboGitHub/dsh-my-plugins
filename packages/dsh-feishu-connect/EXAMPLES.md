# 使用示例

## 基础文本消息

最简单的用法，Agent 收到飞书消息后自动回复：

```
用户（飞书）: 你好
Agent: 你好！有什么可以帮助你的吗？
```

## 主动发送文本

Agent 可以主动通过工具发送消息：

```javascript
// 在 Agent 的回复中
feishu_send({ text: "任务已完成，结果如下：..." })
```

当 Agent 使用了 `feishu_send`，桥接会自动抑制最终文本的自动发送，避免双重回复。

## 发送图片

生成图表后发送给用户：

```javascript
// Agent 生成了一个图表文件
const chartPath = "/workspace/output/chart.png"
feishu_send_media({ paths: [chartPath] })
```

飞书会将 `.png`/`.jpg`/`.webp`/`.gif` 渲染为内嵌图片。

## 发送视频

处理完视频后发送：

```javascript
feishu_send_media({ paths: ["/workspace/demo.mp4"] })
```

飞书会渲染为视频播放器（支持 `.mp4`/`.mov`/`.webm`/`.mkv`）。

## 发送语音

生成语音消息：

```javascript
feishu_send_media({ paths: ["/workspace/voice.opus"] })
```

飞书会渲染为语音气泡（支持 `.ogg`/`.opus`/`.mp3`/`.m4a`）。

## 批量发送多个文件

一次发送报告和图表：

```javascript
feishu_send_media({ 
  paths: [
    "/workspace/report.pdf",
    "/workspace/chart1.png",
    "/workspace/chart2.png"
  ]
})
```

## 强制指定类型

有时文件扩展名不准确，可以强制指定渲染类型：

```javascript
// 把 .webm 强制当作视频发送
feishu_send_media({ 
  paths: ["/workspace/clip.webm"], 
  kind: "video" 
})
```

可选的 `kind` 值：`"image"` | `"video"` | `"audio"` | `"file"`

## 指定机器人或会话

当有多个机器人时，可以指定使用哪个：

```javascript
feishu_send({ 
  text: "消息内容",
  appId: "cli_a1b2c3d4e5f6g7h8"  // 指定机器人
})

feishu_send({ 
  text: "消息内容",
  chatId: "oc_abc123def456"      // 指定聊天 ID
})
```

## 典型工作流示例

### 数据分析 + 可视化

```
用户: 分析一下今天的销售数据
Agent: 
  1. 读取数据文件
  2. 进行统计分析
  3. 生成可视化图表
  4. 调用 feishu_send_media 发送图表
  5. （桥接自动抑制文本回复，因为已经通过工具发送了结果）
```

### 多步任务进度通知

```
用户: 处理这批文件
Agent:
  1. feishu_send({ text: "开始处理..." })
  2. 处理文件...
  3. feishu_send({ text: "已完成 50%..." })
  4. 继续处理...
  5. feishu_send_media({ paths: ["/workspace/result.zip"] })
  6. return "NO_REPLY"  // 显式抑制最终回复
```

### 定时任务结果推送

配合 DSH 的定时任务功能：

```
# Agent 设置定时任务
/timer 1h "检查服务器状态"

# 1小时后触发
Agent:
  1. 检查服务器
  2. 生成状态报告
  3. feishu_send({ text: "服务器状态报告：..." })
```

## 注意事项

1. **路径必须是绝对路径**：`feishu_send_media` 需要完整的文件路径
2. **文件必须存在**：发送前确保文件已生成
3. **文件大小限制**：飞书对单个文件有大小限制（通常图片 10MB，文件 50MB）
4. **自动抑制回复**：使用工具发送后，无需再返回文本（会被自动抑制）
5. **NO_REPLY 约定**：如果需要显式抑制回复，返回 `NO_REPLY` 字符串

## 权限要求

确保飞书机器人有以下权限：
- `im:message:send_as_bot`（发送消息）
- `im:resource:write`（上传图片/文件）
- `im:message.reaction`（可选，显示处理中表情）
