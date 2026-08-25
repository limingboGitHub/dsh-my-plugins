# @deepseek-ai/dsh-asr-gateway

[English](README.md) | 中文

面向浏览器客户端暴露语音识别能力的 Remote-only Host 服务。`AsrGateway` 注册 `asr` Remote 命名空间，并发布一个生成的直接 Remote：`asr/transcribe`。浏览器负责录音与编码，识别在 Host 侧执行——provider 的 API key 不能下发到浏览器，且 provider 源站不为浏览器提供跨域请求。

网关自身不含识别逻辑。它校验载荷，通过 `ctx.get('asr')` 解析已组合的 [`asr`](../asr/README.zh.md) provider，并原样返回该 provider 给出的文本与时长。两类拒绝发生在任何 provider 请求之前：空载荷，以及超过 10 MB base64 字符的载荷——这是厂商上限，在此拦截可避免超大录音白占一次 provider 调用。未组合 `asr` provider 的部署会让调用失败，而不是返回空文本：否则空结果与「录音中确实没有语音」无法区分。

公开载荷类型位于 `./types`，Typert 生成的 Host 与 Client Remote 产物由 `./typert` 与 `./remote` 暴露。

该服务仅通过 Remote 提供，不声明同进程的 Cordis `Context` 合并。客户端包经由显式的 [`api-remotes`](../../api/remotes/README.zh.md) 装配消费它，而不是直接 import Host 实现。

## Model Experience

无。这个仅存在于 Host 侧的识别网关不注册任何 prompt、tool、message 或 provider 请求。识别文本只有在用户提交它所追加到的输入框草稿时，才会到达模型。

#### KV Cache effect

无；本包从不参与模型输入的组装。

## Known Limitations and Deferred Work

- **不支持流式** — 一次调用携带一段完整录音，返回一份完整识别结果。增量识别需要不同于请求/响应方法的 Remote 形式。
- **不写入 session log** — 识别结果是输入框的编辑辅助，不是模型可见输入，因此不做记录。若将来识别文本绕过草稿直接进入模型请求，该路径需要补一个 session event。
- **大小上限按字符计** — 10 MB 上限统计的是 base64 字符数而非解码后字节数，因此实际比「解码字节等价值」提前约 25% 触发拒绝。
