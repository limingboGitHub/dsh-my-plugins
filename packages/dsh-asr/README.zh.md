# @deepseek-ai/dsh-asr

[English](README.md) | 中文

ASR（自动语音识别）能力的 Service Definition。本包导出抽象类 `AsrProvider extends Service`，该抽象类以服务名 `asr` 注册，并声明一个抽象方法 `transcribe(request: AsrRequest): Promise<AsrResult>`，用于将音频转换为文本。本包同时导出 `AsrRequest` 与 `AsrResult` 类型以及 `AsrError` 类。

`AsrRequest` 携带 `audioBase64`（可以是 data URL，如 `data:audio/wav;base64,...`，也可以是裸 base64 字符串）、可选的 `format` 提示（`'wav'` 或 `'mp3'`，当 `audioBase64` 不是 data URL 时必填），以及可选的 `language` 提示（默认为自动检测，具体支持范围由 provider 决定）。`AsrResult` 携带识别出的 `text`，以及 provider 上报时的可选 `duration`（单位秒）。`AsrError` 携带机器可读的 `code`，以及当错误来自 API 响应时的可选 HTTP `statusCode`。

本包不包含任何 provider 实现、网络代码或配置。它是能力接缝（capability seam）中的一个角色，其余角色是 provider（[`dsh-asr-mimo`](../asr-mimo/README.zh.md)）和 consumer（`dsh-asr-gateway`，位于 [`packages/asr/asr-gateway`](../asr-gateway)）。

## Model Experience

无。本 Service Definition 不注册任何 prompt、tool、message 或 provider 请求。

#### KV Cache effect

无。本包从不组装模型输入。

## Known Limitations and Deferred Work

- **不附带 provider** — 仅加载本包只会安装抽象的 `asr` 服务；部署必须同时加载 `dsh-asr-mimo` 之类的 provider，consumer 才能执行转写。
- **结果元数据极少** — `AsrResult` 只暴露识别文本和可选时长；计算置信度、分段时间戳或说话人归属的 provider 无法通过该接口传递这些信息。
