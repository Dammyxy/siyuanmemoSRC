## 1. Startup Bootstrap

- [x] 1.1 Skip `review-events` truth replay when startup has loadable SQLite projection bytes
- [x] 1.2 Preserve full `review-events` replay for projection rebuild paths
- [x] 1.3 Add StorageBootstrapRuntime regression coverage for corrupt/heavy `review-events` truth with an existing projection

## 2. Storage Pressure Baseline

- [x] 2.1 Seed storage-pressure admission from startup delta/projection/truth evidence
- [x] 2.2 Remove exact storage-growth baseline inventory from synchronous Worker initialization
- [x] 2.3 Run exact baseline and migration marking from post-ready maintenance/recovery completion

## 3. Validation

- [x] 3.1 Update Worker startup/pressure source-order and hard-pressure expectations
- [x] 3.2 Run focused StorageBootstrapRuntime tests
- [x] 3.3 Run focused WorkerSqliteDatabaseService tests
- [x] 3.4 Run boundaries, build, and OpenSpec validation
