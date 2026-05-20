import { Dialog, showMessage } from 'siyuan';
import type { ApplicationContext } from '@/application/ApplicationContext';
import type { SyncConflictDirectionApplyResult, SyncConflictDirectionPreview } from '@/application/services/SyncConflictDirectionResolutionService';
import type {
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncStatusResult,
} from '../../../packages/contracts/src/backend-rpc';
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

function renderDomainSyncPanel(
  status: BackendDomainSyncStatusResult | null,
  repairPreview: BackendDomainSyncRepairPreviewResult | null,
  i18n: Record<string, string>,
): string {
  if (!status) {
    return `
      <div class="b3-card b3-card--warning siyuanmemo-domain-sync-panel" style="margin: 10px 0; padding: 10px;">
        ${escapeHtml(i18n.domainSyncStatusUnavailable || 'Domain sync diagnostics unavailable')}
      </div>
    `;
  }
  const skipped = status.processedSources.skipped.slice(0, 3)
    .map((source) => `<span class="b3-chip b3-chip--middle">${escapeHtml(source.sourceId)}: ${escapeHtml(source.skippedReason || 'skipped')}</span>`)
    .join(' ');
  const previewRows = repairPreview?.evidence.slice(0, 5).map((item) => `
    <tr>
      <td class="ft__breakword">${escapeHtml(item.cardId)}</td>
      <td>${escapeHtml(item.reason)}</td>
      <td>${item.reviewEventCount}</td>
      <td>${item.cardReps ?? '-'}</td>
      <td>${fmtTime(item.newestReviewEventAt)}</td>
    </tr>
  `).join('') || '';
  const canPreview = status.repair.available || status.sanity.repairableDivergenceCount > 0;
  const canApply = repairPreview?.status === 'preview' && repairPreview.plannedMutations.length > 0;
  return `
    <div class="siyuanmemo-domain-sync-panel" style="margin: 10px 0; padding: 10px; border: 1px solid var(--b3-border-color); border-radius: 6px;">
      <div class="fn__flex" style="align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        <div>
          <div style="font-weight: 600;">${escapeHtml(i18n.domainSyncHealth || 'Domain sync health')}: ${escapeHtml(status.sanity.status)}</div>
          <div class="ft__on-surface" style="font-size: 12px;">
            ${escapeHtml(i18n.domainSyncLedgerOps || 'Ledger ops')}: ${status.ledger.operationCount}
            · ${escapeHtml(i18n.domainSyncRepairable || 'Repairable')}: ${status.sanity.repairableDivergenceCount}
            · ${escapeHtml(i18n.domainSyncSkippedSources || 'Skipped sources')}: ${status.processedSources.totalSkipped}
          </div>
        </div>
        <div class="fn__flex" style="gap: 8px;">
          <button class="b3-button b3-button--outline" data-action="domain-preview" ${canPreview ? '' : 'disabled'}>${escapeHtml(i18n.domainSyncPreviewRepair || 'Preview repair')}</button>
          <button class="b3-button b3-button--error" data-action="domain-apply" ${canApply ? '' : 'disabled'}>${escapeHtml(i18n.domainSyncApplyRepair || 'Apply repair')}</button>
        </div>
      </div>
      ${skipped ? `<div style="margin-top: 8px;">${skipped}</div>` : ''}
      ${repairPreview ? `
        <div style="margin-top: 10px; max-height: 180px; overflow: auto; border: 1px solid var(--b3-border-color); border-radius: 4px;">
          <table class="b3-table" style="width: 100%; margin: 0;">
            <thead>
              <tr>
                <th>${escapeHtml(i18n.card || 'Card')}</th>
                <th>${escapeHtml(i18n.reason || 'Reason')}</th>
                <th>${escapeHtml(i18n.domainSyncReviewEvents || 'Events')}</th>
                <th>${escapeHtml(i18n.domainSyncCardReps || 'Card reps')}</th>
                <th>${escapeHtml(i18n.syncConflictResolutionLatest || 'Latest')}</th>
              </tr>
            </thead>
            <tbody>${previewRows}</tbody>
          </table>
        </div>
        <div class="ft__on-surface" style="margin-top: 6px; font-size: 12px;">
          ${escapeHtml(i18n.domainSyncPlannedMutations || 'Planned mutations')}: ${repairPreview.plannedMutations.length}
          · ${escapeHtml(i18n.domainSyncUnrepairable || 'Unrepairable')}: ${repairPreview.unrepairableReasons.length}
          ${repairPreview.truncated ? `· ${escapeHtml(i18n.truncated || 'Truncated')}` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderPreview(
  preview: SyncConflictDirectionPreview,
  i18n: Record<string, string>,
  domainStatus: BackendDomainSyncStatusResult | null,
  repairPreview: BackendDomainSyncRepairPreviewResult | null,
): string {
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
      ${renderDomainSyncPanel(domainStatus, repairPreview, i18n)}
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
  let domainStatus: BackendDomainSyncStatusResult | null = null;
  let repairPreview: BackendDomainSyncRepairPreviewResult | null = null;
  try {
    preview = await context.previewSyncConflictDirectionResolution();
  } catch (error) {
    logger.error('Manual sync conflict preview failed:', error);
    showMessage(i18n.syncConflictResolutionPreviewFailed || 'Failed to preview sync conflicts', 5000, 'error');
    return;
  }
  try {
    domainStatus = await context.readDomainSyncDiagnostics();
  } catch (error) {
    logger.warn('Domain sync diagnostics preview unavailable:', error);
  }

  const dialog = new Dialog({
    title: i18n.syncConflictResolutionTitle || 'Resolve SiYuanMemo Sync Conflict',
    content: renderPreview(preview, i18n, domainStatus, repairPreview),
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

  function refreshDomainPanel(): void {
    const panel = dialog.element.querySelector('.siyuanmemo-domain-sync-panel');
    if (panel) {
      panel.outerHTML = renderDomainSyncPanel(domainStatus, repairPreview, i18n);
    }
    bindDomainActions();
  }

  function bindDomainActions(): void {
    dialog.element.querySelector('[data-action="domain-preview"]')?.addEventListener('click', () => {
      void (async () => {
        try {
          repairPreview = await context.previewDomainSyncRepair({ limit: 50, includeUnrepairable: true });
          refreshDomainPanel();
        } catch (error) {
          logger.error('Domain sync repair preview failed:', error);
          showMessage(error instanceof Error ? error.message : String(error), 7000, 'error');
        }
      })();
    });
    dialog.element.querySelector('[data-action="domain-apply"]')?.addEventListener('click', () => {
      void (async () => {
        if (!repairPreview || repairPreview.status !== 'preview') {
          return;
        }
        const confirmText = (i18n.domainSyncApplyConfirm
          || 'Apply repair plan {planId}? This updates card review state from review history.')
          .replace('{planId}', repairPreview.planId);
        if (!window.confirm(confirmText)) {
          return;
        }
        try {
          const result = await context.applyDomainSyncRepair({
            planId: repairPreview.planId,
            idempotencyKey: `domain-sync-repair:${repairPreview.planId}:${Date.now()}`,
            confirmedAt: Date.now(),
            confirmedBy: 'manual-sync-conflict-dialog',
            confirmationText: confirmText,
          });
          if (!result.ok) {
            showMessage(result.reason, 7000, 'error');
            return;
          }
          domainStatus = await context.readDomainSyncDiagnostics();
          repairPreview = null;
          refreshDomainPanel();
          showMessage((i18n.domainSyncApplyDone || 'Domain sync repair applied: {cards} cards')
            .replace('{cards}', String(result.appliedCards)), 5000, 'info');
        } catch (error) {
          logger.error('Domain sync repair apply failed:', error);
          showMessage(error instanceof Error ? error.message : String(error), 7000, 'error');
        }
      })();
    });
  }

  for (const action of ['smart-merge', 'keep-current', 'replace', 'cancel'] as const) {
    dialog.element.querySelector(`[data-action="${action}"]`)?.addEventListener('click', () => {
      void run(action);
    });
  }
  bindDomainActions();
}
