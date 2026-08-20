# dsh-feishu-connect

把飞书（Lark）机器人接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Agent 会话：通过官方 SDK **长连接**接收消息（无需公网 IP/域名/隧道），支持 cc-connect 风格的命令、每聊天独立会话、处理中表情、Markdown 卡片回复，并提供设置页 UI。

单包即用：一个 npm 包同时提供 Host 插件（桥接逻辑）+ Client 插件（设置页 UI）+ helper 子进程（长连接）+ bundle 补丁（自动注册）。

## 功能

- **多机器人**：一个实例同时运行多个机器人，每个绑定一个工作区（workspace），独立长连接、会话状态与命令处理
- **接收/发送**：飞书 `im.message.receive_v1` 长连接 → 注入 Agent 会话 → Agent 在这一轮说的每段文字都以交互卡片（Markdown）发回同一会话；发送媒体不影响文字投递，只有同会话 `feishu_send` 已原样发过的那一段不再重复
- **命令**：`/new [名称]` 新建独立会话、`/switch <序号>` 切换、`/list` 列出、`/help` 帮助（支持前缀匹配 `/n` `/sw` `/l` `/h`）
- **会话**：每个飞书聊天拥有**独立专属的 Agent 会话池**（绝不串进 GUI 会话）；首条消息自动创建会话（绑定配置工作区，无需先在 GUI 打开）；每聊天会话持久化（重启后自动恢复）；`agents.create/resume` 均注入模型选项（修复 `{{model}}` 变量缺失）
- **测试发送**：发到最近会话；扫码创建的机器人自动保存 owner open_id，测试发送会自动建立与该用户的单聊（无需先手动给机器人发消息）
- **处理中表情**：消息到达加 `OnIt` 表情，回复送达后撤销（cc-connect 时机）；可配置 `reactionEmoji`，`none` 关闭
- **连接开关**：每个机器人可在设置页运行时启用/停用连接（停用即断开长连接，无需删除配置或重启）
- **设置页**：设置 → 飞书机器人（机器人列表：连接开关 / 增删改 / 各自工作区 / 状态 / 测试发送）
- **扫码创建**：设置页生成二维码，用飞书 App 扫码即自动创建机器人并获取 AppID/AppSecret（飞书官方应用注册流程，无需手动去开放平台建应用）
- **工具**：
  - `feishu_send`：发送文本消息（Agent 可主动发消息，可用 `appId` 指定机器人，缺省发到最近收到消息的机器人）
  - `feishu_send_media`：发送本地图片、视频、音频或文件（支持 `.png`/`.jpg`/`.webp`/`.gif` 内嵌图片、`.mp4`/`.mov`/`.webm` 视频播放器、`.ogg`/`.opus`/`.mp3` 语音气泡、PDF/Office 文件下载）

## 安装（用户侧）

一条命令装好，无需手改任何 JSON/YAML 配置文件：

```sh
# 已发布到 npm 时（推荐）：
dsh plugin --profile web add dsh-feishu-connect
# 或直接从 git 仓库安装：
dsh plugin --profile web add github:limingboGitHub/dsh-feishu-connect
```

> **为什么需要 pnpm？** `dsh plugin` 是 `dsh web` 的插件管理入口，它在你的 profile 目录（`$DSH_HOME/profiles/web`）里调用 **pnpm** 来安装依赖并写入注册。这不是本插件的特殊要求——管理任意 `dsh plugin` 插件都走 pnpm。装一次即可：`npm i -g pnpm`（Windows 也可用 `corepack enable`/`winget install pnpm`）。如果完全不想装 pnpm，用下方「手动安装」方式把本包放入 profile 并用 cordis 补丁注册，同样可用。
>
> **首次安装若提示 `ERR_PNPM_IGNORED_BUILDS`（pnpm ≥10 默认拦截依赖的构建脚本，此处为 `protobufjs`）**：这是一个**警告**，不是安装失败——缺少构建产物时 lark SDK 的 WebSocket 部分无法工作，但其余功能不受影响。编辑 `$DSH_HOME/profiles/web/pnpm-workspace.yaml`，把 `allowBuilds` 下的 `protobufjs` 从 `set this to true or false` 改为 `true`，然后重新执行上面的命令；`dsh plugin` 才会把本插件写入 profile。

`dsh plugin` 会自动完成三件事：把包安装进 profile 的 node_modules、把本包的 `cordis.patch.yml` 作为 bundle 补丁层挂到 profile、并把包名写进 `dsh.profile.bundles` —— 全程无需编辑任何配置文件。

装完**重启**：

```sh
dsh web
```

然后在 **设置 → 飞书机器人** 填入 工作区 + AppID + AppSecret 并保存。配置写入 **`~/.cc-connect/feishu.config.json`**（与 cc-connect 相同的约定：全局配置在用户主目录，与任何代码仓库/工作区解耦），无需手动创建。会话状态持久化在 `~/.cc-connect/state.json`。

### 换机迁移

配置和会话状态都放在用户主目录，与代码仓库解耦，整体拷到新机器即可：

```sh
# 新机器上安装 dsh，然后：
dsh plugin --profile web add dsh-feishu-connect
# 把旧机器的 ~/.cc-connect/ 整个拷到新机器同目录下（内容含 feishu.config.json 与各 state-*.json）
# 重启 dsh web 即可
```

**没有机器人？** 设置页点「生成二维码」→ 用飞书 App 扫码 → 自动创建机器人并回填 AppID/AppSecret → 点「保存配置」即完成绑定（飞书官方应用注册流程，无需去开放平台手动建应用；权限与事件订阅通常自动预配，建议在开放平台核验发布状态）。

### 连接状态排查（重要）

设置页的「连接状态」有几种取值：`connected`（长连接已建立）、`connecting`（helper 进程在运行，还没到 ready）、`idle`（helper 进程不在运行或已退出）、以及 `failed: ...` 或 `stopped: ...`（2.0 及以后，失败详情透传到页面上）。

安装成功但一直 `connecting` 后变回 **`idle`** 的常见原因：

1. **`protobufjs` 构建脚本被 pnpm 拦截**（最常见，极可能就是「换机后能用但连不上」的原因）。lark SDK 的 WebSocket 长连接需要 `protobufjs` 的构建产物（`lib/`），而 pnpm ≥10 默认不允许依赖运行构建脚本。检查你 profile 的 `pnpm-lock.yaml` 是否记录了依赖，并看 `$DSH_HOME/profiles/web/node_modules/protobufjs/` 下有没有 `lib/` 目录：
   ```sh
   # 没有 lib/ 目录 → 构建被跳过，按上面的 allowBuilds 放行后重新安装
   ls $env:USERPROFILE\.dsh\profiles\web\node_modules\protobufjs
   # 有 lib/ 目录 → 构建没问题，再看第 2 条
   ```
   处理完 `allowBuilds` 后**重新执行安装命令**并**重启 `dsh web`**（`dsh plugin` 安装完成后 helper 进程才会在启动时拉起；已运行的进程用的还是旧环境）。
2. **AppID/AppSecret 错误**或**该机器网络无法访问飞书开放平台**（代理/防火墙）。凭据错误时 SDK 会返回 `code: 1000040345, app_id or app_secret is invalid`，helper 日志会打印，2.0 起状态页会直接显示 `failed: ...`。
3. **事件订阅方式不是「使用长连接接收事件」**，或机器人应用未发布/缺少权限——这类配置问题在你自己机器上同样会失败，与换机无关。

**判据**：一般「同配置在一台机器能连、另一台不能」的核心差异就是构建产物缺失或网络不同；先查 `protobufjs/lib` 是否存在，是 80% 的情况。

### 手动安装备选

> 手动安装（无 pnpm 环境）备选：把包放进 `$DSH_HOME/profiles/node_modules/`，在 profile 的 `cordis.patch.yml` 加入下面两行，重启即可：
> ```yaml
> - insert:
>     - id: feishu-bridge
>       name: dsh-feishu-connect
> ```
>
> ⚠️ **两种方式二选一，不要混用**：`dsh plugin` 会把包写入 `dsh.profile.bundles`（bundle 层），若 `cordis.patch.yml` 里还留着手动 `insert` 行，同一插件 id 会被注册两次，`dsh web` 启动会报 `duplicate loader entry id: feishu-bridge`。曾用手动方式装过的话，先删掉 `cordis.patch.yml` 里的 `insert` 行（恢复成 `[]`）再执行 `dsh plugin`，或反之。

### 飞书开放平台一次性配置（与 cc-connect 相同）
   - 创建企业自建应用，启用机器人
   - 权限：`im:message.p2p_msg:readonly`、`im:message.group_at_msg:readonly`、`im:message:send_as_bot`、`im:message.reaction`（可选，处理中表情用）
   - 事件与回调 → 订阅方式选 **「使用长连接接收事件」**，添加事件 `im.message.receive_v1`
   - 创建版本并发布

## 发布（维护者侧）

```sh
# 1. 登录 npm（首次）——注意用官方 registry，镜像源不能发布
npm login --registry https://registry.npmjs.org

# 2. 改版本号并发布
npm version patch
npm publish --registry https://registry.npmjs.org
```

包名已定为 `dsh-feishu-connect`（与 GitHub 仓库同名，npm 上可用的全局名）。若希望发布为 scope 包（如 `@yourname/dsh-feishu-connect`），把 `package.json` 的 `name` 改成 scope 形式后，用户侧安装命令随之变为：

```sh
dsh plugin --profile web add @yourname/dsh-feishu-connect
```

## 架构

```
飞书开放平台 ⇄ WebSocket 长连接 ⇄ helper.cjs（本包，官方 SDK WSClient）
                                        ⇅ stdout JSON 行
                                   index.js（Host 插件，行 feishu-bridge）
                                        ⇅ ctx.agents / ctx.fs / ctx.shell / fetch
                                   Agent 会话（配置工作区匹配）
                                        ⇅ 同源 admin 路由 /feishu/admin/*
                                   client.js（设置页 UI，行 dsh-feishu-connect）
```

- 配置：`~/.cc-connect/feishu.config.json`（`{ bots: [{ name, workspace, appId, appSecret, reactionEmoji? }] }`，兼容旧单对象格式自动迁移），热读；模板见包内 `feishu.config.example.json`（也可直接在设置页填写并保存）
- 会话状态：`~/.cc-connect/state-<appId>.json`（每机器人独立）
- Host 插件注册：`feishu_send` / `feishu_send_media` 工具、`/feishu/admin/*` 路由、每机器人一个 helper 进程（崩溃自动重启、凭据变更自动重连）

## 工具使用示例

Agent 可直接调用工具发送消息和媒体：

```javascript
// 发送文本
feishu_send({ text: "任务完成！" })

// 发送图片（自动识别扩展名，渲染为内嵌图片）
feishu_send_media({ paths: ["/path/to/chart.png"] })

// 发送视频（自动渲染为视频播放器）
feishu_send_media({ paths: ["/path/to/demo.mp4"] })

// 发送音频（自动渲染为语音气泡）
feishu_send_media({ paths: ["/path/to/voice.opus"] })

// 批量发送多个文件
feishu_send_media({ paths: ["/path/to/report.pdf", "/path/to/chart.png"] })

// 强制类型：把 .webm 当作视频发送（而不是普通文件下载）
feishu_send_media({ paths: ["/path/to/clip.webm"], kind: "video" })
```

**投递规则**：Agent 在一轮里说的每一段文字都会送到飞书，按顺序用空行拼成一条消息。发送媒体**不会**影响文字投递 —— `feishu_send_media` 只负责附件，围绕它写的说明照常送达。

不重复投递的只有两种情况：同会话的 `feishu_send` 已经原样发过的那一段（否则用户会收到两次），以及 `NO_REPLY` 哨兵本身。两者都按段丢弃，同一轮里的其他句子不受影响。

因此 Agent 不需要用 `feishu_send` 回答当前会话 —— 正常作答即可。`feishu_send` 留给发往**其他**会话的场景。

## 开发

```sh
npm i            # 安装 @larksuiteoapi/node-sdk
node --check index.js client.js helper.cjs
```

修改 `client.js` 后无需构建——client-modules 直接按内容哈希提供该文件，刷新浏览器即可生效（dev:web 下热换）。

## License

MIT
