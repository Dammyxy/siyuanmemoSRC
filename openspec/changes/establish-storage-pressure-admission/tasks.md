## 1. Admission Module Contract

- [x] 1.1 Add failing Module tests for exact baseline, normal admission, append reclassification, soft refresh coalescing, and hard blocking evidence
- [x] 1.2 Implement `WorkerStoragePressureAdmissionModule` with cached inventory ownership and explicit exact-collector dependency

## 2. Delta Observation Plumbing

- [x] 2.1 Add failing SQLite delta tests for post-append active inventory evidence
- [x] 2.2 Return post-append delta inventory and entry-growth evidence through the internal durability callback without changing persisted or RPC contracts

## 3. Worker Integration

- [x] 3.1 Add a failing Review feedback regression that clears host-effect spies after load and requires zero projection/truth inventory reads plus a verified journaled receipt
- [x] 3.2 Establish the exact admission baseline during writable startup and route explicit inventory diagnostics through the Module
- [x] 3.3 Replace formal mutation full scans with cached admission decisions and feed durability observations back into the Module
- [x] 3.4 Coalesce soft-pressure exact refresh and preserve synchronous high/hard maintenance, legacy recovery, and fail-closed behavior
- [x] 3.5 Refresh admission evidence after promotion, compaction, recovery, shutdown/reset, and maintenance transitions

## 4. Verification

- [x] 4.1 Run focused admission, SQLite delta, Worker storage-pressure, and Review feedback tests
- [x] 4.2 Run `pnpm run check:boundaries`, `pnpm build`, and strict OpenSpec validation
- [x] 4.3 Record measured hot-path assertions and any remaining delta-payload follow-up in the change artifacts
