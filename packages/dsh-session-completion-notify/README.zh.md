# @lmber/dsh-session-completion-notify

[English](README.md) | 中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 客户端插件：当会话运行结束时，**只要你不在看它**——无论是没选中、切到了其他标签页，还是把浏览器切到了后台——就会发出一次操作系统级系统通知。

触发点与侧边栏绿色完成点的置位逻辑共用同一条 running→idle 边沿，两个界面对「完成」的含义因此保持一致。只有你真正在看的会话（已选中且页面在前台）才不通知；一旦你切到其他标签页或其他应用，即使是那个选中会话完成，也会通知你。通知正文优先使用宿主已投影的会话持久标题，否则使用其显示标题。

通知权限在启动时请求一次。观察器实时读取权限，因此在浏览器设置里稍后授予的权限无需刷新即可生效；被拒绝的权限让观察器保持安静。

## 安装

```sh
dsh plugin --profile web add @lmber/dsh-session-completion-notify
```

然后向 `$DSH_HOME/profiles/web/cordis.patch.yml` 插入：

```yaml
- insert:
    - id: session-completion-notify
      name: '@lmber/dsh-session-completion-notify'
```

重启 DSH。卸载时移除该行并执行 `dsh plugin --profile web remove @lmber/dsh-session-completion-notify`。

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:limingboGitHub/dsh-my-plugins
```

本仓库是合集，插件路径为 `packages/dsh-session-completion-notify`。

## 行为

- 插件订阅 `ctx.sessions.list`，并为每个会话保留上一次观察到的 running 位。
- 首次观察只记录该位，因此加载时已经空闲的会话保持安静。
- 只要用户没在看某个会话（没选中、标签页隐藏、或窗口失去焦点），它的真→假边沿就恰好触发一次通知；已选中的会话仅在页面可见且聚焦时保持安静。
- 同一会话再次运行会开启新一轮观察，所以每次没被盯着的完成都会再次通知。

## 已知限制

- 部分引擎的权限提示依赖用户手势（WebKit、旧版 Chromium），启动时请求可能被静默丢弃；如需要请在浏览器网站设置里允许通知。
- 通知基于边沿而非计数：一个会话在两次快照间隔内完成又立即重跑可能被漏掉。

## 许可证

MIT
