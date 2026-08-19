# dsh-my-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的第三方插件集合。每个插件是一个独立发布的 npm 包，各自独立安装、独立版本号，共用这一个仓库管理。

## 插件

| 插件 | npm 包 | 说明 |
| --- | --- | --- |
| [dsh-feishu-connect](packages/dsh-feishu-connect) | `dsh-feishu-connect` | 把飞书（Lark）机器人接入 Agent 会话，长连接收发、每聊天独立会话、设置页管理 |
| [dsh-token-usage-stats](packages/dsh-token-usage-stats) | `@lmber/dsh-token-usage-stats` | 记录每次模型调用的 token 消耗，设置页内按日/周/月及自定义区间查看 |

## 安装

两个插件互不依赖，按需安装：

```sh
dsh plugin --profile web add dsh-feishu-connect
dsh plugin --profile web add @lmber/dsh-token-usage-stats
```

装完重启 DSH。卸载把 `add` 换成 `remove`。

各插件的配置、数据格式和已知限制见各自目录下的 README。

## 仓库结构

```
packages/
├── dsh-feishu-connect/     飞书桥接
└── dsh-token-usage-stats/  token 用量统计
```

这里不使用 workspace 依赖提升或统一构建：两个包都是手写的免构建 ESM 包，各自的 `package.json` 就是完整的发布单元。仓库只承担版本管理与集中存放。

## 发布

在对应包目录内发布，版本号各自独立：

```sh
cd packages/<plugin>
npm version patch
npm publish --registry=https://registry.npmjs.org/
```

`@lmber/` 是 scoped 包，首次发布需额外带 `--access public`。若本机默认 registry 指向镜像源，`--registry` 不可省略，否则会因镜像只读而报 `ENEEDAUTH`。

## License

MIT
