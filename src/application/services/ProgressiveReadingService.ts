import type { ProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type { ProgressiveBlockRow, ProgressiveDocInfo, ProgressiveSiyuanPort } from '@/application/ports/ProgressiveSiyuanPort';
import type { ProgressiveNativeRiffPort } from '@/application/ports/ProgressiveNativeRiffPort';
import type { BackendIntegrationClientFacet } from '@/application/clients/backend';
import type {
  BackendProgressiveCommandExecuteRequest,
  BackendProgressiveCommandExecuteResult,
  BackendUnavailableClass,
} from '../../../packages/contracts/src/backend-rpc';
import { ConfiguredCaptureStorageService } from '@/application/services/ConfiguredCaptureStorageService';
import {
  ExcerptRecordService,
  normalizeExcerptBlockIds,
} from '@/application/services/ExcerptRecordService';
import {
  ProgressiveExcerptMaterializer,
  type ProgressiveExcerptMaterializerState,
} from '@/application/services/ProgressiveExcerptMaterializer';
import {
  buildProgressiveDisclosureState,
  evaluateProgressiveSourceAvailability,
  type ProgressiveContentPayloadIdentity,
  type ProgressiveDisclosureState,
  type ProgressiveSourceAvailability,
  type ProgressiveSourceLineage,
} from '@/core/progressive/progressiveSourceModel';
import type { IFileService } from '@/infrastructure/services/FileService';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import { isErr } from '@/types/result';
import type { PluginSettings } from '@/types/settings';
import { createLogger } from '@/utils/logger';
import {
  ATTR_PROGRESSIVE_DISCLOSURE_STATE,
  ATTR_PROGRESSIVE_KIND,
  ATTR_PROGRESSIVE_MODE,
  ATTR_PROGRESSIVE_PIECE_COUNT,
  ATTR_PROGRESSIVE_PIECE_INDEX,
  ATTR_PROGRESSIVE_PIECE_STATE,
  ATTR_PROGRESSIVE_SESSION_ID,
  ATTR_PROGRESSIVE_SOURCE_DOC_ID,
  ATTR_PROGRESSIVE_WORKBENCH_ID,
  getLegacyProgressiveAttrName,
} from '@/application/services/ProgressiveAttrContract';
import type { TransactionProvenanceReason } from '@/core/infrastructure/websocket/transaction-fanout-coordinator';
import type { TransactionProvenanceRegistry } from '@/core/infrastructure/websocket/transaction-provenance-registry';

const logger = createLogger('ProgressiveReadingService');
const STORAGE_KEY = 'progressive-reading.json';
const WORKBENCH_DOC_TITLE = 'Topic 工作台';
const DAILY_EXCERPT_ROOT_TITLE = 'SiYuanMemo Topic';

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

interface ProgressiveExcerptMaterializationBlockRow extends ProgressiveBlockRow {
  sort?: string | number;
}

interface ProgressiveReadingSettingsProvider {
  getSettings(): Pick<PluginSettings, 'progressiveReading'>;
}

interface ProgressiveDocTreeScopeRefresher {
  scheduleRebuild(): void;
}

type ProgressiveOwnershipBoundaryClient = {
  p6OwnershipQuery?: (request: {
    requestId?: string;
    surface: 'progressive';
    operation: 'scan-candidates' | 'resolve-list-children' | 'resolve-concept' | 'read-block-meta' | 'read-block-content' | 'read-card-context';
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  }) => Promise<unknown>;
};

type ProgressiveCommandRelayRuntime = {
  getMode?: () => string;
  getInstanceId?: () => string;
};

type ProgressiveCommandFollowerClient = {
  submitAndWait?: <TResult>(request: {
    instanceId: string;
    method: 'progressive.command.execute';
    params: BackendProgressiveCommandExecuteRequest;
  }) => Promise<TResult>;
};

type ProgressiveBackendCommandClient = Pick<BackendIntegrationClientFacet, 'executeProgressiveCommand'>;
type ProgressiveTransactionProvenanceRecorder = Pick<TransactionProvenanceRegistry, 'recordBlockIds'>;

export interface ProgressiveSplitResult {
  sessionId: string;
  pieceDocIds: string[];
}

export interface ProgressiveExcerptInput {
  sourceBlockId: string;
  sourceBlockIds?: string[];
  selectedText: string;
  contentDom?: string;
  origin: 'editor' | 'review';
  currentCardId?: string;
}

export interface ProgressiveExcerptResult {
  excerptEntityId: string;
  excerptEntityType: 'doc' | 'block';
  topicCardId: string;
  sourceBlockId: string;
  sourceBlockIds: string[];
  containerDocId: string;
  sourceLineage?: ProgressiveSourceLineage;
  payloadIdentity?: ProgressiveContentPayloadIdentity;
  disclosureState?: ProgressiveDisclosureState;
}

export interface ProgressiveCreatedExcerptResult extends ProgressiveExcerptResult {
  kind: 'created';
  recordId: string;
  colorApplied: boolean;
}

export type ProgressiveExcerptCreationResult = ProgressiveCreatedExcerptResult;

export interface ProgressiveExcerptSourceMaterializationResult {
  sourceBlockId: string;
  sourceBlockIds: string[];
  contentDom: string;
  highlightSnapshot: ProgressiveExcerptSelectionSnapshot;
  reused: boolean;
}

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

export interface ProgressiveSourceInspectionInput {
  lineage: ProgressiveSourceLineage;
  payloadIdentity: ProgressiveContentPayloadIdentity;
  selectedText: string;
  contentDom?: string;
}

export type ProgressiveProcessingCommand =
  | { operation: 'advance'; pieceDocId: string }
  | { operation: 'defer'; pieceDocId: string }
  | { operation: 'split'; docId: string; mode: ProgressiveSplitMode; splitConfig?: ProgressiveSplitConfig }
  | { operation: 'convert-to-card'; blockIds: string[]; cardType?: 'item' | 'topic' | 'concept' | 'descriptor' };

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

function toAttrJsonValue(value: unknown): string {
  return JSON.stringify(value);
}

function normalizeProgressiveMode(value: string | undefined): ProgressiveSplitMode | undefined {
  return value === 'linear' || value === 'nonlinear' ? value : undefined;
}

export class ProgressiveReadingService {
  private generatedNodeIdCounter = 0;

  constructor(
    private readonly siyuanApi: ProgressiveSiyuanPort,
    private readonly nativeRiffApi: ProgressiveNativeRiffPort,
    private readonly fileService: IFileService,
    private readonly cardService: CardApplicationService,
    private readonly settingsProvider: ProgressiveReadingSettingsProvider,
    private readonly configuredCaptureStorageService: ConfiguredCaptureStorageService,
    private readonly excerptRecordService: ExcerptRecordService,
    private readonly docTreeScopeRefresher?: ProgressiveDocTreeScopeRefresher,
    private readonly ownershipBoundaryClient?: ProgressiveOwnershipBoundaryClient,
    private readonly backendClient?: ProgressiveBackendCommandClient,
    private readonly commandRelayRuntime?: ProgressiveCommandRelayRuntime | null,
    private readonly followerCommandClient?: ProgressiveCommandFollowerClient | null,
    private readonly transactionProvenanceRegistry?: ProgressiveTransactionProvenanceRecorder,
  ) {}

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
      if (createdDocs.length > 0 || createdCardIds.length > 0) {
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
        if (!(error instanceof ProgressiveSplitCancelledError) && cleanupIncomplete) {
          logger.warn('Split artifact cleanup was incomplete after failure', {
            sourceDocId,
            mode,
            cleanupIncomplete,
            error,
          });
        }
        if (error instanceof ProgressiveSplitCancelledError) {
          throw new ProgressiveSplitCancelledError(error.message, cleanupIncomplete);
        }
        throw error;
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

  async materializeExcerptSource(
    snapshot: ProgressiveExcerptSelectionSnapshot,
  ): Promise<ProgressiveExcerptSourceMaterializationResult> {
    const sourceBlockIds = normalizeExcerptBlockIds(snapshot.sourceBlockIds, snapshot.sourceBlockId);
    if (sourceBlockIds.length <= 1) {
      return {
        sourceBlockId: snapshot.sourceBlockId,
        sourceBlockIds,
        contentDom: snapshot.contentDom,
        highlightSnapshot: snapshot,
        reused: false,
      };
    }

    const selectedRows = await this.getBlockRowsByIds(sourceBlockIds);
    const rootIds = new Set(
      selectedRows
        .map((row) => String(row.root_id || '').trim())
        .filter((value) => value.length > 0),
    );
    if (rootIds.size !== 1) {
      throw new Error('多块摘抄要求选区位于同一个文档内');
    }

    return {
      sourceBlockId: snapshot.sourceBlockId,
      sourceBlockIds,
      contentDom: snapshot.contentDom,
      highlightSnapshot: snapshot,
      reused: false,
    };
  }

  async createExcerptFromSelection(input: ProgressiveExcerptInput): Promise<ProgressiveExcerptCreationResult> {
    if (this.backendClient) {
      return this.executeProgressiveCommandFacade<ProgressiveExcerptInput, ProgressiveExcerptCreationResult>(
        'create-excerpt',
        input,
        String(input.sourceBlockId || '').trim() || 'unknown',
      );
    }
    return this.createExcerptFromSelectionLocal(input);
  }

  async createExcerptFromSelectionLocal(input: ProgressiveExcerptInput): Promise<ProgressiveExcerptCreationResult> {
    const materializer = new ProgressiveExcerptMaterializer({
      siyuanApi: this.siyuanApi,
      cardService: this.cardService,
      settingsProvider: this.settingsProvider,
      configuredCaptureStorageService: this.configuredCaptureStorageService,
      excerptRecordService: this.excerptRecordService,
      getBlockInfo: (blockId) => this.getBlockInfo(blockId),
      getBlockRowsByIds: (blockIds) => this.getBlockRowsByIds(blockIds),
      readState: () => this.readState() as Promise<ProgressiveExcerptMaterializerState>,
      getSessionByPieceDocId: (state, pieceDocId) => this.getSessionByPieceDocId(state as ProgressiveState, pieceDocId),
      resolveDocInfo: (docId) => this.resolveDocInfo(docId),
      buildExcerptEntityDom: (excerptInput) => this.buildExcerptEntityDom(excerptInput),
      createExcerptDocUnderSource: (excerptInput) => this.createExcerptDocUnderSource(excerptInput),
      createExcerptDocUnderConfiguredParent: (excerptInput) => this.createExcerptDocUnderConfiguredParent(excerptInput),
      createDailyNoteExcerptBlock: (excerptInput) => this.createDailyNoteExcerptBlock(excerptInput),
      ensureExcerptTopicCard: (excerptInput) => this.ensureExcerptTopicCard(excerptInput),
      setProgressiveAttrs: (blockId, attrs) => this.setProgressiveAttrs(blockId, attrs),
      rollbackExcerptArtifact: (excerptEntityId, excerptEntityType, error) =>
        this.rollbackExcerptArtifact(excerptEntityId, excerptEntityType, error),
      scheduleDocTreeRebuild: () => this.docTreeScopeRefresher?.scheduleRebuild(),
      recordTransactionProvenance: (blockIds, reason) => this.recordProgressiveExcerptProvenance(blockIds, reason),
    });
    return materializer.materialize(input);
  }

  recordProgressiveExcerptSourceMarkProvenance(blockIds: string[]): void {
    this.recordProgressiveExcerptProvenance(blockIds, 'progressive-excerpt-source-mark');
  }

  private recordProgressiveExcerptProvenance(blockIds: string[], reason: TransactionProvenanceReason): void {
    const normalizedBlockIds = normalizeExcerptBlockIds(blockIds);
    if (normalizedBlockIds.length === 0) {
      return;
    }
    this.transactionProvenanceRegistry?.recordBlockIds(normalizedBlockIds, {
      reason,
      source: 'progressive-excerpt',
      suppressAutoCard: true,
    });
  }

  async updateSourceBlockDom(blockId: string, dom: string): Promise<void> {
    const normalizedBlockId = String(blockId || '').trim();
    const normalizedDom = String(dom || '').trim();
    if (!normalizedBlockId || !normalizedDom) {
      throw new Error('更新摘录原文高亮需要有效的块 ID 和 DOM 内容');
    }

    await this.siyuanApi.updateDomBlock(normalizedBlockId, normalizedDom);
  }

  async inspectProgressiveSource(input: ProgressiveSourceInspectionInput): Promise<ProgressiveSourceAvailability> {
    const currentBlocks = await this.getOptionalBlockRowsByIds(input.lineage.sourceBlockIds);
    return evaluateProgressiveSourceAvailability({
      lineage: input.lineage,
      expectedPayload: input.payloadIdentity,
      currentBlocks,
      selectedText: input.selectedText,
      contentDom: input.contentDom,
    });
  }

  async executeProcessingCommand(command: ProgressiveProcessingCommand): Promise<unknown> {
    if (command.operation === 'advance') {
      return this.completeCurrentPiece(command.pieceDocId);
    }
    if (command.operation === 'defer') {
      return this.deferPiece(command.pieceDocId);
    }
    if (command.operation === 'split') {
      return this.splitDocument(command.docId, command.mode, command.splitConfig);
    }
    const blockIds = normalizeExcerptBlockIds(command.blockIds);
    if (blockIds.length === 0) {
      throw new Error('convert-to-card requires blockIds');
    }
    const result = await this.cardService.createCard({
      blockIds,
      cardType: command.cardType || 'item',
      metadata: {
        source: 'manual',
      },
    });
    if (isErr(result)) {
      throw result.error;
    }
    return result.value;
  }

  async deleteProgressiveArtifact(blockId: string): Promise<void> {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return;
    }
    if (this.backendClient) {
      await this.executeProgressiveCommandFacade<{ blockId: string }, null>(
        'delete-artifact',
        { blockId: normalizedBlockId },
        normalizedBlockId,
      );
      return;
    }
    await this.deleteProgressiveArtifactLocal(normalizedBlockId);
  }

  async deleteProgressiveArtifactLocal(blockId: string): Promise<void> {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return;
    }
    await this.siyuanApi.deleteBlock(normalizedBlockId);
    this.docTreeScopeRefresher?.scheduleRebuild();
  }

  async createChildDocFromSource(input: ProgressiveChildDocInput): Promise<ProgressiveChildDocResult> {
    if (this.backendClient) {
      return this.executeProgressiveCommandFacade<ProgressiveChildDocInput, ProgressiveChildDocResult>(
        'create-child-doc',
        input,
        String(input.sourceDocId || '').trim() || 'unknown',
      );
    }
    return this.createChildDocFromSourceLocal(input);
  }

  async createChildDocFromSourceLocal(input: ProgressiveChildDocInput): Promise<ProgressiveChildDocResult> {
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
      ? await this.siyuanApi.updateDomBlock(docId, input.contentDom)
      : await this.siyuanApi.updateMarkdownBlock(docId, input.contentMarkdown || '');
    if (input.kind === 'excerpt-doc') {
      this.recordProgressiveExcerptProvenance([contentBlockId], 'progressive-excerpt-artifact');
    }
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
      await this.ensureNativeRiffRegistration(input.pieceDocId);
      return {
        cardId: existing.id,
        created: false,
      };
    }

    const result = await this.cardService.createCard({
      blockIds: [input.pieceDocId],
      cardType: 'topic',
      progressiveLineage: {
        kind: 'piece',
        sessionId: input.sessionId,
        mode: input.mode,
        pieceDocId: input.pieceDocId,
        pieceIndex: input.pieceIndex,
        sourceDocId: input.sourceDocId,
      },
      metadata: {
        source: 'manual',
        isDocument: true,
      },
    });

    if (isErr(result)) {
      throw result.error;
    }

    const created = this.cardService.getCardByBlockId(input.pieceDocId);
    if (!created) {
      throw new Error('Piece topic card created but could not be reloaded from storage');
    }
    try {
      await this.ensureNativeRiffRegistration(input.pieceDocId);
    } catch (error) {
      await this.rollbackLocalCard(created.id, {
        blockId: input.pieceDocId,
        kind: 'piece-topic',
      });
      throw error;
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
    sourceBlockIds: string[];
    contentDom: string;
    attrs: Record<string, string | number | undefined>;
  }): Promise<string> {
    if (!input.sourceDocInfo.box || !input.sourceDocInfo.hpath) {
      throw new Error('无法解析摘录目标文档路径');
    }

    const result = await this.createChildDocFromSource({
      sourceDocId: input.sourceDocId,
      kind: 'excerpt-doc',
      titlePrefix: 'Topic',
      previewText: input.selectedText,
      previewMax: 12,
      storageMode: 'source-child',
      attrs: input.attrs,
      contentDom: input.contentDom,
    });
    return result.docId;
  }

  private async createExcerptDocUnderConfiguredParent(input: {
    parentDocInfo: ProgressiveDocInfo;
    sourceDocId: string;
    selectedText: string;
    sourceBlockId: string;
    sourceBlockIds: string[];
    contentDom: string;
    attrs: Record<string, string | number | undefined>;
  }): Promise<string> {
    if (!input.parentDocInfo.box || !input.parentDocInfo.hpath) {
      throw new Error('无法解析固定库摘录目标路径');
    }

    const sequence = await this.resolveNextChildDocSequence({
      sourceDocId: input.sourceDocId,
      kind: 'excerpt-doc',
      titlePrefix: 'Topic',
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

    const contentBlockId = await this.siyuanApi.updateDomBlock(docId, input.contentDom);
    this.recordProgressiveExcerptProvenance([contentBlockId], 'progressive-excerpt-artifact');
    await this.setProgressiveAttrs(docId, input.attrs);
    this.docTreeScopeRefresher?.scheduleRebuild();
    return docId;
  }

  private async createDailyNoteExcerptBlock(input: {
    dailyNoteDocId: string;
    selectedText: string;
    sourceBlockId: string;
    sourceBlockIds: string[];
    contentDom: string;
    attrs: Record<string, string | number | undefined>;
  }): Promise<string> {
    const dailyRootBlockId = await this.ensureDailyExcerptRootBlock(input.dailyNoteDocId);
    const dailyExcerptDom = this.buildDailyNoteExcerptDom({
      selectedText: input.selectedText,
      sourceBlockIds: input.sourceBlockIds,
      contentDom: input.contentDom,
    });
    const excerptBlockId = await this.siyuanApi.appendDomBlock(
      dailyRootBlockId,
      dailyExcerptDom,
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
  }): Promise<EnsureTopicCardResult> {
    const existing = this.cardService.getCardByBlockId(input.excerptEntityId);
    if (existing) {
      await this.ensureNativeRiffRegistration(input.excerptEntityId);
      return {
        cardId: existing.id,
        created: false,
      };
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
        sourceBlockIds: input.sourceBlockIds,
        parentTopicCardId: input.parentTopicCardId,
        parentExcerptId: input.parentExcerptId,
        sourceLineage: input.sourceLineage,
        payloadIdentity: input.payloadIdentity,
        disclosureState: input.disclosureState,
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
    try {
      await this.ensureNativeRiffRegistration(input.excerptEntityId);
    } catch (error) {
      await this.rollbackLocalCard(created.id, {
        blockId: input.excerptEntityId,
        kind: 'excerpt-topic',
      });
      throw error;
    }
    return {
      cardId: created.id,
      created: true,
    };
  }

  private async getBlockInfo(blockId: string): Promise<ProgressiveBlockRow> {
    void this.reportOwnershipBoundaryQuery('read-block-meta', { blockId });
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

  private async getBlockRowsByIds(blockIds: string[]): Promise<ProgressiveExcerptMaterializationBlockRow[]> {
    const normalizedIds = normalizeExcerptBlockIds(blockIds);
    if (normalizedIds.length === 0) {
      return [];
    }
    void this.reportOwnershipBoundaryQuery('read-block-content', { blockIds: normalizedIds });

    const rows = await this.siyuanApi.sql<ProgressiveExcerptMaterializationBlockRow>(`
      SELECT id, root_id, parent_id, box, type, subtype, content, markdown, sort
      FROM blocks
      WHERE id IN (${normalizedIds.map((blockId) => `'${this.escapeSql(blockId)}'`).join(', ')})
    `);
    const rowMap = new Map(
      rows.map((row) => [String(row.id || '').trim(), row] as const),
    );
    return normalizedIds.map((blockId) => {
      const row = rowMap.get(blockId);
      if (!row) {
        throw new Error(`块不存在: ${blockId}`);
      }
      return row;
    });
  }

  private async getOptionalBlockRowsByIds(blockIds: string[]): Promise<Array<ProgressiveExcerptMaterializationBlockRow | null>> {
    const normalizedIds = normalizeExcerptBlockIds(blockIds);
    if (normalizedIds.length === 0) {
      return [];
    }
    void this.reportOwnershipBoundaryQuery('read-block-content', { blockIds: normalizedIds });

    const rows = await this.siyuanApi.sql<ProgressiveExcerptMaterializationBlockRow>(`
      SELECT id, root_id, parent_id, box, type, subtype, content, markdown, sort
      FROM blocks
      WHERE id IN (${normalizedIds.map((blockId) => `'${this.escapeSql(blockId)}'`).join(', ')})
    `);
    const rowMap = new Map(
      rows.map((row) => [String(row.id || '').trim(), row] as const),
    );
    return normalizedIds.map((blockId) => rowMap.get(blockId) || null);
  }

  private async getDirectChildRows(parentId: string): Promise<ProgressiveExcerptMaterializationBlockRow[]> {
    void this.reportOwnershipBoundaryQuery('resolve-list-children', { parentId });
    return this.siyuanApi.sql<ProgressiveExcerptMaterializationBlockRow>(`
      SELECT id, root_id, parent_id, box, type, subtype, content, markdown, sort
      FROM blocks
      WHERE parent_id = '${this.escapeSql(parentId)}'
      ORDER BY sort ASC, id ASC
    `);
  }

  private async getChildBlocks(parentId: string): Promise<ProgressiveExcerptMaterializationBlockRow[]> {
    return this.getDirectChildRows(parentId);
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
    void this.reportOwnershipBoundaryQuery('resolve-concept', {
      parentId,
      kind,
      extraAttrs,
    });
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

  private buildExcerptEntityDom(input: {
    selectedText: string;
    contentDom?: string;
    sourceBlockIds: string[];
  }): string {
    const sourceBlockIds = normalizeExcerptBlockIds(input.sourceBlockIds);
    const trackingSourceBlockId = sourceBlockIds[0] || '';
    const providedContentDom = this.normalizeExcerptContentDom(input.contentDom);
    if (!providedContentDom) {
      return this.ensureDomBlockNodeIds(this.buildCanonicalExcerptDom(input.selectedText, sourceBlockIds));
    }

    const withInlineAlias = this.appendInlineSourceAliasToExcerptDom(providedContentDom, trackingSourceBlockId);
    if (withInlineAlias) {
      return this.ensureDomBlockNodeIds(withInlineAlias);
    }

    return this.ensureDomBlockNodeIds(providedContentDom);
  }

  private buildDailyNoteExcerptDom(input: {
    selectedText: string;
    contentDom?: string;
    sourceBlockIds: string[];
  }): string {
    return this.buildExcerptEntityDom(input);
  }

  private buildCanonicalExcerptDom(selectedText: string, sourceBlockIds: string[]): string {
    const normalizedSourceBlockIds = normalizeExcerptBlockIds(sourceBlockIds);
    const trackingSourceBlockId = normalizedSourceBlockIds[0] || '';
    const excerptText = this.escapeHtml(this.toExcerptMarkdown(selectedText))
      .replace(/\n/g, '<br />');
    const sourceRef = this.buildSourceAliasDom(trackingSourceBlockId);
    const separator = excerptText ? ' ' : '';
    return this.buildParagraphDom(`${excerptText}${separator}${sourceRef}`);
  }

  private appendInlineSourceAliasToExcerptDom(contentDom: string, sourceBlockId: string): string | null {
    const normalizedSourceBlockId = String(sourceBlockId || '').trim();
    if (!normalizedSourceBlockId) {
      return contentDom;
    }

    const template = document.createElement('template');
    template.innerHTML = contentDom.trim();
    const topLevelBlocks = Array.from(template.content.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement);
    for (const blockElement of topLevelBlocks) {
      const editable = this.resolveExcerptContentEditable(blockElement);
      if (!editable) {
        continue;
      }

      const separator = String(editable.textContent || '').trim().length > 0 ? ' ' : '';
      editable.insertAdjacentHTML('beforeend', `${separator}${this.buildSourceAliasDom(normalizedSourceBlockId)}`);
      return template.innerHTML.trim();
    }
    return null;
  }

  private buildParagraphDom(innerHtml: string): string {
    return [
      '<div data-type="NodeParagraph" class="p">',
      `<div contenteditable="true" spellcheck="false">${innerHtml}</div>`,
      '<div class="protyle-attr" contenteditable="false">\u200b</div>',
      '</div>',
    ].join('');
  }

  private buildSourceAliasDom(sourceBlockId: string): string {
    return `<span data-type="block-ref" data-id="${this.escapeHtmlAttribute(sourceBlockId)}" data-subtype="s">*</span>`;
  }

  private normalizeExcerptContentDom(contentDom?: string): string {
    const normalizedDom = String(contentDom || '').trim();
    if (!normalizedDom) {
      return '';
    }

    const template = document.createElement('template');
    template.innerHTML = normalizedDom;
    this.trimLeadingEmptyExcerptBlocks(template.content);
    template.content
      .querySelectorAll<HTMLElement>('[data-type="NodeSuperBlock"]')
      .forEach((superBlock) => this.trimLeadingEmptyExcerptBlocks(superBlock));
    return template.innerHTML.trim();
  }

  private trimLeadingEmptyExcerptBlocks(parent: ParentNode): void {
    const childElements = Array.from(parent.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement);

    for (const child of childElements) {
      if (!this.isBlockDomElement(child)) {
        continue;
      }
      if (this.isMeaningfulExcerptBlockElement(child)) {
        return;
      }
      child.remove();
    }
  }

  private isMeaningfulExcerptBlockElement(element: HTMLElement): boolean {
    if (!this.isBlockDomElement(element)) {
      return false;
    }

    const dataType = String(element.getAttribute('data-type') || '').trim();
    if (dataType === 'NodeSuperBlock') {
      return true;
    }

    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.protyle-attr,.protyle-action').forEach((child) => child.remove());
    const text = String(clone.textContent || '')
      .replace(/\u200B/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();
    if (text.length > 0) {
      return true;
    }

    return Boolean(clone.querySelector('img, video, audio, iframe, canvas, table, [data-type="block-ref"], [data-type="a"], [data-href], [data-type="tag"]'));
  }

  private resolveExcerptContentEditable(element: HTMLElement): HTMLElement | null {
    return element.querySelector<HTMLElement>('[contenteditable="true"]');
  }

  private ensureDomBlockNodeIds(dom: string): string {
    const normalizedDom = String(dom || '').trim();
    if (!normalizedDom) {
      return '';
    }

    const template = document.createElement('template');
    template.innerHTML = normalizedDom;
    const seenNodeIds = new Set<string>();
    const blockElements = Array.from(template.content.querySelectorAll<HTMLElement>('[data-type]'))
      .filter((element) => this.isBlockDomElement(element));

    for (const blockElement of blockElements) {
      const currentNodeId = String(blockElement.getAttribute('data-node-id') || '').trim();
      if (this.isValidSiyuanNodeId(currentNodeId) && !seenNodeIds.has(currentNodeId)) {
        seenNodeIds.add(currentNodeId);
        continue;
      }

      let nextNodeId = this.createSiyuanNodeId();
      while (seenNodeIds.has(nextNodeId)) {
        nextNodeId = this.createSiyuanNodeId();
      }
      blockElement.setAttribute('data-node-id', nextNodeId);
      seenNodeIds.add(nextNodeId);
    }

    return template.innerHTML.trim();
  }

  private isBlockDomElement(element: HTMLElement): boolean {
    return String(element.getAttribute('data-type') || '').trim().startsWith('Node');
  }

  private isValidSiyuanNodeId(nodeId: string): boolean {
    return /^\d{14}-[0-9a-z]{7}$/u.test(String(nodeId || '').trim());
  }

  private createSiyuanNodeId(): string {
    const runtimeWindow = window as Window & {
      Lute?: {
        NewNodeID?: () => string;
      };
    };
    const runtimeNodeId = runtimeWindow.Lute?.NewNodeID?.();
    if (this.isValidSiyuanNodeId(runtimeNodeId || '')) {
      return String(runtimeNodeId).trim();
    }

    const now = new Date();
    const timestamp = [
      now.getFullYear().toString().padStart(4, '0'),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    const suffix = (this.generatedNodeIdCounter++).toString(36).padStart(7, '0').slice(-7);
    return `${timestamp}-${suffix}`;
  }

  private async resolveNextChildDocSequence(input: {
    sourceDocId: string;
    kind: Extract<ProgressiveKind, 'excerpt-doc' | 'derived-item-doc'>;
    titlePrefix: string;
  }): Promise<number> {
    void this.reportOwnershipBoundaryQuery('scan-candidates', {
      sourceDocId: input.sourceDocId,
      kind: input.kind,
      titlePrefix: input.titlePrefix,
    });
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

  private async ensureNativeRiffRegistration(blockId: string): Promise<void> {
    await this.nativeRiffApi.addRiffCards(this.nativeRiffApi.BUILTIN_DECK_ID, [blockId]);
  }

  private async rollbackExcerptArtifact(
    excerptEntityId: string,
    excerptEntityType: 'doc' | 'block',
    error: unknown,
  ): Promise<void> {
    const normalizedExcerptEntityId = String(excerptEntityId || '').trim();
    if (!normalizedExcerptEntityId) {
      return;
    }

    try {
      await this.siyuanApi.deleteBlock(normalizedExcerptEntityId);
      this.docTreeScopeRefresher?.scheduleRebuild();
    } catch (cleanupError) {
      logger.warn('Failed to rollback excerpt artifact after progressive creation error', {
        excerptEntityId: normalizedExcerptEntityId,
        excerptEntityType,
        error,
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
      logger.warn('Failed to rollback progressive local card after native Riff sync error', {
        cardId,
        ...context,
        cleanupError,
      });
    }
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

  private async reportOwnershipBoundaryQuery(
    operation: 'scan-candidates' | 'resolve-list-children' | 'resolve-concept' | 'read-block-meta' | 'read-block-content' | 'read-card-context',
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.ownershipBoundaryClient?.p6OwnershipQuery?.({
        requestId: `progressive:${operation}:${Date.now().toString(36)}`,
        surface: 'progressive',
        operation,
        payload,
      });
    } catch (error) {
      logger.warn('Failed to report progressive ownership boundary query', {
        operation,
        payload,
        error,
      });
    }
  }

  async executeFromBackend(
    request: BackendProgressiveCommandExecuteRequest,
  ): Promise<BackendProgressiveCommandExecuteResult> {
    const now = Date.now();
    try {
      let result: unknown;
      if (request.operation === 'create-excerpt') {
        result = await this.createExcerptFromSelectionLocal(request.input as ProgressiveExcerptInput);
      } else if (request.operation === 'create-child-doc') {
        result = await this.createChildDocFromSourceLocal(request.input as ProgressiveChildDocInput);
      } else if (request.operation === 'delete-artifact') {
        const input = request.input as { blockId?: unknown };
        await this.deleteProgressiveArtifactLocal(String(input.blockId || ''));
        result = null;
      } else if (
        request.operation === 'advance'
        || request.operation === 'defer'
        || request.operation === 'split'
        || request.operation === 'convert-to-card'
      ) {
        result = await this.executeProcessingCommand({
          ...(request.input as Record<string, unknown>),
          operation: request.operation,
        } as ProgressiveProcessingCommand);
      } else {
        return this.createProgressiveFailureResult(request, 'validation-failed', 'unsupported progressive command operation', null, false);
      }
      return {
        status: 'completed',
        commandId: request.commandId,
        idempotencyKey: request.idempotencyKey,
        operation: request.operation,
        result,
        rollback: { attempted: false, status: 'not-needed' },
        progress: { state: 'succeeded', currentStep: 'completed', updatedAt: now },
        diagnostics: {
          diagnosticEventId: `progressive:${request.commandId}:${now}`,
          family: 'progressive.command',
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
      const reason = error instanceof Error ? error.message : String(error || 'progressive command failed');
      return this.createProgressiveFailureResult(request, 'failed', reason, 'FAILED', false);
    }
  }

  private async executeProgressiveCommandFacade<TInput, TResult>(
    operation: BackendProgressiveCommandExecuteRequest['operation'],
    input: TInput,
    idempotencySeed: string,
  ): Promise<TResult> {
    if (!this.backendClient) {
      throw new Error('PROGRESSIVE_COMMAND_UNAVAILABLE: backend client is unavailable');
    }
    const now = Date.now();
    const commandId = `progressive:${operation}:${now}`;
    const request: BackendProgressiveCommandExecuteRequest = {
      requestId: commandId,
      commandId,
      idempotencyKey: `progressive:${operation}:${idempotencySeed}:${now}`,
      operation,
      input: input as Record<string, unknown>,
      requestedAt: now,
      deadlineAt: now + 60_000,
      caller: {
        instanceId: 'application-context',
        runtimeRole: 'single-window',
        surface: 'review',
      },
    };
    const result = await this.executeProgressiveCommandViaAuthority<TResult>(request);
    if (result.status !== 'completed' && result.status !== 'duplicate') {
      throw new Error(`PROGRESSIVE_COMMAND_UNAVAILABLE: ${result.reason}`);
    }
    return result.result as TResult;
  }

  private async executeProgressiveCommandViaAuthority<TResult>(
    request: BackendProgressiveCommandExecuteRequest,
  ): Promise<BackendProgressiveCommandExecuteResult<TResult>> {
    const mode = String(this.commandRelayRuntime?.getMode?.() || '').trim();
    if (mode === 'follower') {
      const instanceId = String(this.commandRelayRuntime?.getInstanceId?.() || '').trim();
      if (!instanceId || typeof this.followerCommandClient?.submitAndWait !== 'function') {
        throw new Error('WRITER_UNAVAILABLE: progressive.command.execute relay is unavailable in follower mode');
      }
      return this.followerCommandClient.submitAndWait<BackendProgressiveCommandExecuteResult<TResult>>({
        instanceId,
        method: 'progressive.command.execute',
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
    return this.backendClient!.executeProgressiveCommand<TResult>(request);
  }

  private createProgressiveFailureResult(
    request: BackendProgressiveCommandExecuteRequest,
    status: 'unavailable' | 'validation-failed' | 'failed',
    reason: string,
    unavailableClass: BackendUnavailableClass | null,
    recoverable: boolean,
  ): BackendProgressiveCommandExecuteResult {
    const now = Date.now();
    return {
      status,
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      operation: request.operation,
      unavailableClass,
      reason,
      recoverable,
      rollback: { attempted: status === 'failed', status: status === 'failed' ? 'failed' : 'not-needed', reason },
      progress: { state: status === 'validation-failed' ? 'validation-failed' : 'failed', currentStep: status, updatedAt: now },
      diagnostics: {
        diagnosticEventId: `progressive:${request.commandId}:${now}`,
        family: 'progressive.command',
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

  private async deferPiece(pieceDocId: string): Promise<{ pieceDocId: string; state: 'deferred' }> {
    const state = await this.readState();
    const session = this.getSessionByPieceDocId(state, pieceDocId);
    if (!session) {
      throw new Error('未找到当前 piece 对应的渐进阅读会话');
    }
    const piece = session.pieces.find((entry) => entry.pieceDocId === pieceDocId);
    if (!piece) {
      throw new Error('当前 piece 不在会话中');
    }
    piece.state = 'pending';
    await this.setProgressiveAttrs(pieceDocId, {
      [ATTR_PROGRESSIVE_PIECE_STATE]: 'deferred',
      [ATTR_PROGRESSIVE_DISCLOSURE_STATE]: toAttrJsonValue(buildProgressiveDisclosureState('deferred')),
    });
    await this.writeState(state);
    return {
      pieceDocId,
      state: 'deferred',
    };
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}
