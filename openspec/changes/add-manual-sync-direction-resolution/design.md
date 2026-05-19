## Context

SiYuanMemo stores migrated SRS state in `data/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db`. Recent sync debugging showed that SiYuan file sync can preserve newer versions of that file as conflict copies under `temp/repo/sync/conflicts/**/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db`, while the active database remains stale.

The current implementation already has a backend-owned smart merge path: host code discovers conflict DB copies, passes bytes to the backend worker, and `sync.conflict.merge` appends missing review events and selects newer card rows. A command and topbar action can trigger that merge manually.

Anki handles full-sync conflicts by letting the backend report whether upload, download, or both directions are valid, then the Qt layer asks the user to upload local, download remote, or cancel. SiYuanMemo has no AnkiWeb server, so the equivalent directions are current local database, selected SiYuan conflict copy, and smart merge.

## Goals / Non-Goals

**Goals:**

- Provide an Anki-style manual conflict resolution dialog for SiYuanMemo sync conflict DB copies.
- Preview conflict sources before mutation.
- Preserve backend worker ownership of SQLite mutation and reload behavior.
- Make destructive replacement explicit, backed up, and confirm-gated.
- Keep conflict copies available after resolution.

**Non-Goals:**

- Do not implement a SiYuan cloud upload/download protocol.
- Do not delete or move SiYuan conflict files.
- Do not replace normal automatic smart merge.
- Do not add record-level hand-editing of card/review rows in this change.
- Do not make `kernel.js` own DB merge, replacement, or sync policy.

## Decisions

### Direction model maps Anki semantics to local conflict files

The dialog will present `Smart merge`, `Keep current local`, `Use selected conflict copy`, and `Cancel`.

- `Smart merge` reuses the existing `sync.conflict.merge` behavior and remains the recommended/default path.
- `Keep current local` performs no DB mutation. It closes the flow and reports that conflict files were left untouched.
- `Use selected conflict copy` replaces the active `siyuanmemo.db` with the selected copy after backup and confirmation.
- `Cancel` performs no DB mutation and records no decision.

Alternative considered: label actions as upload/download. This was rejected because SiYuanMemo is not talking to AnkiWeb; those labels would imply cloud-side mutation the plugin cannot perform.

### Preview is an application-level read model

The application layer will expose a preview operation that combines current DB summary with discovered conflict source summaries. Source summaries include source id/path, file modified time when host APIs expose it, byte size, review event count, card count, latest review timestamp, latest card timestamp, and parse errors.

The worker should inspect DB bytes using read-only SQLite loading or a narrowly scoped backend method. UI code must not parse SQLite directly.

Alternative considered: show only filenames. This was rejected because users need enough information to choose direction safely.

### Full replacement is backend-mediated and reload-safe

Replacement will be represented as an explicit backend/application operation, not a direct UI file write. The operation sequence is:

1. Read selected source bytes.
2. Back up the current `siyuanmemo.db` to a plugin data backup path with timestamp/source id.
3. Replace the active DB bytes.
4. Reload or recreate the backend worker SQLite service from the replaced file.
5. Return replacement and backup metadata to the UI.

If any step after backup fails, the UI reports the failure and points to the backup path. The implementation must prevent stale in-memory worker state from persisting over the replacement.

Alternative considered: write bytes through `FileService` from the UI and let the next backend request notice. This was rejected because the current worker can hold an in-memory DB and persistence bridge; replacement must be coordinated with backend state.

### Conflict files stay immutable

The resolver will not delete conflict files, mark them processed, or hide them permanently. A later change can add tombstones or “resolved” labels after product rules are clear.

Alternative considered: create processed-source tombstones immediately. This was rejected because users are still validating recovery behavior, and tombstones could hide useful forensic copies.

## Risks / Trade-offs

- [Risk] User chooses the wrong conflict copy and loses local-only rows. → Mitigation: create a backup before replacement, show metadata preview, and require explicit confirmation.
- [Risk] Worker overwrites a replacement with stale memory. → Mitigation: make replacement a backend-mediated operation that reloads or recreates SQLite state before returning.
- [Risk] Preview counts are expensive for many conflict files. → Mitigation: scan only discovered SiYuanMemo DB conflict copies and summarize sequentially or with a small concurrency limit.
- [Risk] Smart merge and full replacement semantics diverge. → Mitigation: keep smart merge on `sync.conflict.merge`; replacement uses a separate explicit operation and does not reuse merge code.
- [Risk] “Keep current local” is mistaken for cloud upload. → Mitigation: UI copy says it does not edit SiYuan cloud or conflict files; it only keeps current plugin DB for this run.
