# Changelog

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
- 抑制日志改为单行并说明具体原因（`delivered by feishu_send_media` / `NO_REPLY sentinel` /
  `no text reply`）；移除 1.4.2 的逐事件调试输出（一个 turn 会打印 40+ 行 `assistant/chunk`）。

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
