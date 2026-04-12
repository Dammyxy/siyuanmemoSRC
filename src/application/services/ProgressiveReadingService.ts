import type { ProgressiveBlockRow, ProgressiveDocInfo, ProgressiveSiyuanPort } from '@/application/ports/ProgressiveSiyuanPort';
import { CardCreationHelper } from '@/application/helpers/CardCreationHelper';
import { ConfiguredCaptureStorageService } from '@/application/services/ConfiguredCaptureStorageService';
import {
  ExcerptRecordService,
  PROGRESSIVE_EXCERPT_COLOR_TOKEN,
  type ExcerptRecord,
} from '@/application/services/ExcerptRecordService';
import type { IFileService } from '@/infrastructure/services/FileService';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import { isErr } from '@/types/result';
import type { PluginSettings } from '@/types/settings';
import { createLogger } from '@/utils/logger';
import {
  ATTR_PROGRESSIVE_KIND,
  ATTR_PROGRESSIVE_MODE,
  ATTR_PROGRESSIVE_PIECE_COUNT,
  ATTR_PROGRESSIVE_PIECE_INDEX,
  ATTR_PROGRESSIVE_PIECE_STATE,
  ATTR_PROGRESSIVE_SESSION_ID,
  ATTR_PROGRESSIVE_SOURCE_BLOCK_ID,
  ATTR_PROGRESSIVE_SOURCE_DOC_ID,
  ATTR_PROGRESSIVE_WORKBENCH_ID,
  getLegacyProgressiveAttrName,
} from '@/core/siyuan/block';

const logger = createLogger('ProgressiveReadingService');
const STORAGE_KEY = 'progressive-reading.json';
const WORKBENCH_DOC_TITLE = '摘抄工作台';
const DAILY_EXCERPT_ROOT_TITLE = 'SiYuanMemo 摘录';

type ProgressiveKind =
  | 'piece'
  | 'excerpt-doc'
  | 'derived-item-doc'
  | 'piece-workbench'
  | 'source-workbench'
  | 'excerpt'
  | 'daily-excerpt-root'
  | 'excerpt-source-ref';
export type ProgressiveSplitMode = 'linear' | 'nonlinear';
export type ProgressiveHeadingSplitLevel = 'h1' | 'h2' | 'h3ToH6';
export interface ProgressiveSplitConfig {
  horizontalRule: boolean;
  headingLevels: ProgressiveHeadingSplitLevel[];
  customStringEnabled: boolean;
  customString?: string;
}
export type ProgressiveSplitProgressPhase = 'scan' | 'plan' | 'createDocs' | 'createCards' | 'save' | 'cleanup';
export interface ProgressiveSplitProgress {
  phase: ProgressiveSplitProgressPhase;
  current: number;
  total: number;
  percentage: number;
  message: string;
  currentTitle?: string;
  createdDocCount: number;
  createdCardCount: number;
}
export interface ProgressiveSplitExecutionOptions {
  onProgress?: (progress: ProgressiveSplitProgress) => void;
  isCancellationRequested?: () => boolean;
}
type PieceState = 'pending' | 'active' | 'completed';
type ExactHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface ProgressiveSessionPieceRecord {
  pieceDocId: string;
  title: string;
  order: number;
  state: PieceState;
  depth?: number;
  parentPieceDocId?: string;
  topicCardId?: string;
  workbenchDocId?: string;
}

interface ProgressiveSessionRecord {
  id: string;
  sourceDocId: string;
  sourceDocTitle: string;
  notebook: string;
  mode: ProgressiveSplitMode;
  createdAt: number;
  activePieceIndex: number;
  pieces: ProgressiveSessionPieceRecord[];
}

interface ProgressiveState {
  version: 2;
  sessions: Record<string, ProgressiveSessionRecord>;
  sourceDocToSession: Record<string, string>;
  pieceToSession: Record<string, string>;
  sourceDocToWorkbench: Record<string, string>;
}

interface SplitDocPlan {
  baseTitle: string;
  markdown: string;
  depth: number;
  kind: 'heading' | 'leading' | 'segment';
  children: SplitDocPlan[];
}

interface NormalizedProgressiveSplitConfig {
  horizontalRule: boolean;
  enabledHeadingLevels: ExactHeadingLevel[];
  customString?: string;
}

interface SourceBlockNode {
  row: ProgressiveBlockRow;
  children: SourceBlockNode[];
}

interface RenderableBlockPart {
  block: ProgressiveBlockRow;
  localOnly: boolean;
}

type ProjectedItem =
  | { type: 'content'; parts: RenderableBlockPart[] }
  | { type: 'child'; plan: SplitDocPlan };

interface ContentSegment {
  baseTitle: string;
  markdown: string;
}

interface SegmentedContentResult {
  explicitSplit: boolean;
  segments: ContentSegment[];
}

interface CreatedSplitDocArtifact {
  docId: string;
  depth: number;
  creationOrder: number;
}

interface EnsureDocByHPathResult {
  docId: string;
  created: boolean;
}

interface EnsureTopicCardResult {
  cardId: string;
  created: boolean;
}

interface ProgressiveReadingSettingsProvider {
  getSettings(): Pick<PluginSettings, 'progressiveReading'>;
}

interface ProgressiveDocTreeScopeRefresher {
  scheduleRebuild(): void;
}

export interface ProgressiveSplitResult {
  sessionId: string;
  pieceDocIds: string[];
}

export interface ProgressiveExcerptInput {
  sourceBlockId: string;
  selectedText: string;
  origin: 'editor' | 'review';
  currentCardId?: string;
}

export interface ProgressiveExcerptResult {
  excerptEntityId: string;
  excerptEntityType: 'doc' | 'block';
  topicCardId: string;
  sourceBlockId: string;
  containerDocId: string;
}

export interface ProgressiveCreatedExcerptResult extends ProgressiveExcerptResult {
  kind: 'created';
  recordId: string;
  colorApplied: boolean;
}

export interface ProgressiveDuplicateExcerptResult {
  kind: 'duplicate';
  record: ExcerptRecord;
}

export type ProgressiveExcerptCreationResult =
  | ProgressiveCreatedExcerptResult
  | ProgressiveDuplicateExcerptResult;

export type ProgressiveChildDocStorageMode = 'workbench' | 'source-child';

export interface ProgressiveChildDocInput {
  sourceDocId: string;
  kind: Extract<ProgressiveKind, 'excerpt-doc' | 'derived-item-doc'>;
  titlePrefix: string;
  previewText: string;
  previewMax?: number;
  storageMode?: ProgressiveChildDocStorageMode;
  attrs: Record<string, string | number | undefined>;
  contentDom?: string;
  contentMarkdown?: string;
}

export interface ProgressiveChildDocResult {
  docId: string;
  parentDocId: string;
  storageMode: ProgressiveChildDocStorageMode;
  sequence: number;
  contentBlockId?: string;
}

export interface ProgressiveCompletePieceResult {
  sessionId: string;
  completedPieceDocId: string;
  nextPieceDocId?: string;
  nextTopicCardId?: string;
}

export class ProgressiveSplitCancelledError extends Error {
  readonly cleanupIncomplete: boolean;

  constructor(message = 'Split cancelled', cleanupIncomplete = false) {
    super(message);
    this.name = 'ProgressiveSplitCancelledError';
    this.cleanupIncomplete = cleanupIncomplete;
  }
}

const DEFAULT_PROGRESSIVE_HEADING_SPLIT_LEVELS: ProgressiveHeadingSplitLevel[] = ['h1', 'h2', 'h3ToH6'];
const SPLIT_PROGRESS_PHASE_RANGES: Record<ProgressiveSplitProgressPhase, readonly [number, number]> = {
  scan: [0, 15],
  plan: [15, 30],
  createDocs: [30, 80],
  createCards: [80, 95],
  save: [95, 100],
  cleanup: [95, 100],
};

export function createDefaultProgressiveSplitConfig(): ProgressiveSplitConfig {
  return {
    horizontalRule: true,
    headingLevels: [...DEFAULT_PROGRESSIVE_HEADING_SPLIT_LEVELS],
    customStringEnabled: false,
    customString: '',
  };
}

function createEmptyState(): ProgressiveState {
  return {
    version: 2,
    sessions: {},
    sourceDocToSession: {},
    pieceToSession: {},
    sourceDocToWorkbench: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => typeof entryValue === 'string' && entryValue.trim().length > 0)
      .map(([key, entryValue]) => [key, String(entryValue).trim()])
  );
}

function sanitizeDocTitle(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Piece';
}

function truncateText(value: string, max = 40): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

function buildExcerptTitlePreview(value: string, max = 12): string {
  return truncateText(value.replace(/\s+/g, ' ').trim(), max);
}

function toAttrValue(value: string | number | undefined): string {
  if (value === undefined) {
    return '';
  }
  return String(value);
}

function normalizeProgressiveMode(value: string | undefined): ProgressiveSplitMode | undefined {
  return value === 'linear' || value === 'nonlinear' ? value : undefined;
}

export class ProgressiveReadingService {
  private readonly cardCreationHelper: CardCreationHelper;

  constructor(
    private readonly siyuanApi: ProgressiveSiyuanPort,
    private readonly fileService: IFileService,
    private readonly cardService: CardApplicationService,
    private readonly settingsProvider: ProgressiveReadingSettingsProvider,
    private readonly configuredCaptureStorageService: ConfiguredCaptureStorageService,
    private readonly excerptRecordService: ExcerptRecordService,
    private readonly docTreeScopeRefresher?: ProgressiveDocTreeScopeRefresher,
  ) {
    this.cardCreationHelper = new CardCreationHelper(cardService);
  }

  async splitDocument(
    docId: string,
    mode: ProgressiveSplitMode,
    splitConfig?: ProgressiveSplitConfig,
    options?: ProgressiveSplitExecutionOptions,
  ): Promise<ProgressiveSplitResult> {
    const sourceDocId = String(docId || '').trim();
    if (!sourceDocId) {
      throw new Error('docId is required');
    }
    const normalizedSplitConfig = this.normalizeSplitConfig(splitConfig);
    const createdDocs: CreatedSplitDocArtifact[] = [];
    const createdCardIds: string[] = [];
    let createdDocCount = 0;
    let createdCardCount = 0;
    let createdDocSequence = 0;

    const reportProgress = (input: {
      phase: ProgressiveSplitProgressPhase;
      current: number;
      total: number;
      message: string;
      currentTitle?: string;
    }): void => {
      this.emitSplitProgress({
        onProgress: options?.onProgress,
        phase: input.phase,
        current: input.current,
        total: input.total,
        message: input.message,
        currentTitle: input.currentTitle,
        createdDocCount,
        createdCardCount,
      });
    };

    try {
      this.throwIfSplitCancelled(options);
      reportProgress({
        phase: 'scan',
        current: 0,
        total: 1,
        message: 'Scanning source blocks',
      });

      const state = await this.readState();
      const existingSession = await this.reconcileExistingSplitSession(state, sourceDocId);
      if (existingSession) {
        const existingPieceCount = await this.countExistingPieceDocs(existingSession);
        throw new Error(
          existingPieceCount > 0
            ? `当前文档已经存在渐进 split 会话，仍有 ${existingPieceCount} 个 piece 子文档存在`
            : '当前文档已经存在渐进 split 会话'
        );
      }

      const docInfo = await this.resolveDocInfo(sourceDocId);
      const rootNodes = await this.loadBlockTree(sourceDocId);
      reportProgress({
        phase: 'scan',
        current: 1,
        total: 1,
        message: 'Source blocks scanned',
      });
      this.throwIfSplitCancelled(options);

      reportProgress({
        phase: 'plan',
        current: 0,
        total: 1,
        message: 'Building split plan',
      });
      const splitPlans = await this.buildSplitPlansForRoot(rootNodes, normalizedSplitConfig);
      if (splitPlans.length === 0) {
        throw new Error('当前文档没有可拆分的内容');
      }
      reportProgress({
        phase: 'plan',
        current: 1,
        total: 1,
        message: 'Split plan ready',
        currentTitle: docInfo.name || truncateText(docInfo.hpath || sourceDocId),
      });
      this.throwIfSplitCancelled(options);

      const sessionId = this.createSessionId();
      const pieces: ProgressiveSessionPieceRecord[] = [];
      const totalPieceCount = this.countSplitPlans(splitPlans);
      const hpathCache = new Map<string, string>();
      reportProgress({
        phase: 'createDocs',
        current: 0,
        total: totalPieceCount,
        message: 'Creating piece documents',
      });
      await this.materializeSplitPlans({
        notebook: docInfo.box,
        parentHPath: docInfo.hpath,
        sessionId,
        sourceDocId,
        mode,
        totalPieceCount,
        plans: splitPlans,
        pieces,
        hpathCache,
        options,
        onPieceCreated: (piece, context) => {
          if (context.createdDoc) {
            createdDocs.push({
              docId: piece.pieceDocId,
              depth: piece.depth ?? 0,
              creationOrder: createdDocSequence,
            });
            createdDocCount += 1;
            createdDocSequence += 1;
          }
          reportProgress({
            phase: 'createDocs',
            current: pieces.length,
            total: totalPieceCount,
            message: 'Creating piece documents',
            currentTitle: piece.title,
          });
        },
      });
      this.throwIfSplitCancelled(options);

      const totalCardCount = mode === 'nonlinear' ? pieces.length : Math.min(pieces.length, 1);
      reportProgress({
        phase: 'createCards',
        current: 0,
        total: totalCardCount,
        message: 'Creating topic cards',
      });
      await this.createSplitPieceTopicCards({
        sessionId,
        mode,
        sourceDocId,
        pieces,
        options,
        onPieceCardReady: (piece, context) => {
          if (context.createdCard) {
            createdCardIds.push(context.cardId);
            createdCardCount += 1;
          }
          reportProgress({
            phase: 'createCards',
            current: context.processedCount,
            total: totalCardCount,
            message: 'Creating topic cards',
            currentTitle: piece.title,
          });
        },
      });
      this.throwIfSplitCancelled(options);

      reportProgress({
        phase: 'save',
        current: 0,
        total: 1,
        message: 'Saving split session',
      });
      state.sessions[sessionId] = {
        id: sessionId,
        sourceDocId,
        sourceDocTitle: docInfo.name || truncateText(docInfo.hpath || sourceDocId),
        notebook: docInfo.box,
        mode,
        createdAt: Date.now(),
        activePieceIndex: 0,
        pieces,
      };
      state.sourceDocToSession[sourceDocId] = sessionId;
      for (const piece of pieces) {
        state.pieceToSession[piece.pieceDocId] = sessionId;
      }

      await this.writeState(state);
      reportProgress({
        phase: 'save',
        current: 1,
        total: 1,
        message: 'Split session saved',
      });
      this.docTreeScopeRefresher?.scheduleRebuild();
      logger.info('Split session created', {
        sessionId,
        sourceDocId,
        mode,
        pieceCount: pieces.length,
      });

      return {
        sessionId,
        pieceDocIds: pieces.map((piece) => piece.pieceDocId),
      };
    } catch (error) {
      if (error instanceof ProgressiveSplitCancelledError) {
        const cleanupIncomplete = await this.cleanupCancelledSplitArtifacts({
          createdDocs,
          createdCardIds,
          onProgress: options?.onProgress,
          createdDocCount,
          createdCardCount,
        });
        if (createdDocs.length > 0) {
          this.docTreeScopeRefresher?.scheduleRebuild();
        }
        throw new ProgressiveSplitCancelledError(error.message, cleanupIncomplete);
      }

      if (createdDocs.length > 0) {
        this.docTreeScopeRefresher?.scheduleRebuild();
      }
      throw error;
    }
  }

  async completeCurrentPiece(pieceDocId: string): Promise<ProgressiveCompletePieceResult> {
    const state = await this.readState();
    const session = this.getSessionByPieceDocId(state, pieceDocId);
    if (!session) {
      throw new Error('未找到当前 piece 对应的渐进阅读会话');
    }
    if (session.mode !== 'linear') {
      throw new Error('仅线性模式支持完成当前片');
    }

    const currentIndex = session.pieces.findIndex((piece) => piece.pieceDocId === pieceDocId);
    if (currentIndex === -1) {
      throw new Error('当前 piece 不在会话中');
    }

    const currentPiece = session.pieces[currentIndex];
    currentPiece.state = 'completed';
    await this.setProgressiveAttrs(currentPiece.pieceDocId, {
      [ATTR_PROGRESSIVE_PIECE_STATE]: 'completed',
    });

    const nextPiece = session.pieces[currentIndex + 1];
    let nextTopicCardId: string | undefined;
    if (nextPiece) {
      nextPiece.state = 'active';
      nextTopicCardId = (await this.ensurePieceTopicCard({
        sessionId: session.id,
        mode: session.mode,
        pieceDocId: nextPiece.pieceDocId,
        sourceDocId: session.sourceDocId,
        pieceIndex: nextPiece.order,
      })).cardId;
      nextPiece.topicCardId = nextTopicCardId;
      session.activePieceIndex = nextPiece.order;
      await this.setProgressiveAttrs(nextPiece.pieceDocId, {
        [ATTR_PROGRESSIVE_PIECE_STATE]: 'active',
      });
    } else {
      session.activePieceIndex = currentIndex;
    }

    await this.writeState(state);

    return {
      sessionId: session.id,
      completedPieceDocId: currentPiece.pieceDocId,
      nextPieceDocId: nextPiece?.pieceDocId,
      nextTopicCardId,
    };
  }

  async createExcerptFromSelection(input: ProgressiveExcerptInput): Promise<ProgressiveExcerptCreationResult> {
    const sourceBlockId = String(input.sourceBlockId || '').trim();
    const selectedText = this.toExcerptMarkdown(input.selectedText);
    if (!sourceBlockId || !selectedText) {
      throw new Error('摘抄需要有效的单块选区');
    }

    const blockInfo = await this.getBlockInfo(sourceBlockId);
    if (!blockInfo.root_id || !blockInfo.box) {
      throw new Error('无法解析摘抄来源块');
    }

    const state = await this.readState();
    const session = this.getSessionByPieceDocId(state, blockInfo.root_id);
    let sourceDocId = blockInfo.root_id;
    let sessionId: string | undefined;
    let mode: ProgressiveSplitMode | undefined;
    let pieceDocId: string | undefined;

    if (session) {
      const piece = session.pieces.find((entry) => entry.pieceDocId === blockInfo.root_id);
      if (!piece) {
        throw new Error('渐进阅读 piece 状态不完整');
      }
      sourceDocId = piece.pieceDocId;
      sessionId = session.id;
      mode = session.mode;
      pieceDocId = piece.pieceDocId;
    }

    const excerptAttempt = await this.excerptRecordService.createOrRejectDuplicate({
      sourceDocId,
      sourceBlockId,
      selectedText,
      origin: input.origin,
      colorToken: PROGRESSIVE_EXCERPT_COLOR_TOKEN,
      createExcerpt: async () => {
        const excerptStorage = this.settingsProvider.getSettings().progressiveReading?.storage;
        const configuredStorageMode = excerptStorage?.mode;
        const hasExplicitStorage = this.configuredCaptureStorageService.hasExplicitConfiguration(excerptStorage);
        const useSourceChildStorage = configuredStorageMode === 'source-child' || !hasExplicitStorage;
        const excerptAttrs: Record<string, string | number | undefined> = {
          [ATTR_PROGRESSIVE_KIND]: !useSourceChildStorage && configuredStorageMode === 'daily-note' ? 'excerpt' : 'excerpt-doc',
          [ATTR_PROGRESSIVE_SOURCE_DOC_ID]: sourceDocId,
          [ATTR_PROGRESSIVE_SOURCE_BLOCK_ID]: sourceBlockId,
          [ATTR_PROGRESSIVE_SESSION_ID]: sessionId,
          [ATTR_PROGRESSIVE_MODE]: mode,
        };
        let excerptEntityId = '';
        let excerptEntityType: 'doc' | 'block' = 'doc';
        let containerDocId = '';

        if (useSourceChildStorage) {
          const sourceDocInfo = await this.resolveDocInfo(sourceDocId);
          excerptEntityId = await this.createExcerptDocUnderSource({
            sourceDocInfo,
            sourceDocId,
            selectedText,
            sourceBlockId,
            attrs: excerptAttrs,
          });
          containerDocId = excerptEntityId;
        } else if (configuredStorageMode === 'daily-note') {
          const dailyNoteTarget = await this.configuredCaptureStorageService.resolveDailyNoteTarget(excerptStorage);
          if (!dailyNoteTarget) {
            throw new Error('未能解析摘录今日日记存放位置。');
          }
          containerDocId = dailyNoteTarget.containerDocId;
          excerptEntityId = await this.createDailyNoteExcerptBlock({
            dailyNoteDocId: dailyNoteTarget.containerDocId,
            selectedText,
            sourceBlockId,
            attrs: excerptAttrs,
          });
          excerptEntityType = 'block';
        } else {
          const libraryTarget = await this.configuredCaptureStorageService.resolveLibraryTarget(excerptStorage, {
            feature: 'progressive-excerpt',
            allowNonDocTarget: false,
          });
          if (!libraryTarget) {
            throw new Error('未能解析摘录固定库存放位置。');
          }
          containerDocId = libraryTarget.containerDocId;
          excerptEntityId = await this.createExcerptDocUnderConfiguredParent({
            parentDocInfo: libraryTarget.parentDoc,
            sourceDocId,
            selectedText,
            sourceBlockId,
            attrs: excerptAttrs,
          });
        }

        const topicCardId = await this.ensureExcerptTopicCard({
          excerptEntityId,
          excerptEntityType,
          sourceBlockId,
          sessionId,
          mode,
          pieceDocId,
          sourceDocId,
        });

        return {
          excerptEntityId,
          excerptEntityType,
          topicCardId,
          sourceBlockId,
          containerDocId,
        };
      },
    });

    if (excerptAttempt.kind === 'duplicate') {
      logger.info('Duplicate excerpt prevented', {
        sourceBlockId,
        sourceDocId,
        recordId: excerptAttempt.record.recordId,
        origin: input.origin,
      });
      return excerptAttempt;
    }

    logger.info('Excerpt created', {
      sourceBlockId,
      sourceDocId,
      excerptEntityId: excerptAttempt.created.excerptEntityId,
      excerptEntityType: excerptAttempt.created.excerptEntityType,
      containerDocId: excerptAttempt.created.containerDocId,
      recordId: excerptAttempt.record.recordId,
      origin: input.origin,
    });
    this.docTreeScopeRefresher?.scheduleRebuild();

    return {
      kind: 'created',
      ...excerptAttempt.created,
      recordId: excerptAttempt.record.recordId,
      colorApplied: false,
    };
  }

  async updateSourceBlockDom(blockId: string, dom: string): Promise<void> {
    const normalizedBlockId = String(blockId || '').trim();
    const normalizedDom = String(dom || '').trim();
    if (!normalizedBlockId || !normalizedDom) {
      throw new Error('更新摘录原文高亮需要有效的块 ID 和 DOM 内容');
    }

    await this.siyuanApi.updateDomBlock(normalizedBlockId, normalizedDom);
  }

  async createChildDocFromSource(input: ProgressiveChildDocInput): Promise<ProgressiveChildDocResult> {
    const sourceDocId = String(input.sourceDocId || '').trim();
    if (!sourceDocId) {
      throw new Error('sourceDocId is required');
    }
    if (!input.contentDom && !input.contentMarkdown) {
      throw new Error('child doc content is required');
    }

    const sourceDocInfo = await this.resolveDocInfo(sourceDocId);
    const storageMode: ProgressiveChildDocStorageMode = input.storageMode === 'source-child'
      ? 'source-child'
      : 'workbench';
    const sequence = await this.resolveNextChildDocSequence({
      sourceDocId,
      kind: input.kind,
      titlePrefix: input.titlePrefix,
    });

    let parentDocId = sourceDocId;
    let parentHPath = sourceDocInfo.hpath;
    if (storageMode === 'workbench') {
      parentDocId = await this.ensureReusableSourceWorkbenchDoc(sourceDocId, sourceDocInfo.box);
      parentHPath = `${sourceDocInfo.hpath}/${WORKBENCH_DOC_TITLE}`;
    }

    const childTitle = this.buildNumberedChildDocTitle(
      input.titlePrefix,
      sequence,
      input.previewText,
      input.previewMax,
    );
    const childPath = `${parentHPath}/${childTitle}`;
    const created = await this.siyuanApi.createDocWithMarkdown(sourceDocInfo.box, childPath, '');
    const docId = created || await this.findDocIdByHPath(sourceDocInfo.box, childPath);
    if (!docId) {
      throw new Error('子文档创建后无法定位');
    }

    const contentBlockId = input.contentDom
      ? await this.siyuanApi.appendDomBlock(docId, input.contentDom)
      : await this.siyuanApi.appendMarkdownBlock(docId, input.contentMarkdown || '');

    await this.setProgressiveAttrs(docId, input.attrs);
    this.docTreeScopeRefresher?.scheduleRebuild();

    return {
      docId,
      parentDocId,
      storageMode,
      sequence,
      contentBlockId: asString(contentBlockId),
    };
  }

  private async readState(): Promise<ProgressiveState> {
    const raw = await this.fileService.readJSON<Record<string, unknown>>(STORAGE_KEY);
    if (!raw || (!raw.version && raw.version !== 1) || !isRecord(raw)) {
      return createEmptyState();
    }

    return {
      version: 2,
      sessions: isRecord(raw.sessions) ? raw.sessions as ProgressiveState['sessions'] : {},
      sourceDocToSession: toStringRecord(raw.sourceDocToSession),
      pieceToSession: toStringRecord(raw.pieceToSession),
      sourceDocToWorkbench: toStringRecord(raw.sourceDocToWorkbench),
    };
  }

  private async writeState(state: ProgressiveState): Promise<void> {
    await this.fileService.writeJSON(STORAGE_KEY, state);
  }

  private async reconcileExistingSplitSession(
    state: ProgressiveState,
    sourceDocId: string,
  ): Promise<ProgressiveSessionRecord | null> {
    const sessionId = state.sourceDocToSession[sourceDocId];
    if (!sessionId) {
      return null;
    }

    const session = state.sessions[sessionId];
    if (!session) {
      delete state.sourceDocToSession[sourceDocId];
      await this.writeState(state);
      logger.info('Pruned orphaned progressive sourceDocToSession mapping', {
        sourceDocId,
        sessionId,
      });
      return null;
    }

    const existingPieceCount = await this.countExistingPieceDocs(session);
    if (existingPieceCount > 0) {
      return session;
    }

    this.removeSessionState(state, sessionId);
    await this.writeState(state);
    logger.info('Pruned stale progressive split session with no remaining piece docs', {
      sourceDocId,
      sessionId,
    });
    return null;
  }

  private removeSessionState(state: ProgressiveState, sessionId: string): void {
    delete state.sessions[sessionId];

    for (const [sourceDocId, mappedSessionId] of Object.entries(state.sourceDocToSession)) {
      if (mappedSessionId === sessionId) {
        delete state.sourceDocToSession[sourceDocId];
      }
    }

    for (const [pieceDocId, mappedSessionId] of Object.entries(state.pieceToSession)) {
      if (mappedSessionId === sessionId) {
        delete state.pieceToSession[pieceDocId];
      }
    }
  }

  private async countExistingPieceDocs(session: ProgressiveSessionRecord): Promise<number> {
    return (await this.findExistingBlockIds(session.pieces.map((piece) => piece.pieceDocId))).size;
  }

  private createSessionId(): string {
    return `prog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async resolveDocInfo(docId: string): Promise<ProgressiveDocInfo> {
    const info = await this.siyuanApi.getDocInfo(docId);
    if (info.hpath && info.box) {
      return info;
    }

    const rows = await this.siyuanApi.sql<ProgressiveBlockRow>(`
      SELECT id, box, path, hpath, content
      FROM blocks
      WHERE id = '${this.escapeSql(docId)}'
      LIMIT 1
    `);
    const row = rows[0];
    return {
      id: docId,
      box: asString(row?.box) || info.box,
      path: asString(row?.path) || info.path,
      hpath: asString((row as Record<string, unknown> | undefined)?.hpath) || info.hpath,
      name: asString((row as Record<string, unknown> | undefined)?.content) || info.name,
    };
  }

  private async getBlocksByRoot(rootId: string): Promise<ProgressiveBlockRow[]> {
    return this.siyuanApi.sql<ProgressiveBlockRow>(`
      SELECT id, root_id, parent_id, box, type, subtype, content, markdown, sort
      FROM blocks
      WHERE root_id = '${this.escapeSql(rootId)}'
        AND id != '${this.escapeSql(rootId)}'
      ORDER BY parent_id ASC, sort ASC, id ASC
    `);
  }

  private async loadBlockTree(rootId: string): Promise<SourceBlockNode[]> {
    const rows = await this.getBlocksByRoot(rootId);
    return this.buildBlockTree(rows, rootId);
  }

  private buildBlockTree(rows: ProgressiveBlockRow[], rootId: string): SourceBlockNode[] {
    const nodesById = new Map<string, SourceBlockNode>();
    const childrenByParent = new Map<string, SourceBlockNode[]>();

    for (const row of rows) {
      if (!row.id) {
        continue;
      }
      nodesById.set(row.id, {
        row,
        children: [],
      });
    }

    for (const row of rows) {
      if (!row.id) {
        continue;
      }
      const node = nodesById.get(row.id);
      if (!node) {
        continue;
      }
      const parentId = asString(row.parent_id) || rootId;
      const siblings = childrenByParent.get(parentId) || [];
      siblings.push(node);
      childrenByParent.set(parentId, siblings);
    }

    const compareNodes = (left: SourceBlockNode, right: SourceBlockNode): number => {
      const sortCompare = String(left.row.sort || '').localeCompare(String(right.row.sort || ''));
      if (sortCompare !== 0) {
        return sortCompare;
      }
      return String(left.row.id || '').localeCompare(String(right.row.id || ''));
    };

    for (const [parentId, children] of childrenByParent.entries()) {
      children.sort(compareNodes);
      const parentNode = nodesById.get(parentId);
      if (parentNode) {
        parentNode.children = children;
      }
    }

    return childrenByParent.get(rootId) || [];
  }

  private async findExistingBlockIds(blockIds: string[]): Promise<Set<string>> {
    const normalizedIds = Array.from(new Set(
      blockIds
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0),
    ));
    if (normalizedIds.length === 0) {
      return new Set();
    }

    const existingIds = new Set<string>();
    const chunkSize = 200;
    for (let index = 0; index < normalizedIds.length; index += chunkSize) {
      const chunk = normalizedIds.slice(index, index + chunkSize);
      const rows = await this.siyuanApi.sql<Pick<ProgressiveBlockRow, 'id'>>(`
        SELECT id
        FROM blocks
        WHERE id IN (${chunk.map((blockId) => `'${this.escapeSql(blockId)}'`).join(', ')})
      `);
      for (const row of rows) {
        const id = asString(row.id);
        if (id) {
          existingIds.add(id);
        }
      }
    }

    return existingIds;
  }

  private normalizeSplitConfig(splitConfig?: ProgressiveSplitConfig): NormalizedProgressiveSplitConfig {
    const raw = splitConfig ?? createDefaultProgressiveSplitConfig();
    const enabledHeadingLevels = Array.from(new Set(
      (raw.headingLevels || []).flatMap((level): ExactHeadingLevel[] => {
        switch (level) {
          case 'h1':
            return [1];
          case 'h2':
            return [2];
          case 'h3ToH6':
            return [3, 4, 5, 6];
          default:
            return [];
        }
      }),
    )).sort((a, b) => a - b) as ExactHeadingLevel[];
    const customStringEnabled = raw.customStringEnabled === true;
    const customString = customStringEnabled ? String(raw.customString || '').trim() : undefined;

    if (customStringEnabled && !customString) {
      throw new Error('请输入自定义切割字符串');
    }

    if (!raw.horizontalRule && enabledHeadingLevels.length === 0 && !customString) {
      throw new Error('至少选择一个切割标记');
    }

    return {
      horizontalRule: raw.horizontalRule === true,
      enabledHeadingLevels,
      customString,
    };
  }

  private async buildSplitPlansForRoot(
    rootNodes: SourceBlockNode[],
    splitConfig: NormalizedProgressiveSplitConfig,
  ): Promise<SplitDocPlan[]> {
    const projected = await this.projectNodesForContainer(rootNodes, 0, splitConfig, 0);
    const hasHeadingPlans = projected.some((item) => item.type === 'child');
    return this.buildPlansFromProjectedItems(
      projected,
      splitConfig,
      0,
      hasHeadingPlans ? '[前言]' : undefined,
    );
  }

  private async buildSelectedHeadingPlan(
    node: SourceBlockNode,
    headingLevel: ExactHeadingLevel,
    splitConfig: NormalizedProgressiveSplitConfig,
    depth: number,
  ): Promise<SplitDocPlan> {
    const projectedChildren = await this.projectNodesForContainer(node.children, headingLevel, splitConfig, depth + 1);
    const headingMarkdown = this.getLocalOnlyMarkdown(node.row);
    const markdownParts = [headingMarkdown].filter((value) => value.length > 0);
    const childPlans: SplitDocPlan[] = [];
    let seenChildPlan = false;

    for (const item of projectedChildren) {
      if (item.type === 'child') {
        seenChildPlan = true;
        childPlans.push(item.plan);
        continue;
      }

      const segmented = await this.segmentContentParts(item.parts, splitConfig);
      if (segmented.segments.length === 0) {
        continue;
      }

      if (!seenChildPlan && segmented.segments.length === 1 && !segmented.explicitSplit) {
        markdownParts.push(segmented.segments[0].markdown);
        continue;
      }

      childPlans.push(...this.createSegmentPlans(segmented.segments, depth + 1));
    }

    const markdown = markdownParts.join('\n\n').trim() || headingMarkdown || this.resolveHeadingPlanBaseTitle(node.row);
    return {
      baseTitle: this.resolveHeadingPlanBaseTitle(node.row),
      markdown,
      depth,
      kind: 'heading',
      children: childPlans,
    };
  }

  private async projectNodesForContainer(
    nodes: SourceBlockNode[],
    currentSelectedLevel: number,
    splitConfig: NormalizedProgressiveSplitConfig,
    depth: number,
  ): Promise<ProjectedItem[]> {
    const items: ProjectedItem[] = [];
    let bufferedParts: RenderableBlockPart[] = [];

    const flushBufferedParts = (): void => {
      if (bufferedParts.length === 0) {
        return;
      }
      items.push({
        type: 'content',
        parts: bufferedParts,
      });
      bufferedParts = [];
    };

    for (const node of nodes) {
      const preview = this.toBlockPreview(node.row);
      const headingLevel = this.resolveHeadingLevelNumber(node.row, preview);
      const isSelectedHeading = headingLevel !== null
        && headingLevel > currentSelectedLevel
        && splitConfig.enabledHeadingLevels.includes(headingLevel);

      if (isSelectedHeading) {
        flushBufferedParts();
        items.push({
          type: 'child',
          plan: await this.buildSelectedHeadingPlan(node, headingLevel, splitConfig, depth),
        });
        continue;
      }

      if (headingLevel !== null) {
        bufferedParts.push({
          block: node.row,
          localOnly: true,
        });
        const childItems = await this.projectNodesForContainer(node.children, currentSelectedLevel, splitConfig, depth);
        for (const childItem of childItems) {
          if (childItem.type === 'content') {
            bufferedParts.push(...childItem.parts);
            continue;
          }
          flushBufferedParts();
          items.push(childItem);
        }
        continue;
      }

      bufferedParts.push({
        block: node.row,
        localOnly: false,
      });
    }

    flushBufferedParts();
    return items;
  }

  private async buildPlansFromProjectedItems(
    items: ProjectedItem[],
    splitConfig: NormalizedProgressiveSplitConfig,
    depth: number,
    leadingLabel?: string,
  ): Promise<SplitDocPlan[]> {
    const plans: SplitDocPlan[] = [];
    let beforeFirstChild = true;

    for (const item of items) {
      if (item.type === 'child') {
        beforeFirstChild = false;
        plans.push(item.plan);
        continue;
      }

      const segmented = await this.segmentContentParts(item.parts, splitConfig);
      if (segmented.segments.length === 0) {
        continue;
      }

      const label = beforeFirstChild && plans.length === 0 ? leadingLabel : undefined;
      plans.push(...this.createSegmentPlans(segmented.segments, depth, label));
    }

    return plans;
  }

  private async segmentContentParts(
    parts: RenderableBlockPart[],
    splitConfig: NormalizedProgressiveSplitConfig,
  ): Promise<SegmentedContentResult> {
    const groupedParts: RenderableBlockPart[][] = [];
    let current: RenderableBlockPart[] = [];
    let explicitSplit = false;

    const flushCurrent = (): void => {
      if (current.length === 0) {
        return;
      }
      groupedParts.push(current);
      current = [];
    };

    for (const part of parts) {
      const preview = this.toBlockPreview(part.block);
      if (splitConfig.horizontalRule && this.isHorizontalRule(part.block, preview)) {
        if (current.length > 0) {
          explicitSplit = true;
          flushCurrent();
        }
        continue;
      }

      if (this.shouldSplitAtCustomString(preview, splitConfig) && current.length > 0) {
        explicitSplit = true;
        flushCurrent();
      }

      current.push(part);
    }

    flushCurrent();

    const segments: ContentSegment[] = [];
    for (const group of groupedParts) {
      const markdown = await this.renderBlockPartsMarkdown(group);
      if (!markdown) {
        continue;
      }
      segments.push({
        baseTitle: this.resolveContentSegmentBaseTitle(group),
        markdown,
      });
    }

    return {
      explicitSplit,
      segments,
    };
  }

  private createSegmentPlans(
    segments: ContentSegment[],
    depth: number,
    leadingLabel?: string,
  ): SplitDocPlan[] {
    return segments.map((segment, index) => ({
      baseTitle: index === 0 && leadingLabel ? leadingLabel : segment.baseTitle,
      markdown: segment.markdown,
      depth,
      kind: index === 0 && leadingLabel ? 'leading' : 'segment',
      children: [],
    }));
  }

  private async renderBlockPartsMarkdown(parts: RenderableBlockPart[]): Promise<string> {
    return (await Promise.all(parts.map((part) => this.copyBlockMarkdownPart(part))))
      .filter((value) => value.length > 0)
      .join('\n\n')
      .trim();
  }

  private async copyBlockMarkdownPart(part: RenderableBlockPart): Promise<string> {
    if (part.localOnly) {
      return this.getLocalOnlyMarkdown(part.block);
    }
    return this.copyBlockSubtreeMarkdown(part.block);
  }

  private toBlockPreview(block: ProgressiveBlockRow): string {
    return asString(block.markdown) || asString(block.content) || '';
  }

  private getLocalOnlyMarkdown(block: ProgressiveBlockRow): string {
    const markdown = asString(block.markdown);
    if (markdown) {
      return markdown;
    }

    const content = asString(block.content) || '';
    const headingLevel = this.resolveHeadingLevelNumber(block, '');
    if (headingLevel !== null && content) {
      return `${'#'.repeat(headingLevel)} ${content}`.trim();
    }

    return content;
  }

  private async copyBlockSubtreeMarkdown(block: ProgressiveBlockRow): Promise<string> {
    if (!block.id) {
      return this.toBlockPreview(block);
    }

    try {
      const markdown = String(await this.siyuanApi.copyStdMarkdown(block.id) || '').trim();
      if (markdown.length > 0) {
        return markdown;
      }
    } catch (error) {
      logger.warn('Failed to copy subtree markdown for split root, fallback to block preview', {
        blockId: block.id,
        error,
      });
    }

    return this.toBlockPreview(block);
  }

  private resolveHeadingLevelNumber(
    block: ProgressiveBlockRow,
    preview: string,
  ): ExactHeadingLevel | null {
    switch (asString(block.subtype)) {
      case 'h1':
        return 1;
      case 'h2':
        return 2;
      case 'h3':
        return 3;
      case 'h4':
        return 4;
      case 'h5':
        return 5;
      case 'h6':
        return 6;
      default:
        break;
    }

    const headingMatch = preview.trim().match(/^(#{1,6})\s+/u);
    if (headingMatch) {
      return headingMatch[1].length as ExactHeadingLevel;
    }

    if (block.type === 'h') {
      return 3;
    }

    return null;
  }

  private shouldSplitAtCustomString(
    preview: string,
    splitConfig: NormalizedProgressiveSplitConfig,
  ): boolean {
    return typeof splitConfig.customString === 'string'
      && splitConfig.customString.length > 0
      && preview.includes(splitConfig.customString);
  }

  private isHorizontalRule(block: ProgressiveBlockRow, preview: string): boolean {
    if (block.type === 'hr') {
      return true;
    }
    return /^(?:-{3,}|\*{3,}|_{3,})$/u.test(preview.trim());
  }

  private resolveHeadingPlanBaseTitle(block: ProgressiveBlockRow): string {
    const content = asString(block.content);
    if (content) {
      return truncateText(content, 48);
    }
    const preview = this.toBlockPreview(block).replace(/^#{1,6}\s+/u, '').trim();
    if (preview) {
      return truncateText(preview, 48);
    }
    return '[标题]';
  }

  private resolveContentSegmentBaseTitle(parts: RenderableBlockPart[]): string {
    const firstPreview = parts
      .map((part) => this.toBlockPreview(part.block).replace(/^#{1,6}\s+/u, '').trim())
      .find((value) => value.length > 0);
    if (firstPreview) {
      return truncateText(firstPreview, 48);
    }
    return '[片段]';
  }

  private countSplitPlans(plans: SplitDocPlan[]): number {
    return plans.reduce((total, plan) => total + 1 + this.countSplitPlans(plan.children), 0);
  }

  private async materializeSplitPlans(input: {
    notebook: string;
    parentHPath: string;
    sessionId: string;
    sourceDocId: string;
    mode: ProgressiveSplitMode;
    totalPieceCount: number;
    plans: SplitDocPlan[];
    pieces: ProgressiveSessionPieceRecord[];
    hpathCache: Map<string, string>;
    options?: ProgressiveSplitExecutionOptions;
    onPieceCreated?: (piece: ProgressiveSessionPieceRecord, context: { createdDoc: boolean }) => void;
    parentPieceDocId?: string;
  }): Promise<void> {
    let siblingIndex = 0;

    for (const plan of input.plans) {
      this.throwIfSplitCancelled(input.options);
      siblingIndex += 1;
      const prefix = String(siblingIndex).padStart(2, '0');
      const titledName = sanitizeDocTitle(`${prefix} ${plan.baseTitle || '[片段]'}`);
      const piecePath = `${input.parentHPath}/${titledName}`;
      const docResult = await this.ensureDocByHPath(input.notebook, piecePath, plan.markdown, input.hpathCache);
      const pieceDocId = docResult.docId;
      const pieceOrder = input.pieces.length;
      const pieceState: PieceState = input.mode === 'linear'
        ? (pieceOrder === 0 ? 'active' : 'pending')
        : 'active';

      await this.setProgressiveAttrs(pieceDocId, {
        [ATTR_PROGRESSIVE_KIND]: 'piece',
        [ATTR_PROGRESSIVE_SESSION_ID]: input.sessionId,
        [ATTR_PROGRESSIVE_MODE]: input.mode,
        [ATTR_PROGRESSIVE_SOURCE_DOC_ID]: input.sourceDocId,
        [ATTR_PROGRESSIVE_PIECE_INDEX]: pieceOrder,
        [ATTR_PROGRESSIVE_PIECE_COUNT]: input.totalPieceCount,
        [ATTR_PROGRESSIVE_PIECE_STATE]: pieceState,
      });

      const pieceRecord: ProgressiveSessionPieceRecord = {
        pieceDocId,
        title: titledName,
        order: pieceOrder,
        state: pieceState,
        depth: plan.depth,
        parentPieceDocId: input.parentPieceDocId,
      };

      input.pieces.push(pieceRecord);
      input.onPieceCreated?.(pieceRecord, {
        createdDoc: docResult.created,
      });
      this.throwIfSplitCancelled(input.options);

      if (plan.children.length > 0) {
        await this.materializeSplitPlans({
          ...input,
          parentHPath: piecePath,
          plans: plan.children,
          parentPieceDocId: pieceDocId,
        });
      }
    }
  }

  private async createSplitPieceTopicCards(input: {
    sessionId: string;
    mode: ProgressiveSplitMode;
    sourceDocId: string;
    pieces: ProgressiveSessionPieceRecord[];
    options?: ProgressiveSplitExecutionOptions;
    onPieceCardReady?: (piece: ProgressiveSessionPieceRecord, context: {
      processedCount: number;
      cardId: string;
      createdCard: boolean;
    }) => void;
  }): Promise<void> {
    const targetPieces = input.mode === 'nonlinear'
      ? input.pieces
      : input.pieces.slice(0, 1);
    let processedCount = 0;

    for (const piece of targetPieces) {
      this.throwIfSplitCancelled(input.options);
      const cardResult = await this.ensurePieceTopicCard({
        sessionId: input.sessionId,
        mode: input.mode,
        pieceDocId: piece.pieceDocId,
        sourceDocId: input.sourceDocId,
        pieceIndex: piece.order,
      });
      piece.topicCardId = cardResult.cardId;
      processedCount += 1;
      input.onPieceCardReady?.(piece, {
        processedCount,
        cardId: cardResult.cardId,
        createdCard: cardResult.created,
      });
      this.throwIfSplitCancelled(input.options);
    }
  }

  private async ensureDocByHPath(
    notebook: string,
    hpath: string,
    markdown: string,
    hpathCache?: Map<string, string>,
  ): Promise<EnsureDocByHPathResult> {
    const cachedDocId = hpathCache?.get(hpath);
    if (cachedDocId) {
      return {
        docId: cachedDocId,
        created: false,
      };
    }

    let createError: unknown;
    try {
      const createdDocId = String(await this.siyuanApi.createDocWithMarkdown(notebook, hpath, markdown) || '').trim();
      if (createdDocId) {
        hpathCache?.set(hpath, createdDocId);
        return {
          docId: createdDocId,
          created: true,
        };
      }
    } catch (error) {
      createError = error;
    }

    const existing = await this.findDocIdByHPath(notebook, hpath);
    if (existing) {
      hpathCache?.set(hpath, existing);
      return {
        docId: existing,
        created: false,
      };
    }

    if (createError instanceof Error) {
      throw createError;
    }
    if (createError) {
      throw new Error(String(createError));
    }
    throw new Error(`文档创建后无法定位：${hpath}`);
  }

  private async findDocIdByHPath(notebook: string, hpath: string): Promise<string | null> {
    const rows = await this.siyuanApi.sql<ProgressiveBlockRow>(`
      SELECT id
      FROM blocks
      WHERE type = 'd'
        AND box = '${this.escapeSql(notebook)}'
        AND hpath = '${this.escapeSql(hpath)}'
      LIMIT 1
    `);
    return asString(rows[0]?.id) || null;
  }

  private getSessionByPieceDocId(state: ProgressiveState, pieceDocId: string): ProgressiveSessionRecord | null {
    const sessionId = state.pieceToSession[pieceDocId];
    if (!sessionId) {
      return null;
    }
    return state.sessions[sessionId] || null;
  }

  private async ensurePieceTopicCard(input: {
    sessionId: string;
    mode: ProgressiveSplitMode;
    pieceDocId: string;
    sourceDocId: string;
    pieceIndex: number;
  }): Promise<EnsureTopicCardResult> {
    const existing = this.cardService.getCardByBlockId(input.pieceDocId);
    if (existing) {
      return {
        cardId: existing.id,
        created: false,
      };
    }

    const result = await this.cardCreationHelper.createQuickCard(input.pieceDocId, {
      cardType: 'topic',
      metadata: {
        source: 'manual',
        isDocument: true,
        progressive: {
          kind: 'piece',
          sessionId: input.sessionId,
          mode: input.mode,
          pieceDocId: input.pieceDocId,
          sourceDocId: input.sourceDocId,
          pieceIndex: input.pieceIndex,
        },
      },
    });

    if (isErr(result)) {
      throw result.error;
    }

    const created = this.cardService.getCardByBlockId(input.pieceDocId);
    if (!created) {
      throw new Error('Piece topic card created but could not be reloaded from storage');
    }
    return {
      cardId: created.id,
      created: true,
    };
  }

  private async cleanupCancelledSplitArtifacts(input: {
    createdDocs: CreatedSplitDocArtifact[];
    createdCardIds: string[];
    onProgress?: (progress: ProgressiveSplitProgress) => void;
    createdDocCount: number;
    createdCardCount: number;
  }): Promise<boolean> {
    const docsToDelete = [...input.createdDocs]
      .sort((left, right) => right.depth - left.depth || right.creationOrder - left.creationOrder);
    const cardsToDelete = [...input.createdCardIds].reverse();
    const total = cardsToDelete.length + docsToDelete.length;
    let current = 0;
    let cleanupIncomplete = false;

    this.emitSplitProgress({
      onProgress: input.onProgress,
      phase: 'cleanup',
      current: 0,
      total,
      message: 'Cleaning up cancelled split',
      createdDocCount: input.createdDocCount,
      createdCardCount: input.createdCardCount,
    });

    for (const cardId of cardsToDelete) {
      try {
        const result = await this.cardService.deleteCard({ cardId });
        if (isErr(result)) {
          throw result.error;
        }
      } catch (error) {
        cleanupIncomplete = true;
        logger.warn('Failed to delete split topic card during cancellation cleanup', {
          cardId,
          error,
        });
      }

      current += 1;
      this.emitSplitProgress({
        onProgress: input.onProgress,
        phase: 'cleanup',
        current,
        total,
        message: 'Cleaning up cancelled split',
        currentTitle: cardId,
        createdDocCount: input.createdDocCount,
        createdCardCount: input.createdCardCount,
      });
    }

    for (const doc of docsToDelete) {
      try {
        await this.siyuanApi.deleteBlock(doc.docId);
      } catch (error) {
        cleanupIncomplete = true;
        logger.warn('Failed to delete split doc during cancellation cleanup', {
          docId: doc.docId,
          depth: doc.depth,
          error,
        });
      }

      current += 1;
      this.emitSplitProgress({
        onProgress: input.onProgress,
        phase: 'cleanup',
        current,
        total,
        message: 'Cleaning up cancelled split',
        currentTitle: doc.docId,
        createdDocCount: input.createdDocCount,
        createdCardCount: input.createdCardCount,
      });
    }

    return cleanupIncomplete;
  }

  private async createExcerptDocUnderSource(input: {
    sourceDocInfo: ProgressiveDocInfo;
    sourceDocId: string;
    selectedText: string;
    sourceBlockId: string;
    attrs: Record<string, string | number | undefined>;
  }): Promise<string> {
    if (!input.sourceDocInfo.box || !input.sourceDocInfo.hpath) {
      throw new Error('无法解析摘录目标文档路径');
    }

    const result = await this.createChildDocFromSource({
      sourceDocId: input.sourceDocId,
      kind: 'excerpt-doc',
      titlePrefix: '摘录',
      previewText: input.selectedText,
      previewMax: 12,
      storageMode: 'source-child',
      attrs: input.attrs,
      contentDom: this.buildCanonicalExcerptDom(input.selectedText, input.sourceBlockId),
    });
    return result.docId;
  }

  private async createExcerptDocUnderConfiguredParent(input: {
    parentDocInfo: ProgressiveDocInfo;
    sourceDocId: string;
    selectedText: string;
    sourceBlockId: string;
    attrs: Record<string, string | number | undefined>;
  }): Promise<string> {
    if (!input.parentDocInfo.box || !input.parentDocInfo.hpath) {
      throw new Error('无法解析固定库摘录目标路径');
    }

    const sequence = await this.resolveNextChildDocSequence({
      sourceDocId: input.sourceDocId,
      kind: 'excerpt-doc',
      titlePrefix: '摘录',
    });
    const childTitle = this.buildNumberedChildDocTitle(
      '摘录',
      sequence,
      input.selectedText,
      12,
    );
    const childPath = `${input.parentDocInfo.hpath}/${childTitle}`;
    const created = await this.siyuanApi.createDocWithMarkdown(input.parentDocInfo.box, childPath, '');
    const docId = created || await this.findDocIdByHPath(input.parentDocInfo.box, childPath);
    if (!docId) {
      throw new Error('固定库摘录创建后无法定位');
    }

    await this.siyuanApi.appendDomBlock(docId, this.buildCanonicalExcerptDom(input.selectedText, input.sourceBlockId));
    await this.setProgressiveAttrs(docId, input.attrs);
    this.docTreeScopeRefresher?.scheduleRebuild();
    return docId;
  }

  private async createDailyNoteExcerptBlock(input: {
    dailyNoteDocId: string;
    selectedText: string;
    sourceBlockId: string;
    attrs: Record<string, string | number | undefined>;
  }): Promise<string> {
    const dailyRootBlockId = await this.ensureDailyExcerptRootBlock(input.dailyNoteDocId);
    const excerptBlockId = await this.siyuanApi.appendDomBlock(
      dailyRootBlockId,
      this.buildCanonicalExcerptDom(input.selectedText, input.sourceBlockId),
    );
    await this.setProgressiveAttrs(excerptBlockId, input.attrs);
    return excerptBlockId;
  }

  private async ensureDailyExcerptRootBlock(dailyNoteDocId: string): Promise<string> {
    const existing = await this.findDirectChildByKind(dailyNoteDocId, 'daily-excerpt-root');
    if (existing) {
      return existing;
    }

    const rootBlockId = await this.siyuanApi.appendMarkdownBlock(dailyNoteDocId, `## ${DAILY_EXCERPT_ROOT_TITLE}`);
    await this.setProgressiveAttrs(rootBlockId, {
      [ATTR_PROGRESSIVE_KIND]: 'daily-excerpt-root',
    });
    return rootBlockId;
  }

  private async resolveParentExcerptId(sourceDocId: string): Promise<string | undefined> {
    const attrs = await this.siyuanApi.getBlockAttrs(sourceDocId);
    if (this.readProgressiveAttr(attrs, ATTR_PROGRESSIVE_KIND) !== 'excerpt-doc') {
      return undefined;
    }
    return sourceDocId;
  }

  private async ensurePieceWorkbenchDoc(
    state: ProgressiveState,
    session: ProgressiveSessionRecord,
    piece: ProgressiveSessionPieceRecord,
  ): Promise<string> {
    if (piece.workbenchDocId) {
      return piece.workbenchDocId;
    }

    const pieceAttrs = await this.siyuanApi.getBlockAttrs(piece.pieceDocId);
    const attrWorkbenchId = this.readProgressiveAttr(pieceAttrs, ATTR_PROGRESSIVE_WORKBENCH_ID);
    if (attrWorkbenchId) {
      piece.workbenchDocId = attrWorkbenchId;
      return attrWorkbenchId;
    }

    const pieceDocInfo = await this.resolveDocInfo(piece.pieceDocId);
    const workbenchPath = `${pieceDocInfo.hpath}/${WORKBENCH_DOC_TITLE}`;
    const workbenchDocId = (await this.ensureDocByHPath(
      session.notebook,
      workbenchPath,
      `# ${WORKBENCH_DOC_TITLE}\n\n> ${(piece.title || WORKBENCH_DOC_TITLE).trim()}`
    )).docId;

    piece.workbenchDocId = workbenchDocId;
    await this.setProgressiveAttrs(workbenchDocId, {
      [ATTR_PROGRESSIVE_KIND]: 'piece-workbench',
      [ATTR_PROGRESSIVE_SESSION_ID]: session.id,
      [ATTR_PROGRESSIVE_MODE]: session.mode,
      [ATTR_PROGRESSIVE_SOURCE_DOC_ID]: session.sourceDocId,
      [ATTR_PROGRESSIVE_PIECE_INDEX]: piece.order,
    });
    await this.setProgressiveAttrs(piece.pieceDocId, {
      [ATTR_PROGRESSIVE_WORKBENCH_ID]: workbenchDocId,
    });
    state.pieceToSession[piece.pieceDocId] = session.id;

    return workbenchDocId;
  }

  private async ensureSourceWorkbenchDoc(
    state: ProgressiveState,
    sourceDocId: string,
    notebook: string,
  ): Promise<string> {
    const existing = state.sourceDocToWorkbench[sourceDocId];
    if (existing) {
      return existing;
    }

    const sourceAttrs = await this.siyuanApi.getBlockAttrs(sourceDocId);
    const attrWorkbenchId = this.readProgressiveAttr(sourceAttrs, ATTR_PROGRESSIVE_WORKBENCH_ID);
    if (attrWorkbenchId) {
      state.sourceDocToWorkbench[sourceDocId] = attrWorkbenchId;
      return attrWorkbenchId;
    }

    const sourceDocInfo = await this.resolveDocInfo(sourceDocId);
    const workbenchPath = `${sourceDocInfo.hpath}/${WORKBENCH_DOC_TITLE}`;
    const workbenchDocId = (await this.ensureDocByHPath(
      notebook,
      workbenchPath,
      `# ${WORKBENCH_DOC_TITLE}\n\n> ${(sourceDocInfo.name || WORKBENCH_DOC_TITLE).trim()}`
    )).docId;

    state.sourceDocToWorkbench[sourceDocId] = workbenchDocId;
    await this.setProgressiveAttrs(workbenchDocId, {
      [ATTR_PROGRESSIVE_KIND]: 'source-workbench',
      [ATTR_PROGRESSIVE_SOURCE_DOC_ID]: sourceDocId,
    });
    await this.setProgressiveAttrs(sourceDocId, {
      [ATTR_PROGRESSIVE_WORKBENCH_ID]: workbenchDocId,
    });

    return workbenchDocId;
  }

  private async ensureReusableSourceWorkbenchDoc(sourceDocId: string, notebook: string): Promise<string> {
    const state = await this.readState();
    const previousWorkbenchId = state.sourceDocToWorkbench[sourceDocId];
    const workbenchDocId = await this.ensureSourceWorkbenchDoc(state, sourceDocId, notebook);

    if (state.sourceDocToWorkbench[sourceDocId] !== previousWorkbenchId) {
      await this.writeState(state);
    }

    return workbenchDocId;
  }

  private async ensureExcerptTopicCard(input: {
    excerptEntityId: string;
    excerptEntityType: 'doc' | 'block';
    sourceBlockId: string;
    sessionId?: string;
    mode?: ProgressiveSplitMode;
    pieceDocId?: string;
    sourceDocId: string;
  }): Promise<string> {
    const existing = this.cardService.getCardByBlockId(input.excerptEntityId);
    if (existing) {
      return existing.id;
    }

    const result = await this.cardService.createCard({
      blockIds: [input.excerptEntityId],
      cardType: 'topic',
      extractedFrom: input.sourceBlockId,
      progressiveLineage: {
        kind: 'excerpt',
        sessionId: input.sessionId,
        mode: input.mode,
        pieceDocId: input.pieceDocId,
        sourceDocId: input.sourceDocId,
        sourceBlockId: input.sourceBlockId,
      },
      metadata: {
        source: 'manual',
        isDocument: input.excerptEntityType === 'doc',
      },
    });

    if (isErr(result)) {
      throw result.error;
    }

    const created = this.cardService.getCardByBlockId(input.excerptEntityId);
    if (!created) {
      throw new Error('Excerpt topic card created but could not be reloaded from storage');
    }
    return created.id;
  }

  private async getBlockInfo(blockId: string): Promise<ProgressiveBlockRow> {
    const rows = await this.siyuanApi.sql<ProgressiveBlockRow>(`
      SELECT id, root_id, parent_id, box, type, subtype, content, markdown
      FROM blocks
      WHERE id = '${this.escapeSql(blockId)}'
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      throw new Error(`块不存在: ${blockId}`);
    }
    return row;
  }

  private async repairLegacyWorkbenchScaffolds(workbenchDocId: string): Promise<void> {
    const directChildren = await this.getChildBlocks(workbenchDocId);
    for (const child of directChildren) {
      const nestedChildren = await this.getChildBlocks(child.id);
      if (nestedChildren.length === 0) {
        continue;
      }

      const nestedAttrs = await Promise.all(
        nestedChildren.map(async (nestedChild) => ({
          nestedChild,
          attrs: await this.siyuanApi.getBlockAttrs(nestedChild.id),
        }))
      );
      const excerptChildren = nestedAttrs.filter(
        ({ attrs }) => this.readProgressiveAttr(attrs, ATTR_PROGRESSIVE_KIND) === 'excerpt',
      );
      if (excerptChildren.length === 0 || excerptChildren.length !== nestedChildren.length) {
        continue;
      }

      const childMarkdown = await this.getBlockMarkdown(child);
      if (!this.parseBlockRefTarget(childMarkdown)) {
        continue;
      }

      for (const { nestedChild } of excerptChildren) {
        await this.siyuanApi.moveBlockAsChild(nestedChild.id, workbenchDocId);
      }
      await this.siyuanApi.deleteBlock(child.id);
    }
  }

  private async findDirectChildByKind(
    parentId: string,
    kind: ProgressiveKind,
    extraAttrs: Record<string, string> = {},
  ): Promise<string | null> {
    const aliasJoins = [
      this.buildCompatAttrJoin('a0', 'b.id', ATTR_PROGRESSIVE_KIND, kind),
    ];

    let aliasIndex = 1;
    for (const [attrName, attrValue] of Object.entries(extraAttrs)) {
      aliasJoins.push(this.buildCompatAttrJoin(`a${aliasIndex}`, 'b.id', attrName, attrValue));
      aliasIndex += 1;
    }

    const rows = await this.siyuanApi.sql<ProgressiveBlockRow>(`
      SELECT b.id
      FROM blocks b
      ${aliasJoins.join('\n')}
      WHERE b.parent_id = '${this.escapeSql(parentId)}'
      ORDER BY b.sort ASC, b.id ASC
      LIMIT 1
    `);
    return asString(rows[0]?.id) || null;
  }

  private async getBlockMarkdown(block: ProgressiveBlockRow): Promise<string> {
    const markdown = asString(block.markdown);
    if (markdown) {
      return markdown;
    }
    const content = asString(block.content);
    if (content) {
      return content;
    }
    if (!block.id) {
      return '';
    }
    const { kramdown } = await this.siyuanApi.getBlockKramdown(block.id);
    return String(kramdown || '');
  }

  private parseBlockRefTarget(markdown: string): string | null {
    const matched = markdown.match(/\(\(([A-Za-z0-9_-]+)(?:\s+'[^']*')?\)\)/u);
    return matched?.[1] || null;
  }

  private toExcerptMarkdown(value: string): string {
    return value
      .split(/\r?\n/u)
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();
  }

  private buildCanonicalExcerptDom(selectedText: string, sourceBlockId: string): string {
    const excerptText = this.escapeHtml(this.toExcerptMarkdown(selectedText))
      .replace(/\n/g, '<br />');
    const sourceRef = this.buildSourceAliasDom(sourceBlockId);
    const separator = excerptText ? ' ' : '';
    return [
      '<div data-type="NodeParagraph" class="p">',
      `<div contenteditable="true" spellcheck="false">${excerptText}${separator}${sourceRef}</div>`,
      '<div class="protyle-attr" contenteditable="false">\u200b</div>',
      '</div>',
    ].join('');
  }

  private buildSourceAliasDom(sourceBlockId: string): string {
    return `<span data-type="block-ref" data-id="${this.escapeHtmlAttribute(sourceBlockId)}" data-subtype="s">*</span>`;
  }

  private async resolveNextChildDocSequence(input: {
    sourceDocId: string;
    kind: Extract<ProgressiveKind, 'excerpt-doc' | 'derived-item-doc'>;
    titlePrefix: string;
  }): Promise<number> {
    const rows = await this.siyuanApi.sql<ProgressiveBlockRow>(`
      SELECT b.id, b.content
      FROM blocks b
      ${this.buildCompatAttrJoin('a0', 'b.id', ATTR_PROGRESSIVE_KIND, input.kind)}
      ${this.buildCompatAttrJoin('a1', 'b.id', ATTR_PROGRESSIVE_SOURCE_DOC_ID, input.sourceDocId)}
      WHERE b.type = 'd'
      ORDER BY b.id ASC
    `);

    let maxSequence = 0;
    let hasExplicitSequence = false;
    for (const row of rows) {
      const sequence = this.parseNumberedChildDocSequence(asString(row.content) || '', input.titlePrefix);
      if (sequence > 0) {
        hasExplicitSequence = true;
        maxSequence = Math.max(maxSequence, sequence);
      }
    }

    if (hasExplicitSequence) {
      return maxSequence + 1;
    }

    return rows.length + 1;
  }

  private parseNumberedChildDocSequence(title: string, titlePrefix: string): number {
    const escapedPrefix = titlePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matched = title.match(new RegExp(`^\\[${escapedPrefix}\\s*(\\d+)\\]`, 'u'));
    return matched ? Math.max(0, Number(matched[1]) || 0) : 0;
  }

  private buildNumberedChildDocTitle(
    titlePrefix: string,
    sequence: number,
    previewText: string,
    previewMax = 12,
  ): string {
    const prefix = String(Math.max(1, sequence)).padStart(3, '0');
    const preview = buildExcerptTitlePreview(previewText, previewMax);
    if (!preview) {
      return sanitizeDocTitle(`[${titlePrefix} ${prefix}]`);
    }
    return sanitizeDocTitle(`[${titlePrefix} ${prefix}] ${preview}`);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeHtmlAttribute(value: string): string {
    return this.escapeHtml(value).replace(/\n/g, ' ');
  }

  private readProgressiveAttr(attrs: Record<string, string> | null | undefined, attrName: string): string | undefined {
    const primary = asString(attrs?.[attrName]);
    if (primary) {
      return primary;
    }

    const legacyAttrName = getLegacyProgressiveAttrName(attrName);
    if (!legacyAttrName) {
      return undefined;
    }
    return asString(attrs?.[legacyAttrName]);
  }

  private buildCompatAttrJoin(alias: string, blockIdExpr: string, attrName: string, attrValue: string): string {
    const attrNames = [attrName, getLegacyProgressiveAttrName(attrName)]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .filter((value, index, values) => values.indexOf(value) === index);

    const escapedValue = this.escapeSql(attrValue);
    const nameCondition = attrNames.length === 1
      ? `${alias}.name = '${this.escapeSql(attrNames[0])}'`
      : `${alias}.name IN (${attrNames.map((name) => `'${this.escapeSql(name)}'`).join(', ')})`;

    return `INNER JOIN attributes ${alias}
        ON ${alias}.block_id = ${blockIdExpr}
       AND ${nameCondition}
       AND ${alias}.value = '${escapedValue}'`;
  }

  private async setProgressiveAttrs(blockId: string, attrs: Record<string, string | number | undefined>): Promise<void> {
    const normalized = Object.fromEntries(
      Object.entries(attrs).map(([key, value]) => [key, toAttrValue(value)])
    );
    await this.siyuanApi.setBlockAttrs(blockId, normalized);
  }

  private emitSplitProgress(input: {
    onProgress?: (progress: ProgressiveSplitProgress) => void;
    phase: ProgressiveSplitProgressPhase;
    current: number;
    total: number;
    message: string;
    currentTitle?: string;
    createdDocCount: number;
    createdCardCount: number;
  }): void {
    if (!input.onProgress) {
      return;
    }

    const [start, end] = SPLIT_PROGRESS_PHASE_RANGES[input.phase];
    const total = Math.max(0, input.total);
    const current = total > 0
      ? Math.min(Math.max(0, input.current), total)
      : Math.max(0, input.current);
    const ratio = total > 0 ? current / total : 1;
    const percentage = Math.round(start + ((end - start) * ratio));

    input.onProgress({
      phase: input.phase,
      current,
      total,
      percentage,
      message: input.message,
      currentTitle: input.currentTitle,
      createdDocCount: input.createdDocCount,
      createdCardCount: input.createdCardCount,
    });
  }

  private throwIfSplitCancelled(options?: ProgressiveSplitExecutionOptions): void {
    if (options?.isCancellationRequested?.()) {
      throw new ProgressiveSplitCancelledError();
    }
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}
