# @lmber/dsh-token-usage-stats

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 token 用量统计的第三方插件：自动记录每次模型调用的 token 消耗（含速度指标），在设置页提供独立查看界面，并可把账本增量同步到远程聚合服务，实现多设备用量集中统计。

安装不需要改动 DSH 源码，配置持久保存在 `$DSH_HOME`，重启后继续生效。

## 功能

- 每次模型调用自动追加一条记录到 JSONL 账本（schema v2：含 `deviceId`、事件时间戳、`durationMs`、`firstTokenMs`、`outputTokensPerSec`）
- 设置页内独立的「Token 使用统计」面板
- 范围筛选：今日 / 昨天 / 前天 / 本周 / 本月 / 全部，**按月直接选择**（`<input type="month">` + 上/下月快捷按钮），也支持自定义起止日期
- SVG 柱状图展示消耗趋势：按天（近 30 天） / 按月（近 14 个月）切换；**无记录的日子显示为基线**，不再跳天；悬停柱子弹出精确数值
- **各模型每日/每月用量堆叠趋势图**，Top 6 模型 + 其余合并，图例着色
- **自然月历热力图**：按真实日历布局显示所选月份的每日消耗，可前后翻月，不再偏移错位
- 饼图展示模型用量占比 Top 10 + 其余合并，**图例与悬停提示带百分比**；调色板为柔和低饱和 12 色（无刺眼的大红大黄）
- 卡片新增**平均输出速度（tok/s）、平均首字延迟、平均单次耗时**与**非思考输出**（输出中扣除推理思考部分，provider 上报 `reasoningTokens` 时精确）
- **模型输出速度排名面板**：按平均输出速度降序，附带首字延迟与平均耗时，可直接比较各模型快慢
- **输出速度趋势面板**：按天 / 按月展示每个时间段的平均输出速度（tok/s），用于比较不同日期的速度差异
- **多设备远程汇总**：可在设置面板内直接配置 `remoteUrl` 与鉴权 token（无需改 cordis 配置）；账本增量推送到远程服务（按 `deviceId` 隔离存储、可跨设备聚合），面板可切换「本机 / 远程汇总」数据源，并展示同步状态（待同步条数、上次同步时间、失败原因）
- 设备标识自动生成 UUID 并持久化，可用配置覆盖
- 大数字自动换算单位（`k / M / B / T`），卡片、表格、图例、悬停提示统一缩写
- 进入面板与切换筛选时自动拉取最新数据，无需手动刷新

## 安装

```sh
dsh plugin --profile web add @lmber/dsh-token-usage-stats
```

然后重启 DSH。插件自带自挂载配置（`dsh.bundle.patch`），装上即生效，不需要手写任何 cordis 配置。

打开设置，左侧应出现「Token 使用统计」一栏。

## 卸载

```sh
dsh plugin --profile web remove @lmber/dsh-token-usage-stats
```

重启后插件及其设置页消失。账本文件会保留，需要的话手动删除。

## 账本位置与格式

默认写入 `$DSH_HOME/token-usage-ledger.jsonl`（`DSH_HOME` 未设置时为 `~/.dsh`）。

每行一条 JSON 记录（schema v2）：

```json
{
  "type": "model-call",
  "v": 2,
  "ts": 1787102662243,
  "iso": "2026-08-19T01:24:22.243Z",
  "deviceId": "dev-8f2a…",
  "sessionId": "session-xxx",
  "provider": "deepseek-official",
  "model": "deepseek-chat",
  "inputTokens": 1000,
  "outputTokens": 500,
  "cacheReadTokens": 0,
  "cacheWriteTokens": 0,
  "reasoningTokens": 0,
  "totalTokens": 1500,
  "durationMs": 4210.5,
  "firstTokenMs": 380.2,
  "outputTokensPerSec": 92.4,
  "workspacePath": "D:/work/repo",
  "workspaceTitle": "repo"
}
```

- `totalTokens` 是计费 token 总量：`inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens`，四项互不重叠，其中 `inputTokens` 只含未命中缓存的输入；`reasoningTokens` 已包含在 `outputTokens` 内，不重复计入。
- `ts` 取**会话事件自身的 `time` 字段**（精确到每次调用的完成时刻），并在同一步内由 `request/header` → 首个 `assistant/chunk` → `assistant/message` 的时间差推导 `durationMs`（请求发出到完成）与 `firstTokenMs`（首字延迟）、`outputTokensPerSec`（输出速度）。
- v0.2.0 及更早的记录没有 `v` 与速度/设备字段，读取时自动兼容；速度类指标只在有新字段的记录上统计。

账本是纯 JSONL，可以直接用其他工具分析：

```sh
# 总调用次数
wc -l < ~/.dsh/token-usage-ledger.jsonl
```

## 多设备远程同步

### 配置（两种方式皆可，设置面板优先）

**方式一：设置面板（推荐）** — 打开「Token 使用统计」，在「远程同步配置」卡片填写服务地址与可选的鉴权 token，点击「保存配置」。配置立即生效并持久化到 `$DSH_HOME/token-usage-config.json`（token 输入框留空表示保持不变）。

**方式二：cordis 配置**（部署时预设）— profile 的 `cordis.patch.yml`：

```yaml
- id: token-usage-stats
  config:
    remoteUrl: "https://stats.example.com"
    remoteToken: "your-token"        # 可选；与远程服务端 DSH_TS_TOKEN 对应
    # deviceId: "my-laptop"           # 可选；覆盖自动生成的 UUID
    # deviceName: "办公笔记本"        # 可选；默认取主机名
    # syncIntervalMs: 60000           # 可选；推送间隔，默认 60 秒
```

- 未配置 `remoteUrl` 时行为与旧版完全一致：仅本地记账与展示。
- 配置后，插件每分钟（或按 `syncIntervalMs`）把未同步的账本行批量 `POST` 到 `{remoteUrl}/api/v1/ledger/upload`，并持久化水位（`token-usage-sync.json`），失败自动留待下次重试，绝不影响本地记账。
- 设置面板保存的值**优先于** cordis 配置，且无需重启即生效；切换 `remoteUrl` 会重新建立推送水位（新目标从头同步）。
- 面板顶部的数据来源开关（「本机 / 远程汇总」）仅在启用远程后出现；远程视图通过本机插件代理查询，浏览器不直连远程，避免 CORS 且统一鉴权。
- 设备 UUID 自动生成并保存在 `$DSH_HOME/token-usage-device.json`，可用 `deviceId` 配置覆盖。

### 参考服务端

本包附带一个零依赖的 Node 聚合服务（`server/index.js`），存储按设备隔离（`<dataDir>/<deviceId>.jsonl`），查询时跨设备聚合。可用于任何一台常开的机器：

```sh
node server/index.js
# 环境变量：
#   PORT            监听端口（默认 8787）
#   DSH_TS_DATA_DIR 数据目录（默认 ./data）
#   DSH_TS_TOKEN    鉴权 token；设置后所有请求需带 Authorization: Bearer <token>
```

服务端接口（与插件本机路由同语义）：

- `POST /api/v1/ledger/upload` — 设备推送账本行 `{ deviceId, deviceName, rows }`
- `GET /api/v1/ledger/summary?range=&from=&to=&devices=` — 跨设备汇总（`devices=all` 或指定 `deviceId`）
- `GET /api/v1/ledger/series?granularity=&limit=&devices=` — 连续窗口时序
- `GET /api/v1/ledger/series-by-model?granularity=&limit=&devices=` — 按模型时序
- `GET /api/v1/ledger/devices` — 设备列表与各自统计

## HTTP 接口

主机端注册了只读路由，浏览器界面通过它取数据，也可以自己调用：

```
GET /api/token-usage-stats?range=day|yesterday|day-before|week|month|all|YYYY-MM
GET /api/token-usage-stats?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/token-usage-stats?source=local|remote
```

- `range=YYYY-MM` 直接选择某个月（如 `2026-08`），`from`/`to` 按本地时区解析，含首尾两天，两者都可省略。`day` / `yesterday` / `day-before` 各覆盖对应那一个本地日；`week` / `month` / `all` 从各自起点到当前时刻。非法参数返回 400。
- `source=remote` 时本机插件代理到远程服务做同样的查询（需要已配置 `remoteUrl`）。

柱状图与模型趋势的数据来自分桶时间序列接口：

```
GET /api/token-usage-stats/series?granularity=day|hour|month&limit=N&source=
GET /api/token-usage-stats/series-by-model?granularity=day|hour|month&limit=N&source=
```

- 返回**连续窗口**：窗口内无记录的桶为 `{ tokens: 0, calls: 0 }`，柱状图因此不跳天。`day` 窗口止于今天，`month` 止于本月，`limit` 只返回最新 N 桶（默认按最早记录起算）。每个桶额外携带 `avgTokensPerSec`（该窗口内所有调用的平均输出速度；无速度数据时为 `null`）。
- `series-by-model` 返回 `{ granularity, buckets, series }`，所有模型共享同一窗口便于对齐。
- 汇总接口的 `byProvider` / `byModel` 每行额外携带 `avgOutputTokensPerSec`、`avgFirstTokenMs`、`avgDurationMs`（仅统计有对应数据的行）。

设备与同步状态：

```
GET /api/token-usage-stats/meta
```

返回 `deviceId`、`deviceName`、`entryCount` 与 `sync` 状态（`enabled`、`pendingCount`、`lastSyncAt`、`lastError`）。

远程同步配置（设置面板读写）：

```
GET /api/token-usage-stats/config
PUT /api/token-usage-stats/config   # body: { "remoteUrl": "...", "remoteToken": "..." }
```

- `GET` 返回 `remoteUrl`、`remoteUrlSet`、`remoteTokenSet`（**不含 token 明文**）。
- `PUT` 应用并持久化配置；`remoteUrl` 传空字符串停用远程；**不传 `remoteToken` 字段表示保持原值**。切换 `remoteUrl` 会重置推送水位并立即重启同步。

该路由绑定在 DSH web 服务器上，跟随其监听地址（默认仅本机 `127.0.0.1`）。它没有独立鉴权，与 DSH web 界面本身共享同一信任范围 —— 如果把 DSH 暴露到非本机地址，这份用量数据同样会被暴露。

## 本地开发

```sh
node tests/smoke.mjs          # 聚合逻辑冒烟测试（真实账本，无账本时用合成数据）
node tests/integration.mjs    # cordis 集成测试：真实运行时内验证记账/路由/远程同步全链路
node server/index.js          # 启动参考聚合服务
```

`tests/integration.mjs` 在隔离的 cordis `Context` 中加载插件的 `apply()`，驱动模拟的 `session/event` 事件流（`request/header` → `assistant/chunk` → `assistant/message`），断言账本行的时间/速度/路由/工作区字段、HTTP 路由响应，并起一个临时参考服务验证增量推送、水位持久化与远程代理查询。需要本机存在 DSH profile 安装（用于定位 `@deepseek-ai/cordis`），否则自动跳过。

## 兼容性

依赖 DSH 的 `session/event` 事件流、`webServer` 服务和 `settings.section` 插槽。DSH 尚未正式发版，这些接口仍可能变动；插件在这些接口变更后可能需要同步更新。

`webServer` 服务缺失时（例如 headless profile）只记录账本，不注册 HTTP 路由；远程推送在 `webServer` 缺失时仍然工作（记账与推送不依赖 webServer）。

## 已知限制

- 统计基于插件安装后产生的记录，装之前的历史调用无法追溯；速度类指标自 v0.4.0 起才有（旧记录显示「—」）。
- 账本只追加不轮转，长期使用会持续增长，需要时自行归档。
- 面板在进入或切换筛选时自动拉取数据（连接打开期间不轮询，需要最新数字可重新进入面板）。
- 远程汇总视图反映的是「已成功推送到服务端」的数据，未推送行在「待同步」计数中可见。
- 热力图默认显示当前月；翻到数据窗口（约 62 天）之外的月份会显示空月。

## License

MIT