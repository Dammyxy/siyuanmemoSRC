# Upstream PR #17487 Summary (Local Snapshot)

Date: 2026-05-01
Source PR: `https://github.com/siyuan-note/siyuan/pull/17487`

## Migration-Relevant Conclusions

1. PR #17487 introduces a kernel plugin runtime (`kernel.js`) in SiYuan kernel.
2. Runtime capabilities are exposed via `globalThis.siyuan` (lifecycle, logger, storage, RPC, client/server).
3. The runtime does not provide a SQLite/database owner API for plugin canonical DB ownership.
4. For SiyuanMemo migration, the safe architecture remains:
   - `SRS Backend Worker` is the only `sql.js / siyuanmemo.db` owner.
   - `kernel.js` acts as sidecar/coordinator/proxy, not canonical DB owner.
5. `siyuan.storage.put` is suitable for plugin-scoped small files/state, not database hot-path writes.

## Hard Constraints Alignment

- Runtime split: `UI Shell + SRS Backend Worker + Kernel Sidecar`
- Worker-only SQL ownership
- Kernel does not persist cards/review_events/queue_state/AI sessions
- No hidden fallback dual-write; return explicit unavailable/error envelope

## Local Type Reference

- `kernel.d.ts`: `H:/project-F/flashcard/资料/kernel.d.ts`

## Notes

- This file is a branch-local upstream snapshot for day-to-day review during migration phases.
- If upstream changes, refresh this snapshot and record delta in migration docs/backlog as needed.
