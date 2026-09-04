# @lmber/dsh-voice-input

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供语音输入的第三方插件：在输入框旁加一个麦克风按钮，说完自动转成文字填进草稿。识别走小米 MiMo ASR。

安装不需要改动 DSH 源码。录音在浏览器里做，识别在 host 侧做，API key 不会下发到浏览器。

## 功能

- 输入框工具行内的麦克风按钮，点一次开始录音，再点一次结束并识别
- 识别结果追加到当前会话的草稿，已有内容时以空格分隔
- 录音在浏览器内转成 16 kHz 单声道 WAV（MiMo 只接受 wav/mp3，而浏览器录的是 webm/opus）
- 三态提示：空闲 / 录音中 / 识别中；提交进行中禁止开始新录音，但允许结束正在进行的
- 权限拒绝、浏览器不支持、没录到声音、音频过大分别给出对应提示
- 中英双语文案，跟随 DSH 的语言设置
- 组件卸载时释放麦克风，不留占用

## 安装

```sh
dsh plugin --profile web add @lmber/dsh-voice-input
```

然后设置 API key 并重启 DSH：

```sh
# PowerShell
$env:MIMO_API_KEY = 'your-key'

# bash
export MIMO_API_KEY=your-key
```

插件自带自挂载配置（`dsh.bundle.patch`），装上即生效，不需要手写 cordis 配置。

打开会话页，输入框左侧应出现麦克风按钮。

## 卸载

```sh
dsh plugin --profile web remove @lmber/dsh-voice-input
```

## 配置

三个可覆盖字段，在 profile 的 `cordis.patch.yml` 里改：

```yaml
- id: voice-input
  config:
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1'
    model: 'mimo-v2.5-asr'
    apiKeyEnv: MIMO_API_KEY
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `baseUrl` | `https://token-plan-cn.xiaomimimo.com/v1` | OpenAI 兼容的 API 基址，含 `/v1`；插件在其后接 `/chat/completions` |
| `model` | `mimo-v2.5-asr` | 识别模型名 |
| `apiKeyEnv` | `MIMO_API_KEY` | 存放 API key 的环境变量名 |

key 每次识别时重新读取，换了 key 不必重启。

## 工作方式

浏览器负责采集，host 负责识别：

```
麦克风 → MediaRecorder(webm/opus) → decodeAudioData → 16kHz 单声道 PCM
      → WAV → base64 → POST /api/voice-input/transcribe
                              ↓ host 侧
                        读取 MIMO_API_KEY → 调用 MiMo → 返回文本
```

这样分工有两个原因：API key 留在 host 不下发浏览器，以及浏览器直连厂商域名会被 CORS 拦住。

`/api/voice-input/transcribe` 只接受本机来源（`127.0.0.1` / `::1`）。这条路由会花掉你的 API 额度，而 DSH 的 `webServer` 允许配成 `0.0.0.0` 监听；限制本机来源避免局域网内其他人借用你的 key。

## 限制

- **只支持 Web profile。** 依赖浏览器的 `MediaRecorder` 和 `AudioContext`，Electron 与 headless 模式下不加载。
- **要求 DSH ≥ 0.1.2-rc.1。** 1.1.0 起改用新版 client 标准包（`useInput`/`inputActions` hooks）与 `@deepseek-ai/dsh-session/types`，不再依赖已移除的 `dsh-client-runtime` 包；更早版本请用 1.0.x。
- **音频上限 10 MB（base64 后）。** MiMo 的限制；按 16 kHz 单声道估算约 4 分钟。浏览器和 host 两侧都会检查。
- **没有实时转写。** 录完整段才发一次请求，说话过程中不出字。
- **纯静音也算「没录到」。** 解码后长度为 0 与解码失败合并为同一提示，因为对使用者来说都是没有可发送的音频。
- **需要安全上下文。** `getUserMedia` 在非 HTTPS 且非 localhost 的页面上不可用，此时按钮报「浏览器不支持」。
- **未覆盖厂商端点的真实调用。** 测试用打桩的 `fetch` 断言请求构造与错误分支，没有对 MiMo 发过带凭据的请求。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm run test      # 57 个测试
pnpm run build     # 产出 lib/index.js（host）与 lib/client.js（浏览器）
```

`lib/client.js` 是给 DSH 的插件路由用的：CJS 闭包工厂形态，externals 通过注入的 `require` 解析，样式内联在 bundle 里自行注入 `<style>`。这几点由 `tsdown.config.ts` 保证，改构建配置时别破坏。
