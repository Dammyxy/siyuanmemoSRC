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

Writer ownership follows runtime profile:

1. Desktop Electron uses a Primary-App Writer profile: the main SiYuan app renderer is the canonical writer, and document windows are followers rather than peer writers.
2. If a desktop document window observes no primary-app writer lease while kernel/RPC is still alive, it must fail closed with explicit writer-unavailable diagnostics instead of silently taking over.
3. Docker/browser and mobile WebView do not have Electron main-window semantics; they require a separate Active-Frontend Writer profile rather than inheriting desktop document-window rules.
4. Profile detector work starts with diagnostics only: collect bounded runtime observations for desktop main window, desktop document window, Docker/browser, and mobile WebView before changing writer election behavior.

## Consequences

- Kernel 与 Worker 职责清晰，可渐进演进到多窗口 single-writer 协议。
- 避免把 scheduler/Riff/card/AI 会话主写路径提前迁入 kernel，降低回归风险。
- Desktop writer stability is modeled as primary-app binding, not as open competition among all frontend renderers.
- Cross-end writer behavior remains explicit product/design work for Docker/browser and mobile WebView profiles.
- Existing `locationHref` role detection is treated as a signal, not as the full cross-end profile detector.

## Evidence

2026-05-13 local desktop Electron CDP probe:

- Main renderer: `/stage/build/app/?v=<redacted>`, `system.container=std`, Electron user-agent family, plugin `isBrowser=false`, plugin `isMobile=false`, writer runtime mode `writer`, active lease location matches main renderer.
- Document window renderer: `/stage/build/app/window.html?enWindowTitle=<redacted>&enhance=<redacted>`, `system.container=std`, Electron user-agent family, plugin `isBrowser=true`, plugin `isMobile=false`, writer runtime mode `follower`, observed active lease still points to main renderer.
- Browser frontend against the same desktop backend: `/stage/build/desktop/?r=<redacted>`, `system.container=std`, browser user-agent family, plugin `isBrowser=true`, plugin `isMobile=false`, runtime mode `follower`. One observation saw the lease pointing at the desktop document window during handover, then the main renderer reclaimed writer on the next CDP probe. Treat this as evidence that browser frontend probing can reveal lease transitions, but should not be used as Docker-backend evidence.

This supports using plugin/runtime profile signals together with sanitized URL role signals for desktop detection. Docker/browser and mobile WebView still need their own captured payloads before detector behavior changes.
