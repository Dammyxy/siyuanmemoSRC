# ADR-003 Kernel Sidecar Coordinator

- Status: Accepted
- Date: 2026-04-30

## Context

SiYuan kernel companion 适合常驻协调与事件广播，但不适合作为主 DB writer。需要明确其职责边界，避免 runtime ownership 漂移。

## Decision

`kernel.js` 仅作为协调层：

1. 保持 `health/version/capabilities` 与 JSON-RPC 通道。
2. 预留 writer lease、事件收集、host API batch proxy、network proxy、private HTTP facade。
3. 明确 `writesSiyuanMemoDb: false`，禁止主库写入。

## Consequences

- Kernel 与 Worker 职责清晰，可渐进演进到多窗口 single-writer 协议。
- 避免把 scheduler/Riff/card/AI 会话主写路径提前迁入 kernel，降低回归风险。
