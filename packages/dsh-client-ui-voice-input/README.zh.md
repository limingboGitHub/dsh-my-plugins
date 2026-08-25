# @deepseek-ai/dsh-client-ui-voice-input

[English](README.md) | 中文

输入框的语音输入能力：在 `conversation.input.left` 工具行放置一个麦克风控件，录制语音、送去识别，并把识别文本追加到当前会话的草稿中。

工作按进程边界拆分。浏览器半部通过 `getUserMedia` 与 `MediaRecorder` 采集音频，用 `AudioContext.decodeAudioData` 解码录制容器，再重新编码为 16 kHz 单声道 16 位 WAV——provider 只接受 wav 与 mp3，而浏览器录制的是 webm/opus。识别本身经 `asr` Remote 在 Host 侧执行，因此 provider 的 API key 从不进入浏览器。控件不直接写入文本：识别结果经由每会话 input 门面的 `setDraft` 进入输入框，追加在已有内容之后并以一个空格分隔。

控件在三个状态间流转——idle、recording、transcribing——同一个按钮既开始也停止录音。提交在途时拒绝开始录音，因为该事务此刻拥有草稿；但已经在录的录音仍可停止，因为停止意味着释放麦克风。录音期间卸载会取消采集，所以切换会话不会留下未关闭的麦克风。

麦克风 API 不可用、权限被拒绝、以及采集到无法解码的音频，这三种情况都会让控件回到 idle，并在按钮旁给出本地化提示。识别失败则按 error-surface 策略原样呈现 Remote 返回的英文错误行。

## Model Experience

无直接影响。本包不注册任何 prompt、tool 或 message。识别文本落在输入框草稿里，由用户编辑或丢弃；只有用户执行一次常规提交时它才会到达模型。

#### KV Cache effect

无；本包从不参与模型输入的组装。

## Known Limitations and Deferred Work

- **不支持流式与中间结果** — 完整录音在用户停止后才发送，因此没有实时的部分识别文本。要展示中间结果需要流式形式的 Remote。
- **编码占用主线程** — 解码与 WAV 编码在主线程执行，长录音可能短暂阻塞渲染。把编码移入 worker 的工作推迟到实际录音长度让该问题可被察觉时再做。
- **请求参数固定** — Remote 调用固定发送 `format: 'wav'` 与 `language: 'auto'`，两者都不可由用户选择，也没有选择识别语言的界面。
- **只能追加插入** — 文本总是追加到草稿末尾而非光标处，且除输入框自身的历史外，没有针对单次识别的撤销。
- **静音只是被报告，而非被检测** — 识别结果为空时提示为「无有效音频」，因为 provider 无法区分静音录音与识别失败的语音。
