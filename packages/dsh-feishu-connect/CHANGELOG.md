# Changelog

## [1.7.1] - 2025-XX-XX

修复两个会话持久化问题：工作区归属（会话掉进「未分组」）与重启后无法回到上个会话。

### Fixed
- **会话掉进「未分组」**：机器人创建/恢复的 Agent 会话从未挂到工作区注册表，即使 cwd 与配置的
  workspace 一致，GUI 仍把它归入「未分组」。现在新建会话、恢复会话都会
  `workspaceRegistry.attachSession` 挂到配置工作区；旧版本遗留的会话在 `ensureChat` 恢复时也会
  补挂（幂等，失败只记日志，不影响消息处理）。
- **重启后无法回到上次的会话、/list 只剩新会话**：两条根因都修了——
  1. 会话已 live（例如用户在 GUI 里打开过它，或上一次投递已恢复它）时，`agents.resume` 会以
     `cannot prepare session ... while it is live` 拒绝，原来直接吞掉异常并新建会话；现在先
     `agents.get()` 复用 live 会话。
  2. 自动创建路径原来用 `chat.sessions = [{ ... }]` **整体替换**会话列表，任何一次恢复失败都会
     清空该聊天的全部历史会话。现在保留旧列表：只有不可恢复的 legacy `main` 占位符被原位替换，
     其余会话保留，/list、/switch 仍可回到旧会话。
- 恢复失败日志带上完整 stack，便于定位。

## [1.7.0] - 2025-01-XX

修复「同一聊天后续消息的回复失败」：订阅器在每条消息后注销，只存活于当前 turn。

### Fixed
- **同一聊天后续消息的回复失败**：1.6.0 的订阅器在 `handleFeishuMessage` 成功处理后注销
  （`finally { offEvent() }`），导致同一 dedicated session 里后续消息没有 observer，回复
  无法投递到飞书。现在改为 per-bot 常驻 observer（`ensureChatDelivery`），通过
  `bot.chats` 映射 session -> chatId，持续为所有使用该 bot 的聊天服务。
- **处理中表情时序与投递解耦**：表情只在 `agent.whenIdle()` 完成后撤销，不再依赖
  「segment 投递完成」这一逻辑，避免表情卡住或提前消失。

### Changed
- 移除 `handleFeishuMessage` 里的 per-message `ctx.on('session/event')` 与
  `chain` / `delivered` 计数，统一由 per-bot observer 按段投递。

## [1.6.0] - 2025-01-XX

实时交错投递：每段文字产生时立即发送，而非等 turn 结束。

### Fixed
- **时序错误**：1.5.0 收集所有文字段后在 turn 结束时一次性拼接发送，但媒体在工具执行时就已经
  走了，所以飞书总是先收到所有附件、再收到一条合并的文字气泡（实际顺序是「文本1 → 图片 →
  文本2 → 视频 → 文本3」，用户看到的却是「图片、视频、然后所有文字」）。
- 现在用 `session/event` 观察器在每个 `assistant/message` 产生时立即投递它的文字，保持与
  工具调用（包括媒体发送）的真实交错顺序。

### Changed
- 投递日志改为每段一行 `segment N to <chatId> (msg <messageId>): status=200`，末尾汇总
  `nothing to deliver` 或段数。
- `collectTurn` 删除，改为 `deliverableText(message, chatId)` 按单条 `assistant/message`
  判断该段文字是否可投递（排除 `NO_REPLY` 和同会话 `feishu_send` 已原样发过的那一段）。

## [1.5.0] - 2025-01-XX

投递规则改为「会话里说的每一句都送到飞书」，不再由桥接判断该不该吞。

### Fixed
- **一个 turn 里的多段文字只送出最后一段**：`collectTurn` 用 `reply = text` 覆盖，
  而用了工具的 turn 会产生多个 `assistant/message`（调用前说一句、结果出来再说一句）。
  发图片和视频时正好总是这个形态，所以中间的说明被丢掉 —— 这是「有些消息被吞掉」的
  直接原因。现在收集整个 turn 的所有文字段并用空行拼接投递。
- **发媒体不再影响文字投递**：`feishu_send_media` 只负责附件，文字照常送达。

### Changed
- 抑制范围收窄到「同会话 `feishu_send` 已经原样发过的那一段」和 `NO_REPLY` 哨兵本身，
  按段丢弃而不是丢掉整个 turn。同一 turn 里的其他句子不受影响。
- 提示词相应改写：去掉「发完媒体可以回 NO_REPLY」的引导（该引导会让模型主动丢弃说明），
  改为「你说的话都会送达，发不发媒体都一样，照常写」。
- 投递日志附带段数，例如 `status=200 (3 segment(s))`。

## [1.4.4] - 2025-01-XX

### Fixed
- **修复 1.4.3 引入的回归**：`feishu_send_media` 发送附件后，随附的文字说明被吞掉。
  1.4.3 的抑制逻辑只要看到任一 feishu 工具就吞掉文本，但 `feishu_send_media` 投递的
  是附件，文字说明本该与附件共存。现在只有**同会话的 `feishu_send`** 才抑制（它投递
  的是文本，会与自动回复重复）；`feishu_send_media` 和发往其他会话的 `feishu_send` 都
  不再抑制。
- **会话标题变成"错误会话"或截断 openId**：桥接把 `[飞书 ou_...]` 放在消息开头，而
  会话标题从第一条 user/message 的开头几个词截取，结果标题吃掉的是前缀而不是实际请求。
  现在把发送者标记移到消息末尾 `(via Feishu, sender ou_...)`，标题恢复正常。

### Changed
- 抑制原因日志改为 `text already sent by feishu_send`（明确是文本重复，而非所有工具）。

## [1.4.3] - 2025-01-XX

### Fixed
- **投递约定提示词此前从未真正注入**：1.4.1/1.4.2 把注入写在 `setup` 的早期返回之后。
  主会话（`feishu-main-*`）的 `mainAgent` 为 `undefined`，`resumeDedicated` 的
  `if (!mainAgent) return` 直接跳过了注入；`createDedicated` 的 `if (!presets) return`
  同理。注入现在是两个 `setup` 的第一步，与 preset 组合结果无关。
- **抑制检测补上 `tool/call` 事件**：`tool/call` 是独立的 session 事件，`assistant/message`
  里的 `tool-call` block 只是同一次调用的另一处记录。只读后者时，在两者之间被中断的
  turn 会漏判为"未投递"并重复发送。两处现在都读。
- 提示词改写为明确的投递约定：final reply 会被自动送达，`feishu_send` 仅用于发往
  **其他**会话，`feishu_send_media` 用于附件（附件无法走 reply text）。

### Changed
- 抑制日志改为单行并说明具体原因（1.4.4 进一步改进）；移除 1.4.2 的逐事件调试输出。

## [1.4.2] - 2025-01-XX

### Changed
- 加入逐事件调试日志用于定位双重回复（已在 1.4.3 收敛）。

## [1.4.1] - 2025-01-XX

### Fixed
- 尝试在系统提示词中注入飞书工具使用指南（注入位置有误，实际未生效，见 1.4.3）。
- 保留 1.4.0 的桥接检测逻辑作为双保险（防御性编程）。

## [1.4.0] - 2025-01-XX

### Added
- **新工具 `feishu_send_media`**：支持发送本地图片、视频、音频和文件到飞书
  - 图片（`.png`/`.jpg`/`.webp`/`.gif`）渲染为内嵌图片
  - 视频（`.mp4`/`.mov`/`.webm`/`.mkv`）渲染为视频播放器
  - 音频（`.ogg`/`.opus`/`.mp3`/`.m4a`）渲染为语音气泡
  - 其他文件类型渲染为文件下载卡片
  - 支持批量发送多个文件
  - 可通过 `kind` 参数强制指定渲染类型

### Fixed
- **添加双重回复检测**（桥接层防御）：当 Agent 使用 `feishu_send` 或 `feishu_send_media` 工具主动发送消息后，桥接不再自动发送最终文本回复
  - 检测到工具调用后自动抑制桥接的自动回复
  - 支持 cc-connect 的 `NO_REPLY` 约定

### Changed
- 重构媒体上传逻辑，使用飞书官方 API（`/im/v1/images` 和 `/im/v1/files`）
- 添加入站媒体下载基础设施（为未来支持接收图片/文件做准备）

## [1.3.1] - 2024-XX-XX
- 初始稳定版本
- 支持多机器人、命令、会话管理、处理中表情
- 提供设置页 UI 和扫码创建功能
- `feishu_send` 工具
