## Why

Desktop SiYuan users normally run one desktop app that owns both the kernel and the Electron primary window. When that primary window is backgrounded, renderer heartbeat throttling can let the writer lease expire, leaving `leaseHolder=null`; follower relay then has no active writer and Review feedback can fail with `BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease`.

The current policy is "primary window preferred" rather than "desktop primary window owns writer eligibility". That leaves document-window/browser fallback behavior and hidden empty-lease recovery ambiguous in the exact state where ordinary desktop review needs a stable writer.

## What Changes

- Bind ordinary desktop writer eligibility to the desktop Electron `primary-app` role.
- Keep desktop document windows, QuickNote/enhance auxiliary windows, and ordinary desktop browser frontends out of desktop writer ownership.
- Allow hidden desktop `primary-app/canonical` runtimes to reacquire an empty writer lease when backend Worker health is good.
- Preserve mobile behavior: mobile app/WebView continues using its existing backend-worker ownership policy and is not changed by desktop writer binding.
- Preserve kernel companion scope: kernel continues to own lease/relay coordination only and does not write `siyuanmemo.db`.
- Repair recovery paths that currently relay into an empty writer: Review feedback and kernel transaction action polling should attempt desktop primary writer recovery before returning explicit unavailable.
- Add warning/backoff behavior for repeated no-active-writer action polling so background timer throttling does not flood logs.

## Capabilities

### New Capabilities
- `desktop-primary-writer-lease`: Defines desktop writer eligibility, hidden primary-app empty-lease recovery, and no-fallback unavailable behavior for non-primary desktop surfaces.

### Modified Capabilities

## Impact

- Runtime ownership: `src/application/clients/FrontendInstanceRuntime.ts`, `src/application/clients/writerProfileDetector.ts`.
- Kernel companion lease policy: `src/kernel.ts`, `packages/contracts/src/kernel-rpc.ts` if contract wording needs tightening.
- Writer relay consumers: `src/application/usecases/review/ReviewCommitUseCase.ts`, `src/application/handlers/KernelTransactionActionPump.ts`.
- Tests: frontend runtime, kernel writer lease/profile policy, Review commit writer recovery, kernel transaction action pump writer recovery.
- Docs/debt: `ARCHITECTURE.md`, `docs/DDD_RESCAN_BACKLOG.md`, and the investigation report.
