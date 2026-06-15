import type { ProgressiveBlockRow, ProgressiveDocInfo, ProgressiveSiyuanPort } from '@/application/ports/ProgressiveSiyuanPort';
import type {
  ProgressiveExcerptCreationResult,
  ProgressiveExcerptInput,
  ProgressiveExcerptResult,
  ProgressiveSplitMode,
} from '@/application/services/ProgressiveReadingService';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { ConfiguredCaptureStorageService } from '@/application/services/ConfiguredCaptureStorageService';
import {
  ExcerptRecordService,
  PROGRESSIVE_EXCERPT_COLOR_TOKEN,
  normalizeExcerptBlockIds,
  type ExcerptRecordSourceSemantics,
} from '@/application/services/ExcerptRecordService';
import {
  ATTR_PROGRESSIVE_KIND,
  ATTR_PROGRESSIVE_PARENT_EXCERPT_ID,
  ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID,
  ATTR_PROGRESSIVE_SOURCE_BLOCK_ID,
  ATTR_PROGRESSIVE_SOURCE_DOC_ID,
} from '@/application/services/ProgressiveAttrContract';
import {
  resolveProgressiveSourceContext,
  type ProgressiveSourceContext,
} from '@/application/services/ProgressiveSourceContextResolver';
import {
  buildProgressiveContentPayloadIdentity,
  buildProgressiveDisclosureState,
  buildProgressiveSelectionSnapshotIdentity,
  buildProgressiveSourceLineage,
  buildProgressiveUnifiedSourcePosition,
  type ProgressiveContentPayloadIdentity,
  type ProgressiveDisclosureState,
  type ProgressiveSourceLineage,
} from '@/core/progressive/progressiveSourceModel';
import type { PluginSettings } from '@/types/settings';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ProgressiveExcerptMaterializer');

type ProgressiveExcerptAttrs = Record<string, string | number | undefined>;

type ProgressiveExcerptStorageSettings = PluginSettings['progressiveReading']['storage'];

interface ProgressiveExcerptSettingsProvider {
  getSettings(): Pick<PluginSettings, 'progressiveReading'>;
}

export interface ProgressiveExcerptMaterializerSessionPiece {
  pieceDocId: string;
}

export interface ProgressiveExcerptMaterializerSession {
  id: string;
  mode: ProgressiveSplitMode;
  pieces: ProgressiveExcerptMaterializerSessionPiece[];
}

export interface ProgressiveExcerptMaterializerState {
  sessions: Record<string, ProgressiveExcerptMaterializerSession>;
  pieceToSession: Record<string, string>;
}

interface EnsureExcerptTopicCardInput {
  excerptEntityId: string;
  excerptEntityType: 'doc' | 'block';
  sourceBlockId: string;
  sourceBlockIds: string[];
  sourceLineage?: ProgressiveSourceLineage;
  payloadIdentity?: ProgressiveContentPayloadIdentity;
  disclosureState?: ProgressiveDisclosureState;
  sessionId?: string;
  mode?: ProgressiveSplitMode;
  pieceDocId?: string;
  sourceDocId: string;
  parentTopicCardId?: string;
  parentExcerptId?: string;
}

interface MaterializeCreatedExcerptInput {
  sourceBlockId: string;
  sourceBlockIds: string[];
  selectedText: string;
  contentDom: string;
  sourceDocId: string;
  sourceContext: ProgressiveSourceContext;
  sourceLineage: ProgressiveSourceLineage;
  payloadIdentity: ProgressiveContentPayloadIdentity;
  selectionSnapshot: unknown;
  sourcePosition: unknown;
  disclosureState: ProgressiveDisclosureState;
  sessionId?: string;
  mode?: ProgressiveSplitMode;
  pieceDocId?: string;
}

export interface ProgressiveExcerptMaterializerDependencies {
  siyuanApi: ProgressiveSiyuanPort;
  cardService: CardApplicationService;
  settingsProvider: ProgressiveExcerptSettingsProvider;
  configuredCaptureStorageService: ConfiguredCaptureStorageService;
  excerptRecordService: ExcerptRecordService;
  getBlockInfo(blockId: string): Promise<ProgressiveBlockRow>;
  getBlockRowsByIds(blockIds: string[]): Promise<ProgressiveBlockRow[]>;
  readState(): Promise<ProgressiveExcerptMaterializerState>;
  getSessionByPieceDocId(
    state: ProgressiveExcerptMaterializerState,
    pieceDocId: string,
  ): ProgressiveExcerptMaterializerSession | null;
  resolveDocInfo(docId: string): Promise<ProgressiveDocInfo>;
  buildExcerptEntityDom(input: {
    selectedText: string;
    contentDom?: string;
    sourceBlockIds: string[];
  }): string;
  createExcerptDocUnderSource(input: {
    sourceDocInfo: ProgressiveDocInfo;
    sourceDocId: string;
    selectedText: string;
    sourceBlockId: string;
    sourceBlockIds: string[];
    contentDom: string;
    attrs: ProgressiveExcerptAttrs;
  }): Promise<string>;
  createExcerptDocUnderConfiguredParent(input: {
    parentDocInfo: ProgressiveDocInfo;
    sourceDocId: string;
    selectedText: string;
    sourceBlockId: string;
    sourceBlockIds: string[];
    contentDom: string;
    attrs: ProgressiveExcerptAttrs;
  }): Promise<string>;
  createDailyNoteExcerptBlock(input: {
    dailyNoteDocId: string;
    selectedText: string;
    sourceBlockId: string;
    sourceBlockIds: string[];
    contentDom: string;
    attrs: ProgressiveExcerptAttrs;
  }): Promise<string>;
  ensureExcerptTopicCard(input: EnsureExcerptTopicCardInput): Promise<{ cardId: string }>;
  setProgressiveAttrs(blockId: string, attrs: ProgressiveExcerptAttrs): Promise<void>;
  rollbackExcerptArtifact(
    excerptEntityId: string,
    excerptEntityType: 'doc' | 'block',
    error: unknown,
  ): Promise<void>;
  scheduleDocTreeRebuild?(): void;
}

export class ProgressiveExcerptMaterializer {
  constructor(private readonly deps: ProgressiveExcerptMaterializerDependencies) {}

  async materialize(input: ProgressiveExcerptInput): Promise<ProgressiveExcerptCreationResult> {
    const sourceBlockId = String(input.sourceBlockId || '').trim();
    const sourceBlockIds = normalizeExcerptBlockIds(input.sourceBlockIds, input.sourceBlockId);
    const selectedText = toExcerptMarkdown(input.selectedText);
    const contentDom = this.deps.buildExcerptEntityDom({
      selectedText,
      contentDom: input.contentDom,
      sourceBlockIds,
    });
    if (!sourceBlockId || sourceBlockIds.length === 0 || !selectedText || !contentDom) {
      throw new Error('摘抄需要有效的选区或块内容');
    }

    const blockInfo = await this.deps.getBlockInfo(sourceBlockId);
    if (!blockInfo.root_id || !blockInfo.box) {
      throw new Error('无法解析摘抄来源块');
    }

    const sourceContext = await resolveProgressiveSourceContext({
      blockId: sourceBlockId,
      rootId: blockInfo.root_id,
      cardLookup: this.deps.cardService,
      attrLookup: this.deps.siyuanApi,
    });
    const sourceRows = sourceBlockIds.length > 1
      ? await this.deps.getBlockRowsByIds(sourceBlockIds)
      : [blockInfo];
    const sourceLineage = buildProgressiveSourceLineage({
      sourceContext,
      sourceBlockIds,
    });
    const selectionSnapshot = buildProgressiveSelectionSnapshotIdentity({
      sourceBlockId,
      sourceBlockIds,
      selectedText,
      selectionMode: input.contentDom ? 'range' : 'full-block',
    });
    const payloadIdentity = buildProgressiveContentPayloadIdentity({
      sourceBlockIds,
      selectedText,
      contentDom,
      sourceBlocks: sourceRows,
    });
    const sourcePosition = buildProgressiveUnifiedSourcePosition({
      sourceDocId: sourceLineage.sourceDocId,
      rootDocId: sourceLineage.rootDocId,
      sourceBlockId,
      sourceBlockIds,
    });
    const disclosureState = buildProgressiveDisclosureState('created');
    const sessionContext = await this.resolveSessionContext(sourceContext);
    const sourceLineageWithSession: ProgressiveSourceLineage = {
      ...sourceLineage,
      ...(sessionContext.sessionId ? { sessionId: sessionContext.sessionId } : {}),
      ...(sessionContext.mode ? { mode: sessionContext.mode } : {}),
    };
    const sourceDocId = sourceContext.sourceDocId;

    const excerptAttempt = await this.deps.excerptRecordService.createOrRejectDuplicate<ProgressiveExcerptResult>({
      sourceDocId,
      sourceBlockId,
      sourceBlockIds,
      selectedText,
      origin: input.origin,
      colorToken: PROGRESSIVE_EXCERPT_COLOR_TOKEN,
      sourceSemantics: {
        sourceLineage: sourceLineageWithSession,
        selectionSnapshot,
        payloadIdentity,
        sourcePosition,
        disclosureState,
      } satisfies ExcerptRecordSourceSemantics,
      createExcerpt: async () => this.materializeCreatedExcerpt({
        sourceBlockId,
        sourceBlockIds,
        selectedText,
        contentDom,
        sourceDocId,
        sourceContext,
        sourceLineage: sourceLineageWithSession,
        payloadIdentity,
        selectionSnapshot,
        sourcePosition,
        disclosureState,
        sessionId: sessionContext.sessionId,
        mode: sessionContext.mode,
        pieceDocId: sessionContext.pieceDocId,
      }),
    });
    if (excerptAttempt.kind === 'duplicate') {
      return {
        kind: 'duplicate',
        record: excerptAttempt.record,
      };
    }

    logger.info('Excerpt created', {
      sourceBlockId,
      sourceDocId,
      excerptEntityId: excerptAttempt.created.excerptEntityId,
      excerptEntityType: excerptAttempt.created.excerptEntityType,
      sourceBlockIds: excerptAttempt.created.sourceBlockIds,
      containerDocId: excerptAttempt.created.containerDocId,
      recordId: excerptAttempt.record.recordId,
      origin: input.origin,
    });
    this.deps.scheduleDocTreeRebuild?.();

    return {
      kind: 'created',
      ...excerptAttempt.created,
      recordId: excerptAttempt.record.recordId,
      colorApplied: false,
    };
  }

  private async resolveSessionContext(sourceContext: ProgressiveSourceContext): Promise<{
    sessionId?: string;
    mode?: ProgressiveSplitMode;
    pieceDocId?: string;
  }> {
    const state = await this.deps.readState();
    let sessionId = sourceContext.sessionId;
    let mode = sourceContext.mode;
    let pieceDocId: string | undefined;

    const directPieceSession = this.deps.getSessionByPieceDocId(state, sourceContext.rootDocId);
    if (directPieceSession) {
      const piece = directPieceSession.pieces.find((entry) => entry.pieceDocId === sourceContext.rootDocId);
      if (!piece) {
        throw new Error('渐进阅读 piece 状态不完整');
      }
      sessionId = directPieceSession.id;
      mode = directPieceSession.mode;
      pieceDocId = piece.pieceDocId;
    } else if (sessionId && sourceContext.attrSourceDocId) {
      const upstreamPieceSession = this.deps.getSessionByPieceDocId(state, sourceContext.attrSourceDocId);
      if (upstreamPieceSession?.id === sessionId) {
        mode = mode || upstreamPieceSession.mode;
        pieceDocId = sourceContext.attrSourceDocId;
      }
    }

    return {
      sessionId,
      mode,
      pieceDocId,
    };
  }

  private async materializeCreatedExcerpt(input: MaterializeCreatedExcerptInput): Promise<ProgressiveExcerptResult> {
    const excerptStorage = this.deps.settingsProvider.getSettings().progressiveReading?.storage as ProgressiveExcerptStorageSettings | undefined;
    const configuredStorageMode = excerptStorage?.mode;
    const hasExplicitStorage = this.deps.configuredCaptureStorageService.hasExplicitConfiguration(excerptStorage);
    const useSourceChildStorage = configuredStorageMode === 'source-child' || !hasExplicitStorage;
    const excerptAttrs: ProgressiveExcerptAttrs = {
      [ATTR_PROGRESSIVE_KIND]: !useSourceChildStorage && configuredStorageMode === 'daily-note' ? 'excerpt' : 'excerpt-doc',
      [ATTR_PROGRESSIVE_SOURCE_DOC_ID]: input.sourceDocId,
      [ATTR_PROGRESSIVE_SOURCE_BLOCK_ID]: input.sourceBlockId,
      ...(input.sourceContext.parentTopicCardId
        ? { [ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID]: input.sourceContext.parentTopicCardId }
        : {}),
      ...(input.sourceContext.parentExcerptId
        ? { [ATTR_PROGRESSIVE_PARENT_EXCERPT_ID]: input.sourceContext.parentExcerptId }
        : {}),
    };
    let excerptEntityId = '';
    let excerptEntityType: 'doc' | 'block' = 'doc';
    let containerDocId = '';
    try {
      if (useSourceChildStorage) {
        const sourceDocInfo = await this.deps.resolveDocInfo(input.sourceDocId);
        excerptEntityId = await this.deps.createExcerptDocUnderSource({
          sourceDocInfo,
          sourceDocId: input.sourceDocId,
          selectedText: input.selectedText,
          sourceBlockId: input.sourceBlockId,
          sourceBlockIds: input.sourceBlockIds,
          contentDom: input.contentDom,
          attrs: excerptAttrs,
        });
        containerDocId = excerptEntityId;
      } else if (configuredStorageMode === 'daily-note') {
        const dailyNoteTarget = await this.deps.configuredCaptureStorageService.resolveDailyNoteTarget(excerptStorage);
        if (!dailyNoteTarget) {
          throw new Error('未能解析摘录今日日记存放位置。');
        }
        containerDocId = dailyNoteTarget.containerDocId;
        excerptEntityId = await this.deps.createDailyNoteExcerptBlock({
          dailyNoteDocId: dailyNoteTarget.containerDocId,
          selectedText: input.selectedText,
          sourceBlockId: input.sourceBlockId,
          sourceBlockIds: input.sourceBlockIds,
          contentDom: input.contentDom,
          attrs: excerptAttrs,
        });
        excerptEntityType = 'block';
      } else {
        const libraryTarget = await this.deps.configuredCaptureStorageService.resolveLibraryTarget(excerptStorage, {
          feature: 'progressive-excerpt',
          allowNonDocTarget: false,
        });
        if (!libraryTarget) {
          throw new Error('未能解析摘录固定库存放位置。');
        }
        containerDocId = libraryTarget.containerDocId;
        excerptEntityId = await this.deps.createExcerptDocUnderConfiguredParent({
          parentDocInfo: libraryTarget.parentDoc,
          sourceDocId: input.sourceDocId,
          selectedText: input.selectedText,
          sourceBlockId: input.sourceBlockId,
          sourceBlockIds: input.sourceBlockIds,
          contentDom: input.contentDom,
          attrs: excerptAttrs,
        });
      }

      const topicCardResult = await this.deps.ensureExcerptTopicCard({
        excerptEntityId,
        excerptEntityType,
        sourceBlockId: input.sourceBlockId,
        sourceBlockIds: input.sourceBlockIds,
        sourceLineage: input.sourceLineage,
        payloadIdentity: input.payloadIdentity,
        disclosureState: input.disclosureState,
        sessionId: input.sessionId,
        mode: input.mode,
        pieceDocId: input.pieceDocId,
        sourceDocId: input.sourceDocId,
        parentTopicCardId: input.sourceContext.parentTopicCardId,
        parentExcerptId: input.sourceContext.parentExcerptId,
      });

      return {
        excerptEntityId,
        excerptEntityType,
        topicCardId: topicCardResult.cardId,
        sourceBlockId: input.sourceBlockId,
        sourceBlockIds: input.sourceBlockIds,
        containerDocId,
      };
    } catch (error) {
      await this.deps.rollbackExcerptArtifact(excerptEntityId, excerptEntityType, error);
      throw error;
    }
  }
}

function toExcerptMarkdown(value: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}
