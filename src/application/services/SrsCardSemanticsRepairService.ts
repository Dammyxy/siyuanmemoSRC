import {
  auditCardSemantics,
  type SrsCardSemanticAuditResult,
  type SrsCardSemanticRepairPlan,
  type SrsCardSemanticRepairStatus,
} from '@/core/card/semantics';
import type { FSRSCard } from '@/types/card';

export interface SrsCardSemanticsRepairCounts {
  total: number;
  safeRepair: number;
  ambiguous: number;
  insufficient: number;
  noop: number;
  skipped: number;
}

export interface SrsCardSemanticsRepairDiagnostic {
  code: 'semantic-repair-unavailable' | 'semantic-repair-commit-failed' | 'semantic-repair-mirror-failed';
  message: string;
  error?: string;
}

export interface SrsCardSemanticsRepairRow {
  cardId: string;
  status: SrsCardSemanticRepairStatus;
  beforeKind: SrsCardSemanticRepairPlan['beforeKind'];
  afterKind: SrsCardSemanticRepairPlan['afterKind'];
  evidenceCount: number;
  diagnosticCodes: string[];
}

export interface SrsCardSemanticsRepairPreviewReady {
  status: 'ready';
  counts: SrsCardSemanticsRepairCounts;
  rows: SrsCardSemanticsRepairRow[];
  audits: SrsCardSemanticAuditResult[];
}

export interface SrsCardSemanticsRepairUnavailable {
  status: 'unavailable';
  diagnostics: SrsCardSemanticsRepairDiagnostic[];
}

export type SrsCardSemanticsRepairPreviewResult =
  | SrsCardSemanticsRepairPreviewReady
  | SrsCardSemanticsRepairUnavailable;

export interface SrsCardSemanticsRepairCommitResult {
  status: 'committed' | 'unavailable' | 'failed';
  receiptId?: string;
  appliedCount: number;
  skippedCount: number;
  failedCount: number;
  updatedCardIds: string[];
  diagnostics: SrsCardSemanticsRepairDiagnostic[];
  preview?: SrsCardSemanticsRepairPreviewReady;
}

export interface SrsCardSemanticsRepairRepository {
  querySrsCardSemanticRepairCandidates(): FSRSCard[];
  applySrsCardSemanticRepairPlans(input: {
    safePlans: SrsCardSemanticRepairPlan[];
    skippedPlans: SrsCardSemanticRepairPlan[];
    preview: SrsCardSemanticsRepairPreviewReady;
  }): Promise<{
    receiptId: string;
    updatedCards: FSRSCard[];
    repairedCount: number;
    failedCardIds: string[];
  }> | {
    receiptId: string;
    updatedCards: FSRSCard[];
    repairedCount: number;
    failedCardIds: string[];
  };
}

export interface SrsCardSemanticsRepairCardMirror {
  batchUpdateCardsWithoutEvents(
    cards: FSRSCard[],
    options?: { suppressAutosave?: boolean; suppressDueIndexSort?: boolean },
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: Error }>;
}

export interface SrsCardSemanticsRepairServiceDeps {
  repository: SrsCardSemanticsRepairRepository | null | undefined;
  cardMirror?: SrsCardSemanticsRepairCardMirror | null;
}

export class SrsCardSemanticsRepairService {
  constructor(private readonly deps: SrsCardSemanticsRepairServiceDeps) {}

  async preview(): Promise<SrsCardSemanticsRepairPreviewResult> {
    const repository = this.deps.repository;
    if (!repository) {
      return this.unavailable('SQL semantic repair repository is unavailable.');
    }

    try {
      const cards = repository.querySrsCardSemanticRepairCandidates();
      const audits = cards.map((card) => auditCardSemantics({ card }));
      return {
        status: 'ready',
        counts: countAudits(audits),
        rows: audits.map(toRepairRow),
        audits,
      };
    } catch (error) {
      return this.unavailable('SQL semantic repair audit failed.', error);
    }
  }

  async commit(): Promise<SrsCardSemanticsRepairCommitResult> {
    const preview = await this.preview();
    if (preview.status === 'unavailable') {
      return {
        status: 'unavailable',
        appliedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        updatedCardIds: [],
        diagnostics: preview.diagnostics,
      };
    }

    const repository = this.deps.repository;
    if (!repository) {
      return {
        status: 'unavailable',
        appliedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        updatedCardIds: [],
        diagnostics: this.unavailable('SQL semantic repair repository is unavailable.').diagnostics,
        preview,
      };
    }

    const safePlans = preview.audits
      .map((audit) => audit.repairPlan)
      .filter((plan) => plan.status === 'safe-repair' && plan.patch);
    const skippedPlans = preview.audits
      .map((audit) => audit.repairPlan)
      .filter((plan) => plan.status !== 'safe-repair');

    try {
      const applied = await repository.applySrsCardSemanticRepairPlans({
        safePlans,
        skippedPlans,
        preview,
      });
      const diagnostics: SrsCardSemanticsRepairDiagnostic[] = [];
      if (applied.updatedCards.length > 0 && this.deps.cardMirror) {
        const mirrorResult = await this.deps.cardMirror.batchUpdateCardsWithoutEvents(applied.updatedCards, {
          suppressAutosave: true,
          suppressDueIndexSort: true,
        });
        if (!mirrorResult.ok) {
          diagnostics.push({
            code: 'semantic-repair-mirror-failed',
            message: 'Semantic repair committed to SQL, but local card mirror update failed.',
            error: mirrorResult.error.message,
          });
        }
      }

      return {
        status: diagnostics.length > 0 ? 'failed' : 'committed',
        receiptId: applied.receiptId,
        appliedCount: applied.repairedCount,
        skippedCount: skippedPlans.length,
        failedCount: applied.failedCardIds.length + diagnostics.length,
        updatedCardIds: applied.updatedCards.map((card) => card.id),
        diagnostics,
        preview,
      };
    } catch (error) {
      return {
        status: 'failed',
        appliedCount: 0,
        skippedCount: skippedPlans.length,
        failedCount: safePlans.length,
        updatedCardIds: [],
        diagnostics: [{
          code: 'semantic-repair-commit-failed',
          message: 'SQL semantic repair commit failed.',
          error: error instanceof Error ? error.message : String(error),
        }],
        preview,
      };
    }
  }

  private unavailable(message: string, error?: unknown): SrsCardSemanticsRepairUnavailable {
    return {
      status: 'unavailable',
      diagnostics: [{
        code: 'semantic-repair-unavailable',
        message,
        ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
      }],
    };
  }
}

function countAudits(audits: SrsCardSemanticAuditResult[]): SrsCardSemanticsRepairCounts {
  const counts: SrsCardSemanticsRepairCounts = {
    total: audits.length,
    safeRepair: 0,
    ambiguous: 0,
    insufficient: 0,
    noop: 0,
    skipped: 0,
  };
  for (const audit of audits) {
    switch (audit.repairPlan.status) {
      case 'safe-repair':
        counts.safeRepair += 1;
        break;
      case 'ambiguous':
        counts.ambiguous += 1;
        counts.skipped += 1;
        break;
      case 'insufficient':
        counts.insufficient += 1;
        counts.skipped += 1;
        break;
      case 'noop':
        counts.noop += 1;
        break;
    }
  }
  return counts;
}

function toRepairRow(audit: SrsCardSemanticAuditResult): SrsCardSemanticsRepairRow {
  const { repairPlan, resolution } = audit;
  return {
    cardId: repairPlan.cardId,
    status: repairPlan.status,
    beforeKind: repairPlan.beforeKind,
    afterKind: repairPlan.afterKind,
    evidenceCount: resolution.evidence.length,
    diagnosticCodes: resolution.diagnostics.map((diagnostic) => diagnostic.code),
  };
}
