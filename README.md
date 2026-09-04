# dsh-my-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的第三方插件集合。每个插件是一个独立发布的 npm 包，各自独立安装、独立版本号，共用这一个仓库管理。

## 插件

| 插件 | npm 包 | 说明 |
| --- | --- | --- |
| [dsh-feishu-connect](packages/dsh-feishu-connect) | `dsh-feishu-connect` | 把飞书（Lark）机器人接入 Agent 会话，长连接收发、每聊天独立会话、设置页管理 |
| [dsh-token-usage-stats](packages/dsh-token-usage-stats) | `@lmber/dsh-token-usage-stats` | 记录每次模型调用的 token 消耗，设置页内按日/周/月及自定义区间查看 |
| [dsh-session-completion-notify](packages/dsh-session-completion-notify) | `@lmber/dsh-session-completion-notify` | 会话完成时发出系统通知（未选中、标签页隐藏或窗口失焦时都覆盖） |
| [dsh-voice-input](packages/dsh-voice-input) | `@lmber/dsh-voice-input` | 输入框麦克风按钮，浏览器录音、host 侧走小米 MiMo ASR 转成文字填进草稿 |

## 安装

四个插件互不依赖，按需安装：

```sh
dsh plugin --profile web add dsh-feishu-connect
dsh plugin --profile web add @lmber/dsh-token-usage-stats
dsh plugin --profile web add @lmber/dsh-session-completion-notify
dsh plugin --profile web add @lmber/dsh-voice-input
```

装完重启 DSH。卸载把 `add` 换成 `remove`。

各插件的配置、数据格式和已知限制见各自目录下的 README。

## 仓库结构

```
packages/
├── dsh-feishu-connect/              飞书桥接
├── dsh-token-usage-stats/           token 用量统计
├── dsh-session-completion-notify/   会话完成系统通知
└── dsh-voice-input/                 语音输入（TypeScript，需构建）
```

这里不使用 workspace 依赖提升或统一构建：每个包各自的 `package.json` 就是完整的发布单元，仓库只承担版本管理与集中存放。

多数包是手写的免构建 ESM 包，改完即可发布。`dsh-voice-input` 例外：它有 TypeScript 源码和测试，发布前需在包内 `pnpm install && pnpm run build`，产出的 `lib/` 一并提交。

## 发布

在对应包目录内发布，版本号各自独立：

```sh
cd packages/<plugin>
npm version patch
npm publish --registry=https://registry.npmjs.org/
```

`@lmber/` 是 scoped 包，首次发布需额外带 `--access public`。若本机默认 registry 指向镜像源，`--registry` 不可省略，否则会因镜像只读而报 `ENEEDAUTH`。

## ⚠ 发布前必读：package.json 禁止 UTF-8 BOM

**现象**：插件在 DSH 上「部分失效」——host 侧功能正常（数据照常记录、接口照常返回），但浏览器侧 UI 完全不出现（如设置面板里少一个页面、工具栏少一个按钮），且没有任何报错。

**原因**：DSH 新版 client-modules 在启动时用 `JSON.parse` 读取每个插件包的 `package.json`，据此决定是否把该包的浏览器半（`./client`）分发给前端。若 `package.json` 以 **UTF-8 BOM**（字节 `EF BB BF`）开头，`JSON.parse` 直接抛错，该 manifest 被静默判为「不可读」→ 整个包的浏览器半永远不加载。host 半走 ESM 导入不受 BOM 影响，所以会出现「后台在跑、前台不见」的割裂现象。历史上 0.4.x 的 `dsh-token-usage-stats` 全部中招（它的 `package.json` 带 BOM），也是本仓库踩过的最隐蔽坑。

**发布前必须检查**（连 BOM 一起提交进 npm 的通常就是发布前最后改的那版 package.json）：

```powershell
# PowerShell：查看 package.json 前三个字节，EF BB BF 即中招
Format-Hex package.json -Count 3

# Node：任选其一，输出无 BOM 即通过
node -e "const b=require('fs').readFileSync('package.json'); console.log(b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF ? 'BOM FOUND - 禁止发布' : 'ok (no BOM)')"
```

**预防**：

- 编辑器一律按 **UTF-8 无 BOM** 保存（VS Code 右下角编码选 `UTF-8`，不要选 `UTF-8 with BOM`）；本仓库已加 `.editorconfig`（`charset = utf-8`）。
- 避免用会在文件头写 BOM 的工具链写 `package.json`（部分 Windows 编辑器、`fs.writeFileSync(p, json, 'utf8')` 一般是安全的，但注意别把已有 BOM 的字面量写上）。
- 改动 `package.json` 后、`npm publish` 前跑一次上面的检测命令。
- 若已中招：本地去掉 BOM 后重启 DSH 即可恢复 UI；记得**发布一个去 BOM 的新版本**（版本号往前推，例如 0.4.x → 0.4.3），否则别人重装还会复发。

**验证 UI 是否分发**：浏览器打开 DSH 页面后在控制台执行 `JSON.stringify(window.__DSH_BOOT__.entries)`，看你的包名在不在列表里；不在即未被分发。

## License

MIT
