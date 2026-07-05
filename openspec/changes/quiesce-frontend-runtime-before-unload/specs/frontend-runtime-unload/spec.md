# frontend-runtime-unload Specification

## ADDED Requirements

### Requirement: Frontend runtime quiesces before unload cleanup

When plugin/application disposal starts, the frontend instance runtime MUST synchronously stop background heartbeat, relay polling, push relay subscription callbacks, relay continuation timers, visibility refresh handlers, and runtime registry membership before other unload cleanup continues.

#### Scenario: SiYuan unloads kernel companion during update

- **GIVEN** the frontend runtime is active as writer
- **WHEN** application disposal begins
- **THEN** heartbeat and writer relay polling MUST stop before later unload steps can race kernel companion teardown
- **AND** subsequent stale push relay state changes or push command callbacks MUST NOT issue writer RPC calls
- **AND** shutdown-time degraded push relay diagnostics MUST NOT be logged as active runtime warnings

### Requirement: Normal runtime ownership behavior remains unchanged

Frontend runtime shutdown guards MUST apply only after explicit unload quiesce or dispose begins.

#### Scenario: Runtime ownership refresh before start

- **GIVEN** tests or startup paths call ownership refresh before the runtime is started
- **WHEN** the runtime is not unloading
- **THEN** it MUST still observe/acquire writer lease using the existing ownership rules
