import type { HyperspaceSettings } from '@/types/settings';
import { DEFAULT_SETTINGS } from '@/types/settings';
import type {
  HyperspaceExcerptInjectionContext,
  NeuralActivationKind,
  NeuralActivationTrace,
  NeuralActivationTraceStep,
  NeuralAssociationType,
  NeuralEngineMode,
  NeuralRoamBatchNode,
  NeuralRoamBatchSnapshot,
  NeuralHistoryPageRequest,
  NeuralHistoryPageResult,
  NeuralNavigationMode,
  NeuralNavigationState,
  NeuralRoamAnchorEntry,
  NeuralRoamHistoryEntry,
  NeuralPropagationOrigin,
  NeuralRoamSourceEntry,
  NeuralSourceNodeKind,
  NeuralSourceRole,
  NeuralTraceQuality,
} from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import type { BlockData } from '../ConceptQueryEngine';
import { NeuralGraphProvider, type NeuralGraphChannel, type NeuralGraphEdge } from '../graph/NeuralGraphProvider';
import { NeuralHistoryStore } from '../NeuralHistoryStore';
import { createDependencyUnavailableError } from '../../dependencyErrors';

const logger = createLogger('HyperspaceEngine');
const ENGINE_MODE: NeuralEngineMode = 'hyperspace';
const DEFAULT_HYPERSPACE_SETTINGS = DEFAULT_SETTINGS.queues.neuralRoam?.hyperspace as HyperspaceSettings;

export interface QueueItem {
  id: string;
  blockId: string;
  deckId: string;
  blockData: BlockData;
  associationType: NeuralAssociationType;
  reason: string;
}

interface SourceState {
  nodeId: string;
  nodeKind: NeuralSourceNodeKind;
  role: NeuralSourceRole;
  priority: number;
  addedAt: number;
  visitedAt: number;
  preview: string;
}

interface FrontierNode {
  nodeId: string;
  fromNodeId: string | null;
  fromEventId: string | null;
  rootSourceNodeId: string | null;
  associationType: NeuralAssociationType;
  channel: NeuralGraphChannel;
  origin: NeuralPropagationOrigin | null;
  depth: number;
  treeDistance: number | null;
  activationScore: number;
  inheritedPriority: number;
  conductionProbability: number;
}

interface DeferredExpansionTask {
  nodeId: string;
  fromNodeId: string | null;
  fromEventId: string | null;
  rootSourceNodeId: string | null;
  depth: number;
  baseScore: number;
  layersRemaining: number;
  epoch: number;
}

export interface HyperspacePersistedEntry {
  nodeId: string;
  nodeKind: NeuralSourceNodeKind;
  role: NeuralSourceRole;
  priority: number;
  addedAt: number;
  visitedAt: number;
  nodePreview: string;
}

export interface HyperspaceSessionState {
  displayPath: string[];
  displayPathEventIds?: string[];
  currentPathIndex: number;
  navigationMode: NeuralNavigationMode;
  bookmarkPathIndex: number | null;
  history: NeuralRoamHistoryEntry[];
  currentLeadSource: string | null;
  currentLeadSourceEventId?: string | null;
  branchRootNodeId?: string | null;
  currentSessionId: string | null;
  visitedBlocks: string[];
  frontier: FrontierNode[];
  exhaustedSources?: string[];
}

interface ActivateNodeMeta {
  associationType: NeuralAssociationType;
  reason: string;
  focusId: string | null;
  isVirtual: boolean;
  activationKind?: NeuralActivationKind;
  sourceRole?: NeuralSourceRole | null;
  origin?: NeuralPropagationOrigin | null;
  sourceNodeId?: string | null;
  sourceEventId?: string | null;
  branchRootNodeId?: string | null;
  depth?: number | null;
  conductionScore?: number | null;
}

interface AssociatedReviewVisitInput {
  nodeId: string;
  nodePreview?: string | null;
  sourceNodeId?: string | null;
  sourceEventId?: string | null;
  reason?: string | null;
}

interface PathItemOptions {
  focusPath?: boolean;
}

interface HyperspaceEngineOptions {
  getSettings?: () => HyperspaceSettings;
  getHistoryLimit?: () => number;
  random?: () => number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createSessionId(): string {
  return `hs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createHistoryEventId(): string {
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePriority(value: unknown, fallback = 0.6): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : fallback;
}

function normalizeNodeKind(value: unknown): NeuralSourceNodeKind {
  return value === 'virtual' ? 'virtual' : value === 'element' ? 'element' : 'concept';
}

function normalizeSourceRole(value: unknown): NeuralSourceRole {
  return value === 'activation-source' ? 'activation-source' : 'orbit-center';
}

function normalizePreview(text: string, previewLength = 72): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > previewLength ? `${normalized.slice(0, previewLength)}...` : normalized;
}

function normalizeOrigin(value: unknown, associationType?: NeuralAssociationType | null): NeuralPropagationOrigin | null {
  switch (value) {
    case 'source':
    case 'backlink':
    case 'direct-ref':
    case 'indirect-ref':
    case 'descriptor':
    case 'block-tree':
    case 'document-tree':
    case 'follow-path':
    case 'manual-jump':
      return value;
    default:
      switch (associationType) {
        case 'source':
          return 'source';
        case 'descriptor':
          return 'descriptor';
        case 'associated-review':
          return 'follow-path';
        case 'tree-child':
        case 'tree-sibling':
        case 'tree-parent':
          return 'block-tree';
        case 'follow-path':
          return 'follow-path';
        case 'manual-jump':
        case 'path':
          return 'manual-jump';
        case 'backlink':
          return 'backlink';
        case 'outgoing-direct':
          return 'direct-ref';
        case 'outgoing-indirect':
          return 'indirect-ref';
        default:
          return null;
      }
  }
}

function buildReasonText(type: NeuralAssociationType | NeuralPropagationOrigin): string {
  switch (type) {
    case 'source': return '激活源';
    case 'concept-link': return '概念链接';
    case 'element-link': return '块链接';
    case 'descriptor': return '描述符';
    case 'associated-review': return '关联复习卡';
    case 'tree-child': return '子节点传导';
    case 'tree-sibling': return '同级传导';
    case 'tree-parent': return '父节点传导';
    case 'backlink': return '反向链接';
    case 'direct-ref': return '直接引用';
    case 'indirect-ref': return '间接引用';
    case 'block-tree': return '块树';
    case 'document-tree': return '文档树';
    case 'follow-path':
    case 'path': return '沿当前路径';
    case 'manual-jump': return '手动跳转';
    case 'outgoing-direct': return '直接链接';
    case 'outgoing-indirect': return '间接链接';
    case 'focus': return '焦点节点';
    default: return '图关系激活';
  }
}

export class HyperspaceEngine {
  private readonly graphProvider: NeuralGraphProvider;
  private readonly previewLength = 72;
  private readonly getSettingsSnapshot: () => HyperspaceSettings;
  private readonly getHistoryLimit: () => number;
  private readonly random: () => number;
  private readonly historyStore: NeuralHistoryStore;

  private sourcePool = new Map<string, SourceState>();
  private anchorPool = new Map<string, SourceState>();
  private displayPath: string[] = [];
  private displayPathEventIds: string[] = [];
  private currentPathIndex = -1;
  private navigationMode: NeuralNavigationMode = 'explore';
  private bookmarkPathIndex: number | null = null;
  private currentLeadSource: string | null = null;
  private currentLeadSourceEventId: string | null = null;
  private branchRootNodeId: string | null = null;
  private currentSessionId: string | null = null;
  private visitedBlocks = new Set<string>();
  private frontier = new Map<string, FrontierNode>();
  private exhaustedSources = new Set<string>();
  private followCurrentNodeOnce = false;
  private deferredExpansionQueue: DeferredExpansionTask[] = [];
  private deferredExpansionTimer: ReturnType<typeof setTimeout> | null = null;
  private deferredExpansionInFlight: Promise<void> | null = null;
  private queuedExpansionKeys = new Set<string>();
  private expandedActivationEventIds = new Set<string>();
  private expansionEpoch = 0;

  constructor(graphProvider?: NeuralGraphProvider, options: HyperspaceEngineOptions = {}) {
    this.graphProvider = graphProvider ?? new NeuralGraphProvider();
    this.getSettingsSnapshot = options.getSettings ?? (() => DEFAULT_HYPERSPACE_SETTINGS);
    this.getHistoryLimit = options.getHistoryLimit ?? (() => 3000);
    this.random = options.random ?? (() => Math.random());
    this.historyStore = new NeuralHistoryStore(this.resolveHistoryLimit());
  }

  private resolveHistoryLimit(): number {
    return clamp(this.getHistoryLimit(), 200, 5000);
  }

  private syncHistoryCapacity(): void {
    this.historyStore.setCapacity(this.resolveHistoryLimit());
  }

  getEngineMode(): NeuralEngineMode {
    return ENGINE_MODE;
  }

  getConceptBlocks(): string[] {
    return this.getSourceSnapshot().filter((entry) => entry.nodeKind === 'concept').map((entry) => entry.nodeId);
  }

  getSourceSnapshot(): NeuralRoamSourceEntry[] {
    return Array.from(this.sourcePool.values()).map((entry) => ({
      nodeId: entry.nodeId,
      nodePreview: entry.preview,
      nodeKind: entry.nodeKind,
      role: entry.role,
      priority: entry.priority,
      addedAt: entry.addedAt,
      visitedAt: entry.visitedAt,
    })).sort((a, b) => b.visitedAt - a.visitedAt);
  }

  getAnchorSnapshot(): NeuralRoamAnchorEntry[] {
    return Array.from(this.anchorPool.values()).map((entry) => ({
      nodeId: entry.nodeId,
      nodePreview: entry.preview,
      isVirtual: entry.nodeKind === 'virtual',
      nodeKind: entry.nodeKind === 'virtual' ? 'virtual' : 'concept',
      priority: entry.priority,
      addedAt: entry.addedAt,
      visitedAt: entry.visitedAt,
    })).sort((a, b) => b.visitedAt - a.visitedAt);
  }

  async setSourceEntry(nodeId: string, enabled = true): Promise<void> {
    const normalized = String(nodeId || '').trim();
    if (!normalized) return;
    if (!enabled) {
      this.sourcePool.delete(normalized);
      this.exhaustedSources.delete(normalized);
      if (this.currentLeadSource === normalized) {
        this.currentLeadSource = null;
        this.currentLeadSourceEventId = null;
      }
      return;
    }

    const descriptor = await this.resolveNodeDescriptor(normalized);
    const existing = this.sourcePool.get(normalized);
    const now = Date.now();
    this.exhaustedSources.delete(normalized);
    this.sourcePool.set(normalized, {
      nodeId: normalized,
      nodeKind: descriptor.nodeKind,
      role: 'activation-source',
      priority: existing?.priority ?? (await this.resolveNodePriority(normalized, descriptor.nodeKind === 'concept' ? 0.7 : 0.58)),
      addedAt: existing?.addedAt ?? now,
      visitedAt: existing?.visitedAt ?? now,
      preview: descriptor.preview,
    });
  }

  async injectExcerptIntoCurrentSession(
    excerptNodeId: string,
    context: HyperspaceExcerptInjectionContext = {},
  ): Promise<boolean> {
    const normalized = String(excerptNodeId || '').trim();
    if (!normalized) {
      return false;
    }

    await this.setSourceEntry(normalized, true);
    this.touchSource(normalized);

    const currentEntry = this.resolveExcerptInjectionSource(context);
    if (!currentEntry) {
      return true;
    }

    if (currentEntry.nodeId === normalized || this.hasSourceRootInCurrentSession(normalized)) {
      return false;
    }

    const descriptor = await this.resolveNodeDescriptor(normalized);
    const activationScore = this.computeExcerptInjectionScore(currentEntry.conductionScore);
    const candidate: FrontierNode = {
      nodeId: normalized,
      fromNodeId: currentEntry.nodeId,
      fromEventId: currentEntry.eventId,
      rootSourceNodeId: normalized,
      associationType: 'source',
      channel: 'source',
      origin: 'source',
      depth: 0,
      treeDistance: null,
      activationScore,
      inheritedPriority: await this.resolveNodePriority(normalized, descriptor.nodeKind === 'concept' ? 0.7 : 0.58),
      conductionProbability: 1,
    };

    const existing = this.frontier.get(normalized);
    if (existing?.associationType === 'source' && existing.rootSourceNodeId === normalized) {
      return false;
    }
    if (!existing || activationScore > existing.activationScore) {
      this.frontier.set(normalized, candidate);
    }
    this.exhaustedSources.delete(normalized);
    return true;
  }

  async setAnchorEntry(nodeId: string, enabled = true): Promise<void> {
    const normalized = String(nodeId || '').trim();
    if (!normalized) return;
    if (!enabled) {
      this.anchorPool.delete(normalized);
      return;
    }

    const descriptor = await this.resolveNodeDescriptor(normalized);
    const existing = this.anchorPool.get(normalized);
    const now = Date.now();
    this.anchorPool.set(normalized, {
      nodeId: normalized,
      nodeKind: descriptor.nodeKind,
      role: 'activation-source',
      priority: existing?.priority ?? (await this.resolveNodePriority(normalized, descriptor.nodeKind === 'concept' ? 0.65 : 0.55)),
      addedAt: existing?.addedAt ?? now,
      visitedAt: existing?.visitedAt ?? now,
      preview: descriptor.preview,
    });
  }

  async clearAnchors(): Promise<void> {
    this.anchorPool.clear();
  }

  async setCurrentFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
      bookmarkCurrentPath?: boolean;
    } = {},
  ): Promise<void> {
    const normalized = String(focusId || '').trim();
    if (!normalized) return;

    await this.setSourceEntry(normalized, true);
    await this.setAnchorEntry(normalized, true);

    if (options.bookmarkCurrentPath && this.currentPathIndex >= 0) {
      this.bookmarkPathIndex = this.currentPathIndex;
    }
    if (options.resetHistory) {
      this.clearHistory('current');
    }

    this.currentLeadSource = normalized;
    this.currentLeadSourceEventId = null;
    this.branchRootNodeId = normalized;
    this.currentSessionId = createSessionId();
    this.navigationMode = 'explore';
    this.frontier.clear();
    this.visitedBlocks.clear();
    this.exhaustedSources.clear();
    this.followCurrentNodeOnce = false;
    this.clearDeferredExpansionState();

    if (options.includeFocusAsFirst) {
      await this.activateSourceRoot(normalized);
      return;
    }
  }

  async startRoamingFromFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
      startNewSession?: boolean;
    } = {},
  ): Promise<void> {
    await this.setCurrentFocus(focusId, {
      includeFocusAsFirst: options.includeFocusAsFirst ?? true,
      resetHistory: options.resetHistory ?? false,
    });
  }

  async getNextCard(): Promise<QueueItem | null> {
    try {
      const follow = await this.consumeFollowPath();
      if (follow) return follow;

      const sourceRoot = await this.consumePendingSourceRoot();
      if (sourceRoot) return sourceRoot;

      const frontier = await this.consumeFrontier();
      if (frontier) return frontier;

      if (this.frontier.size === 0 && (this.hasDeferredExpansionPending() || this.canBootstrapCurrentActivation())) {
        await this.ensureFrontierReady();
        const recoveredFrontier = await this.consumeFrontier();
        if (recoveredFrontier) return recoveredFrontier;
      }

      this.markCurrentLeadSourceExhausted();

      return this.consumeNextSourceRoot();
    } catch (error) {
      logger.error('Failed to resolve hyperspace next card:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to resolve hyperspace next card', error);
    }
  }

  async jumpToHistoryNode(nodeId: string): Promise<boolean> {
    const target = this.findLatestHistoryEntry(nodeId);
    if (!target) return false;

    const sessionPath = this.buildPathEntriesForSession(target.sessionId);
    const targetIndex = sessionPath.findIndex((entry) => entry.eventId === target.eventId);
    if (targetIndex < 0) return false;

    if (this.currentPathIndex >= 0 && this.currentPathIndex < this.displayPath.length) {
      this.bookmarkPathIndex = this.currentPathIndex;
    }

    this.displayPath = sessionPath.map((entry) => entry.nodeId);
    this.displayPathEventIds = sessionPath.map((entry) => entry.eventId);
    this.currentPathIndex = targetIndex;
    this.navigationMode = 'follow';
    this.followCurrentNodeOnce = true;
    this.currentSessionId = target.sessionId;
    this.currentLeadSource = target.branchRootNodeId ?? target.focusId ?? target.nodeId;
    this.currentLeadSourceEventId = this.findSourceEventIdInHistory(
      this.historyStore.toArray(),
      this.currentLeadSource,
      target.sessionId,
    );
    this.branchRootNodeId = target.branchRootNodeId ?? target.focusId ?? target.nodeId;
    return true;
  }

  getHistoryCount(sessionId?: string | null): number {
    this.syncHistoryCapacity();
    return this.historyStore.getCount(sessionId);
  }

  getHistoryPage(request: NeuralHistoryPageRequest): NeuralHistoryPageResult {
    this.syncHistoryCapacity();
    return this.historyStore.getPage(request);
  }

  getHistorySnapshot(): NeuralRoamHistoryEntry[] {
    this.syncHistoryCapacity();
    return this.historyStore.toArray();
  }

  getHistoryEntryByEventId(eventId: string): NeuralRoamHistoryEntry | null {
    this.syncHistoryCapacity();
    return this.historyStore.findByEventId(eventId);
  }

  getHistoryEntriesByNodeId(nodeId: string): NeuralRoamHistoryEntry[] {
    this.syncHistoryCapacity();
    return this.historyStore.getEntriesByNodeId(nodeId);
  }

  getHistoryHitCount(nodeId: string): number {
    this.syncHistoryCapacity();
    return this.historyStore.getHitCount(nodeId);
  }

  recordAssociatedReviewVisit(input: AssociatedReviewVisitInput): NeuralRoamHistoryEntry | null {
    const nodeId = String(input.nodeId || '').trim();
    if (!nodeId) {
      return null;
    }

    if (!this.currentSessionId) {
      this.currentSessionId = createSessionId();
    }

    const explicitSourceEventId = String(input.sourceEventId || '').trim();
    const explicitSourceEntry = explicitSourceEventId
      ? this.findHistoryEntryByEventId(explicitSourceEventId)
      : null;
    const sourceNodeId = String(input.sourceNodeId || '').trim()
      || explicitSourceEntry?.nodeId
      || this.getCurrentPathNodeId()
      || this.currentLeadSource
      || null;
    const sourceEntry = explicitSourceEntry ?? (sourceNodeId ? this.findLatestHistoryEntry(sourceNodeId) : null);
    const sourceEventId = explicitSourceEventId
      || sourceEntry?.eventId
      || this.getCurrentPathEventId();
    const sessionId = sourceEntry?.sessionId ?? this.currentSessionId;
    const focusId = sourceEntry?.focusId ?? this.currentLeadSource;
    const branchRootNodeId = sourceEntry?.branchRootNodeId ?? this.branchRootNodeId ?? focusId ?? nodeId;
    const reason = String(input.reason || '').trim() || buildReasonText('associated-review');
    const historyEntry = this.createHistoryEntry(
      nodeId,
      sessionId,
      normalizePreview(String(input.nodePreview || nodeId), this.previewLength),
      {
        associationType: 'associated-review',
        reason,
        focusId,
        isVirtual: false,
        activationKind: 'follow-path',
        sourceRole: null,
        origin: 'follow-path',
        sourceNodeId,
        sourceEventId,
        branchRootNodeId,
        depth: sourceEntry?.depth == null ? null : sourceEntry.depth + 1,
        conductionScore: null,
      },
    );

    this.commitHistoryEntry(historyEntry);
    return { ...historyEntry };
  }

  getSessionFocusStack(): NeuralRoamHistoryEntry[] {
    if (!this.currentSessionId) return [];
    const deduped = new Map<string, NeuralRoamHistoryEntry>();
    for (const entry of this.historyStore.toArray()) {
      if (entry.sessionId !== this.currentSessionId || entry.activationKind !== 'source-root') {
        continue;
      }
      deduped.set(entry.nodeId, entry);
    }
    return Array.from(deduped.values()).sort((a, b) => b.visitedAt - a.visitedAt);
  }

  getNavigationState(): NeuralNavigationState {
    return {
      currentPathIndex: this.currentPathIndex,
      currentNodeId: this.getCurrentPathNodeId(),
      currentEventId: this.getCurrentPathEventId(),
      navigationMode: this.navigationMode,
      engineMode: ENGINE_MODE,
      engineSessionId: this.currentSessionId,
      hasBookmark: this.bookmarkPathIndex !== null,
      pathLength: this.displayPath.length,
      sessionId: this.currentSessionId,
    };
  }

  getCurrentBatchSnapshot(): NeuralRoamBatchSnapshot | null {
    const navigationState = this.getNavigationState();
    const currentEntry = navigationState.currentEventId
      ? this.findHistoryEntryByEventId(navigationState.currentEventId)
      : null;
    const roundNodes: NeuralRoamBatchNode[] = currentEntry ? [{
      eventId: currentEntry.eventId,
      nodeId: currentEntry.nodeId,
      nodePreview: currentEntry.nodePreview,
      isVirtual: currentEntry.isVirtual,
      associationType: currentEntry.associationType,
      reason: currentEntry.reason,
      visitedAt: currentEntry.visitedAt,
      sourceNodeId: currentEntry.sourceNodeId,
      sourceEventId: currentEntry.sourceEventId,
    }] : [];
    const focusNodeId = this.currentLeadSource;
    const focusPreview = focusNodeId
      ? this.sourcePool.get(focusNodeId)?.preview
        ?? this.anchorPool.get(focusNodeId)?.preview
        ?? this.findLatestHistoryEntry(focusNodeId)?.nodePreview
        ?? normalizePreview(focusNodeId, this.previewLength)
      : null;

    return {
      kind: 'hyperspace-current-node',
      engineMode: ENGINE_MODE,
      navigationState,
      focusNodeId,
      focusNodePreview: focusPreview,
      currentNodeId: navigationState.currentNodeId,
      roundSize: roundNodes.length,
      viewedCount: roundNodes.length,
      remainingCount: 0,
      roundNodes,
      recentPath: this.buildRecentPathEntries(),
      sourceSnapshot: this.getSourceSnapshot(),
      seedSnapshot: this.getSourceSnapshot().map((entry) => ({
        nodeId: entry.nodeId,
        nodePreview: entry.nodePreview,
        priority: entry.priority,
        addedAt: entry.addedAt,
        visitedAt: entry.visitedAt,
      })),
      anchorSnapshot: this.getAnchorSnapshot(),
    };
  }

  setNavigationMode(mode: NeuralNavigationMode): void {
    this.navigationMode = mode;
  }

  returnToBookmark(): boolean {
    if (this.bookmarkPathIndex === null) return false;
    if (this.bookmarkPathIndex < 0 || this.bookmarkPathIndex >= this.displayPath.length) {
      this.bookmarkPathIndex = null;
      return false;
    }
    this.currentPathIndex = this.bookmarkPathIndex;
    this.bookmarkPathIndex = null;
    this.navigationMode = 'follow';
    this.followCurrentNodeOnce = true;
    return true;
  }

  clearHistory(scope: 'current' | 'all' = 'current'): void {
    if (scope === 'all' || !this.currentSessionId) {
      this.historyStore.clear();
    } else {
      this.historyStore.removeBySession(this.currentSessionId);
    }
    this.displayPath = [];
    this.displayPathEventIds = [];
    this.currentPathIndex = -1;
    this.bookmarkPathIndex = null;
    this.currentLeadSource = null;
    this.currentLeadSourceEventId = null;
    this.branchRootNodeId = null;
    this.currentSessionId = null;
    this.visitedBlocks.clear();
    this.frontier.clear();
    this.exhaustedSources.clear();
    this.followCurrentNodeOnce = false;
    this.clearDeferredExpansionState();
  }

  async getPathItemByNodeId(blockId: string, options: PathItemOptions = {}): Promise<QueueItem | null> {
    const blockData = await this.graphProvider.fetchBlockData(blockId);
    if (!blockData) return null;
    const latest = this.findLatestHistoryEntry(blockId);
    const associationType = latest?.associationType ?? 'manual-jump';
    const reason = latest?.reason ?? buildReasonText(associationType);

    if (options.focusPath !== false) {
      const targetIndex = this.findLatestPathIndex(blockId);
      if (targetIndex >= 0) {
        if (this.currentPathIndex >= 0 && this.currentPathIndex !== targetIndex) {
          this.bookmarkPathIndex = this.currentPathIndex;
        }
        this.currentPathIndex = targetIndex;
        this.navigationMode = 'follow';
        this.followCurrentNodeOnce = false;
      }
    }

    return this.buildQueueItem(blockData, associationType, reason);
  }

  getActivationTrace(eventId: string): NeuralActivationTrace | null {
    const target = this.findHistoryEntryByEventId(eventId);
    if (!target) return null;

    if (target.traceQuality === 'legacy') {
      return {
        targetEventId: target.eventId,
        targetNodeId: target.nodeId,
        branchRootNodeId: target.branchRootNodeId,
        isExact: false,
        degradedReason: 'legacy',
        steps: [this.toTraceStep(target)],
      };
    }

    const reversed: NeuralActivationTraceStep[] = [];
    const seen = new Set<string>();
    let current: NeuralRoamHistoryEntry | null = target;
    let degradedReason: string | null = null;

    while (current) {
      if (seen.has(current.eventId)) {
        degradedReason = degradedReason ?? 'cycle';
        break;
      }

      seen.add(current.eventId);
      reversed.push(this.toTraceStep(current));

      if (!current.sourceEventId) {
        if (current.sourceNodeId && current.sourceNodeId !== current.nodeId) {
          reversed.push(this.buildSyntheticRootStep(current, current.sourceNodeId));
          degradedReason = degradedReason ?? 'missing-source-event';
        }
        break;
      }

      const sourceEntry = this.findHistoryEntryByEventId(current.sourceEventId);
      if (!sourceEntry) {
        if (current.sourceNodeId && current.sourceNodeId !== current.nodeId) {
          reversed.push(this.buildSyntheticRootStep(current, current.sourceNodeId));
        }
        degradedReason = degradedReason ?? 'missing-source-entry';
        break;
      }
      current = sourceEntry;
    }

    const steps = reversed.reverse();
    if (target.branchRootNodeId && steps.length > 0 && !steps.some((step) => step.nodeId === target.branchRootNodeId)) {
      steps.unshift(this.buildSyntheticRootStep(target, target.branchRootNodeId));
      degradedReason = degradedReason ?? 'branch-root-unresolved';
    }

    return {
      targetEventId: target.eventId,
      targetNodeId: target.nodeId,
      branchRootNodeId: target.branchRootNodeId,
      isExact: degradedReason === null,
      degradedReason,
      steps,
    };
  }

  exportSourcePoolState(): HyperspacePersistedEntry[] {
    return Array.from(this.sourcePool.values()).map((entry) => ({
      nodeId: entry.nodeId,
      nodeKind: entry.nodeKind,
      role: entry.role,
      priority: entry.priority,
      addedAt: entry.addedAt,
      visitedAt: entry.visitedAt,
      nodePreview: entry.preview,
    }));
  }

  exportAnchorPoolState(): HyperspacePersistedEntry[] {
    return Array.from(this.anchorPool.values()).map((entry) => ({
      nodeId: entry.nodeId,
      nodeKind: entry.nodeKind,
      role: entry.role,
      priority: entry.priority,
      addedAt: entry.addedAt,
      visitedAt: entry.visitedAt,
      nodePreview: entry.preview,
    }));
  }

  exportSessionState(): HyperspaceSessionState {
    this.syncHistoryCapacity();
    return {
      displayPath: [...this.displayPath],
      displayPathEventIds: [...this.displayPathEventIds],
      currentPathIndex: this.currentPathIndex,
      navigationMode: this.navigationMode,
      bookmarkPathIndex: this.bookmarkPathIndex,
      history: this.historyStore.toArray(),
      currentLeadSource: this.currentLeadSource,
      currentLeadSourceEventId: this.currentLeadSourceEventId,
      branchRootNodeId: this.branchRootNodeId,
      currentSessionId: this.currentSessionId,
      visitedBlocks: Array.from(this.visitedBlocks),
      frontier: Array.from(this.frontier.values()).map((entry) => ({ ...entry })),
      exhaustedSources: Array.from(this.exhaustedSources),
    };
  }

  restoreSourcePoolState(entries: unknown): void {
    this.sourcePool.clear();
    if (!Array.isArray(entries)) return;
    for (const raw of entries) {
      if (!isRecord(raw)) continue;
      const nodeId = typeof raw.nodeId === 'string' ? raw.nodeId.trim() : '';
      if (!nodeId) continue;
      this.sourcePool.set(nodeId, {
        nodeId,
        nodeKind: normalizeNodeKind(raw.nodeKind),
        role: normalizeSourceRole(raw.role === 'activation-source' ? raw.role : 'activation-source'),
        priority: normalizePriority(raw.priority, 0.6),
        addedAt: Number.isFinite(Number(raw.addedAt)) ? Number(raw.addedAt) : Date.now(),
        visitedAt: Number.isFinite(Number(raw.visitedAt)) ? Number(raw.visitedAt) : Date.now(),
        preview: normalizePreview(typeof raw.nodePreview === 'string' ? raw.nodePreview : nodeId, this.previewLength),
      });
    }
  }

  restoreAnchorPoolState(entries: unknown): void {
    this.anchorPool.clear();
    if (!Array.isArray(entries)) return;
    for (const raw of entries) {
      if (!isRecord(raw)) continue;
      const nodeId = typeof raw.nodeId === 'string' ? raw.nodeId.trim() : '';
      if (!nodeId) continue;
      this.anchorPool.set(nodeId, {
        nodeId,
        nodeKind: normalizeNodeKind(raw.nodeKind),
        role: normalizeSourceRole(raw.role),
        priority: normalizePriority(raw.priority, 0.55),
        addedAt: Number.isFinite(Number(raw.addedAt)) ? Number(raw.addedAt) : Date.now(),
        visitedAt: Number.isFinite(Number(raw.visitedAt)) ? Number(raw.visitedAt) : Date.now(),
        preview: normalizePreview(typeof raw.nodePreview === 'string' ? raw.nodePreview : nodeId, this.previewLength),
      });
    }
  }

  restoreSessionState(state: Partial<HyperspaceSessionState> | null | undefined): void {
    this.clearDeferredExpansionState();
    this.syncHistoryCapacity();
    if (!isRecord(state)) {
      this.clearHistory('all');
      return;
    }

    this.displayPath = Array.isArray(state.displayPath) ? state.displayPath.map(String).filter(Boolean) : [];
    const normalizedHistory = Array.isArray(state.history)
      ? state.history
        .map((entry, index) => this.normalizeHistoryEntry(entry, index))
        .filter((entry): entry is NeuralRoamHistoryEntry => Boolean(entry))
      : [];
    this.historyStore.replaceAll(normalizedHistory);
    this.displayPathEventIds = Array.isArray(state.displayPathEventIds)
      ? state.displayPathEventIds.map(String).filter(Boolean)
      : this.rebuildDisplayPathEventIds(this.displayPath, normalizedHistory);
    this.currentPathIndex = this.displayPath.length > 0
      ? clamp(Number(state.currentPathIndex) || 0, 0, this.displayPath.length - 1)
      : -1;
    this.navigationMode = state.navigationMode === 'follow' ? 'follow' : 'explore';
    this.bookmarkPathIndex = Number.isFinite(Number(state.bookmarkPathIndex))
      ? clamp(Number(state.bookmarkPathIndex), 0, Math.max(0, this.displayPath.length - 1))
      : null;
    this.currentLeadSource = typeof state.currentLeadSource === 'string' && state.currentLeadSource ? state.currentLeadSource : null;
    this.currentLeadSourceEventId = typeof state.currentLeadSourceEventId === 'string' && state.currentLeadSourceEventId ? state.currentLeadSourceEventId : null;
    this.branchRootNodeId = typeof state.branchRootNodeId === 'string' && state.branchRootNodeId ? state.branchRootNodeId : this.currentLeadSource;
    this.currentSessionId = typeof state.currentSessionId === 'string' && state.currentSessionId ? state.currentSessionId : null;
    this.visitedBlocks = new Set(Array.isArray(state.visitedBlocks) ? state.visitedBlocks.map(String).filter(Boolean) : this.displayPath);
    this.frontier.clear();
    if (Array.isArray(state.frontier)) {
      for (const raw of state.frontier) {
        if (!isRecord(raw)) continue;
        const nodeId = typeof raw.nodeId === 'string' ? raw.nodeId.trim() : '';
        if (!nodeId) continue;
        this.frontier.set(nodeId, {
          nodeId,
          fromNodeId: typeof raw.fromNodeId === 'string' && raw.fromNodeId ? raw.fromNodeId : null,
          fromEventId: typeof raw.fromEventId === 'string' && raw.fromEventId ? raw.fromEventId : null,
          rootSourceNodeId: typeof raw.rootSourceNodeId === 'string' && raw.rootSourceNodeId ? raw.rootSourceNodeId : null,
          associationType: this.normalizeAssociationType(raw.associationType),
          channel: this.normalizeChannel(raw.channel),
          origin: normalizeOrigin(raw.origin, this.normalizeAssociationType(raw.associationType)),
          depth: Number.isFinite(Number(raw.depth)) ? Number(raw.depth) : 1,
          treeDistance: Number.isFinite(Number(raw.treeDistance)) ? Number(raw.treeDistance) : null,
          activationScore: Number.isFinite(Number(raw.activationScore)) ? Number(raw.activationScore) : 1,
          inheritedPriority: Number.isFinite(Number(raw.inheritedPriority)) ? Number(raw.inheritedPriority) : 0.6,
          conductionProbability: Number.isFinite(Number(raw.conductionProbability)) ? Number(raw.conductionProbability) : 0.5,
        });
      }
    }
    this.exhaustedSources = new Set(Array.isArray(state.exhaustedSources) ? state.exhaustedSources.map(String).filter(Boolean) : []);
  }

  private getSettings(): HyperspaceSettings {
    return this.getSettingsSnapshot() ?? DEFAULT_HYPERSPACE_SETTINGS;
  }

  private resolveExcerptInjectionSource(
    context: HyperspaceExcerptInjectionContext,
  ): NeuralRoamHistoryEntry | null {
    const explicitEventId = String(context.currentEventId || '').trim();
    if (explicitEventId) {
      return this.findHistoryEntryByEventId(explicitEventId);
    }

    const explicitNodeId = String(context.currentNodeId || '').trim();
    if (explicitNodeId && this.currentSessionId) {
      const entries = this.getHistoryEntriesByNodeId(explicitNodeId)
        .filter((entry) => entry.sessionId === this.currentSessionId);
      if (entries.length > 0) {
        return entries[entries.length - 1];
      }
    }

    const currentEventId = this.getCurrentPathEventId();
    if (currentEventId) {
      return this.findHistoryEntryByEventId(currentEventId);
    }

    return null;
  }

  private computeExcerptInjectionScore(sourceScore: number | null | undefined): number {
    const carryDecay = clamp(this.getSettings().activationCarryDecay, 0.1, 1);
    const baseScore = clamp(Number(sourceScore) || 1, 0.05, 1);
    return clamp(baseScore * carryDecay, 0.05, 1);
  }

  private async consumeFollowPath(): Promise<QueueItem | null> {
    if (!this.followCurrentNodeOnce && this.navigationMode !== 'follow') return null;
    if (this.followCurrentNodeOnce) {
      this.followCurrentNodeOnce = false;
      const current = this.getCurrentPathNodeId();
      return current ? this.getPathItemByNodeId(current, { focusPath: false }) : null;
    }

    const nextIndex = this.currentPathIndex + 1;
    if (nextIndex >= this.displayPath.length) {
      this.navigationMode = 'explore';
      return null;
    }

    this.currentPathIndex = nextIndex;
    const current = this.getCurrentPathNodeId();
    return current ? this.getPathItemByNodeId(current, { focusPath: false }) : null;
  }

  private async consumePendingSourceRoot(): Promise<QueueItem | null> {
    if (this.currentLeadSource && !this.hasSourceRootInCurrentSession(this.currentLeadSource)) {
      return this.activateSourceRoot(this.currentLeadSource);
    }
    return null;
  }

  private async consumeNextSourceRoot(): Promise<QueueItem | null> {
    const nextSource = this.selectNextSource();
    if (!nextSource) return null;
    if (nextSource.nodeId === this.currentLeadSource && this.hasSourceRootInCurrentSession(nextSource.nodeId)) {
      return null;
    }
    this.currentLeadSource = nextSource.nodeId;
    this.branchRootNodeId = nextSource.nodeId;
    return this.activateSourceRoot(nextSource.nodeId);
  }

  private async consumeFrontier(): Promise<QueueItem | null> {
    while (this.frontier.size > 0) {
      const candidate = this.pickBestFrontierNode();
      if (!candidate) break;
      this.frontier.delete(candidate.nodeId);

      if (this.visitedBlocks.has(candidate.nodeId)) {
        continue;
      }

      const blockData = await this.graphProvider.fetchBlockData(candidate.nodeId);
      if (!blockData) {
        continue;
      }

      const activationKind: NeuralActivationKind = candidate.associationType === 'source'
        ? 'source-root'
        : this.isTreeAssociation(candidate.associationType)
          ? 'tree-edge'
          : 'graph-edge';
      const historyEntry = this.createHistoryEntry(
        candidate.nodeId,
        this.currentSessionId ?? createSessionId(),
        normalizePreview(blockData.content || candidate.nodeId, this.previewLength),
        {
          associationType: candidate.associationType,
          reason: buildReasonText(candidate.origin ?? candidate.associationType),
          focusId: candidate.rootSourceNodeId ?? this.currentLeadSource,
          isVirtual: false,
          activationKind,
          origin: candidate.origin,
          sourceNodeId: candidate.fromNodeId,
          sourceEventId: candidate.fromEventId,
          branchRootNodeId: candidate.rootSourceNodeId ?? candidate.nodeId,
          sourceRole: candidate.associationType === 'source' ? 'activation-source' : null,
          depth: candidate.associationType === 'source' ? 0 : candidate.depth,
          conductionScore: candidate.activationScore,
        },
      );

      this.commitHistoryEntry(historyEntry);
      if (candidate.associationType === 'source') {
        this.currentLeadSource = candidate.nodeId;
        this.currentLeadSourceEventId = historyEntry.eventId;
        this.branchRootNodeId = candidate.nodeId;
      }
      this.queueDeferredExpansion({
        nodeId: candidate.nodeId,
        fromNodeId: candidate.nodeId,
        fromEventId: historyEntry.eventId,
        rootSourceNodeId: candidate.rootSourceNodeId ?? candidate.nodeId,
        depth: Math.max(1, candidate.depth + 1),
        baseScore: candidate.activationScore,
        layersRemaining: this.getSettings().maxLayersPerRepetition,
        epoch: this.expansionEpoch,
      });

      return this.buildQueueItem(blockData, candidate.associationType, historyEntry.reason);
    }
    return null;
  }

  private async activateSourceRoot(nodeId: string): Promise<QueueItem | null> {
    const descriptor = await this.resolveNodeDescriptor(nodeId);
    if (!descriptor.blockData) {
      return null;
    }
    if (!this.currentSessionId) {
      this.currentSessionId = createSessionId();
    }

    const historyEntry = this.createHistoryEntry(nodeId, this.currentSessionId, descriptor.preview, {
      associationType: 'source',
      reason: buildReasonText('source'),
      focusId: nodeId,
      isVirtual: descriptor.nodeKind === 'virtual',
      activationKind: 'source-root',
      sourceRole: 'activation-source',
      origin: 'source',
      branchRootNodeId: nodeId,
      depth: 0,
      conductionScore: 1,
    });
    this.currentLeadSource = nodeId;
    this.currentLeadSourceEventId = historyEntry.eventId;
    this.branchRootNodeId = nodeId;
    this.commitHistoryEntry(historyEntry);
    this.queueDeferredExpansion({
      nodeId,
      fromNodeId: nodeId,
      fromEventId: historyEntry.eventId,
      rootSourceNodeId: nodeId,
      depth: 1,
      baseScore: 1,
      layersRemaining: this.getSettings().maxLayersPerRepetition,
      epoch: this.expansionEpoch,
    });
    return this.buildQueueItem(descriptor.blockData, 'source', buildReasonText('source'));
  }

  private async expandFromNode(
    nodeId: string,
    fromNodeId: string | null,
    fromEventId: string | null,
    rootSourceNodeId: string | null,
    depth: number,
    baseScore: number,
    layersRemaining: number,
    expansionTrail = new Set<string>(),
    expectedEpoch = this.expansionEpoch,
  ): Promise<void> {
    const settings = this.getSettings();
    if (depth > settings.maxTotalDepth || layersRemaining <= 0) {
      return;
    }

    if (expectedEpoch !== this.expansionEpoch) {
      return;
    }

    const expansionKey = `${nodeId}::${depth}`;
    if (expansionTrail.has(expansionKey)) {
      return;
    }
    expansionTrail.add(expansionKey);

    const sourcePriority = await this.resolveNodePriority(nodeId, this.sourcePool.get(rootSourceNodeId ?? '')?.priority ?? 0.6);
    const edges = await this.fetchHyperspaceEdgesCompat(nodeId, settings);

    if (expectedEpoch !== this.expansionEpoch) {
      return;
    }

    const candidates: FrontierNode[] = [];
    for (const edge of edges) {
      if (expectedEpoch !== this.expansionEpoch) {
        return;
      }
      if (this.visitedBlocks.has(edge.nodeId)) {
        continue;
      }

      const conduction = this.computeConductionProbability(edge, sourcePriority);
      const score = this.computeActivationScore(baseScore, depth, edge, conduction);
      const frontierNode: FrontierNode = {
        nodeId: edge.nodeId,
        fromNodeId,
        fromEventId,
        rootSourceNodeId,
        associationType: edge.associationType,
        channel: edge.channel,
        origin: normalizeOrigin(edge.origin, edge.associationType),
        depth,
        treeDistance: Number.isFinite(Number(edge.distance)) ? Number(edge.distance) : null,
        activationScore: score,
        inheritedPriority: sourcePriority,
        conductionProbability: conduction,
      };
      const existing = this.frontier.get(edge.nodeId);
      if (!existing || score > existing.activationScore) {
        this.frontier.set(edge.nodeId, frontierNode);
      }
      candidates.push(frontierNode);
    }

    if (layersRemaining <= 1) {
      return;
    }

    const recursiveCandidates = candidates
      .filter((candidate) => candidate.depth < settings.maxTotalDepth)
      .sort((a, b) => b.activationScore - a.activationScore)
      .slice(0, 4);

    for (const candidate of recursiveCandidates) {
      const nextTrail = new Set(expansionTrail);
      await this.expandFromNode(
        candidate.nodeId,
        candidate.nodeId,
        null,
        rootSourceNodeId,
        candidate.depth + 1,
        candidate.activationScore,
        layersRemaining - 1,
        nextTrail,
        expectedEpoch,
      );
    }
  }

  private buildExpansionKey(task: DeferredExpansionTask): string {
    return [
      task.nodeId,
      task.rootSourceNodeId ?? '',
      String(task.depth),
      String(task.layersRemaining),
    ].join('::');
  }

  private queueDeferredExpansion(task: DeferredExpansionTask): void {
    const settings = this.getSettings();
    if (task.epoch !== this.expansionEpoch) {
      return;
    }
    if (task.layersRemaining <= 0 || task.depth > settings.maxTotalDepth) {
      return;
    }
    if (task.fromEventId && this.expandedActivationEventIds.has(task.fromEventId)) {
      return;
    }

    const key = this.buildExpansionKey(task);
    if (this.queuedExpansionKeys.has(key)) {
      return;
    }

    this.queuedExpansionKeys.add(key);
    this.deferredExpansionQueue.push({ ...task });
    this.scheduleDeferredExpansionPump();
  }

  private scheduleDeferredExpansionPump(): void {
    if (this.deferredExpansionTimer !== null || this.deferredExpansionInFlight) {
      return;
    }

    this.deferredExpansionTimer = setTimeout(() => {
      this.deferredExpansionTimer = null;
      void this.flushDeferredExpansion().catch((error) => {
        logger.warn('Failed to flush deferred hyperspace expansion:', error);
      });
    }, 0);
  }

  private async flushDeferredExpansion(): Promise<void> {
    if (this.deferredExpansionTimer !== null) {
      clearTimeout(this.deferredExpansionTimer);
      this.deferredExpansionTimer = null;
    }

    if (this.deferredExpansionInFlight) {
      await this.deferredExpansionInFlight;
      return;
    }

    const epoch = this.expansionEpoch;
    const run = (async () => {
      while (this.deferredExpansionQueue.length > 0) {
        const task = this.deferredExpansionQueue.shift();
        if (!task) {
          continue;
        }

        const key = this.buildExpansionKey(task);
        this.queuedExpansionKeys.delete(key);

        if (task.epoch !== this.expansionEpoch) {
          continue;
        }

        try {
          await this.expandFromNode(
            task.nodeId,
            task.fromNodeId,
            task.fromEventId,
            task.rootSourceNodeId,
            task.depth,
            task.baseScore,
            task.layersRemaining,
            new Set<string>(),
            task.epoch,
          );
          if (task.fromEventId && task.epoch === this.expansionEpoch) {
            this.expandedActivationEventIds.add(task.fromEventId);
          }
        } catch (error) {
          logger.warn('Deferred hyperspace expansion failed:', error);
        }

        if (epoch !== this.expansionEpoch) {
          return;
        }
      }
    })();

    this.deferredExpansionInFlight = run;

    try {
      await run;
    } finally {
      if (this.deferredExpansionInFlight === run) {
        this.deferredExpansionInFlight = null;
      }
      if (this.deferredExpansionQueue.length > 0 && this.expansionEpoch === epoch) {
        this.scheduleDeferredExpansionPump();
      }
    }
  }

  private async ensureFrontierReady(): Promise<void> {
    if (this.frontier.size > 0) {
      return;
    }

    if (this.hasDeferredExpansionPending()) {
      await this.flushDeferredExpansion();
      if (this.frontier.size > 0) {
        return;
      }
    }

    if (!this.bootstrapCurrentActivationExpansion()) {
      return;
    }

    await this.flushDeferredExpansion();
  }

  private hasDeferredExpansionPending(): boolean {
    return this.deferredExpansionQueue.length > 0
      || this.deferredExpansionTimer !== null
      || this.deferredExpansionInFlight !== null;
  }

  private canBootstrapCurrentActivation(): boolean {
    const currentEventId = this.getCurrentPathEventId();
    if (!currentEventId || this.expandedActivationEventIds.has(currentEventId)) {
      return false;
    }
    return Boolean(this.findHistoryEntryByEventId(currentEventId));
  }

  private bootstrapCurrentActivationExpansion(): boolean {
    const currentEventId = this.getCurrentPathEventId();
    if (!currentEventId || this.expandedActivationEventIds.has(currentEventId)) {
      return false;
    }

    const currentEntry = this.findHistoryEntryByEventId(currentEventId);
    if (!currentEntry) {
      return false;
    }

    this.queueDeferredExpansion({
      nodeId: currentEntry.nodeId,
      fromNodeId: currentEntry.nodeId,
      fromEventId: currentEntry.eventId,
      rootSourceNodeId: currentEntry.branchRootNodeId ?? currentEntry.focusId ?? currentEntry.nodeId,
      depth: Math.max(1, (currentEntry.depth ?? 0) + 1),
      baseScore: Math.max(0.05, Number(currentEntry.conductionScore) || 1),
      layersRemaining: this.getSettings().maxLayersPerRepetition,
      epoch: this.expansionEpoch,
    });
    return true;
  }

  private markCurrentLeadSourceExhausted(): void {
    if (!this.currentLeadSource || this.hasDeferredExpansionPending()) {
      return;
    }
    this.exhaustedSources.add(this.currentLeadSource);
  }

  private clearDeferredExpansionState(): void {
    this.expansionEpoch += 1;
    if (this.deferredExpansionTimer !== null) {
      clearTimeout(this.deferredExpansionTimer);
      this.deferredExpansionTimer = null;
    }
    this.deferredExpansionQueue = [];
    this.queuedExpansionKeys.clear();
    this.expandedActivationEventIds.clear();
    this.deferredExpansionInFlight = null;
  }

  private async fetchHyperspaceEdgesCompat(
    nodeId: string,
    settings: HyperspaceSettings,
  ): Promise<NeuralGraphEdge[]> {
    const provider = this.graphProvider as unknown as {
      fetchHyperspaceEdges?: (nodeId: string, options: {
        engineMode: NeuralEngineMode;
        includeTreeChannels?: HyperspaceSettings['treeChannels'];
      }) => Promise<NeuralGraphEdge[]>;
      fetchEdges?: (nodeId: string) => Promise<Array<{
        nodeId: string;
        associationType: NeuralAssociationType;
        weight: number;
        channel?: NeuralGraphChannel;
        origin?: NeuralPropagationOrigin | null;
        distance?: number;
        sourcePriority?: number | null;
        targetPriority?: number | null;
        rootId?: string | null;
      }>>;
    };

    if (typeof provider.fetchHyperspaceEdges === 'function') {
      return provider.fetchHyperspaceEdges(nodeId, {
        engineMode: ENGINE_MODE,
        includeTreeChannels: settings.treeChannels,
      });
    }

    if (typeof provider.fetchEdges === 'function') {
      const legacyEdges = await provider.fetchEdges(nodeId);
      return legacyEdges.map((edge) => ({
        nodeId: edge.nodeId,
        associationType: edge.associationType,
        weight: edge.weight,
        channel: edge.channel ?? (edge.associationType === 'descriptor' ? 'element-link' : 'concept-map'),
        origin: normalizeOrigin(edge.origin, edge.associationType),
        distance: edge.distance,
        sourcePriority: edge.sourcePriority ?? null,
        targetPriority: edge.targetPriority ?? null,
        rootId: edge.rootId ?? null,
      }));
    }

    return [];
  }

  private computeActivationScore(
    baseScore: number,
    depth: number,
    edge: NeuralGraphEdge,
    conductionProbability: number,
  ): number {
    const settings = this.getSettings();
    const channelFactor = this.getChannelFactor(edge.associationType);
    const depthPenalty = 1 / (1 + Math.max(depth - 1, 0) * 0.35);
    const treeFactor = this.isTreeAssociation(edge.associationType)
      ? 1 / (1 + Math.max((edge.distance ?? 1) - 1, 0) * settings.siblingDistancePenalty * 0.35)
      : 1;
    return baseScore * settings.activationCarryDecay * conductionProbability * channelFactor * depthPenalty * treeFactor;
  }

  private computeConductionProbability(edge: NeuralGraphEdge, sourcePriority: number): number {
    const settings = this.getSettings();
    const targetPriority = normalizePriority(edge.targetPriority, 0.5);
    const combinedPriority = this.computePrioritySignal(targetPriority, this.getGroupPriority(edge.associationType));
    const distanceFactor = edge.associationType === 'tree-sibling'
      ? 1 / (1 + Math.max(edge.distance ?? 1, 1) * settings.siblingDistancePenalty)
      : 1;
    const rootParentFactor = edge.associationType === 'tree-parent' && edge.rootId && edge.nodeId === edge.rootId
      ? settings.articleRootParentConductionProbability
      : 1;
    const sourceFactor = clamp(0.55 + sourcePriority * 0.45, 0.1, 1);
    return clamp(combinedPriority * distanceFactor * rootParentFactor * sourceFactor, 0.02, 1);
  }

  private getChannelFactor(type: NeuralAssociationType): number {
    switch (type) {
      case 'concept-link': return 1.12;
      case 'element-link': return 0.96;
      case 'descriptor': return 0.88;
      case 'tree-child': return 0.92;
      case 'tree-parent': return 0.82;
      case 'tree-sibling': return 0.74;
      default: return 1;
    }
  }

  private combinePriority(originalP: number, groupP: number): number {
    const op = 1 - clamp(originalP, 0, 1);
    const gp = 1 - clamp(groupP, 0, 1);
    return 1 - op * gp;
  }

  private computePrioritySignal(nodePriority: number, groupPriority: number): number {
    return clamp(1 - this.combinePriority(1 - nodePriority, groupPriority), 0.05, 1);
  }

  private getGroupPriority(type: NeuralAssociationType): number {
    const settings = this.getSettings();
    switch (type) {
      case 'concept-link':
        return settings.conceptLinkGroupPriority;
      case 'element-link':
      case 'descriptor':
        return settings.elementLinkGroupPriority;
      case 'tree-child':
        return settings.treeChildGroupPriority;
      case 'tree-parent':
        return settings.treeParentGroupPriority;
      case 'tree-sibling':
        return settings.treeSiblingBaseGroupPriority;
      default:
        return settings.elementLinkGroupPriority;
    }
  }

  private async resolveNodeDescriptor(nodeId: string): Promise<{ blockData: BlockData | null; nodeKind: NeuralSourceNodeKind; preview: string }> {
    const blockData = await this.graphProvider.fetchBlockData(nodeId);
    if (!blockData) {
      return { blockData: null, nodeKind: 'virtual', preview: normalizePreview(nodeId, this.previewLength) };
    }

    let nodeKind: NeuralSourceNodeKind = 'element';
    try {
      nodeKind = await this.graphProvider.isConceptCard(nodeId) ? 'concept' : 'element';
    } catch (error) {
      logger.debug('Failed to resolve node kind for hyperspace source', { nodeId, error });
    }
    return { blockData, nodeKind, preview: normalizePreview(blockData.content || nodeId, this.previewLength) };
  }

  private async resolveNodePriority(nodeId: string, fallback: number): Promise<number> {
    try {
      const resolved = await this.graphProvider.fetchNodePriority(nodeId);
      return normalizePriority(resolved, fallback);
    } catch {
      return fallback;
    }
  }

  private hasSourceRootInCurrentSession(nodeId: string): boolean {
    if (!this.currentSessionId) return false;
    return this.historyStore.toArray().some((entry) =>
      entry.sessionId === this.currentSessionId
      && entry.nodeId === nodeId
      && entry.activationKind === 'source-root'
    );
  }

  private selectNextSource(): SourceState | null {
    const candidates = Array.from(this.sourcePool.values())
      .filter((entry) => !this.exhaustedSources.has(entry.nodeId))
      .sort((a, b) => (b.priority - a.priority) || (b.visitedAt - a.visitedAt));
    return candidates[0] ?? null;
  }

  private pickBestFrontierNode(): FrontierNode | null {
    const settings = this.getSettings();
    const candidates = Array.from(this.frontier.values())
      .sort((a, b) =>
        (b.activationScore - a.activationScore)
        || (a.depth - b.depth)
        || (b.conductionProbability - a.conductionProbability)
      )
      .slice(0, 12);

    if (candidates.length === 0) {
      return null;
    }

    if (settings.raceRandomness <= 0) {
      return candidates[0];
    }

    const weighted = candidates.map((candidate) => {
      const jitter = 1 - settings.raceRandomness + this.random() * settings.raceRandomness;
      const weight = Math.max(0.0001, candidate.activationScore * jitter);
      return { candidate, weight };
    });
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
      return candidates[0];
    }

    let threshold = this.random() * totalWeight;
    for (const item of weighted) {
      threshold -= item.weight;
      if (threshold <= 0) {
        return item.candidate;
      }
    }
    return weighted[weighted.length - 1].candidate;
  }

  private commitHistoryEntry(entry: NeuralRoamHistoryEntry): void {
    this.touchSource(entry.branchRootNodeId ?? entry.focusId ?? entry.nodeId);
    this.touchAnchor(entry.nodeId);
    this.syncHistoryCapacity();
    this.historyStore.append(entry);

    if (this.currentPathIndex >= 0 && this.currentPathIndex < this.displayPath.length - 1) {
      this.displayPath = this.displayPath.slice(0, this.currentPathIndex + 1);
      this.displayPathEventIds = this.displayPathEventIds.slice(0, this.currentPathIndex + 1);
    }

    this.displayPath.push(entry.nodeId);
    this.displayPathEventIds.push(entry.eventId);
    this.currentPathIndex = this.displayPath.length - 1;
    this.visitedBlocks.add(entry.nodeId);
  }

  private touchSource(nodeId: string | null): void {
    if (!nodeId) return;
    const entry = this.sourcePool.get(nodeId);
    if (!entry) return;
    this.sourcePool.set(nodeId, { ...entry, visitedAt: Date.now() });
  }

  private touchAnchor(nodeId: string | null): void {
    if (!nodeId) return;
    const entry = this.anchorPool.get(nodeId);
    if (!entry) return;
    this.anchorPool.set(nodeId, { ...entry, visitedAt: Date.now() });
  }

  private buildQueueItem(blockData: BlockData, associationType: NeuralAssociationType, reason: string): QueueItem {
    return {
      id: blockData.id,
      blockId: blockData.id,
      deckId: 'neural-roam',
      blockData,
      associationType,
      reason,
    };
  }

  private getCurrentPathNodeId(): string | null {
    return this.currentPathIndex >= 0 && this.currentPathIndex < this.displayPath.length
      ? this.displayPath[this.currentPathIndex]
      : null;
  }

  private getCurrentPathEventId(): string | null {
    return this.currentPathIndex >= 0 && this.currentPathIndex < this.displayPathEventIds.length
      ? this.displayPathEventIds[this.currentPathIndex]
      : null;
  }

  private findLatestPathIndex(blockId: string): number {
    for (let index = this.displayPath.length - 1; index >= 0; index -= 1) {
      if (this.displayPath[index] === blockId) return index;
    }
    return -1;
  }

  private findLatestHistoryEntry(blockId: string): NeuralRoamHistoryEntry | null {
    const entries = this.historyStore.getEntriesByNodeId(blockId);
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }

  private findHistoryEntryByEventId(eventId: string): NeuralRoamHistoryEntry | null {
    return this.historyStore.findByEventId(eventId);
  }

  private buildPathEntriesForSession(sessionId: string): NeuralRoamHistoryEntry[] {
    const result: NeuralRoamHistoryEntry[] = [];
    for (const entry of this.historyStore.toArray()) {
      if (entry.sessionId !== sessionId) continue;
      if (result[result.length - 1]?.eventId !== entry.eventId) {
        result.push(entry);
      }
    }
    return result;
  }

  private buildRecentPathEntries(limit = 8): NeuralRoamHistoryEntry[] {
    if (!this.currentSessionId) {
      return [];
    }

    return this.historyStore.toArray()
      .filter((entry) => entry.sessionId === this.currentSessionId)
      .slice(-Math.max(1, Math.min(limit, 32)))
      .map((entry) => ({ ...entry }));
  }

  private findSourceEventIdInHistory(history: NeuralRoamHistoryEntry[], sourceId: string | null, sessionId: string | null): string | null {
    if (!sourceId || !sessionId) return null;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (entry.sessionId !== sessionId || entry.nodeId !== sourceId) continue;
      if (entry.activationKind === 'source-root' || entry.associationType === 'source') {
        return entry.eventId;
      }
    }
    return null;
  }

  private rebuildDisplayPathEventIds(displayPath: string[], history: NeuralRoamHistoryEntry[]): string[] {
    const remaining = history.map((entry) => entry.eventId);
    const result: string[] = [];
    for (const nodeId of displayPath) {
      const matchIndex = remaining.findIndex((eventId) => history.find((candidate) => candidate.eventId === eventId)?.nodeId === nodeId);
      if (matchIndex >= 0) {
        result.push(remaining.splice(matchIndex, 1)[0]);
      }
    }
    return result;
  }

  private normalizeAssociationType(value: unknown): NeuralAssociationType {
    switch (value) {
      case 'backlink':
      case 'outgoing-direct':
      case 'outgoing-indirect':
      case 'descriptor':
      case 'associated-review':
      case 'focus':
      case 'path':
      case 'source':
      case 'concept-link':
      case 'element-link':
      case 'tree-child':
      case 'tree-sibling':
      case 'tree-parent':
      case 'follow-path':
      case 'manual-jump':
        return value;
      default:
        return 'manual-jump';
    }
  }

  private normalizeChannel(value: unknown): NeuralGraphChannel {
    switch (value) {
      case 'concept-map':
      case 'element-link':
      case 'block-tree':
      case 'document-tree':
      case 'source':
        return value;
      default:
        return 'concept-map';
    }
  }

  private normalizeHistoryEntry(entry: unknown, index = 0): NeuralRoamHistoryEntry | null {
    if (!isRecord(entry)) return null;
    const nodeId = typeof entry.nodeId === 'string' ? entry.nodeId : '';
    if (!nodeId) return null;

    const visitedAt = Number(entry.visitedAt);
    const sessionId = typeof entry.sessionId === 'string' && entry.sessionId ? entry.sessionId : this.currentSessionId || 'hyperspace-legacy';
    const associationType = this.normalizeAssociationType(entry.associationType);
    const activationKind = entry.activationKind === 'source-root'
      || entry.activationKind === 'graph-edge'
      || entry.activationKind === 'tree-edge'
      || entry.activationKind === 'follow-path'
      || entry.activationKind === 'manual-jump'
      ? entry.activationKind
      : associationType === 'source'
        ? 'source-root'
        : this.isTreeAssociation(associationType)
          ? 'tree-edge'
          : 'graph-edge';
    const traceQuality: NeuralTraceQuality = entry.traceQuality === 'exact' ? 'exact' : 'legacy';
    const sourceRole = entry.sourceRole === 'activation-source'
      ? 'activation-source'
      : entry.sourceRole === 'orbit-center'
        ? 'orbit-center'
        : associationType === 'source'
          ? 'activation-source'
          : null;
    const origin = normalizeOrigin(entry.origin, associationType);
    const depth = Number(entry.depth);
    const conductionScore = Number(entry.conductionScore);
    return {
      eventId: typeof entry.eventId === 'string' && entry.eventId ? entry.eventId : `legacy-${sessionId}-${nodeId}-${Math.trunc(Number.isFinite(visitedAt) ? visitedAt : Date.now())}-${index}`,
      nodeId,
      focusId: typeof entry.focusId === 'string' && entry.focusId ? entry.focusId : null,
      sessionId,
      associationType,
      reason: typeof entry.reason === 'string' ? entry.reason : buildReasonText(origin ?? associationType),
      visitedAt: Number.isFinite(visitedAt) ? visitedAt : Date.now(),
      isVirtual: Boolean(entry.isVirtual),
      nodePreview: normalizePreview(typeof entry.nodePreview === 'string' ? entry.nodePreview : nodeId, this.previewLength),
      traceQuality,
      engineMode: ENGINE_MODE,
      sourceRole,
      origin,
      sourceNodeId: typeof entry.sourceNodeId === 'string' && entry.sourceNodeId ? entry.sourceNodeId : null,
      sourceEventId: typeof entry.sourceEventId === 'string' && entry.sourceEventId ? entry.sourceEventId : null,
      branchRootNodeId: typeof entry.branchRootNodeId === 'string' && entry.branchRootNodeId ? entry.branchRootNodeId : (typeof entry.focusId === 'string' && entry.focusId ? entry.focusId : nodeId),
      activationKind,
      depth: Number.isFinite(depth) ? depth : null,
      conductionScore: Number.isFinite(conductionScore) ? conductionScore : null,
    };
  }

  private createHistoryEntry(nodeId: string, sessionId: string, nodePreview: string, meta: ActivateNodeMeta): NeuralRoamHistoryEntry {
    return {
      eventId: createHistoryEventId(),
      nodeId,
      focusId: meta.focusId,
      sessionId,
      associationType: meta.associationType,
      reason: meta.reason,
      visitedAt: Date.now(),
      isVirtual: meta.isVirtual,
      nodePreview,
      traceQuality: 'exact',
      engineMode: ENGINE_MODE,
      sourceRole: meta.sourceRole ?? null,
      origin: normalizeOrigin(meta.origin, meta.associationType),
      sourceNodeId: meta.sourceNodeId ?? null,
      sourceEventId: meta.sourceEventId ?? null,
      branchRootNodeId: meta.branchRootNodeId ?? meta.focusId ?? nodeId,
      activationKind: meta.activationKind ?? (meta.associationType === 'source'
        ? 'source-root'
        : this.isTreeAssociation(meta.associationType)
          ? 'tree-edge'
          : 'graph-edge'),
      depth: meta.depth ?? null,
      conductionScore: meta.conductionScore ?? null,
    };
  }

  private toTraceStep(entry: NeuralRoamHistoryEntry): NeuralActivationTraceStep {
    return {
      eventId: entry.eventId,
      nodeId: entry.nodeId,
      nodePreview: entry.nodePreview,
      isVirtual: entry.isVirtual,
      associationType: entry.associationType,
      reason: entry.reason,
      activationKind: entry.activationKind,
      visitedAt: entry.visitedAt,
      focusId: entry.focusId,
      engineMode: entry.engineMode,
      sourceRole: entry.sourceRole,
      origin: entry.origin ?? null,
      sourceNodeId: entry.sourceNodeId,
      sourceEventId: entry.sourceEventId,
      branchRootNodeId: entry.branchRootNodeId,
      traceQuality: entry.traceQuality,
      depth: entry.depth,
      conductionScore: entry.conductionScore,
      isSyntheticRoot: false,
    };
  }

  private buildSyntheticRootStep(entry: NeuralRoamHistoryEntry, forcedNodeId?: string | null): NeuralActivationTraceStep {
    const nodeId = forcedNodeId ?? entry.sourceNodeId ?? entry.branchRootNodeId ?? entry.focusId ?? entry.nodeId;
    const latest = this.findLatestHistoryEntry(nodeId);
    return {
      eventId: `synthetic-root-${entry.eventId}-${nodeId}`,
      nodeId,
      nodePreview: latest?.nodePreview ?? normalizePreview(nodeId, this.previewLength),
      isVirtual: latest?.isVirtual ?? false,
      associationType: 'source',
      reason: buildReasonText('source'),
      activationKind: 'source-root',
      visitedAt: latest?.visitedAt ?? entry.visitedAt,
      focusId: nodeId,
      engineMode: ENGINE_MODE,
      sourceRole: 'activation-source',
      origin: 'source',
      sourceNodeId: null,
      sourceEventId: null,
      branchRootNodeId: nodeId,
      traceQuality: 'exact',
      depth: 0,
      conductionScore: latest?.conductionScore ?? 1,
      isSyntheticRoot: true,
    };
  }

  private isTreeAssociation(type: NeuralAssociationType): boolean {
    return type === 'tree-child' || type === 'tree-sibling' || type === 'tree-parent';
  }
}
