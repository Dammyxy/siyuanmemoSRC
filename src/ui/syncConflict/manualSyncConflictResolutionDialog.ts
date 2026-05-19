import { Dialog, showMessage } from 'siyuan';
import type { ApplicationContext } from '@/application/ApplicationContext';
import type { SyncConflictDirectionApplyResult, SyncConflictDirectionPreview } from '@/application/services/SyncConflictDirectionResolutionService';
import { applyDialogChrome } from '@/utils/dialog';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ManualSyncConflictResolutionDialog');

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtTime(value: number | null | undefined): string {
  if (!value) {
    return '-';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function fmtSize(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function resultMessage(result: SyncConflictDirectionApplyResult, i18n: Record<string, string>): string {
  if (result.kind === 'smartMerge') {
    return (i18n.syncConflictResolutionSmartMergeDone
      || 'Smart merge complete: sources {sources}, reviews {reviewEvents}, cards {cards}')
      .replace('{sources}', String(result.merge.sources))
      .replace('{reviewEvents}', String(result.merge.mergedReviewEvents))
      .replace('{cards}', String(result.merge.mergedCards));
  }
  if (result.kind === 'keepCurrentLocal') {
    return i18n.syncConflictResolutionKeepCurrentDone
      || 'Current local database kept. Conflict files were not changed.';
  }
  if (result.kind === 'replaceWithConflictCopy') {
    return (i18n.syncConflictResolutionReplaceDone
      || 'Replacement complete. Backup: {backupPath}')
      .replace('{backupPath}', result.backupPath);
  }
  return i18n.syncConflictResolutionCanceled || 'Resolution canceled';
}

function renderPreview(preview: SyncConflictDirectionPreview, i18n: Record<string, string>): string {
  const current = preview.current;
  const sourceRows = preview.sources.map((source, index) => {
    const disabled = source.parseStatus !== 'ok' ? 'disabled' : '';
    const status = source.parseStatus === 'ok'
      ? (i18n.syncConflictResolutionStatusReadable || 'Readable')
      : `${i18n.syncConflictResolutionStatusUnavailable || 'Unavailable'}: ${source.parseError || source.parseStatus}`;
    return `
      <tr>
        <td><input type="radio" name="sync-conflict-source" value="${escapeHtml(source.sourceId)}" ${index === 0 && !disabled ? 'checked' : ''} ${disabled}></td>
        <td class="ft__breakword">${escapeHtml(source.sourceId)}<br><span class="ft__on-surface">${escapeHtml(source.path || '')}</span></td>
        <td>${fmtSize(source.size)}</td>
        <td>${source.reviewEventCount}</td>
        <td>${source.cardCount}</td>
        <td>${fmtTime(source.latestReviewTimestamp || source.latestCardTimestamp)}</td>
        <td>${escapeHtml(status)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="siyuanmemo-sync-conflict-dialog" style="padding: 12px; font-size: 13px;">
      <div class="b3-label" style="margin: 0 0 8px 0;">
        <div class="fn__flex" style="gap: 12px; flex-wrap: wrap;">
          <span>${escapeHtml(i18n.syncConflictResolutionCurrent || 'Current local')}: ${current ? `${current.reviewEventCount} reviews / ${current.cardCount} cards` : '-'}</span>
          <span>${escapeHtml(i18n.syncConflictResolutionLatest || 'Latest')}: ${fmtTime(current?.latestReviewTimestamp || current?.latestCardTimestamp)}</span>
        </div>
      </div>
      ${preview.sources.length === 0 ? `
        <div class="b3-card b3-card--info" style="margin: 8px 0; padding: 10px;">
          ${escapeHtml(i18n.syncConflictManualMergeNoSources || 'No SiYuanMemo sync conflict databases found')}
        </div>
      ` : `
        <div style="max-height: 340px; overflow: auto; border: 1px solid var(--b3-border-color); border-radius: 6px;">
          <table class="b3-table" style="width: 100%; margin: 0;">
            <thead>
              <tr>
                <th></th><th>${escapeHtml(i18n.syncConflictResolutionSource || 'Source')}</th><th>${escapeHtml(i18n.syncConflictResolutionSize || 'Size')}</th><th>${escapeHtml(i18n.syncConflictResolutionReviews || 'Reviews')}</th><th>${escapeHtml(i18n.syncConflictResolutionCards || 'Cards')}</th><th>${escapeHtml(i18n.syncConflictResolutionLatest || 'Latest')}</th><th>${escapeHtml(i18n.syncConflictResolutionStatus || 'Status')}</th>
              </tr>
            </thead>
            <tbody>${sourceRows}</tbody>
          </table>
        </div>
      `}
      <div class="fn__flex" style="justify-content: flex-end; gap: 8px; margin-top: 12px;">
        <button class="b3-button b3-button--cancel" data-action="cancel">${escapeHtml(i18n.cancel || 'Cancel')}</button>
        <button class="b3-button b3-button--outline" data-action="keep-current">${escapeHtml(i18n.syncConflictResolutionKeepCurrent || 'Keep current local')}</button>
        <button class="b3-button" data-action="smart-merge" ${preview.sources.some((source) => source.parseStatus === 'ok') ? '' : 'disabled'}>${escapeHtml(i18n.syncConflictResolutionSmartMerge || 'Smart merge')}</button>
        <button class="b3-button b3-button--error" data-action="replace" ${preview.sources.some((source) => source.parseStatus === 'ok') ? '' : 'disabled'}>${escapeHtml(i18n.syncConflictResolutionReplace || 'Use selected conflict copy')}</button>
      </div>
    </div>
  `;
}

function selectedSourceId(dialog: Dialog): string | null {
  const input = dialog.element.querySelector<HTMLInputElement>('input[name="sync-conflict-source"]:checked');
  return input?.value || null;
}

export async function openManualSyncConflictResolutionDialog(context: ApplicationContext): Promise<void> {
  const i18n = context.getI18n?.() || {};
  let preview: SyncConflictDirectionPreview;
  try {
    preview = await context.previewSyncConflictDirectionResolution();
  } catch (error) {
    logger.error('Manual sync conflict preview failed:', error);
    showMessage(i18n.syncConflictResolutionPreviewFailed || 'Failed to preview sync conflicts', 5000, 'error');
    return;
  }

  const dialog = new Dialog({
    title: i18n.syncConflictResolutionTitle || 'Resolve SiYuanMemo Sync Conflict',
    content: renderPreview(preview, i18n),
    width: 'min(920px, 96vw)',
  });
  applyDialogChrome(dialog, {
    visualVariant: 'form',
    containerClass: 'siyuanmemo-sync-conflict-resolution-dialog',
    dialogWidth: 'min(920px, 96vw)',
    dialogHeight: 'auto',
  });

  async function run(action: 'smart-merge' | 'keep-current' | 'replace' | 'cancel'): Promise<void> {
    try {
      if (action === 'cancel') {
        dialog.destroy();
        showMessage(resultMessage({ kind: 'cancel', unchanged: true }, i18n), 2500, 'info');
        return;
      }
      if (action === 'keep-current') {
        const result = await context.applySyncConflictDirectionResolution({ kind: 'keepCurrentLocal' });
        dialog.destroy();
        showMessage(resultMessage(result, i18n), 5000, 'info');
        return;
      }
      if (action === 'smart-merge') {
        const readable = preview.sources.filter((source) => source.parseStatus === 'ok').map((source) => source.sourceId);
        const result = await context.applySyncConflictDirectionResolution({ kind: 'smartMerge', sourceIds: readable });
        dialog.destroy();
        showMessage(resultMessage(result, i18n), 5000, 'info');
        return;
      }
      const sourceId = selectedSourceId(dialog);
      if (!sourceId) {
        showMessage(i18n.syncConflictResolutionSelectSource || 'Select one readable conflict copy', 3000, 'error');
        return;
      }
      const confirmText = (i18n.syncConflictResolutionReplaceConfirm
        || 'Replace current local database with {sourceId}? A backup will be created first.')
        .replace('{sourceId}', sourceId);
      if (!window.confirm(confirmText)) {
        return;
      }
      const result = await context.applySyncConflictDirectionResolution({
        kind: 'replaceWithConflictCopy',
        sourceId,
        confirmed: true,
      });
      dialog.destroy();
      showMessage(resultMessage(result, i18n), 7000, 'info');
    } catch (error) {
      logger.error('Manual sync conflict direction failed:', error);
      showMessage(error instanceof Error ? error.message : String(error), 7000, 'error');
    }
  }

  for (const action of ['smart-merge', 'keep-current', 'replace', 'cancel'] as const) {
    dialog.element.querySelector(`[data-action="${action}"]`)?.addEventListener('click', () => {
      void run(action);
    });
  }
}
