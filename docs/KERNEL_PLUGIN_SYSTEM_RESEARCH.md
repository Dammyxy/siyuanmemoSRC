# SiYuan Kernel Plugin System Research

日期：2026-04-30

## 结论摘要

上游 PR `siyuan-note/siyuan#17487` 为思源引入内核侧 JavaScript 插件运行时。插件可在同一插件目录内提供 `kernel.js`，由思源 kernel 进程用 goja 启动，并通过 `globalThis.siyuan` 获得生命周期、日志、插件作用域文件存储、JSON-RPC、HTTP/WS/SSE client、private HTTP/WS/SSE server handler 等能力。

对 SiYuanMemo 来说，这不是替代前端插件 runtime，而是新增一个同名的 kernel companion。最稳妥路线是：先把 kernel companion 做成只读/轻写的 RPC 后台，不直接写 `siyuanmemo.db`，由现有 browser-side `ApplicationContext` 通过 application port 访问它。

推荐 P0：

1. `plugin.json` 增加 `kernels` 字段，跟随官方 sample 声明桌面、移动、Docker/Harmony 与 `all`，但真实跨端 writer 策略仍需单独设计。
2. 新增 `kernel.js` 构建产物，启动后绑定 `health` / `version` / `listRiffDecks` / `auditNativeRiff` 等 RPC。
3. 前端新增 `KernelPluginPort` 与 `KernelPluginRpcAdapter`，保持 `ui -> application -> infrastructure` 边界。
4. kernel companion 只调用思源 kernel REST/Riff API 和自身 `siyuan.storage`，不直接读写 SiYuanMemo 主 SQLite 文件。

## 调研来源

- PR 本地摘要: `docs/UPSTREAM_PR_17487_SUMMARY.md`
- Kernel plugin type declaration: `H:/project-F/flashcard/资料/kernel.d.ts`
- 上游实现分支：
  - `kernel/plugin/*`
  - `kernel/api/plugin.go`
  - `kernel/api/router.go`
  - `kernel/model/plugin.go`
  - `kernel/bazaar/plugin.go`
- SiYuanMemo 本地架构锚点：
  - `siyuan-plugin-siyuanmemo/ARCHITECTURE.md`
  - `siyuan-plugin-siyuanmemo/plugin.json`
  - `siyuan-plugin-siyuanmemo/src/application/ApplicationContext.ts`
  - `siyuan-plugin-siyuanmemo/src/core/infrastructure/websocket/TransactionWebSocketService.ts`
  - `siyuan-plugin-siyuanmemo/src/infrastructure/services/FileService.ts`
  - `siyuan-plugin-siyuanmemo/src/application/ports/*Riff*.ts`

## 上游 PR 状态

截至 2026-04-30 调研时：

- PR 标题：`Support kernel plugin system`
- 状态：Open
- head：`Zuoqiu-Yingyi:feat/kernel-plugin`
- base：`siyuan-note:dev`
- 最新 head sha：`61e7d24030658ffc3f84469f906bb8f786d2dbcc`
- commits：139
- changed files：29
- additions/deletions：约 `5421 / 73`
- mergeable：true

变更主要集中在：

| 路径 | 作用 |
|---|---|
| `kernel/plugin/plugin.go` | `KernelPlugin` 生命周期、goja runtime、RPC/HTTP/WS/SSE 分发 |
| `kernel/plugin/manager.go` | kernel plugin manager，按插件启停加载/卸载 |
| `kernel/plugin/sandbox.go` | 注入 `globalThis.siyuan` 与 node-like 模块 |
| `kernel/plugin/api_client.go` | `siyuan.client.fetch/socket/event` |
| `kernel/plugin/api_server.go` / `server.go` | `siyuan.server.private.*` handler 与响应写回 |
| `kernel/plugin/api_rpc.go` / `rpc.go` | JSON-RPC method registry、HTTP/WS endpoint、broadcast |
| `kernel/plugin/api_storage.go` | 插件作用域文件 CRUD |
| `kernel/api/plugin.go` | `/api/plugin/*` handler |
| `kernel/api/router.go` | 注册 `/api/plugin/*`、`/ws/plugin/rpc/*`、`/plugin/private/*` |
| `kernel/model/plugin.go` | `Petal.Kernel`、`LoadKernelPetals()`、`kernel.js` 读取 |
| `kernel/bazaar/plugin.go` | `plugin.json.kernels` 兼容判断 |

## 加载模型

内核插件加载有两个硬条件：

1. `plugin.json` 必须包含非空 `kernels` 数组。
2. 插件安装目录必须有 `kernel.js`。

示例：

```json
{
  "kernels": ["windows", "linux", "darwin", "ios", "android", "harmony", "docker", "all"]
}
```

平台值支持：

- `windows`
- `linux`
- `darwin`
- `docker`
- `android`
- `ios`
- `all`

加载流程：

1. 插件已启用。
2. `LoadKernelPetals()` 读取已启用 petal。
3. `bazaar.IsIncompatibleKernelPlugin()` 检查 `kernels` 是否匹配当前 backend。
4. `loadCode()` 查找 `<data>/plugins/<name>/kernel.js`。
5. 存在则创建 `KernelPlugin`，注入 sandbox，执行脚本。
6. 依次调用 `onload`、`onloaded`、`onrunning`。
7. 禁用/关闭时调用 `onunload`，清理 RPC methods、sockets、runtime。

当前 SiYuanMemo 的 `plugin.json` 已声明 `kernels`，新内核可按平台兼容性加载 `kernel.js`。

## Runtime 能力面

`kernel.d.ts` 暴露的顶层对象为 `globalThis.siyuan`。

### `siyuan.plugin`

提供插件元数据：

- `name`
- `version`
- `displayName`
- `platform`
- `i18n`
- `lifecycle`

生命周期：

- `onload`
- `onloaded`
- `onrunning`
- `onunload`

这些 hook 支持 async/promise。

### `siyuan.logger`

结构化写入 kernel 日志：

- `trace`
- `debug`
- `info`
- `warn`
- `error`

此外 goja_nodejs console 被启用，`console.log/warn/error` 也会进入 kernel log。

### `siyuan.storage`

插件作用域文件 CRUD，路径限制在：

```text
data/storage/petal/<plugin-name>/
```

能力：

- `get(path)` -> lazy data object
- `put(path, content)`
- `remove(path)`
- `list(path)`

`get()` 返回对象支持：

- `text()`
- `json()`
- `buffer()`
- `arrayBuffer()`

注意：当前 `put()` 以字符串内容为主，适合 JSON/文本。大二进制文件和 SQLite 主库不应第一阶段迁入 kernel 写入。

### `siyuan.rpc`

注册 JSON-RPC 方法：

- `bind(name, fn, ...descriptions)`
- `unbind(name)`
- `broadcast(method, params?)`

外部调用入口：

- `POST /api/plugin/rpc/:name`
- `GET /ws/plugin/rpc/:name`

P0 adapter 采用的 JSON-RPC 请求形状：

- body 固定为 `{ "jsonrpc": "2.0", "method": string, "params": array | object, "id": number | string }`。
- 无参方法使用空 positional params：`"params": []`。
- 不要发送 `"params": null`；即使插件状态为 `running`，当前内核也会返回 `-32600 Invalid Request`。
- adapter 层负责把 HTTP/RPC error 映射成显式 unavailable 或抛出 adapter error，Settings/UI 不直接处理 `/api/plugin/rpc/*` envelope。

这正好适合浏览器端 SiYuanMemo 通过 adapter 调 kernel companion。

### `siyuan.client`

由 kernel 代理并自动注入插件 JWT：

- `fetch(path, init?)`
- `socket(path, protocols?)`
- `event(path)`

`fetch` 目标为本机思源 server 的绝对 path，例如 `/api/riff/getRiffDecks`。

高价值用法：

- kernel companion 调 `/api/riff/*`
- kernel companion 调 `/api/query/sql`
- kernel companion 调 `/api/broadcast/*` 或 SSE/WS endpoints
- 后台网络请求或长任务不依赖前端 tab/dialog 生命周期

### `siyuan.server`

当前声明只开放 private scope：

- `/plugin/private/<name>/*path`

handler 形态：

- `siyuan.server.private.http.handler`
- `siyuan.server.private.ws.handler`
- `siyuan.server.private.es.handler`

PR 描述和实现里 WS/SSE server handler 已有路径；但 `kernel.d.ts` 部分注释仍有“reserved / not yet implemented”式残留。实际采用前必须用本地编译版 smoke test 确认。

## 与前端插件 runtime 的关系

内核插件不是前端 `siyuan` npm API 的替代品。

| 能力 | 前端插件 | kernel plugin |
|---|---|---|
| Vue / DOM / Protyle UI | 有 | 无 |
| `addTab/addDock/addTopBar` | 有 | 无 |
| `eventBus('ws-main')` | 有 | 不等价 |
| kernel REST/Riff API 调用 | `fetch('/api/...')` | `siyuan.client.fetch('/api/...')` |
| 常驻后台 | 依赖前端插件生命周期 | 更接近 kernel 生命周期 |
| JSON-RPC 服务 | 需要自建 | 内置 |
| 插件作用域文件 | `loadData/saveData` 等 | `siyuan.storage` |

因此 SiYuanMemo 应保留前端插件作为 UI / composition root / review surface 主体。kernel companion 只做后台能力和 RPC helper。

## SiYuanMemo 当前相关架构

当前架构方向：

```text
ui -> application -> core -> infrastructure
```

关键事实：

- `ApplicationContext` 是唯一组合根。
- Siyuan/Riff 能力通过 `application/ports/*` 定义，由 `infrastructure/siyuan/*` 适配。
- `TransactionWebSocketService` 目前订阅前端 `plugin.eventBus.on('ws-main')`，分发给 AutoCard、doc tree review scope、native Riff sync、review source refresh 等 handler。
- `FileService` 封装前端 `loadData/saveData`，并额外通过 `/api/file/getFile` / `/api/file/putFile` 读写 `siyuanmemo.db` 二进制。
- `ARCHITECTURE.md` 已明确：主数据优先 `siyuanmemo.db`，browser plugin application 层通过 sql.js 单写，`kernel.js` 暂留未来算法计算 RPC 位置，不直接写 DB。

这说明 kernel companion 的接入点应是新的 infrastructure adapter，而不是让 UI 或 application 直接调用 `/api/plugin/rpc`。

## 推荐架构

新增 bounded context 可归为 `Siyuan integration` / cross-cutting background integration。

建议新增端口：

```ts
export interface KernelPluginPort {
  isAvailable(): Promise<boolean>;
  getStatus(): Promise<KernelPluginStatus>;
  call<T>(method: string, params?: unknown): Promise<T>;
}
```

基础设施实现：

```text
src/application/ports/KernelPluginPort.ts
src/infrastructure/siyuan/KernelPluginRpcAdapter.ts
src/kernel.ts
```

调用方向：

```text
UI
  -> Application service
    -> KernelPluginPort
      -> KernelPluginRpcAdapter
        -> /api/plugin/rpc/siyuan-plugin-siyuanmemo
          -> kernel.js RPC method
            -> siyuan.client.fetch('/api/...')
```

不建议：

- UI 直接 `fetch('/api/plugin/rpc/...')`
- application service 直接 import kernel RPC helper
- kernel.js 直接写 `siyuanmemo.db`
- kernel.js 复制 Browser/Review 业务状态

## 可增强方向

### P0：Kernel Companion Health + Riff Audit

目标：确认新 runtime 可用，并建立稳定 RPC 通道。

RPC methods：

- `health`
- `version`
- `listRiffDecks`
- `auditNativeRiff`

收益：

- 验证 `kernels` / `kernel.js` / RPC endpoint / build copy 机制。
- 不碰主数据写入。
- 为后续后台同步和诊断打底。

前端可在设置页或诊断页显示：

- kernel companion 是否 loaded/running
- 已绑定 RPC methods
- 当前平台
- Riff decks 概览

### P1：后台 Riff 观察与轻量同步辅助

目标：减少前端 `ws-main` 常驻监听压力。

可做：

- kernel companion 通过 `siyuan.client.socket('/ws/...')` 或 SSE 订阅宿主事件。
- 解析 native Riff add/remove/update 迹象。
- 通过 `siyuan.rpc.broadcast()` 通知前端。
- 前端仍由 `XiuyuanSyncService` 作为唯一同步提交边界。

关键边界：

- kernel companion 可以“发现事件”和“做只读 audit”。
- 正式本地 Xiuyuan/CardDTO/queue mutation 仍在现有 application service 内执行。

### P2：后台长任务与 AI 网络桥

目标：把不需要 DOM 的长耗时任务移出 UI surface。

候选：

- AI web search / fetch proxy
- 大批量 Riff audit
- 周期性 source existence check
- Arena contestant shadow calculation
- diagnostic profile

注意：

- 密钥仍应按现有 AI settings 权限模型处理。
- 任务要有 job id、cancel、progress、timeout、日志。
- 结果通过 RPC response 或 broadcast 回 browser application。

### P3：算法 RPC / Arena 计算端

目标：把 SRS Arena contestant 或耗时算法放到 kernel companion。

适合：

- 只读预测
- 批量模拟
- diagnostic scoring
- candidate algorithm explain

不适合第一阶段：

- 正式调度写回
- 主 card state mutation
- 直接接管 `SchedulerRouter`

## 风险与边界

### 双写风险

`siyuanmemo.db` 当前由 browser-side sql.js 管理。若 kernel companion 也读写该文件，会出现：

- 两个 SQLite runtime 各持一份内存状态。
- browser persist 覆盖 kernel persist。
- kernel persist 覆盖 browser persist。
- review hot path rollback 语义失效。

结论：第一阶段 kernel companion 不写主 DB。后续若要迁移，必须先设计单写者协议或把整个 SQL ownership 迁到 kernel。

### EventBus 语义差异

前端 `plugin.eventBus('ws-main')` 是 app runtime 的 DOM EventTarget 包装。kernel plugin 的 `siyuan.event` 是 kernel plugin 内部 event bus。两者不是同一条总线。

结论：不能假设 `siyuan.event.handler` 会收到前端 `ws-main` 同形 payload。需要本地编译版验证可用事件源。

### Server handler 稳定性

`siyuan.server.private.http` 很适合私有诊断页面或文件服务代理；WS/SSE server handler 在实现与声明之间有一点文档滞后。

结论：P0 不依赖 private WS/SSE server handler，只用 JSON-RPC HTTP；P1 再验证 WebSocket。

### 平台与发布

`kernels` 已按官方 sample 扩到桌面、移动、Docker/Harmony 与 `all`，用于让 kernel companion 在支持后端插件系统的平台上可被加载；移动端/容器上的 writer 归属、资源限制与跨端 relay 仍未验证，不能仅凭 manifest 视为跨端 writer 已完成。

结论：manifest 先跟随官方 sample 覆盖 `windows/linux/darwin/ios/android/harmony/docker/all`；桌面多窗口 writer 稳定性与跨端 writer 策略分别验证，不能把平台声明等同于跨端单 writer 完成。

### Build 复杂度

当前构建拆成 webpack kernel entry + Vite app entry：

- `build:kernel` 使用 `webpack.kernel.config.cjs` 把 `src/kernel.ts` 构建为 `build/kernel/kernel.js`。
- `build:app` 使用 `vite.config.ts` 构建前端 `src/index.ts` 到 `index.js`，并把 `build/kernel/kernel.js` 复制到发布包根目录。
- `build` 通过 `run-s build:kernel build:app` 保证 packaged `kernel.js` 先生成再复制。

`src/kernel.ts` 使用 `/// <reference types="siyuan/kernel" />` 和 `siyuan@1.2.2-alpha.0` 的 kernel 类型。Kernel entry 保持独立，不 import browser-only dependency，不直接读写 `siyuanmemo.db`。

结论：P0 已从根目录手写 `kernel.js` 收口为 typed source + sample-style webpack kernel build，仍保持前端 bundle 不被 kernel runtime 依赖污染。

## 建议实施切片

### Step 1：Manifest + Smoke Kernel

改动：

- `plugin.json` 添加 `kernels`。
- 新增 `src/kernel.ts` 最小 kernel companion source。
- 新增 `webpack.kernel.config.cjs`，Vite static copy 包含 `build/kernel/kernel.js`。

RPC：

- `health`
- `version`

验收：

- `/api/plugin/listLoadedPlugins` 能看到 SiYuanMemo。
- `/api/plugin/getLoadedPlugin` 返回 state `running`。
- `/api/plugin/rpc/siyuan-plugin-siyuanmemo` 调 `health` 返回 ok。

### Step 2：前端 Port + Adapter

改动：

- `KernelPluginPort`
- `KernelPluginRpcAdapter`
- `ApplicationContext` 注入 adapter。
- 设置/诊断入口只读展示 status。

验收：

- kernel 不存在时返回 unavailable，不影响正常插件启动。
- kernel 存在时 status 正常。
- UI 不直连 `/api/plugin/rpc`。

### Step 3：Riff Audit RPC

改动：

- kernel method 调 `/api/riff/getRiffDecks`、必要时分页读取 deck cards。
- 返回只读 audit summary。

验收：

- 不写本地 Xiuyuan/CardDTO。
- 不写 `siyuanmemo.db`。
- 错误可在前端诊断面看到。

### Step 4：Broadcast Bridge

改动：

- 前端用 WS 连接 `/ws/plugin/rpc/<name>`。
- kernel 通过 `siyuan.rpc.broadcast()` 推送 job/progress/audit event。

验收：

- reconnect/backoff。
- onunload 清理。
- 前端 disable 时无 listener 泄漏。

## 推荐第一版 kernel.js 草图

```js
const state = {
  startedAt: Date.now(),
  version: siyuan.plugin.version,
};

async function api(path, body = {}) {
  const response = await siyuan.client.fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data?.code !== 0) {
    throw new Error(data?.msg || response.statusText || `Request failed: ${path}`);
  }
  return data.data;
}

siyuan.plugin.lifecycle.onload = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] loading');

  await siyuan.rpc.bind('health', async () => ({
    ok: true,
    plugin: siyuan.plugin.name,
    version: state.version,
    platform: siyuan.plugin.platform,
    uptimeMs: Date.now() - state.startedAt,
  }), 'Return SiYuanMemo kernel companion health.');

  await siyuan.rpc.bind('listRiffDecks', async () => {
    return api('/api/riff/getRiffDecks');
  }, 'List native SiYuan Riff decks.');
};

siyuan.plugin.lifecycle.onunload = async () => {
  await siyuan.rpc.broadcast('siyuanmemo.kernel.unload', {
    at: Date.now(),
  });
  await siyuan.logger.info('[SiYuanMemo kernel] unloaded');
};
```

此草图只表达方向。正式实现应加 method namespace、schema validation、timeout、错误 envelope、build 流程和测试。

## 与当前架构的对齐判断

推荐路线符合当前 SiYuanMemo 架构：

- 不新增 UI -> infrastructure 直连。
- 不绕过 `ApplicationContext`。
- 不恢复旧 `QuickCardWebSocketService` 双路径。
- 不让 kernel companion 成为第二个主数据写入者。
- 把新能力收束为 infrastructure adapter + application port。

当前最值得替换的不是 Review/Browser 主链，而是“后台/诊断/同步观察”类能力：

- Riff audit
- native Riff event observation
- long-running diagnostics
- AI/network background tasks
- SRS Arena shadow calculation

## 待验证清单

在用户已编译安装的本地思源版本中，需要逐项验证：

- `plugin.json.kernels` 在桌面、移动、Docker/Harmony 与 `all` 声明匹配后能启动；跨端 writer smoke 仍需另行验证。
- `kernel.js` 热更新/禁用/启用生命周期表现。
- `/api/plugin/listLoadedPlugins` 与 `/api/plugin/getLoadedPlugin` 返回结构。
- `POST /api/plugin/rpc/:name` 已确认使用完整 JSON-RPC 2.0 envelope；升级内核分支时继续复核 endpoint shape 与 `params` 校验。
- `/ws/plugin/rpc/:name` broadcast 是否稳定。
- `siyuan.client.fetch('/api/riff/getRiffDecks')` 返回 envelope 形状。
- `siyuan.client.socket()` 能否订阅思源主 WS 或相关 proxy endpoint。
- `siyuan.server.private.http` 可用性。
- `siyuan.server.private.ws/es` 实际可用性与 `kernel.d.ts` 注释是否一致。
- `siyuan.storage.put()` 对大文件/二进制场景的限制。

## 最终建议

短期做 kernel companion，不做 kernel rewrite。

SiYuanMemo 当前主架构已经比较清楚：browser application 是主组合根，SQL 是 browser-side 单写，Review/Browser/Queue/Scheduler 已经有稳定 active path。内核插件系统真正打开的新空间，是让后台任务摆脱 UI surface 生命周期，同时通过 JSON-RPC 给前端提供一个干净的能力端口。

因此第一阶段目标应是“跑通 + 收口 + 不破坏”：health、status、Riff audit、diagnostic。等 RPC 通道和生命周期稳定，再讨论是否把 native Riff observation、AI fetch bridge、Arena shadow calculation 放进去。
