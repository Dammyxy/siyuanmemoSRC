// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncSanityStatus,
  BackendDomainSyncStatusResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { ReviewDomainSyncSafetyDecision } from '@/application/services/ReviewDomainSyncSafetyService';

const { dialogRecords, showMessageMock } = vi.hoisted(() => ({
  dialogRecords: [] as Array<{
    title: string;
    element: HTMLElement;
    destroy: ReturnType<typeof vi.fn>;
  }>,
  showMessageMock: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Dialog: class FakeDialog {
    element: HTMLElement;
    private readonly destroyMock = vi.fn();

    constructor(options: { title: string; content: string }) {
      this.element = document.createElement('div');
      this.element.innerHTML = options.content;
      document.body.appendChild(this.element);
      const record = {
        title: options.title,
        element: this.element,
        destroy: this.destroyMock,
      };
      dialogRecords.push(record);
    }

    destroy(): void {
      this.destroyMock();
      this.element.remove();
    }
  },
  showMessage: showMessageMock,
}));

vi.mock('@/utils/dialog', () => ({
  applyDialogChrome: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

async function loadModule() {
  return import('../manualSyncConflictResolutionDialog');
}

function domainStatus(status: BackendDomainSyncSanityStatus): BackendDomainSyncStatusResult {
  const skipped = status === 'source-error' ? 1 : 0;
  const repairable = status === 'repairable' ? 2 : 0;
  return {
    ok: true,
    ledger: {
      operationCount: 3,
      newestOperationAt: 1_700_000_000_000,
      operationTypes: {},
    },
    processedSources: {
      recent: [],
      skipped: skipped > 0 ? [{
        sourceId: 'conflict-source-error',
        sourceKind: 'siyuan-conflict-db',
        fingerprint: 'fingerprint-source-error',
        path: '/tmp/conflict.db',
        processedAt: 1,
        importedOperations: 0,
        ignoredOperations: 0,
        importedReviewEvents: 0,
        ignoredReviewEvents: 0,
        importedCards: 0,
        ignoredCards: 0,
        skippedReason: 'parse-error',
        latestSanityStatus: 'source-error',
      }] : [],
      totalProcessed: 1,
      totalSkipped: skipped,
    },
    sanity: {
      status,
      checkedAt: 1_700_000_000_001,
      ledgerOperationCount: 3,
      pendingImportCount: status === 'needs-direction' ? 1 : 0,
      processedSourceCount: 1,
      skippedSourceCount: skipped,
      repairableDivergenceCount: repairable,
      divergentCardCount: repairable,
      reasonCounts: {},
      affectedCardIds: repairable ? ['card-a', 'card-b'] : [],
      truncated: false,
    },
    repair: {
      available: repairable > 0,
      repairableDivergenceCount: repairable,
      latestPlanId: repairable > 0 ? 'plan-entry' : null,
    },
  };
}

function repairPreview(overrides: Partial<BackendDomainSyncRepairPreviewResult> = {}): BackendDomainSyncRepairPreviewResult {
  return {
    ok: true,
    planId: 'plan-preview',
    status: 'preview',
    createdAt: 1_700_000_000_002,
    affectedCardCount: 2,
    evidence: [{
      cardId: 'card-a',
      blockId: 'block-a',
      reason: 'missing-card-state',
      newestReviewEventAt: 1_700_000_000_003,
      cardLastReview: null,
      reviewEventCount: 3,
      cardReps: 1,
    }],
    plannedMutations: [{
      cardId: 'card-a',
      mutationType: 'card-state-repair',
      summary: 'repair card state',
      before: {},
      after: {},
    }],
    unrepairableReasons: [],
    schedulerEvidence: {
      schedulerType: 'fsrs',
      configHash: 'hash',
      capturedAt: 1_700_000_000_004,
    },
    truncated: false,
    limit: 50,
    ...overrides,
  };
}

function decision(kind: ReviewDomainSyncSafetyDecision['kind'], status?: BackendDomainSyncSanityStatus): ReviewDomainSyncSafetyDecision {
  return {
    kind,
    canOpenReview: false,
    message: `blocked ${kind}`,
    sanityStatus: status,
    repairableDivergenceCount: status === 'repairable' ? 2 : 0,
    skippedSourceCount: status === 'source-error' ? 1 : 0,
    pendingImportCount: status === 'needs-direction' ? 1 : 0,
    divergentCardCount: status === 'repairable' ? 2 : 0,
  };
}

function basePreview() {
  return {
    current: {
      reviewEventCount: 1,
      cardCount: 2,
      latestReviewTimestamp: 1_700_000_000_000,
      latestCardTimestamp: 1_700_000_000_000,
    },
    sources: [{
      sourceId: 'source-a',
      path: '/tmp/source-a.db',
      size: 128,
      reviewEventCount: 2,
      cardCount: 3,
      latestReviewTimestamp: 1_700_000_000_001,
      latestCardTimestamp: 1_700_000_000_001,
      parseStatus: 'ok',
    }],
  };
}

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    getI18n: () => ({
      retry: '重试',
      cancel: '取消',
      syncConflictResolutionTitle: '处理 SiYuanMemo 同步冲突',
      syncConflictResolutionCurrent: '当前本地库',
      syncConflictResolutionLatest: '最新时间',
      syncConflictResolutionReviews: '复习',
      syncConflictResolutionCards: '卡片',
      syncConflictResolutionSource: '来源',
      syncConflictResolutionSize: '大小',
      syncConflictResolutionStatus: '状态',
      syncConflictResolutionStatusReadable: '可读取',
      syncConflictResolutionSmartMerge: '智能合并',
      syncConflictResolutionKeepCurrent: '保留当前本地库',
      syncConflictResolutionReplace: '使用选中的冲突副本',
      domainSyncReviewBlocked: '同步冲突处理完成前无法开始复习',
      domainSyncReviewBlockedRepairable: '检测到可修复的同步差异：可修复 {repairable}，分歧 {divergent}，跳过来源 {skipped}。请先预览并应用修复，再开始复习。',
      domainSyncReviewBlockedNeedsDirection: '检测到需要人工选择处理方向的同步变更：待处理 {pending}，分歧 {divergent}。请先处理同步冲突，再开始复习。',
      domainSyncReviewBlockedSourceError: '检测到同步来源读取异常：跳过来源 {skipped}。请先处理或清理异常来源，再开始复习。',
      domainSyncStatusRepairable: '可修复',
      domainSyncStatusNeedsDirection: '需要选择处理方向',
      domainSyncStatusSourceError: '来源读取异常',
      domainSyncHealth: '同步健康状态',
      domainSyncLedgerOps: '同步记录',
      domainSyncRepairable: '可修复',
      domainSyncSkippedSources: '跳过来源',
      domainSyncPreviewRepair: '预览修复',
      domainSyncApplyRepair: '应用修复',
      domainSyncCleanupSources: '清理已处理副本',
      domainSyncAffectedCards: '受影响卡片',
      domainSyncPlannedMutations: '计划变更',
      domainSyncUnrepairable: '不可修复',
      domainSyncPlanId: '计划 ID',
      domainSyncApplyConfirmTitle: '应用同步修复',
      domainSyncApplyConfirm: '应用修复计划 {planId}？这会根据复习历史更新卡片复习状态。',
      domainSyncReviewEvents: '复习记录',
      domainSyncCardReps: '卡片复习次数',
      domainSyncReasonMissingCardState: '缺少卡片状态',
      domainSyncStatusUnavailable: '同步诊断状态不可用',
      reason: '原因',
      truncated: '已截断',
    }),
    previewSyncConflictDirectionResolution: vi.fn(async () => basePreview()),
    applySyncConflictDirectionResolution: vi.fn(async () => ({ kind: 'keepCurrentLocal' })),
    readDomainSyncDiagnostics: vi.fn(async () => domainStatus('clean')),
    previewDomainSyncRepair: vi.fn(async () => repairPreview()),
    applyDomainSyncRepair: vi.fn(async (request) => ({
      ok: true,
      status: 'applied',
      planId: request.planId,
      idempotencyKey: request.idempotencyKey,
      appliedAt: request.confirmedAt,
      appliedCards: 2,
      skippedCards: 0,
      invalidatedQueueProjections: 1,
    })),
    ...overrides,
  } as any;
}

async function click(element: Element | null): Promise<void> {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await Promise.resolve();
  await Promise.resolve();
}

describe('openManualSyncConflictResolutionDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    dialogRecords.length = 0;
    showMessageMock.mockReset();
    vi.restoreAllMocks();
  });

  it.each([
    ['repairable', 'block-repairable'],
    ['needs-direction', 'block-needs-direction'],
    ['source-error', 'block-source-error'],
  ] as const)('renders blocked Review recovery state for %s diagnostics', async (status, kind) => {
    const { openManualSyncConflictResolutionDialog } = await loadModule();

    await openManualSyncConflictResolutionDialog(buildContext(), {
      initialDomainStatus: domainStatus(status),
      reviewBlockDecision: decision(kind, status),
    });

    expect(document.body.textContent).toContain('同步冲突处理完成前无法开始复习');
    expect(document.body.textContent).not.toContain(`blocked ${kind}`);
    expect(document.body.querySelector('[data-action="domain-preview"]')).toBeTruthy();
    expect(document.body.querySelector('[data-action="domain-retry"]')).toBeTruthy();
    expect(document.body.querySelector('[data-action="domain-cancel-review"]')).toBeTruthy();
  });

  it('renders diagnostics unavailable state with retry and cancel actions', async () => {
    const { openManualSyncConflictResolutionDialog } = await loadModule();
    const context = buildContext({
      readDomainSyncDiagnostics: vi.fn(async () => {
        throw new Error('backend unavailable');
      }),
    });

    await openManualSyncConflictResolutionDialog(context, {
      reviewBlockDecision: decision('unavailable'),
      diagnosticsUnavailableReason: 'backend unavailable',
    });

    expect(document.body.textContent).toContain('同步诊断状态不可用');
    expect(document.body.textContent).toContain('backend unavailable');
    expect(document.body.querySelector('[data-action="domain-retry"]')).toBeTruthy();
    expect(document.body.querySelector('[data-action="domain-cancel-review"]')).toBeTruthy();
  });

  it('renders repair preview truncation and repair counts', async () => {
    const { openManualSyncConflictResolutionDialog } = await loadModule();
    const context = buildContext({
      previewDomainSyncRepair: vi.fn(async () => repairPreview({
        affectedCardCount: 7,
        unrepairableReasons: [{ cardId: 'card-z', reason: 'missing review evidence' }],
        truncated: true,
      })),
    });

    await openManualSyncConflictResolutionDialog(context, {
      initialDomainStatus: domainStatus('repairable'),
      reviewBlockDecision: decision('block-repairable', 'repairable'),
    });
    await click(document.body.querySelector('[data-action="domain-preview"]'));

    expect(context.previewDomainSyncRepair).toHaveBeenCalledWith({ limit: 50, includeUnrepairable: true });
    expect(document.body.textContent).toContain('受影响卡片');
    expect(document.body.textContent).toContain('7');
    expect(document.body.textContent).toContain('不可修复');
    expect(document.body.textContent).toContain('已截断');
    expect(document.body.textContent).toContain('缺少卡片状态');
  });

  it('uses plugin-owned repair confirmation and applies confirmed repair without window.confirm', async () => {
    const { openManualSyncConflictResolutionDialog } = await loadModule();
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => {
      throw new Error('window.confirm must not be used');
    });
    const onDiagnosticsSafe = vi.fn();
    const context = buildContext();

    await openManualSyncConflictResolutionDialog(context, {
      initialDomainStatus: domainStatus('repairable'),
      reviewBlockDecision: decision('block-repairable', 'repairable'),
      onDiagnosticsSafe,
    });
    await click(document.body.querySelector('[data-action="domain-preview"]'));
    await click(document.body.querySelector('[data-action="domain-apply"]'));

    expect(dialogRecords.at(-1)?.title).toBe('应用同步修复');
    expect(document.body.textContent).toContain('计划 ID');
    expect(document.body.textContent).toContain('plan-preview');
    expect(document.body.textContent).toContain('受影响卡片');
    expect(document.body.textContent).toContain('计划变更');
    expect(document.body.textContent).toContain('不可修复');

    await click(document.body.querySelector('.siyuanmemo-domain-sync-confirm [data-action="confirm-apply"]'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(context.applyDomainSyncRepair).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'plan-preview',
      confirmedBy: 'manual-sync-conflict-dialog',
      confirmationText: expect.stringContaining('plan-preview'),
    }));
    expect(onDiagnosticsSafe).toHaveBeenCalledOnce();
  });

  it('cleans eligible conflict copies through the bound application context method', async () => {
    const { openManualSyncConflictResolutionDialog } = await loadModule();
    const status = domainStatus('merged');
    status.processedSources.recent = [{
      sourceId: 'processed-copy',
      sourceKind: 'siyuan-conflict-db',
      fingerprint: 'fp-processed-copy',
      path: '/tmp/processed-copy.db',
      processedAt: 1,
      importedOperations: 1,
      ignoredOperations: 0,
      importedReviewEvents: 1,
      ignoredReviewEvents: 0,
      importedCards: 0,
      ignoredCards: 0,
      skippedReason: null,
      latestSanityStatus: 'merged',
      cleanup: { eligible: true, reason: 'processed-resolved' },
    }];
    const context = buildContext({
      initialDomainStatus: status,
      readDomainSyncDiagnostics: vi.fn(async () => domainStatus('clean')),
    });
    context.cleanupDomainSyncConflictSources = vi.fn(async function cleanup(this: unknown, request: { sourceIds: string[] }) {
      expect(this).toBe(context);
      expect(request.sourceIds).toEqual(['processed-copy']);
      return {
        cleaned: [{ sourceId: 'processed-copy' }],
        skipped: [],
        failed: [],
      };
    });

    await openManualSyncConflictResolutionDialog(context, {
      initialDomainStatus: status,
      reviewBlockDecision: decision('block-repairable', 'repairable'),
    });
    await click(document.body.querySelector('[data-action="domain-cleanup"]'));

    expect(context.cleanupDomainSyncConflictSources).toHaveBeenCalledOnce();
    expect(showMessageMock).toHaveBeenCalledWith(expect.stringContaining('已清理 1'), 5000, 'info');
  });
});
