import type { CreationDecision } from '@/core/card/post-creation/contracts';
import {
  selectPreferredInlineSymbolLine,
} from '@/core/card/post-creation/rules/rule-utils';
import type {
  CdfMultilineTemplateId,
  CreateCdfMultilineCardsPayload,
} from '@/application/usecases/xiuyuan/CreateCdfMultilineCardsUseCase';
import type { ResolvedListChildren } from '@/application/usecases/xiuyuan/shared/ListChildrenResolver';
import { createLogger } from '@/utils/logger';
import { isErr, type Result } from '@/types/result';
import type { AutoCardExecutionSource } from './AutoCardExecutionRuntime';

const logger = createLogger('AutoCardPlannerExecutionRuntime');

type TopicItemCardType = 'topic' | 'item';

export interface AutoCardPlannerExecutionInput {
  blockId: string;
  content: string;
  decision: CreationDecision;
  source: AutoCardExecutionSource;
  docRootId?: string;
}

export interface AutoCardPlannerCreateBasicInput {
  blockId: string;
  direction: string;
  content: string;
  cardType: TopicItemCardType;
  actualSymbol?: string;
  source: AutoCardExecutionSource;
  decision: CreationDecision;
}

export interface AutoCardPlannerCreateClozeInput {
  blockId: string;
  content: string;
  cardType: TopicItemCardType;
  decision: CreationDecision;
  source: AutoCardExecutionSource;
}

export interface AutoCardPlannerCreateConceptInput {
  blockId: string;
  content: string;
  actualSymbol?: string;
  direction: 'both' | 'forward' | 'reverse';
  source: AutoCardExecutionSource;
  options?: {
    skipEnsureConceptDocumentBlockId?: string;
  };
  decision: CreationDecision;
}

export interface AutoCardPlannerCreateDescriptorInput {
  blockId: string;
  content: string;
  actualSymbol?: string;
  direction: 'forward' | 'reverse' | 'both';
  source: AutoCardExecutionSource;
  options?: {
    skipDocumentConceptAutoCreateBlockId?: string;
  };
  decision: CreationDecision;
}

export interface AutoCardPlannerExecutionRuntimeDeps {
  getBlockAttrs: (blockId: string) => Promise<Record<string, string>>;
  getLocalCardsByBlockId: (blockId: string) => unknown[];
  createBasicCard: (input: AutoCardPlannerCreateBasicInput) => Promise<void>;
  createClozeCard: (input: AutoCardPlannerCreateClozeInput) => Promise<void>;
  createConceptCard: (input: AutoCardPlannerCreateConceptInput) => Promise<void>;
  createDescriptorCard: (input: AutoCardPlannerCreateDescriptorInput) => Promise<void>;
  resolveListChildrenBySubtype: (parentBlockId: string) => Promise<ResolvedListChildren>;
  createListTemplateCards: (input: {
    parentBlockId: string;
    childBlocks: Array<{ id: string }>;
    cardType: TopicItemCardType;
  }) => Promise<void>;
  createCdfMultilineCards: (input: {
    parentBlockId: string;
    templateId: CdfMultilineTemplateId;
  }) => Promise<Result<CreateCdfMultilineCardsPayload>>;
}

export class AutoCardPlannerExecutionRuntime {
  constructor(private readonly deps: AutoCardPlannerExecutionRuntimeDeps) {}

  async execute(params: AutoCardPlannerExecutionInput): Promise<boolean> {
    const { blockId, content, decision, source, docRootId } = params;
    const inlineContent = normalizeInlineSymbolContent(content);
    const clozeContent = normalizeClozeSymbolContent(content);
    const attrs = await this.deps.getBlockAttrs(blockId);

    if (hasXiuyuanBinding(attrs)) {
      logger.debug('[SiYuanMemo][AutoCard] Skip planner decision: block already has Xiuyuan binding', {
        blockId,
        source,
        ruleId: decision.id,
        executorKind: decision.executorKind,
      });
      return false;
    }

    const existedBefore = this.deps.getLocalCardsByBlockId(blockId).length > 0;
    if (existedBefore) {
      logger.debug('[SiYuanMemo][AutoCard] Skip planner decision: card already exists in local storage', {
        blockId,
        source,
        ruleId: decision.id,
      });
      return false;
    }

    switch (decision.executorKind) {
      case 'quick-basic': {
        await this.deps.createBasicCard({
          blockId,
          direction: decision.direction || 'forward',
          content: inlineContent,
          cardType: normalizeTopicItemCardType(decision.cardType),
          actualSymbol: undefined,
          source,
          decision,
        });
        break;
      }
      case 'quick-cloze': {
        logger.debug('[SiYuanMemo][AutoCard] Executing quick-cloze decision with normalized content', {
          blockId,
          executorKind: decision.executorKind,
          rawLength: String(content || '').length,
          clozeContentLength: clozeContent.length,
          firstLinePreview: clozeContent.split('\n')[0]?.slice(0, 80) || '',
        });
        await this.deps.createClozeCard({
          blockId,
          content: clozeContent,
          cardType: normalizeTopicItemCardType(decision.cardType),
          decision,
          source,
        });
        break;
      }
      case 'concept-definition-inline': {
        const direction = decision.direction === 'backward'
          ? 'reverse'
          : decision.direction === 'forward'
            ? 'forward'
            : 'both';
        await this.deps.createConceptCard({
          blockId,
          content: inlineContent,
          actualSymbol: undefined,
          direction,
          source,
          options: {
            skipEnsureConceptDocumentBlockId: source === 'doc-oneclick-scan' ? docRootId : undefined,
          },
          decision,
        });
        break;
      }
      case 'descriptor-inline': {
        const direction = decision.direction === 'backward'
          ? 'reverse'
          : decision.direction === 'both'
            ? 'both'
            : 'forward';
        await this.deps.createDescriptorCard({
          blockId,
          content: inlineContent,
          actualSymbol: undefined,
          direction,
          source,
          options: {
            skipDocumentConceptAutoCreateBlockId: source === 'doc-oneclick-scan' ? docRootId : undefined,
          },
          decision,
        });
        break;
      }
      case 'list-template-structural': {
        if (source === 'symbol-listener') {
          logger.debug('[SiYuanMemo][AutoCard] Structural list-template rule is disabled for symbol-listener source', {
            blockId,
            ruleId: decision.id,
          });
          return false;
        }
        return this.createListTemplateCardsByPlanner(
          blockId,
          normalizeTopicItemCardType(decision.cardType)
        );
      }
      case 'cdf-multiline-structural': {
        if (source === 'symbol-listener') {
          logger.debug('[SiYuanMemo][AutoCard] Structural CDF rule is disabled for symbol-listener source', {
            blockId,
            ruleId: decision.id,
          });
          return false;
        }
        return this.createCdfMultilineCardsByPlanner(blockId, decision.templateId);
      }
      default: {
        logger.debug('[SiYuanMemo][AutoCard] Unsupported planner decision for auto-card execution', {
          blockId,
          source,
          ruleId: decision.id,
          executorKind: decision.executorKind,
        });
        return false;
      }
    }

    const existedAfter = this.deps.getLocalCardsByBlockId(blockId).length > 0;
    return !existedBefore && existedAfter;
  }

  private async createListTemplateCardsByPlanner(
    parentBlockId: string,
    cardType: TopicItemCardType
  ): Promise<boolean> {
    const resolvedChildren = await this.deps.resolveListChildrenBySubtype(parentBlockId);
    const childBlocks = [...resolvedChildren.orderedChildren, ...resolvedChildren.unorderedChildren]
      .map((child) => ({ id: child.id }));

    if (childBlocks.length < 2) {
      logger.debug('[SiYuanMemo][AutoCard] Structural list-template skipped: not enough child list items', {
        parentBlockId,
        childCount: childBlocks.length,
      });
      return false;
    }

    const existingBefore = childBlocks.reduce((count, child) => (
      this.deps.getLocalCardsByBlockId(child.id).length > 0 ? count + 1 : count
    ), 0);

    await this.deps.createListTemplateCards({
      parentBlockId,
      childBlocks,
      cardType,
    });

    const existingAfter = childBlocks.reduce((count, child) => (
      this.deps.getLocalCardsByBlockId(child.id).length > 0 ? count + 1 : count
    ), 0);

    return existingAfter > existingBefore;
  }

  private async createCdfMultilineCardsByPlanner(
    parentBlockId: string,
    templateId: string
  ): Promise<boolean> {
    if (templateId !== 'builtin-list-concept-multiline' && templateId !== 'builtin-list-descriptor-multiline') {
      logger.warn('[SiYuanMemo][AutoCard] Unexpected CDF template id from planner decision', {
        parentBlockId,
        templateId,
      });
      return false;
    }

    const result = await this.deps.createCdfMultilineCards({
      parentBlockId,
      templateId,
    });

    if (isErr(result)) {
      logger.warn('[SiYuanMemo][AutoCard] Failed to create CDF multiline cards by planner:', {
        parentBlockId,
        templateId,
        error: result.error,
      });
      return false;
    }

    const payload = result.value;
    const created = payload.createdDefinition + payload.createdDescriptor;
    if (created === 0) {
      return false;
    }

    logger.info('[SiYuanMemo][AutoCard] Created CDF multiline cards by planner', {
      parentBlockId,
      templateId,
      createdDefinition: payload.createdDefinition,
      createdDescriptor: payload.createdDescriptor,
      skipped: payload.skipped,
      failed: payload.failed,
    });
    return true;
  }
}

export function normalizeTopicItemCardType(cardType: string | undefined): TopicItemCardType {
  return cardType === 'topic' ? 'topic' : 'item';
}

export function hasXiuyuanBinding(attrs: Record<string, string> | null | undefined): boolean {
  if (!attrs) {
    return false;
  }
  const xiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
  return typeof xiuyuanId === 'string' && xiuyuanId.trim().length > 0;
}

export function normalizeInlineSymbolContent(content: string): string {
  return selectPreferredInlineSymbolLine(content);
}

export function normalizeClozeSymbolContent(content: string): string {
  return String(content || '')
    .replace(/\{:[^{}\n]*\}/g, '')
    .replace(/\r/g, '')
    .trim();
}
