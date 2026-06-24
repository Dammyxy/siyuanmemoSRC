import { UnifiedPostCreationPlanner } from '@/core/card/post-creation/UnifiedPostCreationPlanner';
import {
  resolveDefaultCapabilities,
  type CreationDecision,
} from '@/core/card/post-creation/contracts';
import { selectPreferredInlineSymbolLine } from '@/core/card/post-creation/rules/rule-utils';
import {
  PostCreationConflictMediator,
  type ConflictPromptPort,
} from './PostCreationConflictMediator';
import { createLogger } from '@/utils/logger';
import type { HostBlockQueryPort } from '@/application/ports/HostBlockQueryPort';

const logger = createLogger('DocumentPostCreationScanService');

type DocumentScanSiyuanPort = {
  getBlockKramdown: (blockId: string) => Promise<{ kramdown: string }>;
};

type ScannedBlockRow = {
  id?: string;
  type?: string;
  parent_id?: string;
};

type ScanExecutor = {
  executeSingleBlockDecision: (params: { blockId: string; content: string; decision: CreationDecision }) => Promise<boolean>;
  executeStructuralDecision: (params: { blockId: string; content: string; decision: CreationDecision }) => Promise<boolean>;
};

type SingleBlockDecisionResolution = {
  matchedRuleIds?: string[];
  enabledDecisions?: CreationDecision[];
  selectedDecision: CreationDecision | null;
  conflicted?: boolean;
};

export interface DocumentPostCreationScanResult {
  rootId: string;
  scanned: number;
  created: number;
  skipped: number;
  failed: number;
  conflicted: number;
  consumed: number;
}

export interface DocumentSymbolCardPlanCandidate {
  blockId: string;
  blockType: string;
  content: string;
  normalizedContent: string;
  decision: CreationDecision;
  executorKind: CreationDecision['executorKind'];
  structural: boolean;
  consumed: boolean;
  conflicted: boolean;
}

export interface DocumentSymbolCardBatchPlan {
  rootId: string;
  summary: DocumentPostCreationScanResult;
  candidates: DocumentSymbolCardPlanCandidate[];
}

function normalizeInlineSymbolContent(content: string): string {
  return selectPreferredInlineSymbolLine(content);
}

function normalizeSingleBlockDetectionContent(blockType: string, content: string): string {
  if (blockType === 'i') {
    return normalizeInlineSymbolContent(content);
  }
  return String(content || '').replace(/\{:[^{}\n]*\}/g, '').trim();
}

export class DocumentPostCreationScanService {
  private readonly planner: UnifiedPostCreationPlanner;
  private readonly conflictMediator: PostCreationConflictMediator;
  private readonly resolveCardType?: (params: { blockId: string; blockType: string; content: string }) => Promise<'topic' | 'item'>;
  private readonly resolveStructuralDecision?: (params: {
    blockId: string;
    blockType: string;
    content: string;
    resolvedCardType?: 'topic' | 'item';
  }) => Promise<SingleBlockDecisionResolution>;
  private readonly resolveSingleBlockDecision?: (params: {
    blockId: string;
    blockType: string;
    content: string;
    resolvedCardType?: 'topic' | 'item';
  }) => Promise<SingleBlockDecisionResolution>;

  constructor(
    private readonly siyuanApi: DocumentScanSiyuanPort,
    private readonly blockQuery: Pick<HostBlockQueryPort, 'listBlocksByRoot' | 'listParentIdsWithParagraphChild'>,
    private readonly executor: ScanExecutor,
    options?: {
      planner?: UnifiedPostCreationPlanner;
      conflictMediator?: PostCreationConflictMediator;
      promptPort?: ConflictPromptPort;
      resolveCardType?: (params: { blockId: string; blockType: string; content: string }) => Promise<'topic' | 'item'>;
      resolveStructuralDecision?: (params: {
        blockId: string;
        blockType: string;
        content: string;
        resolvedCardType?: 'topic' | 'item';
      }) => Promise<SingleBlockDecisionResolution>;
      resolveSingleBlockDecision?: (params: {
        blockId: string;
        blockType: string;
        content: string;
        resolvedCardType?: 'topic' | 'item';
      }) => Promise<SingleBlockDecisionResolution>;
    }
  ) {
    this.planner = options?.planner || new UnifiedPostCreationPlanner();
    this.conflictMediator = options?.conflictMediator || new PostCreationConflictMediator();
    this.promptPort = options?.promptPort;
    this.resolveCardType = options?.resolveCardType;
    this.resolveStructuralDecision = options?.resolveStructuralDecision;
    this.resolveSingleBlockDecision = options?.resolveSingleBlockDecision;
  }

  private readonly promptPort?: ConflictPromptPort;

  async scanByRootId(rootId: string): Promise<DocumentPostCreationScanResult> {
    const plan = await this.planByRootId(rootId);
    return this.executePlan(plan);
  }

  async planByRootId(rootId: string): Promise<DocumentSymbolCardBatchPlan> {
    const normalizedRootId = rootId.trim();
    const summary: DocumentPostCreationScanResult = {
      rootId: normalizedRootId,
      scanned: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      conflicted: 0,
      consumed: 0,
    };
    const candidates: DocumentSymbolCardPlanCandidate[] = [];

    if (!normalizedRootId) {
      return { rootId: normalizedRootId, summary, candidates };
    }

    const rows = await this.blockQuery.listBlocksByRoot(
      normalizedRootId,
      ['p', 'm', 'i'],
    ) as ScannedBlockRow[];

    const blockRows = rows
      .map((row) => ({
        id: typeof row.id === 'string' ? row.id : '',
        type: typeof row.type === 'string' ? row.type : '',
      }))
      .filter((row) => row.id.length > 0 && (row.type === 'p' || row.type === 'm' || row.type === 'i'));

    const listItemIds = blockRows
      .filter((row) => row.type === 'i')
      .map((row) => row.id);
    const listItemsWithParagraphChild = new Set<string>();
    if (listItemIds.length > 0) {
      const parentIds = await this.blockQuery.listParentIdsWithParagraphChild(listItemIds);
      parentIds.forEach((parentId) => listItemsWithParagraphChild.add(parentId));
    }

    summary.scanned = blockRows.length;
    if (blockRows.length === 0) {
      return { rootId: normalizedRootId, summary, candidates };
    }

    const consumedBlockIds = new Set<string>();
    const runContext = this.conflictMediator.createRunContext();
    const structuralRulesEnabled = this.resolveStructuralDecision
      ? true
      : resolveDefaultCapabilities('doc-oneclick-scan').allowStructuralRules;

    // Pass 1: structural anchors (`i` blocks only).
    if (!structuralRulesEnabled) {
      logger.info('[DocumentPostCreationScan] Structural pass skipped because source capabilities disabled structural rules', {
        source: 'doc-oneclick-scan',
      });
    } else {
      for (const row of blockRows) {
        if (row.type !== 'i') {
          continue;
        }

        try {
          const { kramdown } = await this.siyuanApi.getBlockKramdown(row.id);
          const content = String(kramdown || '');
          const normalizedContent = normalizeSingleBlockDetectionContent(row.type, content);
          const resolvedCardType = this.resolveCardType
            ? await this.resolveCardType({ blockId: row.id, blockType: row.type, content: normalizedContent })
            : undefined;
          let selectedDecision: CreationDecision | null = null;
          let conflicted = false;
          let hadStructuralCandidate = false;

          if (this.resolveStructuralDecision) {
            const resolved = await this.resolveStructuralDecision({
              blockId: row.id,
              blockType: row.type,
              content: normalizedContent,
              resolvedCardType,
            });
            selectedDecision = resolved.selectedDecision || null;
            conflicted = resolved.conflicted === true;
            hadStructuralCandidate = Boolean(selectedDecision)
              || conflicted
              || (resolved.matchedRuleIds?.length ?? 0) > 0
              || (resolved.enabledDecisions?.length ?? 0) > 0;
          } else {
            const plan = this.planner.plan({
              blockId: row.id,
              blockType: row.type,
              content: normalizedContent,
              source: 'doc-oneclick-scan',
              resolvedCardType,
            });
            const structuralDecisions = plan.decisions.filter((decision) =>
              decision.executorKind === 'list-template-structural'
              || decision.executorKind === 'cdf-multiline-structural'
            );

            if (structuralDecisions.length === 0) {
              continue;
            }
            hadStructuralCandidate = true;

            const structuralPlan = {
              ...plan,
              decisions: structuralDecisions,
              conflicts: plan.conflicts.filter((conflict) =>
                conflict.decisionIds.filter((decisionId) =>
                  structuralDecisions.some((decision) => decision.id === decisionId)
                ).length > 1
              ),
            };
            const resolved = await this.conflictMediator.resolveSingleDecision(
              structuralPlan,
              runContext,
              {
                sourceLabel: 'doc-oneclick-scan',
                promptPort: this.promptPort,
              }
            );
            selectedDecision = resolved.decision;
            conflicted = resolved.conflicted;
          }

          if (conflicted) {
            summary.conflicted += 1;
          }

          if (!selectedDecision) {
            if (hadStructuralCandidate) {
              summary.skipped += 1;
            }
            continue;
          }

          consumedBlockIds.add(row.id);
          candidates.push({
            blockId: row.id,
            blockType: row.type,
            content,
            normalizedContent,
            decision: selectedDecision,
            executorKind: selectedDecision.executorKind,
            structural: true,
            consumed: true,
            conflicted,
          });
        } catch (error) {
          summary.failed += 1;
          logger.error('[DocumentPostCreationScan] Structural pass failed:', {
            blockId: row.id,
            error,
          });
        }
      }
    }

    // Pass 2: single-block rules (`p` / `m` and fallback `i`).
    for (const row of blockRows) {
      if (row.type !== 'p' && row.type !== 'm' && row.type !== 'i') {
        continue;
      }
      // Prefer paragraph children as the stable semantic unit; list-item is fallback only.
      if (row.type === 'i' && listItemsWithParagraphChild.has(row.id)) {
        summary.skipped += 1;
        continue;
      }
      if (consumedBlockIds.has(row.id)) {
        summary.skipped += 1;
        continue;
      }

      try {
        const { kramdown } = await this.siyuanApi.getBlockKramdown(row.id);
        const content = String(kramdown || '');
        const normalizedContent = normalizeSingleBlockDetectionContent(row.type, content);
        const resolvedCardType = this.resolveCardType
          ? await this.resolveCardType({ blockId: row.id, blockType: row.type, content: normalizedContent })
          : undefined;
        let selectedDecision: CreationDecision | null = null;
        let conflicted = false;

        if (this.resolveSingleBlockDecision) {
          const resolved = await this.resolveSingleBlockDecision({
            blockId: row.id,
            blockType: row.type,
            content: normalizedContent,
            resolvedCardType,
          });
          selectedDecision = resolved.selectedDecision || null;
          conflicted = resolved.conflicted === true;
        } else {
          const plan = this.planner.plan({
            blockId: row.id,
            blockType: row.type,
            content: normalizedContent,
            source: 'doc-oneclick-scan',
            resolvedCardType,
          });
          const nonStructuralDecisions = plan.decisions.filter((decision) =>
            decision.executorKind !== 'list-template-structural'
            && decision.executorKind !== 'cdf-multiline-structural'
          );
          if (nonStructuralDecisions.length === 0) {
            summary.skipped += 1;
            continue;
          }

          const nonStructuralPlan = {
            ...plan,
            decisions: nonStructuralDecisions,
            conflicts: plan.conflicts.filter((conflict) =>
              conflict.decisionIds.filter((decisionId) =>
                nonStructuralDecisions.some((decision) => decision.id === decisionId)
              ).length > 1
            ),
          };
          const resolved = await this.conflictMediator.resolveSingleDecision(
            nonStructuralPlan,
            runContext,
            {
              sourceLabel: 'doc-oneclick-scan',
              promptPort: this.promptPort,
            }
          );
          selectedDecision = resolved.decision;
          conflicted = resolved.conflicted;
        }

        if (conflicted) {
          summary.conflicted += 1;
        }

        if (!selectedDecision) {
          summary.skipped += 1;
          continue;
        }

        candidates.push({
          blockId: row.id,
          blockType: row.type,
          content,
          normalizedContent,
          decision: selectedDecision,
          executorKind: selectedDecision.executorKind,
          structural: false,
          consumed: false,
          conflicted,
        });
      } catch (error) {
        summary.failed += 1;
        logger.error('[DocumentPostCreationScan] Single-block pass failed:', {
          blockId: row.id,
          error,
        });
      }
    }

    summary.consumed = consumedBlockIds.size;
    return { rootId: normalizedRootId, summary, candidates };
  }

  private async executePlan(plan: DocumentSymbolCardBatchPlan): Promise<DocumentPostCreationScanResult> {
    const summary: DocumentPostCreationScanResult = { ...plan.summary };
    for (const candidate of plan.candidates) {
      try {
        const created = candidate.structural
          ? await this.executor.executeStructuralDecision({
            blockId: candidate.blockId,
            content: candidate.content,
            decision: candidate.decision,
          })
          : await this.executor.executeSingleBlockDecision({
            blockId: candidate.blockId,
            content: candidate.normalizedContent,
            decision: candidate.decision,
          });
        if (created) {
          summary.created += 1;
          if (!candidate.structural) {
            summary.consumed += 1;
          }
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.failed += 1;
        logger.error('[DocumentPostCreationScan] Candidate execution failed:', {
          blockId: candidate.blockId,
          executorKind: candidate.executorKind,
          error,
        });
      }
    }
    return summary;
  }
}
