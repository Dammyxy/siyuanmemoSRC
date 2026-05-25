import { Dialog, showMessage } from 'siyuan';
import type { ApplicationContext } from '@/application/ApplicationContext';
import type {
  ManualSyncBackupRetentionApplyResult,
  ManualSyncBackupRetentionPreviewResult,
} from '@/application/services/ManualSyncBackupRetentionApplicationService';
import type { SyncConflictDirectionApplyResult, SyncConflictDirectionPreview } from '@/application/services/SyncConflictDirectionResolutionService';
import type {
  BackendDomainSyncRepairApplyResult,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncConflictSourceCleanupCandidatesResult,
  BackendDomainSyncStatusResult,
} from '../../../packages/contracts/src/backend-rpc';
import { applyDialogChrome } from '@/utils/dialog';
import { createLogger } from '@/utils/logger';
import {
  buildReviewDomainSyncSafetyDecision,
  type ReviewDomainSyncSafetyDecision,
} from '@/application/services/ReviewDomainSyncSafetyService';

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
      || '智能合并完成：来源 {sources}，新增复习 {reviewEvents}，更新卡片 {cards}')
      .replace('{sources}', String(result.merge.sources))
      .replace('{reviewEvents}', String(result.merge.mergedReviewEvents))
      .replace('{cards}', String(result.merge.mergedCards));
  }
  if (result.kind === 'keepCurrentLocal') {
    return i18n.syncConflictResolutionKeepCurrentDone
      || '已保留当前本地库，冲突文件未改动。';
  }
  if (result.kind === 'replaceWithConflictCopy') {
    return (i18n.syncConflictResolutionReplaceDone
      || '替换完成，备份路径：{backupPath}')
      .replace('{backupPath}', result.backupPath);
  }
  return i18n.syncConflictResolutionCanceled || '已取消处理';
}

function label(i18n: Record<string, string>, key: string, fallback: string): string {
  return i18n[key] || fallback;
}

function template(
  i18n: Record<string, string>,
  key: string,
  fallback: string,
  values: Record<string, string | number>,
): string {
  let text = label(i18n, key, fallback);
  for (const [name, value] of Object.entries(values)) {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
  }
  return text;
}

function domainSyncStatusLabel(status: string, i18n: Record<string, string>): string {
  const labels: Record<string, [string, string]> = {
    clean: ['domainSyncStatusClean', '正常'],
    merged: ['domainSyncStatusMerged', '已合并'],
    repairable: ['domainSyncStatusRepairable', '可修复'],
    'needs-direction': ['domainSyncStatusNeedsDirection', '需要选择处理方向'],
    divergent: ['domainSyncStatusDivergent', '存在分歧'],
    'source-error': ['domainSyncStatusSourceError', '来源读取异常'],
  };
  const pair = labels[status];
  return pair ? label(i18n, pair[0], pair[1]) : status;
}

function domainSyncEvidenceReasonLabel(reason: string, i18n: Record<string, string>): string {
  const labels: Record<string, [string, string]> = {
    'missing-card-state': ['domainSyncReasonMissingCardState', '缺少卡片状态'],
    'missing-scheduler-evidence': ['domainSyncReasonMissingSchedulerEvidence', '缺少调度证据'],
    'review-history-newer-than-card-state': ['domainSyncReasonReviewHistoryNewer', '复习历史比卡片状态更新'],
    'review-event-count-exceeds-card-reps': ['domainSyncReasonReviewCountExceedsReps', '复习记录数超过卡片复习次数'],
  };
  const pair = labels[reason];
  return pair ? label(i18n, pair[0], pair[1]) : reason;
}

function domainSyncSkippedReasonLabel(reason: string | null | undefined, i18n: Record<string, string>): string {
  const raw = reason || 'skipped';
  const labels: Record<string, [string, string]> = {
    skipped: ['domainSyncSkippedReasonSkipped', '已跳过'],
    'parse-error': ['domainSyncSkippedReasonParseError', '解析失败'],
    'open-error': ['domainSyncSkippedReasonOpenError', '打开失败'],
    'schema-missing': ['domainSyncSkippedReasonSchemaMissing', '缺少同步表结构'],
  };
  const pair = labels[raw];
  return pair ? label(i18n, pair[0], pair[1]) : raw;
}

function reviewBlockDecisionMessage(
  decision: ReviewDomainSyncSafetyDecision,
  i18n: Record<string, string>,
): string {
  const counts = {
    repairable: decision.repairableDivergenceCount,
    divergent: decision.divergentCardCount,
    skipped: decision.skippedSourceCount,
    pending: decision.pendingImportCount,
  };
  switch (decision.kind) {
    case 'block-repairable':
      return template(i18n, 'domainSyncReviewBlockedRepairable', '检测到可修复的同步差异：可修复 {repairable}，分歧 {divergent}，跳过来源 {skipped}。请先预览并应用修复，再开始复习。', counts);
    case 'block-needs-direction':
      return template(i18n, 'domainSyncReviewBlockedNeedsDirection', '检测到需要人工选择处理方向的同步变更：待处理 {pending}，分歧 {divergent}。请先处理同步冲突，再开始复习。', counts);
    case 'block-divergent':
      return template(i18n, 'domainSyncReviewBlockedDivergent', '检测到无法自动判断的同步分歧：分歧 {divergent}。请先处理冲突，再开始复习。', counts);
    case 'block-source-error':
      return template(i18n, 'domainSyncReviewBlockedSourceError', '检测到同步来源读取异常：跳过来源 {skipped}。请先处理或清理异常来源，再开始复习。', counts);
    case 'unavailable':
      return label(i18n, 'domainSyncReviewBlockedUnavailable', '无法读取同步诊断状态。请重试诊断后再开始复习。');
    case 'allow':
      return label(i18n, 'domainSyncReviewSafe', '同步状态安全，可以开始复习。');
  }
}

function domainSyncUnsafeAfterRepairMessage(
  decision: ReviewDomainSyncSafetyDecision,
  i18n: Record<string, string>,
): string {
  return template(
    i18n,
    'domainSyncStillUnsafeAfterRepair',
    '同步修复已执行，但诊断仍不安全：{status}（可修复 {repairable}，分歧 {divergent}，跳过来源 {skipped}）。请继续处理剩余项。',
    {
      status: domainSyncStatusLabel(decision.sanityStatus || 'source-error', i18n),
      repairable: decision.repairableDivergenceCount,
      divergent: decision.divergentCardCount,
      skipped: decision.skippedSourceCount,
    },
  );
}

function domainSyncApplyMessage(
  result: Extract<BackendDomainSyncRepairApplyResult, { ok: true }>,
  decision: ReviewDomainSyncSafetyDecision,
  i18n: Record<string, string>,
): string {
  const applied = (i18n.domainSyncApplyDone || '同步修复已应用：{cards} 张卡片')
    .replace('{cards}', String(result.appliedCards));
  return decision.canOpenReview
    ? applied
    : `${applied}；${domainSyncUnsafeAfterRepairMessage(decision, i18n)}`;
}

async function readCleanupCandidates(
  context: ApplicationContext,
  log: Pick<typeof logger, 'warn'>,
): Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult | null> {
  const cleanupHost = context as unknown as {
    listDomainSyncConflictSourceCleanupCandidates?: () => Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult>;
  };
  if (!cleanupHost.listDomainSyncConflictSourceCleanupCandidates) {
    return null;
  }
  try {
    return await cleanupHost.listDomainSyncConflictSourceCleanupCandidates();
  } catch (error) {
    log.warn('Domain sync conflict source cleanup candidates unavailable:', error);
    return null;
  }
}

type DomainSyncCleanupCandidate = BackendDomainSyncConflictSourceCleanupCandidatesResult['candidates'][number];

function domainSyncCleanupEligibleSources(
  status: BackendDomainSyncStatusResult,
  cleanupCandidates: BackendDomainSyncConflictSourceCleanupCandidatesResult | null,
): Array<{ sourceId: string }> {
  if (cleanupCandidates) {
    return cleanupCandidates.candidates.filter((candidate) => candidate.cleanup.eligible);
  }
  const byId = new Map<string, BackendDomainSyncStatusResult['processedSources']['recent'][number]>();
  for (const source of [...status.processedSources.recent, ...status.processedSources.skipped]) {
    if (source.cleanup?.eligible === true) {
      byId.set(source.sourceId, source);
    }
  }
  return [...byId.values()];
}

function renderDomainSyncPanel(
  status: BackendDomainSyncStatusResult | null,
  repairPreview: BackendDomainSyncRepairPreviewResult | null,
  cleanupCandidates: BackendDomainSyncConflictSourceCleanupCandidatesResult | null,
  i18n: Record<string, string>,
  options: {
    reviewBlockDecision?: ReviewDomainSyncSafetyDecision | null;
    diagnosticsUnavailableReason?: string | null;
  } = {},
): string {
  if (!status) {
    return `
      <div class="b3-card b3-card--warning siyuanmemo-domain-sync-panel" style="margin: 10px 0; padding: 10px;">
        <div style="font-weight: 600;">${escapeHtml(i18n.domainSyncStatusUnavailable || '同步诊断状态不可用')}</div>
        ${options.diagnosticsUnavailableReason ? `<div class="ft__on-surface" style="margin-top: 4px; font-size: 12px;">${escapeHtml(options.diagnosticsUnavailableReason)}</div>` : ''}
        <div class="fn__flex" style="gap: 8px; margin-top: 10px; flex-wrap: wrap;">
          <button class="b3-button b3-button--outline" data-action="domain-retry">${escapeHtml(i18n.retry || '重试')}</button>
          <button class="b3-button b3-button--cancel" data-action="domain-cancel-review">${escapeHtml(i18n.cancel || '取消')}</button>
        </div>
      </div>
    `;
  }
  const skipped = status.processedSources.skipped.slice(0, 3)
    .map((source) => `<span class="b3-chip b3-chip--middle">${escapeHtml(source.sourceId)}: ${escapeHtml(domainSyncSkippedReasonLabel(source.skippedReason, i18n))}</span>`)
    .join(' ');
  const previewRows = repairPreview?.evidence.slice(0, 5).map((item) => `
    <tr>
      <td class="ft__breakword">${escapeHtml(item.cardId)}</td>
      <td>${escapeHtml(domainSyncEvidenceReasonLabel(item.reason, i18n))}</td>
      <td>${item.reviewEventCount}</td>
      <td>${item.cardReps ?? '-'}</td>
      <td>${fmtTime(item.newestReviewEventAt)}</td>
    </tr>
  `).join('') || '';
  const canPreview = status.repair.available
    || status.sanity.repairableDivergenceCount > 0
    || status.sanity.divergentCardCount > 0;
  const canApply = repairPreview?.status === 'preview' && repairPreview.plannedMutations.length > 0;
  const noApplicableRepair = repairPreview
    && repairPreview.plannedMutations.length === 0
    && (repairPreview.status === 'unrepairable' || repairPreview.status === 'no-repair');
  const cleanupEligible = domainSyncCleanupEligibleSources(status, cleanupCandidates);
  const cleanupRows = cleanupCandidates?.candidates.slice(0, 12).map((candidate: DomainSyncCleanupCandidate) => {
    const processed = candidate.processedSource;
    const imported = (processed?.importedOperations ?? 0) + (processed?.importedReviewEvents ?? 0) + (processed?.importedCards ?? 0);
    const ignored = (processed?.ignoredOperations ?? 0) + (processed?.ignoredReviewEvents ?? 0) + (processed?.ignoredCards ?? 0);
    const state = candidate.cleanup.eligible
      ? (i18n.domainSyncCleanupStateEligible || '已处理，可清理')
      : `${i18n.domainSyncCleanupStateBlocked || '不可清理'}: ${candidate.cleanup.reason}`;
    return `
      <tr>
        <td class="ft__breakword">${escapeHtml(candidate.sourceId)}<br><span class="ft__on-surface">${escapeHtml(candidate.path || '')}</span></td>
        <td>${fmtSize(candidate.size)}</td>
        <td>${imported}</td>
        <td>${ignored}</td>
        <td>${escapeHtml(state)}</td>
      </tr>
    `;
  }).join('') || '';
  return `
    <div class="siyuanmemo-domain-sync-panel" style="margin: 10px 0; padding: 10px; border: 1px solid var(--b3-border-color); border-radius: 6px;">
      ${options.reviewBlockDecision ? `
        <div class="b3-card b3-card--warning" style="margin: 0 0 10px 0; padding: 8px;">
          <div style="font-weight: 600;">${escapeHtml(i18n.domainSyncReviewBlocked || '同步冲突处理完成前无法开始复习')}</div>
          <div class="ft__on-surface" style="font-size: 12px; margin-top: 4px;">${escapeHtml(reviewBlockDecisionMessage(options.reviewBlockDecision, i18n))}</div>
        </div>
      ` : ''}
      <div class="fn__flex" style="align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        <div>
          <div style="font-weight: 600;">${escapeHtml(i18n.domainSyncHealth || '同步健康状态')}: ${escapeHtml(domainSyncStatusLabel(status.sanity.status, i18n))}</div>
          <div class="ft__on-surface" style="font-size: 12px;">
            ${escapeHtml(i18n.domainSyncLedgerOps || '同步记录')}: ${status.ledger.operationCount}
            · ${escapeHtml(i18n.domainSyncRepairable || '可修复')}: ${status.sanity.repairableDivergenceCount}
            · ${escapeHtml(i18n.domainSyncSkippedSources || '跳过来源')}: ${status.processedSources.totalSkipped}
          </div>
        </div>
        <div class="fn__flex" style="gap: 8px;">
          <button class="b3-button b3-button--outline" data-action="domain-retry">${escapeHtml(i18n.retry || '重试')}</button>
          <button class="b3-button b3-button--outline" data-action="domain-preview" ${canPreview ? '' : 'disabled'}>${escapeHtml(i18n.domainSyncPreviewRepair || '预览修复')}</button>
          <button class="b3-button b3-button--error" data-action="domain-apply" ${canApply ? '' : 'disabled'}>${escapeHtml(i18n.domainSyncApplyRepair || '应用修复')}</button>
          <button class="b3-button b3-button--outline" data-action="domain-cleanup" ${cleanupEligible.length > 0 ? '' : 'disabled'}>${escapeHtml(i18n.domainSyncCleanupSources || '清理已处理副本')}</button>
          <button class="b3-button b3-button--cancel" data-action="domain-cancel-review">${escapeHtml(i18n.cancel || '取消')}</button>
        </div>
      </div>
      ${cleanupEligible.length > 0 ? `
        <div class="ft__on-surface" style="margin-top: 6px; font-size: 12px;">
          ${escapeHtml(i18n.domainSyncCleanupEligible || '可清理的冲突副本')}: ${cleanupEligible.map((source) => escapeHtml(source.sourceId)).join(', ')}
        </div>
      ` : ''}
      ${cleanupCandidates && cleanupCandidates.candidates.length > 0 ? `
        <div style="margin-top: 8px; max-height: 180px; overflow: auto; border: 1px solid var(--b3-border-color); border-radius: 4px;">
          <table class="b3-table" style="width: 100%; margin: 0;">
            <thead>
              <tr>
                <th>${escapeHtml(i18n.syncConflictResolutionSource || '来源')}</th>
                <th>${escapeHtml(i18n.syncConflictResolutionSize || '大小')}</th>
                <th>${escapeHtml(i18n.domainSyncImported || '已导入')}</th>
                <th>${escapeHtml(i18n.domainSyncIgnored || '已存在')}</th>
                <th>${escapeHtml(i18n.status || '状态')}</th>
              </tr>
            </thead>
            <tbody>${cleanupRows}</tbody>
          </table>
        </div>
      ` : ''}
      ${skipped ? `<div style="margin-top: 8px;">${skipped}</div>` : ''}
      ${repairPreview ? `
        ${noApplicableRepair ? `
          <div class="b3-card b3-card--warning" style="margin-top: 10px; padding: 8px;">
            <div style="font-weight: 600;">${escapeHtml(i18n.domainSyncNoApplicableRepair || '没有可应用的自动修复')}</div>
            <div class="ft__on-surface" style="font-size: 12px; margin-top: 4px;">${escapeHtml(i18n.domainSyncNoApplicableRepairHint || '这些差异需要先清理已删除卡片、刷新来源状态，或人工处理不可修复证据。')}</div>
          </div>
        ` : ''}
        <div style="margin-top: 10px; max-height: 180px; overflow: auto; border: 1px solid var(--b3-border-color); border-radius: 4px;">
          <table class="b3-table" style="width: 100%; margin: 0;">
            <thead>
              <tr>
                <th>${escapeHtml(i18n.card || '卡片')}</th>
                <th>${escapeHtml(i18n.reason || '原因')}</th>
                <th>${escapeHtml(i18n.domainSyncReviewEvents || '复习记录')}</th>
                <th>${escapeHtml(i18n.domainSyncCardReps || '卡片复习次数')}</th>
                <th>${escapeHtml(i18n.syncConflictResolutionLatest || '最新时间')}</th>
              </tr>
            </thead>
            <tbody>${previewRows}</tbody>
          </table>
        </div>
        <div class="ft__on-surface" style="margin-top: 6px; font-size: 12px;">
          ${escapeHtml(i18n.domainSyncPlannedMutations || '计划变更')}: ${repairPreview.plannedMutations.length}
          · ${escapeHtml(i18n.domainSyncAffectedCards || '受影响卡片')}: ${repairPreview.affectedCardCount}
          · ${escapeHtml(i18n.domainSyncUnrepairable || '不可修复')}: ${repairPreview.unrepairableReasons.length}
          ${repairPreview.truncated ? `· ${escapeHtml(i18n.truncated || '已截断')}` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function manualSyncBackupReasonLabel(reason: string, i18n: Record<string, string>): string {
  const labels: Record<string, [string, string]> = {
    'eligible-old': ['manualSyncBackupRetentionEligibleOld', '可清理：早于保留天数'],
    'retained-newest': ['manualSyncBackupRetentionRetainedNewest', '保留：最近备份'],
    'retained-young': ['manualSyncBackupRetentionRetainedYoung', '保留：未超过保留天数'],
    'ignored-name': ['manualSyncBackupRetentionIgnoredName', '已忽略：非插件备份文件'],
    'invalid-metadata': ['manualSyncBackupRetentionInvalidMetadata', '已忽略：备份元数据无效'],
  };
  const pair = labels[reason];
  return pair ? label(i18n, pair[0], pair[1]) : reason;
}

function renderManualSyncBackupRetentionPanel(
  preview: ManualSyncBackupRetentionPreviewResult | null,
  applyResult: ManualSyncBackupRetentionApplyResult | null,
  i18n: Record<string, string>,
): string {
  const retainedNewest = preview?.candidates.filter((candidate) => candidate.reason === 'retained-newest').length ?? 0;
  const ignored = preview?.candidates.filter((candidate) => candidate.reason === 'ignored-name' || candidate.reason === 'invalid-metadata').length ?? 0;
  const rows = preview?.candidates.slice(0, 12).map((candidate) => `
    <tr>
      <td class="ft__breakword">${escapeHtml(candidate.name)}<br><span class="ft__on-surface">${escapeHtml(candidate.path)}</span></td>
      <td>${fmtSize(candidate.size)}</td>
      <td>${fmtTime(candidate.createdAt)}</td>
      <td>${escapeHtml(candidate.sourceId || '-')}</td>
      <td>${escapeHtml(manualSyncBackupReasonLabel(candidate.reason, i18n))}</td>
    </tr>
  `).join('') || '';
  const cleanupDisabled = preview && preview.eligibleCount > 0 ? '' : 'disabled';
  const noEligibleHint = preview && preview.eligibleCount === 0
    ? (i18n.manualSyncBackupRetentionNoEligible || '没有符合条件的旧备份；最近 3 个备份会保留，用于回滚误替换。')
    : '';
  return `
    <div class="siyuanmemo-manual-sync-backup-panel" style="margin: 10px 0; padding: 10px; border: 1px solid var(--b3-border-color); border-radius: 6px;">
      <div class="fn__flex" style="justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap;">
        <div>
          <div style="font-weight: 600;">${escapeHtml(i18n.manualSyncBackupRetentionTitle || '手动同步备份')}</div>
          <div class="ft__on-surface" style="font-size: 12px; margin-top: 4px;">
            ${escapeHtml(i18n.manualSyncBackupRetentionHint || '最近备份会保留，用于回滚误替换。')}
          </div>
        </div>
        <div class="fn__flex" style="gap: 8px; flex-wrap: wrap;">
          <button class="b3-button b3-button--outline" data-action="manual-backup-preview">${escapeHtml(i18n.manualSyncBackupRetentionPreview || '预览清理')}</button>
          <button class="b3-button b3-button--error" data-action="manual-backup-cleanup" ${cleanupDisabled}>${escapeHtml(i18n.manualSyncBackupRetentionCleanup || '清理旧备份')}</button>
        </div>
      </div>
      ${preview ? `
        <div class="ft__on-surface" style="margin-top: 8px; font-size: 12px;">
          ${escapeHtml(i18n.manualSyncBackupRetentionKeepNewest || '保留最近 N 个备份').replace('N', String(preview.retention.keepNewest))}
          · ${escapeHtml(i18n.manualSyncBackupRetentionDeleteOlderThan || '删除早于 N 天的备份').replace('N', String(preview.retention.deleteOlderThanDays))}
          · ${escapeHtml(i18n.manualSyncBackupRetentionEligible || '可清理')}: ${preview.eligibleCount}
          · ${escapeHtml(i18n.manualSyncBackupRetentionEligibleBytes || '可释放')}: ${fmtSize(preview.eligibleBytes)}
          · ${escapeHtml(i18n.manualSyncBackupRetentionRetainedNewestCount || '最近保留')}: ${retainedNewest}
          · ${escapeHtml(i18n.manualSyncBackupRetentionIgnored || '已忽略')}: ${ignored}
        </div>
        ${noEligibleHint ? `<div class="ft__on-surface" style="margin-top: 6px; font-size: 12px;">${escapeHtml(noEligibleHint)}</div>` : ''}
        ${preview.candidates.length > 0 ? `
          <div style="margin-top: 8px; max-height: 180px; overflow: auto; border: 1px solid var(--b3-border-color); border-radius: 4px;">
            <table class="b3-table" style="width: 100%; margin: 0;">
              <thead>
                <tr>
                  <th>${escapeHtml(i18n.fileName || '文件名')}</th>
                  <th>${escapeHtml(i18n.syncConflictResolutionSize || '大小')}</th>
                  <th>${escapeHtml(i18n.createdAt || '创建时间')}</th>
                  <th>${escapeHtml(i18n.syncConflictResolutionSource || '来源')}</th>
                  <th>${escapeHtml(i18n.status || '状态')}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        ` : `<div class="ft__on-surface" style="margin-top: 8px;">${escapeHtml(i18n.manualSyncBackupRetentionEmpty || '未发现手动同步备份。')}</div>`}
      ` : ''}
      ${applyResult ? `
        <div class="ft__on-surface" style="margin-top: 8px; font-size: 12px;">
          ${escapeHtml(i18n.manualSyncBackupRetentionApplyDone || '清理旧备份完成')}:
          ${escapeHtml(i18n.deleted || '已删除')} ${applyResult.deleted.length}
          · ${escapeHtml(i18n.skipped || '已跳过')} ${applyResult.skipped.length}
          · ${escapeHtml(i18n.failed || '失败')} ${applyResult.failed.length}
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
  cleanupCandidates: BackendDomainSyncConflictSourceCleanupCandidatesResult | null,
  manualBackupPreview: ManualSyncBackupRetentionPreviewResult | null,
  manualBackupApplyResult: ManualSyncBackupRetentionApplyResult | null,
  options: {
    reviewBlockDecision?: ReviewDomainSyncSafetyDecision | null;
    diagnosticsUnavailableReason?: string | null;
  } = {},
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
          <span>${escapeHtml(i18n.syncConflictResolutionCurrent || '当前本地库')}: ${current ? `${current.reviewEventCount} ${i18n.syncConflictResolutionReviews || '复习'} / ${current.cardCount} ${i18n.syncConflictResolutionCards || '卡片'}` : '-'}</span>
          <span>${escapeHtml(i18n.syncConflictResolutionLatest || '最新时间')}: ${fmtTime(current?.latestReviewTimestamp || current?.latestCardTimestamp)}</span>
        </div>
      </div>
      ${renderDomainSyncPanel(domainStatus, repairPreview, cleanupCandidates, i18n, options)}
      ${renderManualSyncBackupRetentionPanel(manualBackupPreview, manualBackupApplyResult, i18n)}
      ${preview.sources.length === 0 ? `
        <div class="b3-card b3-card--info" style="margin: 8px 0; padding: 10px;">
          ${escapeHtml(i18n.syncConflictManualMergeNoSources || '未发现 SiYuanMemo 同步冲突数据库')}
        </div>
      ` : `
        <div style="max-height: 340px; overflow: auto; border: 1px solid var(--b3-border-color); border-radius: 6px;">
          <table class="b3-table" style="width: 100%; margin: 0;">
            <thead>
              <tr>
                <th></th><th>${escapeHtml(i18n.syncConflictResolutionSource || '来源')}</th><th>${escapeHtml(i18n.syncConflictResolutionSize || '大小')}</th><th>${escapeHtml(i18n.syncConflictResolutionReviews || '复习')}</th><th>${escapeHtml(i18n.syncConflictResolutionCards || '卡片')}</th><th>${escapeHtml(i18n.syncConflictResolutionLatest || '最新时间')}</th><th>${escapeHtml(i18n.syncConflictResolutionStatus || '状态')}</th>
              </tr>
            </thead>
            <tbody>${sourceRows}</tbody>
          </table>
        </div>
      `}
      <div class="fn__flex" style="justify-content: flex-end; gap: 8px; margin-top: 12px;">
        <button class="b3-button b3-button--cancel" data-action="cancel">${escapeHtml(i18n.cancel || '取消')}</button>
        <button class="b3-button b3-button--outline" data-action="keep-current">${escapeHtml(i18n.syncConflictResolutionKeepCurrent || '保留当前本地库')}</button>
        <button class="b3-button" data-action="smart-merge" ${preview.sources.some((source) => source.parseStatus === 'ok') ? '' : 'disabled'}>${escapeHtml(i18n.syncConflictResolutionSmartMerge || '智能合并')}</button>
        <button class="b3-button b3-button--error" data-action="replace" ${preview.sources.some((source) => source.parseStatus === 'ok') ? '' : 'disabled'}>${escapeHtml(i18n.syncConflictResolutionReplace || '使用选中的冲突副本')}</button>
      </div>
    </div>
  `;
}

function selectedSourceId(dialog: Dialog): string | null {
  const input = dialog.element.querySelector<HTMLInputElement>('input[name="sync-conflict-source"]:checked');
  return input?.value || null;
}

function renderConfirmationContent(input: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  rows?: Array<{ label: string; value: string | number }>;
}): string {
  const rows = input.rows?.map((row) => `
    <div class="fn__flex" style="justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid var(--b3-border-color);">
      <span class="ft__on-surface">${escapeHtml(row.label)}</span>
      <strong class="ft__breakword" style="text-align: right;">${escapeHtml(row.value)}</strong>
    </div>
  `).join('') || '';
  return `
    <div class="siyuanmemo-domain-sync-confirm" style="padding: 14px; font-size: 13px;">
      <div style="font-weight: 600; margin-bottom: 6px;">${escapeHtml(input.title)}</div>
      <div class="ft__on-surface" style="line-height: 1.5;">${escapeHtml(input.body)}</div>
      ${rows ? `<div style="margin-top: 12px;">${rows}</div>` : ''}
      <div class="fn__flex" style="justify-content: flex-end; gap: 8px; margin-top: 14px;">
        <button class="b3-button b3-button--cancel" data-action="confirm-cancel">${escapeHtml(input.cancelLabel)}</button>
        <button class="b3-button ${input.danger ? 'b3-button--error' : ''}" data-action="confirm-apply">${escapeHtml(input.confirmLabel)}</button>
      </div>
    </div>
  `;
}

function openPluginConfirmation(input: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  rows?: Array<{ label: string; value: string | number }>;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = new Dialog({
      title: input.title,
      content: renderConfirmationContent(input),
      width: 'min(520px, 92vw)',
    });
    applyDialogChrome(dialog, {
      visualVariant: 'form',
      containerClass: 'siyuanmemo-domain-sync-confirm-dialog',
      dialogWidth: 'min(520px, 92vw)',
      dialogHeight: 'auto',
    });
    const settle = (confirmed: boolean): void => {
      dialog.destroy();
      resolve(confirmed);
    };
    dialog.element.querySelector('[data-action="confirm-cancel"]')?.addEventListener('click', () => settle(false));
    dialog.element.querySelector('[data-action="confirm-apply"]')?.addEventListener('click', () => settle(true));
  });
}

export interface OpenManualSyncConflictResolutionDialogOptions {
  initialDomainStatus?: BackendDomainSyncStatusResult | null;
  reviewBlockDecision?: ReviewDomainSyncSafetyDecision | null;
  diagnosticsUnavailableReason?: string | null;
  onDiagnosticsSafe?: () => void | Promise<void>;
}

export async function openManualSyncConflictResolutionDialog(
  context: ApplicationContext,
  options: OpenManualSyncConflictResolutionDialogOptions = {},
): Promise<void> {
  const i18n = context.getI18n?.() || {};
  let preview: SyncConflictDirectionPreview;
  let domainStatus: BackendDomainSyncStatusResult | null = options.initialDomainStatus ?? null;
  let repairPreview: BackendDomainSyncRepairPreviewResult | null = null;
  let cleanupCandidates: BackendDomainSyncConflictSourceCleanupCandidatesResult | null = null;
  let manualBackupPreview: ManualSyncBackupRetentionPreviewResult | null = null;
  let manualBackupApplyResult: ManualSyncBackupRetentionApplyResult | null = null;
  let diagnosticsUnavailableReason: string | null = options.diagnosticsUnavailableReason ?? null;
  try {
    preview = await context.previewSyncConflictDirectionResolution();
  } catch (error) {
    logger.error('Manual sync conflict preview failed:', error);
    showMessage(i18n.syncConflictResolutionPreviewFailed || '同步冲突预览失败', 5000, 'error');
    return;
  }
  if (!domainStatus) {
    try {
      domainStatus = await context.readDomainSyncDiagnostics();
      diagnosticsUnavailableReason = null;
    } catch (error) {
      diagnosticsUnavailableReason = error instanceof Error ? error.message : String(error);
      logger.warn('Domain sync diagnostics preview unavailable:', error);
    }
  }
  if (domainStatus) {
    cleanupCandidates = await readCleanupCandidates(context, logger);
  }

  const dialog = new Dialog({
    title: i18n.syncConflictResolutionTitle || '处理 SiYuanMemo 同步冲突',
    content: renderPreview(preview, i18n, domainStatus, repairPreview, cleanupCandidates, manualBackupPreview, manualBackupApplyResult, {
      reviewBlockDecision: options.reviewBlockDecision ?? null,
      diagnosticsUnavailableReason,
    }),
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
        showMessage(i18n.syncConflictResolutionSelectSource || '请选择一个可读取的冲突副本', 3000, 'error');
        return;
      }
      const confirmText = (i18n.syncConflictResolutionReplaceConfirm
        || '确认用 {sourceId} 替换当前本地数据库？系统会先创建备份。')
        .replace('{sourceId}', sourceId);
      const confirmed = await openPluginConfirmation({
        title: i18n.syncConflictResolutionReplaceConfirmTitle || '确认替换冲突副本',
        body: confirmText,
        confirmLabel: i18n.syncConflictResolutionReplace || '使用选中的冲突副本',
        cancelLabel: i18n.cancel || '取消',
        danger: true,
        rows: [
          { label: i18n.syncConflictResolutionSource || '来源', value: sourceId },
        ],
      });
      if (!confirmed) {
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
      panel.outerHTML = renderDomainSyncPanel(domainStatus, repairPreview, cleanupCandidates, i18n, {
        reviewBlockDecision: options.reviewBlockDecision ?? null,
        diagnosticsUnavailableReason,
      });
    }
    bindDomainActions();
  }

  function refreshManualBackupPanel(): void {
    const panel = dialog.element.querySelector('.siyuanmemo-manual-sync-backup-panel');
    if (panel) {
      panel.outerHTML = renderManualSyncBackupRetentionPanel(manualBackupPreview, manualBackupApplyResult, i18n);
    }
    bindManualBackupActions();
  }

  async function notifySafeDiagnosticsIfNeeded(): Promise<void> {
    if (!domainStatus || !options.onDiagnosticsSafe) {
      return;
    }
    const decision = buildReviewDomainSyncSafetyDecision(domainStatus);
    if (decision.canOpenReview) {
      await options.onDiagnosticsSafe();
    }
  }

  function bindDomainActions(): void {
    dialog.element.querySelector('[data-action="domain-retry"]')?.addEventListener('click', () => {
      void (async () => {
        try {
          domainStatus = await context.readDomainSyncDiagnostics();
          cleanupCandidates = await readCleanupCandidates(context, logger);
          diagnosticsUnavailableReason = null;
          repairPreview = null;
          refreshDomainPanel();
          await notifySafeDiagnosticsIfNeeded();
        } catch (error) {
          diagnosticsUnavailableReason = error instanceof Error ? error.message : String(error);
          logger.warn('Domain sync diagnostics retry unavailable:', error);
          refreshDomainPanel();
          showMessage(diagnosticsUnavailableReason, 7000, 'error');
        }
      })();
    });
    dialog.element.querySelector('[data-action="domain-cancel-review"]')?.addEventListener('click', () => {
      dialog.destroy();
      showMessage(i18n.domainSyncReviewCanceled || '已取消复习，请先处理同步冲突', 2500, 'info');
    });
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
    dialog.element.querySelector('[data-action="domain-cleanup"]')?.addEventListener('click', () => {
      void (async () => {
        if (!domainStatus) {
          return;
        }
        const sourceIds = domainSyncCleanupEligibleSources(domainStatus, cleanupCandidates).map((source) => source.sourceId);
        if (sourceIds.length === 0) {
          return;
        }
        try {
          const cleanupHost = context as unknown as {
            cleanupDomainSyncConflictSources?: (request: {
              sourceIds: string[];
              idempotencyKey: string;
              confirmedAt: number;
            }) => Promise<{ cleaned: unknown[]; skipped: unknown[]; failed: unknown[] }>;
          };
          if (!cleanupHost.cleanupDomainSyncConflictSources) {
            throw new Error(i18n.domainSyncCleanupUnavailable || '同步冲突副本清理命令不可用');
          }
          const result = await cleanupHost.cleanupDomainSyncConflictSources({
            sourceIds,
            idempotencyKey: `domain-sync-cleanup:${Date.now()}:${sourceIds.join(',')}`,
            confirmedAt: Date.now(),
          });
          domainStatus = await context.readDomainSyncDiagnostics();
          cleanupCandidates = await readCleanupCandidates(context, logger);
          refreshDomainPanel();
          showMessage((i18n.domainSyncCleanupDone || '清理完成：已清理 {cleaned}，已跳过 {skipped}，失败 {failed}')
            .replace('{cleaned}', String(result.cleaned.length))
            .replace('{skipped}', String(result.skipped.length))
            .replace('{failed}', String(result.failed.length)), 5000, 'info');
        } catch (error) {
          logger.error('Domain sync conflict source cleanup failed:', error);
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
          || '应用修复计划 {planId}？这会根据复习历史更新卡片复习状态。')
          .replace('{planId}', repairPreview.planId);
        const confirmed = await openPluginConfirmation({
          title: i18n.domainSyncApplyConfirmTitle || '应用同步修复',
          body: confirmText,
          confirmLabel: i18n.domainSyncApplyRepair || '应用修复',
          cancelLabel: i18n.cancel || '取消',
          danger: true,
          rows: [
            { label: i18n.domainSyncPlanId || '计划 ID', value: repairPreview.planId },
            { label: i18n.domainSyncAffectedCards || '受影响卡片', value: repairPreview.affectedCardCount },
            { label: i18n.domainSyncPlannedMutations || '计划变更', value: repairPreview.plannedMutations.length },
            { label: i18n.domainSyncUnrepairable || '不可修复', value: repairPreview.unrepairableReasons.length },
          ],
        });
        if (!confirmed) {
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
          cleanupCandidates = await readCleanupCandidates(context, logger);
          repairPreview = null;
          refreshDomainPanel();
          const nextDecision = buildReviewDomainSyncSafetyDecision(domainStatus);
          await notifySafeDiagnosticsIfNeeded();
          showMessage(
            domainSyncApplyMessage(result, nextDecision, i18n),
            7000,
            nextDecision.canOpenReview ? 'info' : 'error',
          );
        } catch (error) {
          logger.error('Domain sync repair apply failed:', error);
          showMessage(error instanceof Error ? error.message : String(error), 7000, 'error');
        }
      })();
    });
  }

  function bindManualBackupActions(): void {
    dialog.element.querySelector('[data-action="manual-backup-preview"]')?.addEventListener('click', () => {
      void (async () => {
        try {
          manualBackupPreview = await context.previewManualSyncBackupRetention();
          manualBackupApplyResult = null;
          refreshManualBackupPanel();
        } catch (error) {
          logger.error('Manual sync backup retention preview failed:', error);
          showMessage(error instanceof Error ? error.message : String(error), 7000, 'error');
        }
      })();
    });
    dialog.element.querySelector('[data-action="manual-backup-cleanup"]')?.addEventListener('click', () => {
      void (async () => {
        if (!manualBackupPreview || manualBackupPreview.eligibleCount === 0) {
          return;
        }
        const confirmed = await openPluginConfirmation({
          title: i18n.manualSyncBackupRetentionCleanupConfirmTitle || '清理旧备份',
          body: i18n.manualSyncBackupRetentionCleanupConfirm
            || '确认删除早于保留天数且不属于最近保留范围的手动同步备份？最近备份会保留，用于回滚误替换。',
          confirmLabel: i18n.manualSyncBackupRetentionCleanup || '清理旧备份',
          cancelLabel: i18n.cancel || '取消',
          danger: true,
          rows: [
            { label: i18n.manualSyncBackupRetentionEligible || '可清理', value: manualBackupPreview.eligibleCount },
            { label: i18n.manualSyncBackupRetentionEligibleBytes || '可释放', value: fmtSize(manualBackupPreview.eligibleBytes) },
          ],
        });
        if (!confirmed) {
          return;
        }
        try {
          manualBackupApplyResult = await context.applyManualSyncBackupRetention();
          manualBackupPreview = await context.previewManualSyncBackupRetention();
          refreshManualBackupPanel();
          showMessage(i18n.manualSyncBackupRetentionApplyDone || '清理旧备份完成', 5000, 'info');
        } catch (error) {
          logger.error('Manual sync backup retention cleanup failed:', error);
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
  bindManualBackupActions();
}
