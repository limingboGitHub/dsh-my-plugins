# @deepseek-ai/dsh-asr-mimo

[English](README.md) | 中文

[`dsh-asr`](../asr/README.zh.md) 能力的 Xiaomi MiMo provider。识别过程搭载在厂商的 OpenAI 兼容 chat-completions 端点上：音频作为单个 `input_audio` 内容部分传输，识别出的文本作为普通的 message 内容返回。该 provider 注入 `credentials` 服务，并通过继承 `AsrProvider` 注册在 `asr` 服务名下。

`Config` 的字段全部可选，均可从 cordis.yml 覆盖：`baseUrl`（包含 `/v1` 的 API 基础 URL，默认为 `https://token-plan-cn.xiaomimimo.com/v1`）、`model`（识别模型名称，默认为 `mimo-v2.5-asr`）以及 `apiKeyEnv`（存放 API 密钥的环境变量，默认为 `MIMO_API_KEY`）。所有随部署而变化的值都在构造函数中通过 `resolveConfig` 步骤一次性解析，因此一次转写绝不会重新推导端点。凭据在每次调用时通过 `ctx.credentials.resolve(...)` 解析，因此轮换后的密钥无需重启即可在下一次转写时生效，并且绝不会跨调用缓存。

请求发送时设置 `redirect: 'error'`，因此重定向永远不会将 API 密钥和音频送达其他源。音频以 data URL 形式发送；当传入裸 base64 时，MIME 类型从声明的格式推导（`mp3` 映射为 `audio/mpeg`，其余映射为 `audio/wav`），因为厂商要求 MIME 与格式一致。当请求携带 `language` 时，它以 `asr_options.language` 转发。失败以 `AsrError` 抛出，错误码为 `MISSING_API_KEY`（未配置凭据）、`API_ERROR`（携带 HTTP 状态码）和 `EMPTY_RESPONSE`（响应未携带转写结果）。成功时，结果携带去除首尾空白的识别文本，以及厂商报告时的计费音频时长（秒）。

## Model Experience

无——本 provider 自身不注册任何 prompt、tool、message 或 provider 请求；它只响应 consumer 的转写调用。

#### KV Cache effect

无；本包从不组装模型输入。

## Known Limitations and Deferred Work

- **仅支持 wav 和 mp3 容器** —— 厂商只接受 wav 和 mp3；调用方必须在调用 `transcribe` 之前将任何其他容器转码。
- **无流式识别** —— 每次 `transcribe` 调用发送完整音频并等待完整结果；不存在增量或部分转写路径。
- **时长可能缺失** —— 厂商仅通过可能缺失的 `usage.seconds` 字段报告时长，因此即使转写成功也不保证 `AsrResult.duration` 存在。
- **语言提示未经校验** —— `language` 直接透传给厂商，不会在本地对照厂商实际支持的语言进行校验；不受支持的取值只会表现为厂商侧错误或识别质量下降。
