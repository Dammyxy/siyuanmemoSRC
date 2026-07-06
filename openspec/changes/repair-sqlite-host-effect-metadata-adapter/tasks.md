## 1. Feedback Loop

- [x] 1.1 Read fresh live logs and confirm `review.session.feedback` still reports sealed segment reads as `purpose=unknown substep=unknown`.
- [x] 1.2 Trace metadata from runtime SQLite delta diagnostics through worker SQLite persistence and backend host effects.
- [x] 1.3 Identify the shape mismatch between runtime `{ diagnostics: { sqliteDeltaPurpose, sqliteDeltaSubstep } }` and bridge `{ purpose, substep }`.

## 2. Implementation

- [x] 2.1 Add a worker SQLite metadata normalizer at the persistence Adapter Seam.
- [x] 2.2 Forward normalized metadata for SQLite `readBinary`, `writeBinary`, `readJSON`, and `writeJSON` host effects.
- [x] 2.3 Preserve direct bridge metadata support and suppress unrelated diagnostics.
- [x] 2.4 Keep Review durable commit and SQLite delta persistence behavior unchanged.

## 3. Tests

- [x] 3.1 Add focused Adapter regression proving runtime diagnostics become bridge host-effect metadata.
- [x] 3.2 Add focused regression proving direct bridge metadata still passes through.
- [x] 3.3 Run focused worker DB metadata tests.

## 4. Docs And Validation

- [x] 4.1 Update architecture/debt docs with the Adapter Seam repair and remaining frontend CDF bottleneck.
- [x] 4.2 Run `pnpm run check:boundaries`.
- [x] 4.3 Run `pnpm build`.
- [x] 4.4 Run `openspec validate repair-sqlite-host-effect-metadata-adapter --strict`.
