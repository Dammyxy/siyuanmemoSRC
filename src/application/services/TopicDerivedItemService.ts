import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { ProgressiveNativeRiffPort } from '@/application/ports/ProgressiveNativeRiffPort';
import type { BackendIntegrationClientFacet } from '@/application/clients/backend';
import {
  resolveNativeRiffCompatibilityDecision,
  type NativeRiffSrsAction,
} from '@/application/policies/NativeRiffCompatibilityPolicy';
import type {
  BackendTopicDerivedCommandExecuteRequest,
  BackendTopicDerivedCommandExecuteResult,
  BackendUnavailableClass,
} from '../../../packages/contracts/src/backend-rpc';
import {
  type ProgressiveChildDocInput,
  type ProgressiveChildDocStorageMode,
  ProgressiveReadingService,
} from '@/application/services/ProgressiveReadingService';
import type { CreationDecision } from '@/core/card/post-creation/contracts';
import { ClozeDetector, type ClozeInfo } from '@/utils/cloze-detector';
import {
  ATTR_PROGRESSIVE_KIND,
  ATTR_PROGRESSIVE_PARENT_EXCERPT_ID,
  ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID,
  ATTR_PROGRESSIVE_SOURCE_BLOCK_ID,
  ATTR_PROGRESSIVE_SOURCE_DOC_ID,
  ATTR_PROGRESSIVE_STORAGE_MODE,
} from '@/application/services/ProgressiveAttrContract';
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

type TopicDerivedCommandRelayRuntime = {
  getMode?: () => string;
  getInstanceId?: () => string;
};

type TopicDerivedCommandFollowerClient = {
  submitAndWait?: <TResult>(request: {
    instanceId: string;
    method: 'topic-derived.command.execute';
    params: BackendTopicDerivedCommandExecuteRequest;
  }) => Promise<TResult>;
};

type TopicDerivedBackendCommandClient = Pick<BackendIntegrationClientFacet, 'executeTopicDerivedCommand'>;

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

export interface TopicDerivedManualClozeCandidateInput {
  plannerContent: string;
  artifactContentDom: string;
  answerFingerprint: string;
  previewText: string;
}

export interface TopicDerivedItemInput {
  sourceBlockId: string;
  sourceDocId: string;
  parentTopicCardId: string;
  parentTopicTitle?: string;
  parentExcerptId?: string;
  sourceRootKind?: ProgressiveSourceRootKind;
  plannerContent: string;
  artifactContentDom?: string;
  mode?: 'planner-derived' | 'manual-cloze';
  answerFingerprint?: string;
  previewText?: string;
  decisions: CreationDecision[];
  storageMode?: ProgressiveChildDocStorageMode;
  manualClozeCandidates?: TopicDerivedManualClozeCandidateInput[];
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

type TopicDerivedItemCreationOptions = {
  useLocalChildDoc?: boolean;
};

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
    private readonly backendClient?: TopicDerivedBackendCommandClient,
    private readonly commandRelayRuntime?: TopicDerivedCommandRelayRuntime | null,
    private readonly followerCommandClient?: TopicDerivedCommandFollowerClient | null,
  ) {}

  async createFromTopicSource(input: TopicDerivedItemInput): Promise<TopicDerivedItemResult> {
    if (this.backendClient) {
      return this.executeTopicDerivedCommandFacade(input);
    }
    return this.createFromTopicSourceLocal(input);
  }

  async createFromTopicSourceLocal(
    input: TopicDerivedItemInput,
    options?: TopicDerivedItemCreationOptions,
  ): Promise<TopicDerivedItemResult> {
    const sourceBlockId = String(input.sourceBlockId || '').trim();
    const sourceDocId = String(input.sourceDocId || '').trim();
    const parentTopicCardId = String(input.parentTopicCardId || '').trim();
    const parentTopicTitle = normalizeWhitespace(String(input.parentTopicTitle || ''));
    const parentExcerptId = String(input.parentExcerptId || '').trim() || undefined;
    const plannerContent = String(input.plannerContent || '');
    const artifactContentDom = String(input.artifactContentDom || '').trim();
    const manualClozeCandidates = Array.isArray(input.manualClozeCandidates)
      ? input.manualClozeCandidates
      : [];
    const hasManualClozeCandidatePayload = input.mode === 'manual-cloze' && manualClozeCandidates.length > 0;

    if (!sourceBlockId || !sourceDocId || !parentTopicCardId || (!plannerContent && !hasManualClozeCandidatePayload)) {
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
      manualCandidateCount: manualClozeCandidates.length,
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
        manualClozeCandidates,
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
        const childDocTitleText = parentTopicTitle || candidate.previewText;
        const childDoc = await this.createChildDocFromTopicSource({
          sourceDocId,
          kind: 'derived-item-doc',
          fallbackTitle: parentTopicTitle || '挖空',
          previewText: childDocTitleText,
          previewMax: parentTopicTitle ? 80 : 16,
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
          },
          ...(candidate.contentDom
            ? { contentDom: candidate.contentDom }
            : { contentMarkdown: candidate.contentMarkdown || '' }),
        }, options);
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
      logger.error('TOPIC_DERIVED_SETTINGS_UNAVAILABLE: failed to read topic derivation storage mode', error);
      throw new Error('TOPIC_DERIVED_SETTINGS_UNAVAILABLE: failed to read topic derivation storage mode');
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
    manualClozeCandidates?: TopicDerivedManualClozeCandidateInput[];
  }): DerivedCandidate[] {
    const decision = input.decisions.find((candidate) => candidate.family === 'cloze');
    if (!decision) {
      return [];
    }

    const rawCandidates = Array.isArray(input.manualClozeCandidates) && input.manualClozeCandidates.length > 0
      ? input.manualClozeCandidates
      : [{
          plannerContent: input.plannerContent,
          artifactContentDom: input.artifactContentDom,
          answerFingerprint: input.answerFingerprint || '',
          previewText: input.previewText || '',
        }];
    const candidates: DerivedCandidate[] = [];
    const seenFingerprints = new Set<string>();
    for (const rawCandidate of rawCandidates) {
      const answerFingerprint = String(rawCandidate.answerFingerprint || '').trim();
      const artifactContentDom = String(rawCandidate.artifactContentDom || '').trim();
      const previewText = normalizeWhitespace(String(rawCandidate.previewText || ''));
      const plannerContent = String(rawCandidate.plannerContent || '');
      if (!answerFingerprint || !artifactContentDom || !previewText || !plannerContent) {
        continue;
      }
      if (seenFingerprints.has(answerFingerprint)) {
        continue;
      }
      seenFingerprints.add(answerFingerprint);
      candidates.push({
        creationRuleId: decision.id,
        answerFingerprint,
        contentMarkdown: plannerContent,
        contentDom: artifactContentDom,
        previewText,
        metadataSource: 'topic-derived',
      });
    }
    return candidates;
  }

  private async createChildDocFromTopicSource(
    input: ProgressiveChildDocInput,
    options?: TopicDerivedItemCreationOptions,
  ) {
    return options?.useLocalChildDoc
      ? this.progressiveReadingService.createChildDocFromSourceLocal(input)
      : this.progressiveReadingService.createChildDocFromSource(input);
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

    await this.registerNativeRiffCompatibility(input.derivedBlockId);

    return result.value.getId().getValue();
  }

  private async registerNativeRiffCompatibility(
    blockId: string,
    action?: NativeRiffSrsAction,
  ): Promise<void> {
    if (!resolveNativeRiffCompatibilityDecision({ action }).enabled) {
      return;
    }
    await this.nativeRiffApi.addRiffCards(this.nativeRiffApi.BUILTIN_DECK_ID, [blockId]);
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

  async executeFromBackend(
    request: BackendTopicDerivedCommandExecuteRequest,
  ): Promise<BackendTopicDerivedCommandExecuteResult<TopicDerivedItemResult>> {
    const now = Date.now();
    try {
      const result = await this.createFromTopicSourceLocal(
        request.input as TopicDerivedItemInput,
        { useLocalChildDoc: true },
      );
      return {
        status: 'completed',
        commandId: request.commandId,
        idempotencyKey: request.idempotencyKey,
        operation: 'create-from-topic-source',
        result,
        audit: {
          created: result.created,
          skipped: result.skipped,
          nativeRiffRegistered: 0,
        },
        rollback: { attempted: false, status: 'not-needed' },
        progress: { state: 'succeeded', currentStep: 'completed', updatedAt: now },
        diagnostics: {
          diagnosticEventId: `topic-derived:${request.commandId}:${now}`,
          family: 'topic-derived.command',
          commandId: request.commandId,
          timing: {
            submittedAt: Number(request.requestedAt) || now,
            deadlineAt: Number.isFinite(Number(request.deadlineAt)) ? Number(request.deadlineAt) : null,
            completedAt: now,
          },
          errorCategory: null,
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error || 'topic-derived command failed');
      return this.createTopicDerivedFailureResult(request, 'failed', reason, 'FAILED', false);
    }
  }

  private async executeTopicDerivedCommandFacade(input: TopicDerivedItemInput): Promise<TopicDerivedItemResult> {
    if (!this.backendClient) {
      throw new Error('TOPIC_DERIVED_COMMAND_UNAVAILABLE: backend client is unavailable');
    }
    const now = Date.now();
    const commandId = `topic-derived:create:${now}`;
    const idempotencySeed = [
      input.sourceBlockId,
      input.sourceDocId,
      input.parentTopicCardId,
      input.parentExcerptId || '',
      input.mode || 'planner-derived',
      Array.isArray(input.manualClozeCandidates)
        ? input.manualClozeCandidates
          .map((candidate) => String(candidate.answerFingerprint || '').trim())
          .filter(Boolean)
          .join('|')
        : input.answerFingerprint || '',
    ].join(':');
    const request: BackendTopicDerivedCommandExecuteRequest = {
      requestId: commandId,
      commandId,
      idempotencyKey: `topic-derived:${idempotencySeed}:${now}`,
      operation: 'create-from-topic-source',
      input: input as unknown as Record<string, unknown>,
      requestedAt: now,
      deadlineAt: now + 60_000,
      caller: {
        instanceId: 'application-context',
        runtimeRole: 'single-window',
        surface: 'review',
      },
    };
    const result = await this.executeTopicDerivedCommandViaAuthority(request);
    if (result.status !== 'completed' && result.status !== 'duplicate') {
      throw new Error(`TOPIC_DERIVED_COMMAND_UNAVAILABLE: ${result.reason}`);
    }
    return result.result;
  }

  private async executeTopicDerivedCommandViaAuthority(
    request: BackendTopicDerivedCommandExecuteRequest,
  ): Promise<BackendTopicDerivedCommandExecuteResult<TopicDerivedItemResult>> {
    const mode = String(this.commandRelayRuntime?.getMode?.() || '').trim();
    if (mode === 'follower') {
      const instanceId = String(this.commandRelayRuntime?.getInstanceId?.() || '').trim();
      if (!instanceId || typeof this.followerCommandClient?.submitAndWait !== 'function') {
        throw new Error('WRITER_UNAVAILABLE: topic-derived.command.execute relay is unavailable in follower mode');
      }
      return this.followerCommandClient.submitAndWait<BackendTopicDerivedCommandExecuteResult<TopicDerivedItemResult>>({
        instanceId,
        method: 'topic-derived.command.execute',
        params: {
          ...request,
          caller: {
            ...(request.caller ?? {
              instanceId,
              surface: 'review',
            }),
            instanceId,
            runtimeRole: 'follower',
          },
        },
      });
    }
    return this.backendClient!.executeTopicDerivedCommand<TopicDerivedItemResult>(request);
  }

  private createTopicDerivedFailureResult(
    request: BackendTopicDerivedCommandExecuteRequest,
    status: 'unavailable' | 'validation-failed' | 'failed',
    reason: string,
    unavailableClass: BackendUnavailableClass | null,
    recoverable: boolean,
  ): BackendTopicDerivedCommandExecuteResult<TopicDerivedItemResult> {
    const now = Date.now();
    return {
      status,
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      operation: 'create-from-topic-source',
      unavailableClass,
      reason,
      recoverable,
      audit: { created: 0, skipped: 0, nativeRiffRegistered: 0 },
      rollback: { attempted: status === 'failed', status: status === 'failed' ? 'failed' : 'not-needed', reason },
      progress: { state: status === 'validation-failed' ? 'validation-failed' : 'failed', currentStep: status, updatedAt: now },
      diagnostics: {
        diagnosticEventId: `topic-derived:${request.commandId}:${now}`,
        family: 'topic-derived.command',
        commandId: request.commandId,
        timing: {
          submittedAt: Number(request.requestedAt) || now,
          deadlineAt: Number.isFinite(Number(request.deadlineAt)) ? Number(request.deadlineAt) : null,
          completedAt: now,
        },
        errorCategory: unavailableClass,
      },
    };
  }
}
