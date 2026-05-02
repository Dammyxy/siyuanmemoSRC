import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { ProgressiveNativeRiffPort } from '@/application/ports/ProgressiveNativeRiffPort';
import {
  type ProgressiveChildDocStorageMode,
  ProgressiveReadingService,
} from '@/application/services/ProgressiveReadingService';
import type { CreationDecision } from '@/core/card/post-creation/contracts';
import { ClozeDetector, type ClozeInfo } from '@/utils/cloze-detector';
import {
  ATTR_PROGRESSIVE_ANSWER_FINGERPRINT,
  ATTR_PROGRESSIVE_CREATION_RULE_ID,
  ATTR_PROGRESSIVE_KIND,
  ATTR_PROGRESSIVE_PARENT_EXCERPT_ID,
  ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID,
  ATTR_PROGRESSIVE_SOURCE_BLOCK_ID,
  ATTR_PROGRESSIVE_SOURCE_DOC_ID,
  ATTR_PROGRESSIVE_STORAGE_MODE,
} from '@/core/siyuan/block';
import { createLogger } from '@/utils/logger';
import {
  parseBasicDirectionContent,
  selectPreferredInlineSymbolLine,
} from '@/core/card/post-creation/rules/rule-utils';
import { isErr } from '@/types/result';
import type { ProgressiveSourceRootKind } from '@/application/services/ProgressiveSourceContextResolver';

const logger = createLogger('TopicDerivedItemService');

type TopicDerivationSettingsProvider = {
  getSettings: () => {
    quickCard?: {
      topicDerivation?: {
        enabled?: boolean;
        storageMode?: ProgressiveChildDocStorageMode;
      };
    };
  };
};

type TopicDerivedOwnershipBoundaryClient = {
  p6OwnershipQuery?: (request: {
    requestId?: string;
    surface: 'topic-derived';
    operation: 'scan-candidates' | 'resolve-list-children' | 'resolve-concept' | 'read-block-meta' | 'read-block-content' | 'read-card-context';
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  }) => Promise<unknown>;
  p6OwnershipCommand?: (request: {
    requestId?: string;
    surface: 'topic-derived';
    operation: 'execute-side-effect';
    payload?: Record<string, unknown>;
    idempotencyKey: string;
  }) => Promise<unknown>;
};

type DerivedCandidate = {
  creationRuleId: string;
  answerFingerprint: string;
  contentMarkdown?: string;
  contentDom?: string;
  previewText: string;
  metadataSource: 'topic-derived';
  question?: string;
  answer?: string;
};

export interface TopicDerivedItemInput {
  sourceBlockId: string;
  sourceDocId: string;
  parentTopicCardId: string;
  parentExcerptId?: string;
  sourceRootKind?: ProgressiveSourceRootKind;
  plannerContent: string;
  artifactContentDom?: string;
  mode?: 'planner-derived' | 'manual-cloze';
  answerFingerprint?: string;
  previewText?: string;
  decisions: CreationDecision[];
  storageMode?: ProgressiveChildDocStorageMode;
}

export interface TopicDerivedItemArtifact {
  derivedDocId: string;
  derivedBlockId: string;
  derivedCardId: string;
  sourceBlockId: string;
  storageMode: ProgressiveChildDocStorageMode;
  creationRuleId: string;
  answerFingerprint: string;
}

export interface TopicDerivedItemResult {
  created: number;
  skipped: number;
  items: TopicDerivedItemArtifact[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export class TopicDerivedItemService {
  constructor(
    private readonly cardService: CardApplicationService,
    private readonly progressiveReadingService: ProgressiveReadingService,
    private readonly nativeRiffApi: ProgressiveNativeRiffPort,
    private readonly settingsProvider: TopicDerivationSettingsProvider,
    private readonly ownershipBoundaryClient?: TopicDerivedOwnershipBoundaryClient,
  ) {}

  async createFromTopicSource(input: TopicDerivedItemInput): Promise<TopicDerivedItemResult> {
    const sourceBlockId = String(input.sourceBlockId || '').trim();
    const sourceDocId = String(input.sourceDocId || '').trim();
    const parentTopicCardId = String(input.parentTopicCardId || '').trim();
    const parentExcerptId = String(input.parentExcerptId || '').trim() || undefined;
    const plannerContent = String(input.plannerContent || '');
    const artifactContentDom = String(input.artifactContentDom || '').trim();

    if (!sourceBlockId || !sourceDocId || !parentTopicCardId || !plannerContent) {
      return {
        created: 0,
        skipped: 0,
        items: [],
      };
    }
    void this.reportOwnershipQuery('scan-candidates', {
      sourceBlockId,
      sourceDocId,
      parentTopicCardId,
      mode: input.mode || 'planner-derived',
    });

    const storageMode = this.resolveStorageMode(input.storageMode, input.sourceRootKind);
    const candidates = input.mode === 'manual-cloze'
      ? this.buildManualClozeCandidates({
        sourceBlockId,
        plannerContent,
        artifactContentDom,
        answerFingerprint: input.answerFingerprint,
        previewText: input.previewText,
        decisions: input.decisions,
      })
      : this.buildCandidates({
        sourceBlockId,
        content: plannerContent,
        decisions: input.decisions,
      });
    if (candidates.length === 0) {
      return {
        created: 0,
        skipped: 0,
        items: [],
      };
    }

    const existingFingerprints = await this.loadExistingFingerprints(sourceBlockId, parentTopicCardId);
    const items: TopicDerivedItemArtifact[] = [];
    let skipped = 0;

    for (const candidate of candidates) {
      if (existingFingerprints.has(candidate.answerFingerprint)) {
        skipped += 1;
        continue;
      }

      let derivedDocId = '';
      try {
        const childDoc = await this.progressiveReadingService.createChildDocFromSource({
          sourceDocId,
          kind: 'derived-item-doc',
          titlePrefix: 'Item',
          previewText: candidate.previewText,
          previewMax: 16,
          storageMode,
          attrs: {
            [ATTR_PROGRESSIVE_KIND]: 'derived-item-doc',
            [ATTR_PROGRESSIVE_SOURCE_DOC_ID]: sourceDocId,
            [ATTR_PROGRESSIVE_SOURCE_BLOCK_ID]: sourceBlockId,
            [ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID]: parentTopicCardId,
            ...(parentExcerptId
              ? { [ATTR_PROGRESSIVE_PARENT_EXCERPT_ID]: parentExcerptId }
              : {}),
            [ATTR_PROGRESSIVE_STORAGE_MODE]: storageMode,
            [ATTR_PROGRESSIVE_CREATION_RULE_ID]: candidate.creationRuleId,
            [ATTR_PROGRESSIVE_ANSWER_FINGERPRINT]: candidate.answerFingerprint,
          },
          ...(candidate.contentDom
            ? { contentDom: candidate.contentDom }
            : { contentMarkdown: candidate.contentMarkdown || '' }),
        });
        derivedDocId = childDoc.docId;

        const derivedBlockId = String(childDoc.contentBlockId || '').trim();
        if (!derivedBlockId) {
          throw new Error('Topic 下继续制卡的子文档创建成功，但内容块未返回');
        }
        void this.reportOwnershipCommand({
          sourceBlockId,
          sourceDocId,
          parentTopicCardId,
          parentExcerptId,
          derivedDocId: childDoc.docId,
          derivedBlockId,
          ruleId: candidate.creationRuleId,
        });

        const derivedCardId = await this.createDerivedItemCard({
          candidate,
          derivedBlockId,
          sourceBlockId,
          sourceDocId,
          parentTopicCardId,
          parentExcerptId,
          storageMode,
        });

        existingFingerprints.add(candidate.answerFingerprint);
        items.push({
          derivedDocId: childDoc.docId,
          derivedBlockId,
          derivedCardId,
          sourceBlockId,
          storageMode,
          creationRuleId: candidate.creationRuleId,
          answerFingerprint: candidate.answerFingerprint,
        });
      } catch (error) {
        await this.rollbackDerivedDoc(derivedDocId, {
          sourceBlockId,
          sourceDocId,
          parentTopicCardId,
          parentExcerptId,
          answerFingerprint: candidate.answerFingerprint,
          creationRuleId: candidate.creationRuleId,
          error,
        });
        throw error;
      }
    }

    logger.info('Derived item creation completed', {
      sourceBlockId,
      sourceDocId,
      parentTopicCardId,
      parentExcerptId: parentExcerptId || null,
      sourceRootKind: input.sourceRootKind || null,
      storageMode,
      created: items.length,
      skipped,
    });

    return {
      created: items.length,
      skipped,
      items,
    };
  }

  private resolveStorageMode(
    explicitMode?: ProgressiveChildDocStorageMode,
    sourceRootKind?: ProgressiveSourceRootKind,
  ): ProgressiveChildDocStorageMode {
    if (sourceRootKind === 'excerpt-doc') {
      return 'source-child';
    }

    if (explicitMode === 'source-child') {
      return 'source-child';
    }

    if (explicitMode === 'workbench') {
      return 'workbench';
    }

    try {
      return this.settingsProvider.getSettings().quickCard?.topicDerivation?.storageMode === 'source-child'
        ? 'source-child'
        : 'workbench';
    } catch (error) {
      logger.warn('Failed to read topic derivation storage mode, falling back to workbench', error);
      return 'workbench';
    }
  }

  private async loadExistingFingerprints(sourceBlockId: string, parentTopicCardId: string): Promise<Set<string>> {
    const result = await this.cardService.getCards({
      filter: {
        customFilter: (card) => {
          const meta = isRecord(card.meta) ? card.meta : undefined;
          const progressive = isRecord(meta?.progressive) ? meta.progressive : undefined;
          return (
            String(progressive?.kind || '').trim() === 'derived-item'
            && String(progressive?.sourceBlockId || '').trim() === sourceBlockId
            && String(progressive?.parentTopicCardId || '').trim() === parentTopicCardId
          );
        },
      },
    });

    const fingerprints = new Set<string>();
    for (const card of result.cards) {
      const meta = isRecord(card.meta) ? card.meta : undefined;
      const progressive = isRecord(meta?.progressive) ? meta.progressive : undefined;
      const fingerprint = String(progressive?.answerFingerprint || '').trim();
      if (fingerprint) {
        fingerprints.add(fingerprint);
      }
    }
    return fingerprints;
  }

  private buildCandidates(input: {
    sourceBlockId: string;
    content: string;
    decisions: CreationDecision[];
  }): DerivedCandidate[] {
    const candidates: DerivedCandidate[] = [];
    const seenFingerprints = new Set<string>();

    for (const decision of input.decisions) {
      if (decision.family === 'cloze') {
        for (const cloze of ClozeDetector.extractClozes(input.content)) {
          const answerFingerprint = `${input.sourceBlockId}::${decision.id}::${cloze.start}:${cloze.end}`;
          if (seenFingerprints.has(answerFingerprint)) {
            continue;
          }
          seenFingerprints.add(answerFingerprint);
          candidates.push({
            creationRuleId: decision.id,
            answerFingerprint,
            contentMarkdown: this.buildSingleClozeMarkdown(input.content, cloze),
            previewText: cloze.text,
            metadataSource: 'topic-derived',
          });
        }
        continue;
      }

      const normalizedBasic = this.normalizeBasicDerivationContent(input.content, decision);
      if (!normalizedBasic) {
        continue;
      }

      const answerFingerprint = `${input.sourceBlockId}::${decision.id}::${normalizeWhitespace(normalizedBasic)}`;
      if (seenFingerprints.has(answerFingerprint)) {
        continue;
      }
      seenFingerprints.add(answerFingerprint);
      const parsed = this.parseNormalizedBasic(normalizedBasic);
      candidates.push({
        creationRuleId: decision.id,
        answerFingerprint,
        contentMarkdown: normalizedBasic,
        previewText: parsed?.answer || parsed?.question || normalizedBasic,
        metadataSource: 'topic-derived',
        question: parsed?.question,
        answer: parsed?.answer,
      });
    }

    return candidates;
  }

  private buildManualClozeCandidates(input: {
    sourceBlockId: string;
    plannerContent: string;
    artifactContentDom: string;
    answerFingerprint?: string;
    previewText?: string;
    decisions: CreationDecision[];
  }): DerivedCandidate[] {
    const decision = input.decisions.find((candidate) => candidate.family === 'cloze');
    const answerFingerprint = String(input.answerFingerprint || '').trim();
    const artifactContentDom = String(input.artifactContentDom || '').trim();
    const previewText = normalizeWhitespace(String(input.previewText || ''));
    if (!decision || !answerFingerprint || !artifactContentDom || !previewText) {
      return [];
    }

    return [{
      creationRuleId: decision.id,
      answerFingerprint,
      contentMarkdown: input.plannerContent,
      contentDom: artifactContentDom,
      previewText,
      metadataSource: 'topic-derived',
    }];
  }

  private buildSingleClozeMarkdown(content: string, target: ClozeInfo): string {
    const clozes = ClozeDetector.extractClozes(content).sort((left, right) => left.start - right.start);
    let cursor = 0;
    let output = '';

    for (const cloze of clozes) {
      output += content.slice(cursor, cloze.start);
      output += cloze.start === target.start && cloze.end === target.end
        ? content.slice(cloze.start, cloze.end)
        : cloze.text;
      cursor = cloze.end;
    }

    output += content.slice(cursor);
    return output;
  }

  private normalizeBasicDerivationContent(content: string, decision: CreationDecision): string | null {
    const normalized = this.normalizeInlineSymbolContent(content);
    if (!normalized) {
      return null;
    }

    if (decision.family === 'basic') {
      return normalized;
    }

    if (decision.family === 'concept-definition') {
      return this.convertSemanticToBasic(
        normalized,
        decision.direction || 'both',
        /^(\(\([^)]+\)\))\s*(::|：：|:>|：》|:<|：《)\s*(.+)$/u,
      );
    }

    if (decision.family === 'descriptor') {
      return this.convertSemanticToBasic(
        normalized,
        decision.direction || 'forward',
        /^(.+?)\s*(;;|；；|;<|；<|；《|;<>|；<>|；《》)\s*(.+)$/u,
      );
    }

    return null;
  }

  private convertSemanticToBasic(
    normalized: string,
    direction: 'forward' | 'backward' | 'both',
    pattern: RegExp,
  ): string | null {
    const match = normalized.match(pattern);
    if (!match) {
      return null;
    }

    const left = String(match[1] || '').trim();
    const right = String(match[3] || '').trim();
    if (!left || !right) {
      return null;
    }

    if (direction === 'backward') {
      return `${left} << ${right}`;
    }
    if (direction === 'both') {
      return `${left} <> ${right}`;
    }
    return `${left} >> ${right}`;
  }

  private normalizeInlineSymbolContent(content: string): string {
    return selectPreferredInlineSymbolLine(content);
  }

  private parseNormalizedBasic(content: string): {
    question: string;
    answer: string;
    symbolType: string;
  } | null {
    const parsed = parseBasicDirectionContent(content);
    return parsed
      ? {
          question: parsed.question,
          answer: parsed.answer,
          symbolType: parsed.symbol,
        }
      : null;
  }

  private async createDerivedItemCard(input: {
    candidate: DerivedCandidate;
    derivedBlockId: string;
    sourceBlockId: string;
    sourceDocId: string;
    parentTopicCardId: string;
    parentExcerptId?: string;
    storageMode: ProgressiveChildDocStorageMode;
  }): Promise<string> {
    const result = await this.cardService.createCard({
      blockIds: [input.derivedBlockId],
      cardType: 'item',
      extractedFrom: input.sourceBlockId,
      progressiveLineage: {
        kind: 'derived-item',
        sourceDocId: input.sourceDocId,
        sourceBlockId: input.sourceBlockId,
        parentTopicCardId: input.parentTopicCardId,
        parentExcerptId: input.parentExcerptId,
        storageMode: input.storageMode,
        creationRuleId: input.candidate.creationRuleId,
        answerFingerprint: input.candidate.answerFingerprint,
      },
      metadata: {
        source: input.candidate.metadataSource,
        cardSource: 'topic-derived',
        ...(input.candidate.question ? { question: input.candidate.question } : {}),
        ...(input.candidate.answer ? { answer: input.candidate.answer } : {}),
      },
    });

    if (isErr(result)) {
      throw result.error;
    }

    const derivedCardId = result.value.getId().getValue();
    try {
      await this.nativeRiffApi.addRiffCards(this.nativeRiffApi.BUILTIN_DECK_ID, [input.derivedBlockId]);
    } catch (error) {
      await this.rollbackLocalCard(derivedCardId, {
        derivedBlockId: input.derivedBlockId,
        sourceBlockId: input.sourceBlockId,
        parentTopicCardId: input.parentTopicCardId,
        parentExcerptId: input.parentExcerptId || null,
        error,
      });
      throw error;
    }

    return derivedCardId;
  }

  private async rollbackDerivedDoc(docId: string, context: Record<string, unknown>): Promise<void> {
    const normalizedDocId = String(docId || '').trim();
    if (!normalizedDocId) {
      return;
    }

    try {
      await this.progressiveReadingService.deleteProgressiveArtifact(normalizedDocId);
    } catch (cleanupError) {
      logger.warn('Failed to rollback derived item document after progressive item creation error', {
        docId: normalizedDocId,
        ...context,
        cleanupError,
      });
    }
  }

  private async rollbackLocalCard(cardId: string, context: Record<string, unknown>): Promise<void> {
    try {
      const result = await this.cardService.deleteCard({ cardId });
      if (isErr(result)) {
        throw result.error;
      }
    } catch (cleanupError) {
      logger.warn('Failed to rollback derived item local card after native Riff sync error', {
        cardId,
        ...context,
        cleanupError,
      });
    }
  }

  private async reportOwnershipQuery(
    operation: 'scan-candidates' | 'resolve-list-children' | 'resolve-concept' | 'read-block-meta' | 'read-block-content' | 'read-card-context',
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.ownershipBoundaryClient?.p6OwnershipQuery?.({
        requestId: `topic-derived:${operation}:${Date.now().toString(36)}`,
        surface: 'topic-derived',
        operation,
        payload,
      });
    } catch (error) {
      logger.warn('Failed to report topic-derived ownership query', { operation, payload, error });
    }
  }

  private async reportOwnershipCommand(payload: Record<string, unknown>): Promise<void> {
    try {
      await this.ownershipBoundaryClient?.p6OwnershipCommand?.({
        requestId: `topic-derived:command:${Date.now().toString(36)}`,
        surface: 'topic-derived',
        operation: 'execute-side-effect',
        payload,
        idempotencyKey: `topic-derived:${String(payload.sourceBlockId || 'unknown')}:${String(payload.ruleId || 'rule')}:${Date.now().toString(36)}`,
      });
    } catch (error) {
      logger.warn('Failed to report topic-derived ownership command', { payload, error });
    }
  }
}
