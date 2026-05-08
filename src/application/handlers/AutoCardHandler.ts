import type { ITransactionHandler, Transaction } from '../../core/infrastructure/websocket/TransactionWebSocketService';
import {
    classifyTransactionBatch,
    shouldDispatchAutoCard,
    type TransactionClassification,
} from '@/core/infrastructure/websocket/transaction-classifier';
import type FSRSPlugin from '@/index';
import type { AutoCardSiyuanPort } from '../ports/AutoCardSiyuanPort';
import type { AutoCardRiffPort } from '../ports/AutoCardRiffPort';
import {
    createUnavailableHostBlockQueryPort,
    type HostBlockQueryPort,
} from '@/application/ports/HostBlockQueryPort';
import type { SrsBackendClient } from '../clients/SrsBackendClient';
import type { BackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import { createLogger } from '@/utils/logger';
import {
    incrementRuntimePerformanceCounter,
    measureRuntimePerformance,
    recordRuntimePerformanceSpan,
    startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';
import { ClozeDetector } from '@/utils/cloze-detector';
import { isErr, type Result } from '@/types/result';
import { UnifiedPostCreationPlanner } from '@/core/card/post-creation/UnifiedPostCreationPlanner';
import type { CreationDecision } from '@/core/card/post-creation/contracts';
import {
    parseBasicDirectionContent,
    selectPreferredInlineSymbolLine,
} from '@/core/card/post-creation/rules/rule-utils';
import { PostCreationConflictMediator } from '@/application/services/PostCreationConflictMediator';
import { DocumentPostCreationScanService } from '@/application/services/DocumentPostCreationScanService';
import {
    resolveProgressiveSourceContext,
    type ProgressiveSourceContext,
} from '@/application/services/ProgressiveSourceContextResolver';
import { resolveListChildrenBySubtype } from '@/application/usecases/xiuyuan/shared/ListChildrenResolver';
import { CreateCdfMultilineCardsUseCase } from '@/application/usecases/xiuyuan/CreateCdfMultilineCardsUseCase';
import type { CreateXiuyuanFromBlocksCommand } from '@/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import type {
    BackendAutoCardExecuteEnvelope,
    BackendAutoCardExecuteRequest,
    BackendAutoCardExecuteResult,
    BackendAutoCardDecisionProjection,
    BackendAutoCardDecisionResolveResult,
    BackendUnavailableClass,
} from '../../../packages/contracts/src/backend-rpc';
import {
    AutoCardExecutionRuntime,
    type AutoCardExecutionEnvelope,
    type AutoCardExecutionResult,
    type AutoCardExecutionSource,
} from './AutoCardExecutionRuntime';

const logger = createLogger('AutoCardHandler');

type QuickCardSettings = {
    enabled?: boolean;
    flashcard?: {
        mark?: boolean;
        list?: boolean;
        heading?: boolean;
        superBlock?: boolean;
    };
    flashcardSeededFromSiyuan?: boolean;
    enabledSymbols?: {
        basic?: boolean;
        concept?: boolean;
        descriptor?: boolean;
        cloze?: boolean;
        multiLine?: boolean;
    };
    debounceDelay?: {
        quick?: number;
        list?: number;
    };
    enableDebounce?: boolean;
    descriptorUseXiuyuan?: boolean;
    topicDerivation?: {
        enabled?: boolean;
        storageMode?: 'workbench' | 'source-child';
    };
};

export interface AutoCardDocumentScanResult {
    rootId: string;
    scanned: number;
    created: number;
    skipped: number;
    failed: number;
    conflicted: number;
    consumed: number;
}

type SettingsServiceLike = {
    getSettings: () => {
        quickCard?: QuickCardSettings;
    };
};

type CardServiceLike = {
    getCardByBlockId: (blockId: string) => unknown;
    getCardsByBlockId?: (blockId: string) => unknown[];
    saveCards: () => Promise<void>;
};

type XiuyuanCreateResult = Result<{
    xiuyuan: {
        id: string;
    };
    cards: Array<{
        id: string;
    }>;
}>;

type XiuyuanApplicationServiceLike = {
    createFromBlocks: (command: CreateXiuyuanFromBlocksCommand) => Promise<XiuyuanCreateResult>;
    createTemplate: (template: Record<string, unknown>) => Promise<Result<void>>;
};

type CardTypeDetectionServiceLike = {
    detectCardType: (blockId: string) => Promise<'topic' | 'item'>;
    detectCardTypeDetails?: (input: {
        blockId: string;
        blockType?: string | null;
        markdown?: string | null;
        content?: string | null;
    }) => Promise<{ cardType: 'topic' | 'item' }>;
};

type AutoCardContextLike = {
    getSettingsService?: () => SettingsServiceLike;
    getCardService?: () => CardServiceLike;
    getXiuyuanApplicationService?: () => Promise<XiuyuanApplicationServiceLike>;
    getCardTypeDetectionService?: () => CardTypeDetectionServiceLike;
    getTopicDerivedItemService?: () => TopicDerivedItemServiceLike;
    getSrsBackendClient?: () => SrsBackendClient | null;
    getFrontendInstanceRuntime?: () => {
        getMode: () => string;
        getInstanceId: () => string;
        ensureWritable?: () => Promise<void>;
    } | null;
    getFollowerCommandClient?: () => {
        submitAndWait: <TResult>(request: {
            instanceId: string;
            commandId?: string;
            method: string;
            params?: unknown;
        }, timeoutMs?: number) => Promise<TResult>;
    } | null;
    getBackendMigrationRuntimePolicy?: () => Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null;
};

type AutoCardDecisionCoreResult = {
    candidateId: string;
    decisionEventId: string;
    status: 'selected' | 'skipped' | 'no-op' | 'unavailable' | 'failed';
    unavailableClass: BackendUnavailableClass | null;
    matchedRuleIds: string[];
    enabledDecisions: CreationDecision[];
    selectedDecision: CreationDecision | null;
    conflicted: boolean;
    shouldUseTopicDerivation: boolean;
    markOnlyClozeCandidate: boolean;
};

type TopicDerivedItemServiceLike = {
    createFromTopicSource: (input: {
        sourceBlockId: string;
        sourceDocId: string;
        parentTopicCardId: string;
        parentExcerptId?: string;
        sourceRootKind?: 'ordinary-doc' | 'piece' | 'excerpt-doc' | 'excerpt-block' | 'topic-doc';
        plannerContent: string;
        artifactContentDom?: string;
        mode?: 'planner-derived' | 'manual-cloze';
        answerFingerprint?: string;
        previewText?: string;
        decisions: CreationDecision[];
        storageMode?: 'workbench' | 'source-child';
    }) => Promise<{
        created: number;
        skipped: number;
        items: Array<{
            derivedDocId: string;
            derivedBlockId: string;
            derivedCardId: string;
            sourceBlockId: string;
            storageMode: 'workbench' | 'source-child';
            creationRuleId: string;
            answerFingerprint: string;
        }>;
    }>;
};

type ListChildBlock = {
    id: string;
};

type AutoCardTraceContext = {
    runId: string;
    trigger: string;
    txBatchId?: string;
    nextBlockId?: string;
};

type AutoCardDecisionRuleScope = 'all' | 'single-block' | 'structural';

type BackendRelayRuntimeState =
    | { mode: 'missing' }
    | { mode: 'writer' }
    | { mode: 'follower'; instanceId: string }
    | { mode: 'unknown'; rawMode: string | null };

type CandidateBlockContext = {
    candidateId: string;
    blockId: string;
    txBatchId: string;
    actions: string[];
    enqueuedAt: number;
    opIds: string[];
    retryAttempt: number;
    followUpRequested?: boolean;
};

type AutoCardCheckStatus = string;

type ListenerCandidateLifecycleStatus =
    | 'accepted'
    | 'retry-scheduled'
    | 'created'
    | 'skipped'
    | 'retry-exhausted'
    | 'failed';

export interface AutoCardListenerCandidateDiagnostic {
    candidateId: string;
    blockId: string;
    status: ListenerCandidateLifecycleStatus;
    reason: string;
    terminal: boolean;
    txBatchId?: string;
    actions: string[];
    opIds: string[];
    attempt: number;
    delayMs?: number;
    runId?: string;
    createdAt: number;
    updatedAt: number;
}

export interface AutoCardHandlerPorts {
    siyuanApi: AutoCardSiyuanPort;
    riffApi: AutoCardRiffPort;
    hostBlockQuery?: HostBlockQueryPort;
}

const QUICK_CARD_PREFILTER_MARKERS = [
    '>>',
    '》》',
    '<<',
    '《《',
    '<>',
    '《》',
    '>>>',
    '》》》',
    '::',
    '：：',
    ';;',
    '；；',
    ';<',
    '；<',
    '；《',
    ';<>',
    '；<>',
    '；《》',
    '{{',
    '}}',
    '==',
    '\\cloze',
    'data-type="mark"',
];

const QUICK_CARD_PREFILTER_CONTENT_KEYS = new Set([
    'content',
    'markdown',
    'kramdown',
    'text',
    'html',
    'data',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function inspectQuickCardPayload(value: unknown, key = ''): { inspected: boolean; hasMarker: boolean } {
    if (typeof value === 'string') {
        const inspected = key === '' || QUICK_CARD_PREFILTER_CONTENT_KEYS.has(key.toLowerCase());
        return {
            inspected,
            hasMarker: inspected && QUICK_CARD_PREFILTER_MARKERS.some((marker) => value.includes(marker)),
        };
    }
    if (Array.isArray(value)) {
        return value.reduce(
            (summary, entry) => {
                const next = inspectQuickCardPayload(entry, key);
                return {
                    inspected: summary.inspected || next.inspected,
                    hasMarker: summary.hasMarker || next.hasMarker,
                };
            },
            { inspected: false, hasMarker: false },
        );
    }
    if (!isRecord(value)) {
        return { inspected: false, hasMarker: false };
    }
    return Object.entries(value).reduce(
        (summary, [childKey, childValue]) => {
            const next = inspectQuickCardPayload(childValue, childKey);
            return {
                inspected: summary.inspected || next.inspected,
                hasMarker: summary.hasMarker || next.hasMarker,
            };
        },
        { inspected: false, hasMarker: false },
    );
}

function shouldPrefilterAutoCardOperation(op: { action?: unknown; data?: unknown }): boolean {
    const action = String(op.action || '').trim();
    if (action !== 'insert' && action !== 'update') {
        return false;
    }
    const data = isRecord(op.data) ? op.data : null;
    const newPayload = inspectQuickCardPayload(data?.new);
    const oldPayload = inspectQuickCardPayload(data?.old);
    if (newPayload.hasMarker || oldPayload.hasMarker) {
        return false;
    }
    return newPayload.inspected || oldPayload.inspected;
}

/**
 * Auto card handler for quick symbol based card creation.
 *
 * Responsibilities:
 * - Listen to block edit transactions.
 * - Batch process quick symbol detection.
 * - Create cards through application services.
 */
export class AutoCardHandler implements ITransactionHandler {
    private plugin: FSRSPlugin;
    private readonly siyuanApi: AutoCardSiyuanPort;
    private readonly riffApi: AutoCardRiffPort;
    private readonly hostBlockQuery: HostBlockQueryPort;
    private readonly postCreationPlanner = new UnifiedPostCreationPlanner();
    private readonly conflictMediator = new PostCreationConflictMediator();
    private readonly executionRuntime: AutoCardExecutionRuntime;
    

    private processing: Set<string> = new Set();
    private readonly conceptCardEnsureInFlight = new Set<string>();
    private readonly candidateTimers = new Map<string, NodeJS.Timeout>();
    private readonly candidateContexts = new Map<string, CandidateBlockContext>();
    private readonly listenerCandidateDiagnostics = new Map<string, AutoCardListenerCandidateDiagnostic>();
    private readonly listenerCandidateDiagnosticOrder: string[] = [];
    private readonly lastEvaluationFingerprintByBlock = new Map<string, string>();
    private readonly suppressedTopicDerivedMarkMutations = new Map<string, number>();
    private readonly settledEvaluationDelayMs = 300;
    private readonly candidateRetryDelaysMs = [250, 750, 1500, 3000, 6000];
    private readonly followUpEvaluationDelayMs = 0;
    private readonly maxListenerCandidateDiagnostics = 200;
    private traceSequence = 0;
    private readonly activeRunContexts = new Map<string, AutoCardTraceContext>();
    

    // Supported quick-card symbol patterns (half-width and full-width variants).
    private patterns = {
        concept: /^(.+?)\s*(::|：：)\s*(.+)$/,
        conceptForward: /^(.+?)\s*(:>|：》)\s*(.+)$/,
        conceptReverse: /^(.+?)\s*(:<|：《)\s*(.+)$/,
        descriptor: /^(.+?)\s*(;;|；；)\s*(.+)$/,
        descriptorReverse: /^(.+?)\s*(;<|；<|；《)\s*(.+)$/,
        descriptorBoth: /^(.+?)\s*(;<>|；<>|；《》)\s*(.+)$/,
        basicBoth: /^(.+?)\s*(<>|《》)\s*(.+)$/,
        basicForward: /^(.+?)\s*(>>|》》)\s*(.+)$/,
        basicBackward: /^(.+?)\s*(<<|《《)\s*(.+)$/,
        cloze: /\{\{(.+?)\}\}/g,
        clozeEqual: /==(.+?)==/g,
        clozeMark: /<span data-type="mark">(.+?)<\/span>/g,
        multiLine: /(.+?)\s*(>>>|》》》)\s*$/,
        listCue: /^(.+?)\s*(->|→)\s*(.+)$/,
    };
    
    constructor(
        plugin: FSRSPlugin,
        ports: AutoCardHandlerPorts
    ) {
        this.plugin = plugin;
        this.siyuanApi = ports.siyuanApi;
        this.riffApi = ports.riffApi;
        this.hostBlockQuery = ports.hostBlockQuery ?? createUnavailableHostBlockQueryPort('AutoCardHandler was constructed without HostBlockQueryPort');
        this.executionRuntime = new AutoCardExecutionRuntime({
            executePlannerDecision: async (input) => this.executePlannerDecision(input),
            createTopicDerivedItem: async (input) => this.getTopicDerivedItemService().createFromTopicSource(input),
            pushMsg: async (message) => this.siyuanApi.pushMsg(message),
        });
        logger.debug('[SiYuanMemo][AutoCard] Handler initialized');
    }

    private getContext(): AutoCardContextLike | null {
        try {
            return (this.plugin?.getContext?.() as unknown as AutoCardContextLike | null) ?? null;
        } catch (error) {
            logger.warn('[AutoCard] Failed to get ApplicationContext:', error);
            return null;
        }
    }

    private requireContext(): AutoCardContextLike {
        const context = this.getContext();
        if (!context) {
            throw new Error('[AutoCard] ApplicationContext is unavailable');
        }
        return context;
    }

    private get settingsService(): SettingsServiceLike {
        try {
            const context = this.requireContext();
            if (context.getSettingsService) {
                return context.getSettingsService();
            }
        } catch (error) {
            logger.warn('[AutoCard] Failed to get SettingsService from context:', error);
        }
        throw new Error('[AutoCard] SettingsService is unavailable');
    }
    
    private getCardService(): CardServiceLike {
        const context = this.requireContext();
        if (context.getCardService) {
            return context.getCardService();
        }
        throw new Error('[AutoCard] CardApplicationService is unavailable');
    }
    
    private async requireXiuyuanApplicationService(
        unavailableUserMessage = '修缘服务不可用'
    ): Promise<XiuyuanApplicationServiceLike> {
        const context = this.requireContext();
        if (context.getXiuyuanApplicationService) {
            return await context.getXiuyuanApplicationService();
        }

        logger.error('[SiYuanMemo][AutoCard] XiuyuanApplicationService not available');
        await this.siyuanApi.pushErrMsg(unavailableUserMessage);
        throw new Error('[AutoCard] XiuyuanApplicationService is unavailable');
    }

    private getCardTypeDetectionService(): CardTypeDetectionServiceLike {
        const context = this.requireContext();
        if (context.getCardTypeDetectionService) {
            return context.getCardTypeDetectionService();
        }
        throw new Error('[AutoCard] CardTypeDetectionService is unavailable');
    }

    private getTopicDerivedItemService(): TopicDerivedItemServiceLike {
        const context = this.requireContext();
        if (context.getTopicDerivedItemService) {
            return context.getTopicDerivedItemService();
        }
        throw new Error('[AutoCard] TopicDerivedItemService is unavailable');
    }

    private getSrsBackendClientOptional(): SrsBackendClient | null {
        try {
            const context = this.getContext();
            if (context?.getSrsBackendClient) {
                return context.getSrsBackendClient() ?? null;
            }
            return null;
        } catch (error) {
            logger.warn('[AutoCard] Failed to get SrsBackendClient from context:', error);
            return null;
        }
    }

    private getFrontendRelayRuntimeOptional(): {
        getMode: () => string;
        getInstanceId: () => string;
        ensureWritable?: () => Promise<void>;
    } | null {
        try {
            const context = this.getContext();
            if (context?.getFrontendInstanceRuntime) {
                return context.getFrontendInstanceRuntime() ?? null;
            }
            return null;
        } catch (error) {
            logger.warn('[AutoCard] Failed to get FrontendInstanceRuntime from context:', error);
            return null;
        }
    }

    private getFollowerCommandClientOptional(): {
        submitAndWait: <TResult>(request: {
            instanceId: string;
            commandId?: string;
            method: string;
            params?: unknown;
        }, timeoutMs?: number) => Promise<TResult>;
    } | null {
        try {
            const context = this.getContext();
            if (context?.getFollowerCommandClient) {
                return context.getFollowerCommandClient() ?? null;
            }
            return null;
        } catch (error) {
            logger.warn('[AutoCard] Failed to get FollowerCommandClient from context:', error);
            return null;
        }
    }

    private getRuntimePolicyOptional(): Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null {
        try {
            const context = this.getContext();
            if (context?.getBackendMigrationRuntimePolicy) {
                return context.getBackendMigrationRuntimePolicy() ?? null;
            }
            return null;
        } catch (error) {
            logger.warn('[AutoCard] Failed to get backend migration runtime policy from context:', error);
            return null;
        }
    }

    private traceBackendPolicyDecision(reason: string, payload?: Record<string, unknown>): void {
        logger.info('[BackendMigrationPolicy][AutoCardHandler]', {
            reason,
            ...(payload || {}),
        });
    }

    private resolveBackendRelayRuntimeState(): BackendRelayRuntimeState {
        const runtime = this.getFrontendRelayRuntimeOptional();
        if (!runtime) {
            return { mode: 'missing' };
        }
        const rawMode = runtime.getMode();
        if (rawMode === 'writer') {
            return { mode: 'writer' };
        }
        if (rawMode === 'follower') {
            const instanceId = String(runtime.getInstanceId() || '').trim();
            if (!instanceId) {
                return { mode: 'unknown', rawMode: 'follower-without-instance' };
            }
            return { mode: 'follower', instanceId };
        }
        if (typeof rawMode === 'undefined' || rawMode === null || rawMode === '') {
            return { mode: 'unknown', rawMode: null };
        }
        return { mode: 'unknown', rawMode: String(rawMode) };
    }

    private toCreationDecision(decision: BackendAutoCardDecisionProjection): CreationDecision {
        return {
            id: decision.id,
            family: decision.family as CreationDecision['family'],
            templateId: decision.templateId,
            cardType: decision.cardType as CreationDecision['cardType'],
            mode: decision.mode as CreationDecision['mode'],
            executorKind: decision.executorKind as CreationDecision['executorKind'],
            renderProfile: decision.renderProfile as CreationDecision['renderProfile'],
            direction: decision.direction,
            priority: decision.priority,
            conflictGroup: decision.conflictGroup,
            hints: decision.hints,
        };
    }

    private toBackendDecisionProjection(decision: CreationDecision): BackendAutoCardDecisionProjection {
        return {
            id: decision.id,
            family: decision.family,
            templateId: decision.templateId,
            cardType: decision.cardType,
            mode: decision.mode,
            executorKind: decision.executorKind,
            renderProfile: decision.renderProfile,
            direction: decision.direction,
            priority: decision.priority,
            conflictGroup: decision.conflictGroup,
            hints: decision.hints,
        };
    }

    private toBackendExecuteEnvelope(envelope: AutoCardExecutionEnvelope): BackendAutoCardExecuteEnvelope {
        if (envelope.kind === 'planner-decision') {
            return {
                kind: 'planner-decision',
                blockId: envelope.blockId,
                content: envelope.content,
                decision: this.toBackendDecisionProjection(envelope.decision),
                source: envelope.source,
                docRootId: envelope.docRootId,
            };
        }
        return {
            kind: 'topic-derived',
            input: {
                ...envelope.input,
                decisions: envelope.input.decisions.map((decision) => this.toBackendDecisionProjection(decision)),
            },
        };
    }

    private fromBackendExecuteEnvelope(envelope: BackendAutoCardExecuteEnvelope): AutoCardExecutionEnvelope {
        if (envelope.kind === 'planner-decision') {
            return {
                kind: 'planner-decision',
                blockId: envelope.blockId,
                content: envelope.content,
                decision: this.toCreationDecision(envelope.decision),
                source: envelope.source,
                docRootId: envelope.docRootId,
            };
        }
        return {
            kind: 'topic-derived',
            input: {
                ...envelope.input,
                decisions: (envelope.input.decisions || []).map((decision) => this.toCreationDecision(decision)),
            },
        };
    }

    private normalizeBackendExecuteResult(payload: unknown): AutoCardExecutionResult {
        if (!payload || typeof payload !== 'object') {
            throw new Error('autocard.execute returned invalid payload');
        }
        const candidate = payload as {
            executed?: unknown;
            created?: unknown;
            skipped?: unknown;
        };
        return {
            executed: candidate.executed === true,
            created: Math.max(0, Math.floor(Number(candidate.created || 0))),
            skipped: Math.max(0, Math.floor(Number(candidate.skipped || 0))),
        };
    }

    private normalizeBackendDecisionResolveResult(payload: unknown): BackendAutoCardDecisionResolveResult {
        if (!payload || typeof payload !== 'object') {
            throw new Error('autocard.decision.resolve returned invalid payload');
        }
        const candidate = payload as Record<string, unknown>;
        const status = String(candidate.status || '').trim();
        if (!this.isDecisionStatus(status)) {
            throw new Error('autocard.decision.resolve returned invalid payload');
        }
        const candidateId = String(candidate.candidateId || '').trim();
        const decisionEventId = String(candidate.decisionEventId || '').trim();
        if (!candidateId || !decisionEventId) {
            throw new Error('autocard.decision.resolve returned invalid payload');
        }
        return payload as BackendAutoCardDecisionResolveResult;
    }

    private isDecisionStatus(value: string): value is AutoCardDecisionCoreResult['status'] {
        return value === 'selected'
            || value === 'skipped'
            || value === 'no-op'
            || value === 'unavailable'
            || value === 'failed';
    }

    private hashFNV1a32(input: string): string {
        let hash = 0x811c9dc5;
        for (let index = 0; index < input.length; index += 1) {
            hash ^= input.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    private buildLocalCandidateId(input: {
        blockId: string;
        content: string;
        blockType: string;
        resolvedCardType: 'topic' | 'item';
        source: AutoCardExecutionSource;
        ruleScope: AutoCardDecisionRuleScope;
    }): string {
        return `autocard-candidate:${this.hashFNV1a32(JSON.stringify(input))}`;
    }

    private buildLocalDecisionEventId(input: {
        candidateId: string;
        selectedDecisionId: string | null;
        status: AutoCardDecisionCoreResult['status'];
        unavailableClass: BackendUnavailableClass | null;
    }): string {
        return `autocard-decision:${this.hashFNV1a32(JSON.stringify(input))}`;
    }

    private async executeViaWorkerIfAvailable(
        envelope: AutoCardExecutionEnvelope,
    ): Promise<AutoCardExecutionResult> {
        const runtimePolicy = this.getRuntimePolicyOptional();
        if (runtimePolicy && !runtimePolicy.capabilities.autoCardExecuteWriteEnabled) {
            this.traceBackendPolicyDecision(
                runtimePolicy.capabilities.backendWorkerAvailable ? 'writer-relay-disabled' : 'backend-worker-disabled',
                { method: 'autocard.execute' },
            );
            throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires backend+writer ownership');
        }
        const backendClient = this.getSrsBackendClientOptional();
        if (!backendClient) {
            this.traceBackendPolicyDecision('backend-worker-unavailable', { method: 'autocard.execute' });
            throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires backend-worker ownership');
        }
        const relayRuntime = this.resolveBackendRelayRuntimeState();
        if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'missing') {
            this.traceBackendPolicyDecision('writer-relay-runtime-missing', { method: 'autocard.execute' });
            throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires writer relay runtime');
        }
        if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'unknown') {
            this.traceBackendPolicyDecision('writer-relay-runtime-unknown', {
                method: 'autocard.execute',
                rawMode: relayRuntime.rawMode,
            });
            throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires writer relay runtime');
        }
        const followerClient = this.getFollowerCommandClientOptional();
        const request: BackendAutoCardExecuteRequest = {
            envelope: this.toBackendExecuteEnvelope(envelope),
        };
        const relayExecute = async (followerRuntime: Extract<BackendRelayRuntimeState, { mode: 'follower' }>) => {
            if (!followerClient) {
                this.traceBackendPolicyDecision('follower-relay-unavailable', {
                    method: 'autocard.execute',
                    instanceId: followerRuntime.instanceId,
                });
                throw new Error('BACKEND_UNAVAILABLE: autocard.execute relay is unavailable in follower mode');
            }
            try {
                const relayResult = await measureRuntimePerformance('autocard', 'execute.relay-submit-wait', () => followerClient.submitAndWait<unknown>({
                    instanceId: followerRuntime.instanceId,
                    method: 'autocard.execute',
                    params: request,
                }), {
                    envelopeKind: envelope.kind,
                    method: 'autocard.execute',
                });
                return this.normalizeBackendExecuteResult(relayResult);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error || '');
                if (message.includes('BACKEND_UNAVAILABLE: writer relay timeout')) {
                    this.traceBackendPolicyDecision('follower-relay-timeout', {
                        method: 'autocard.execute',
                        instanceId: followerRuntime.instanceId,
                    });
                }
                throw error;
            }
        };
        if (relayRuntime.mode === 'follower') {
            return relayExecute(relayRuntime);
        }
        const runtime = this.getFrontendRelayRuntimeOptional();
        if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && !runtime?.ensureWritable) {
            this.traceBackendPolicyDecision('writer-relay-runtime-missing', { method: 'autocard.execute' });
            throw new Error('BACKEND_UNAVAILABLE: autocard.execute requires writer relay runtime');
        }
        if (runtime?.ensureWritable) {
            try {
                await measureRuntimePerformance('relay', 'ensure-writable.autocard-execute', () => runtime.ensureWritable!(), {
                    method: 'autocard.execute',
                });
            } catch (error) {
                const refreshedRelayRuntime = this.resolveBackendRelayRuntimeState();
                if (refreshedRelayRuntime.mode === 'follower') {
                    return relayExecute(refreshedRelayRuntime);
                }
                const message = error instanceof Error ? error.message : String(error || '');
                if (message.startsWith('BACKEND_UNAVAILABLE:')) {
                    this.traceBackendPolicyDecision('writer-unavailable', {
                        method: 'autocard.execute',
                        error: message,
                    });
                }
                throw error;
            }
            const refreshedRelayRuntime = this.resolveBackendRelayRuntimeState();
            if (refreshedRelayRuntime.mode === 'follower') {
                return relayExecute(refreshedRelayRuntime);
            }
        }
        try {
            const result = await measureRuntimePerformance('autocard', 'execute.backend-worker', () => backendClient.executeAutoCard(request), {
                envelopeKind: envelope.kind,
                method: 'autocard.execute',
            });
            return this.normalizeBackendExecuteResult(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            if (message.startsWith('BACKEND_UNAVAILABLE:')) {
                if (message.includes('writer lease')) {
                    this.traceBackendPolicyDecision('writer-unavailable', {
                        method: 'autocard.execute',
                        error: message,
                    });
                }
                throw error;
            }
            throw error;
        }
    }

    private async executeAutoCardEnvelope(
        envelope: AutoCardExecutionEnvelope,
    ): Promise<boolean> {
        const workerResult = await measureRuntimePerformance(
            'autocard',
            'execute-envelope.worker-or-relay',
            () => this.executeViaWorkerIfAvailable(envelope),
            { envelopeKind: envelope.kind },
        );
        return workerResult.executed;
    }

    private resolveExecutionOwnership(input: {
        kind: AutoCardExecutionEnvelope['kind'];
    }): {
        owner: 'backend-command' | 'application-command';
        envelopeKind: AutoCardExecutionEnvelope['kind'];
    } {
        return {
            owner: 'backend-command',
            envelopeKind: input.kind,
        };
    }

    async executeEnvelopeFromBackend(
        request: BackendAutoCardExecuteRequest,
    ): Promise<BackendAutoCardExecuteResult> {
        if (!request || typeof request !== 'object' || !request.envelope || typeof request.envelope !== 'object') {
            throw new Error('autocard.execute requires named params with envelope');
        }
        const localEnvelope = this.fromBackendExecuteEnvelope(request.envelope);
        const result = await measureRuntimePerformance(
            'autocard',
            'execute-envelope.backend-local',
            () => this.executionRuntime.executeLocalWithResult(localEnvelope),
            { envelopeKind: localEnvelope.kind },
        );
        return {
            executed: result.executed,
            created: result.created,
            skipped: result.skipped,
        };
    }

    private async resolveAutoCardDecisionCore(input: {
        blockId: string;
        content: string;
        blockType: string;
        resolvedCardType: 'topic' | 'item';
        source: AutoCardExecutionSource;
        ruleScope?: AutoCardDecisionRuleScope;
        quickCardSettings: QuickCardSettings;
        sourceContext: ProgressiveSourceContext | null;
    }): Promise<AutoCardDecisionCoreResult> {
        const backendClient = this.getSrsBackendClientOptional();
        const runtimePolicy = this.getRuntimePolicyOptional();
        const request = {
            blockId: input.blockId,
            content: input.content,
            blockType: input.blockType,
            resolvedCardType: input.resolvedCardType,
            source: input.source,
            ruleScope: input.ruleScope ?? 'all',
            hasParentTopicCard: Boolean(input.sourceContext?.parentTopicCardId),
            settings: {
                enabledSymbols: {
                    basic: input.quickCardSettings.enabledSymbols?.basic,
                    concept: input.quickCardSettings.enabledSymbols?.concept,
                    descriptor: input.quickCardSettings.enabledSymbols?.descriptor,
                    cloze: input.quickCardSettings.enabledSymbols?.cloze,
                    multiLine: input.quickCardSettings.enabledSymbols?.multiLine,
                },
                topicDerivation: {
                    enabled: input.quickCardSettings.topicDerivation?.enabled,
                },
            },
        } as const;
        if (backendClient && (runtimePolicy?.capabilities.autoCardDecisionBackendEnabled ?? true)) {
            const relayRuntime = this.resolveBackendRelayRuntimeState();
            if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'missing') {
                this.traceBackendPolicyDecision('writer-relay-runtime-missing', {
                    method: 'autocard.decision.resolve',
                });
                throw new Error('BACKEND_UNAVAILABLE: autocard.decision.resolve requires writer relay runtime');
            }
            if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'unknown') {
                this.traceBackendPolicyDecision('writer-relay-runtime-unknown', {
                    method: 'autocard.decision.resolve',
                    rawMode: relayRuntime.rawMode,
                });
                throw new Error('BACKEND_UNAVAILABLE: autocard.decision.resolve requires writer relay runtime');
            }
            const followerClient = this.getFollowerCommandClientOptional();
            let decisionResult: BackendAutoCardDecisionResolveResult;
            if (relayRuntime.mode === 'follower') {
                if (!followerClient) {
                    this.traceBackendPolicyDecision('follower-relay-unavailable', {
                        method: 'autocard.decision.resolve',
                        instanceId: relayRuntime.instanceId,
                    });
                    throw new Error('BACKEND_UNAVAILABLE: autocard.decision.resolve relay is unavailable in follower mode');
                }
                try {
                    const relayResult = await measureRuntimePerformance('autocard', 'decision.relay-submit-wait', () => followerClient.submitAndWait<unknown>({
                        instanceId: relayRuntime.instanceId,
                        commandId: `autocard.decision.resolve:${this.hashFNV1a32(JSON.stringify(request))}`,
                        method: 'autocard.decision.resolve',
                        params: request,
                    }), {
                        method: 'autocard.decision.resolve',
                        ruleScope: request.ruleScope,
                        source: request.source,
                    });
                    decisionResult = this.normalizeBackendDecisionResolveResult(relayResult);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error || '');
                    if (message.includes('BACKEND_UNAVAILABLE: writer relay timeout')) {
                        this.traceBackendPolicyDecision('follower-relay-timeout', {
                            method: 'autocard.decision.resolve',
                            instanceId: relayRuntime.instanceId,
                        });
                    }
                    throw error;
                }
            } else {
                decisionResult = this.normalizeBackendDecisionResolveResult(
                    await measureRuntimePerformance('autocard', 'decision.backend-worker', () => backendClient.resolveAutoCardDecision(request), {
                        method: 'autocard.decision.resolve',
                        ruleScope: request.ruleScope,
                        source: request.source,
                    }),
                );
            }
            return {
                candidateId: decisionResult.candidateId,
                decisionEventId: decisionResult.decisionEventId,
                status: decisionResult.status,
                unavailableClass: decisionResult.unavailableClass ?? null,
                matchedRuleIds: decisionResult.matchedRuleIds || [],
                enabledDecisions: (decisionResult.filteredDecisions || []).map((decision) => this.toCreationDecision(decision)),
                selectedDecision: decisionResult.selectedDecision ? this.toCreationDecision(decisionResult.selectedDecision) : null,
                conflicted: decisionResult.conflicted === true,
                shouldUseTopicDerivation: decisionResult.shouldUseTopicDerivation === true,
                markOnlyClozeCandidate: decisionResult.markOnlyClozeCandidate === true,
            };
        }
        if (runtimePolicy && !runtimePolicy.capabilities.autoCardDecisionBackendEnabled) {
            this.traceBackendPolicyDecision(
                runtimePolicy.capabilities.backendWorkerAvailable ? 'compatibility-read-used' : 'backend-worker-disabled',
                { method: 'autocard.decision.resolve', mode: 'local-decision' },
            );
        } else if (!backendClient) {
            this.traceBackendPolicyDecision('compatibility-read-used', {
                method: 'autocard.decision.resolve',
                mode: 'local-decision',
                reason: 'backend-client-missing',
            });
        }
        return measureRuntimePerformance('autocard', 'decision.local-resolve', () => this.resolveAutoCardDecisionCoreLocal(input), {
            ruleScope: input.ruleScope ?? 'all',
            source: input.source,
        });
    }

    private async resolveAutoCardDecisionCoreLocal(input: {
        blockId: string;
        content: string;
        blockType: string;
        resolvedCardType: 'topic' | 'item';
        source: AutoCardExecutionSource;
        ruleScope?: AutoCardDecisionRuleScope;
        quickCardSettings: QuickCardSettings;
        sourceContext: ProgressiveSourceContext | null;
    }): Promise<AutoCardDecisionCoreResult> {
        const plan = this.postCreationPlanner.plan({
            blockId: input.blockId,
            content: input.content,
            source: input.source,
            blockType: input.blockType,
            resolvedCardType: input.resolvedCardType,
            capabilities: input.ruleScope === 'structural' ? {
                allowStructuralRules: true,
            } : undefined,
        });
        const scopedDecisions = this.filterDecisionsByRuleScope(plan.decisions, input.ruleScope ?? 'all');
        const preliminaryEnabledDecisions = scopedDecisions.filter((decision) =>
            this.isDecisionEnabledBySettings(decision, input.quickCardSettings)
        );
        const enabledDecisions = this.filterTopicDerivedDecisions(
            preliminaryEnabledDecisions,
            input.content,
            input.sourceContext,
        );
        const shouldUseTopicDerivation = this.shouldUseTopicDerivation(
            input.quickCardSettings,
            input.sourceContext,
            enabledDecisions,
        );
        const markOnlyClozeCandidate = (
            Boolean(input.sourceContext?.parentTopicCardId)
            && preliminaryEnabledDecisions.length > 0
            && enabledDecisions.length === 0
            && this.isMarkOnlyClozeCandidate(input.content, preliminaryEnabledDecisions)
        );
        const enabledDecisionIds = new Set(enabledDecisions.map((decision) => decision.id));
        const filteredPlan = {
            ...plan,
            decisions: enabledDecisions,
            conflicts: plan.conflicts.filter((conflict) =>
                conflict.decisionIds.filter((decisionId) => enabledDecisionIds.has(decisionId)).length > 1
            ),
        };
        const runContext = this.conflictMediator.createRunContext();
        const resolved = await this.conflictMediator.resolveSingleDecision(
            filteredPlan,
            runContext,
            {
                sourceLabel: input.source,
                defaultStrategy: 'semantic-first',
            }
        );
        const status: AutoCardDecisionCoreResult['status'] = resolved.decision
            ? 'selected'
            : enabledDecisions.length > 0
                ? 'skipped'
                : 'no-op';
        const candidateId = this.buildLocalCandidateId({
            blockId: input.blockId,
            content: input.content,
            blockType: input.blockType,
            resolvedCardType: input.resolvedCardType,
            source: input.source,
            ruleScope: input.ruleScope ?? 'all',
        });
        const unavailableClass: BackendUnavailableClass | null = null;
        return {
            candidateId,
            decisionEventId: this.buildLocalDecisionEventId({
                candidateId,
                selectedDecisionId: resolved.decision?.id || null,
                status,
                unavailableClass,
            }),
            status,
            unavailableClass,
            matchedRuleIds: plan.diagnostics.matchedRuleIds,
            enabledDecisions,
            selectedDecision: resolved.decision,
            conflicted: resolved.conflicted,
            shouldUseTopicDerivation,
            markOnlyClozeCandidate,
        };
    }

    private filterDecisionsByRuleScope(
        decisions: CreationDecision[],
        ruleScope: AutoCardDecisionRuleScope,
    ): CreationDecision[] {
        if (ruleScope === 'single-block') {
            return decisions.filter((decision) => (
                decision.executorKind !== 'list-template-structural'
                && decision.executorKind !== 'cdf-multiline-structural'
            ));
        }
        if (ruleScope === 'structural') {
            return decisions.filter((decision) => (
                decision.executorKind === 'list-template-structural'
                || decision.executorKind === 'cdf-multiline-structural'
            ));
        }
        return decisions;
    }

    private async resolveDetectedCardType(
        blockId: string,
        blockType: string,
        content: string
    ): Promise<'topic' | 'item'> {
        try {
            const service = this.getCardTypeDetectionService();
            if (service.detectCardTypeDetails) {
                const result = await service.detectCardTypeDetails({
                    blockId,
                    blockType,
                    markdown: content,
                    content,
                });
                return result.cardType;
            }
            return await service.detectCardType(blockId);
        } catch (error) {
            logger.warn('[SiYuanMemo][AutoCard] Falling back to item cardType because detection service failed', {
                blockId,
                blockType,
                error,
            });
            return 'item';
        }
    }

    private normalizeTopicItemCardType(cardType: string | undefined): 'topic' | 'item' {
        return cardType === 'topic' ? 'topic' : 'item';
    }

    private hasXiuyuanBinding(attrs: Record<string, string> | null | undefined): boolean {
        if (!attrs) {
            return false;
        }
        const xiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
        return typeof xiuyuanId === 'string' && xiuyuanId.trim().length > 0;
    }

    private getLocalCardByBlockId(blockId: string): unknown {
        return this.getCardService().getCardByBlockId(blockId);
    }

    private getLocalCardsByBlockId(blockId: string): unknown[] {
        const cardService = this.getCardService();
        if (typeof cardService.getCardsByBlockId === 'function') {
            return cardService.getCardsByBlockId(blockId);
        }
        const single = cardService.getCardByBlockId(blockId);
        return single ? [single] : [];
    }

    private isLocalConceptCard(card: unknown): boolean {
        if (!card || typeof card !== 'object') {
            return false;
        }
        const candidate = card as {
            type?: string;
            cardTypeMarker?: string;
            meta?: { cardTypeMarker?: string };
        };
        const marker = candidate.cardTypeMarker ?? candidate.meta?.cardTypeMarker;
        return candidate.type === 'concept' || marker === 'concept';
    }

    private hasLocalConceptCard(blockId: string): boolean {
        return this.isLocalConceptCard(this.getLocalCardByBlockId(blockId));
    }

    private shouldUseTopicDerivation(
        settings: QuickCardSettings,
        sourceContext: ProgressiveSourceContext | null,
        decisions: CreationDecision[],
    ): boolean {
        if (!sourceContext?.parentTopicCardId) {
            return false;
        }

        if (settings.topicDerivation?.enabled === false) {
            return false;
        }

        return decisions.some((decision) => (
            decision.family === 'basic'
            || decision.family === 'cloze'
            || decision.family === 'concept-definition'
            || decision.family === 'descriptor'
        ));
    }

    suppressNextTopicDerivedMarkMutation(blockId: string): void {
        const normalizedBlockId = String(blockId || '').trim();
        if (!normalizedBlockId) {
            return;
        }
        const current = this.suppressedTopicDerivedMarkMutations.get(normalizedBlockId) ?? 0;
        this.suppressedTopicDerivedMarkMutations.set(normalizedBlockId, current + 1);
    }

    private consumeSuppressedTopicDerivedMarkMutation(blockId: string): boolean {
        const normalizedBlockId = String(blockId || '').trim();
        if (!normalizedBlockId) {
            return false;
        }
        const current = this.suppressedTopicDerivedMarkMutations.get(normalizedBlockId) ?? 0;
        if (current <= 0) {
            return false;
        }
        if (current === 1) {
            this.suppressedTopicDerivedMarkMutations.delete(normalizedBlockId);
            return true;
        }
        this.suppressedTopicDerivedMarkMutations.set(normalizedBlockId, current - 1);
        return true;
    }

    private isMarkOnlyClozeCandidate(content: string, decisions: CreationDecision[]): boolean {
        if (!decisions.some((decision) => decision.family === 'cloze')) {
            return false;
        }
        const clozes = ClozeDetector.extractClozes(content);
        return clozes.length > 0 && clozes.every((cloze) => cloze.type === 'mark');
    }

    private filterTopicDerivedDecisions(
        decisions: CreationDecision[],
        content: string,
        sourceContext: ProgressiveSourceContext | null,
    ): CreationDecision[] {
        if (!sourceContext?.parentTopicCardId || !this.isMarkOnlyClozeCandidate(content, decisions)) {
            return decisions;
        }
        return decisions.filter((decision) => decision.family !== 'cloze');
    }

    private nextTraceId(prefix: string): string {
        this.traceSequence += 1;
        return `${prefix}-${Date.now()}-${this.traceSequence}`;
    }

    private traceAutoCard(event: string, payload: Record<string, unknown>): void {
        logger.info('[AutoCardTrace]', { event, ...payload });
    }

    private getActiveRunContext(blockId: string): AutoCardTraceContext | undefined {
        return this.activeRunContexts.get(blockId);
    }

    private summarizeAttrs(attrs: Record<string, string> | null | undefined): Record<string, unknown> {
        const normalized = attrs ?? {};
        const xiuyuanId = String(normalized['custom-xiuyuan-id'] || '').trim();
        const legacyXiuyuanId = String(normalized['custom-fsrs-xiuyuan-id'] || '').trim();
        const cardType = String(normalized['custom-fsrs-card-type'] || '').trim();
        return {
            hasXiuyuanBinding: xiuyuanId.length > 0 || legacyXiuyuanId.length > 0,
            xiuyuanId: xiuyuanId || null,
            legacyXiuyuanId: legacyXiuyuanId || null,
            cardType: cardType || null,
            attrKeys: Object.keys(normalized).sort(),
        };
    }

    private previewContent(content: string, maxLength = 120): string {
        const normalized = String(content || '')
            .replace(/\r/g, '')
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.length > 0) || '';
        if (normalized.length <= maxLength) {
            return normalized;
        }
        return `${normalized.slice(0, maxLength)}...`;
    }

    private summarizeDecision(decision: CreationDecision | null | undefined): Record<string, unknown> | null {
        if (!decision) {
            return null;
        }
        return {
            id: decision.id,
            family: decision.family,
            executorKind: decision.executorKind,
            templateId: decision.templateId,
            direction: decision.direction ?? null,
            cardType: decision.cardType ?? null,
            mode: decision.mode,
            isBidirectionalHint: decision.hints?.isBidirectional ?? false,
        };
    }

    private mapXiuyuanSource(source: AutoCardExecutionSource): CreateXiuyuanFromBlocksCommand['source'] {
        return source === 'symbol-listener' ? 'auto-listener' : 'doc-scan';
    }

    private getDuplicatePolicyForSource(source: AutoCardExecutionSource): CreateXiuyuanFromBlocksCommand['duplicatePolicy'] {
        return source === 'symbol-listener' ? 'reuse-existing' : 'error';
    }

    private buildEvaluationFingerprint(input: {
        blockType: string;
        content: string;
        attrs: Record<string, string> | null | undefined;
        localCardCount: number;
        decisions: CreationDecision[];
    }): string {
        return JSON.stringify({
            blockType: input.blockType,
            content: input.content,
            attrs: this.summarizeAttrs(input.attrs),
            localCardCount: input.localCardCount,
            decisionShape: input.decisions.map((decision) => ({
                id: decision.id,
                family: decision.family,
                executorKind: decision.executorKind,
                templateId: decision.templateId,
                direction: decision.direction ?? null,
                cardType: decision.cardType ?? null,
                mode: decision.mode,
                renderProfile: decision.renderProfile ?? null,
            })),
        });
    }

    getListenerCandidateDiagnostics(): AutoCardListenerCandidateDiagnostic[] {
        return this.listenerCandidateDiagnosticOrder
            .map((candidateId) => this.listenerCandidateDiagnostics.get(candidateId))
            .filter((diagnostic): diagnostic is AutoCardListenerCandidateDiagnostic => Boolean(diagnostic))
            .map((diagnostic) => ({
                ...diagnostic,
                actions: [...diagnostic.actions],
                opIds: [...diagnostic.opIds],
            }));
    }

    private recordListenerCandidateLifecycle(
        context: CandidateBlockContext,
        status: ListenerCandidateLifecycleStatus,
        reason: string,
        options: {
            terminal?: boolean;
            delayMs?: number;
            runId?: string | null;
            attempt?: number;
        } = {}
    ): void {
        const now = Date.now();
        const existing = this.listenerCandidateDiagnostics.get(context.candidateId);
        if (!existing) {
            this.listenerCandidateDiagnosticOrder.push(context.candidateId);
        }
        const terminal = options.terminal ?? (
            status === 'created'
            || status === 'skipped'
            || status === 'retry-exhausted'
            || status === 'failed'
        );
        this.listenerCandidateDiagnostics.set(context.candidateId, {
            candidateId: context.candidateId,
            blockId: context.blockId,
            status,
            reason,
            terminal,
            txBatchId: context.txBatchId,
            actions: [...context.actions],
            opIds: [...context.opIds],
            attempt: options.attempt ?? context.retryAttempt,
            ...(typeof options.delayMs === 'number' ? { delayMs: options.delayMs } : {}),
            ...(options.runId ? { runId: options.runId } : {}),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        });
        this.trimListenerCandidateDiagnostics();
        this.traceAutoCard('candidate.lifecycle', {
            candidateId: context.candidateId,
            blockId: context.blockId,
            status,
            reason,
            terminal,
            attempt: options.attempt ?? context.retryAttempt,
            delayMs: options.delayMs ?? null,
            txBatchId: context.txBatchId,
        });
    }

    private trimListenerCandidateDiagnostics(): void {
        while (this.listenerCandidateDiagnosticOrder.length > this.maxListenerCandidateDiagnostics) {
            const candidateId = this.listenerCandidateDiagnosticOrder.shift();
            if (candidateId) {
                this.listenerCandidateDiagnostics.delete(candidateId);
            }
        }
    }

    private scheduleCandidateTimer(
        blockId: string,
        delayMs: number,
        reason: string,
        context: CandidateBlockContext
    ): void {
        const existingTimer = this.candidateTimers.get(blockId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(() => {
            recordRuntimePerformanceSpan(
                'autocard',
                'candidate.settle-latency',
                Date.now() - context.enqueuedAt,
                {
                    actionCount: context.actions.length,
                    delayMs,
                    txBatchId: context.txBatchId,
                    reason,
                    retryAttempt: context.retryAttempt,
                },
            );
            this.candidateTimers.delete(blockId);
            void this.processSettledCandidate(blockId);
        }, delayMs);

        this.candidateTimers.set(blockId, timer);
    }

    private isTransientReadinessStatus(status: AutoCardCheckStatus): boolean {
        return status === 'empty-content' || status === 'missing-block';
    }

    private toTerminalCandidateOutcome(status: AutoCardCheckStatus): {
        status: ListenerCandidateLifecycleStatus;
        reason: string;
    } {
        if (status === 'executed-planner-decision' || status === 'executed-topic-derived') {
            return { status: 'created', reason: status };
        }
        if (status === 'error') {
            return { status: 'failed', reason: status };
        }
        return { status: 'skipped', reason: status || 'unknown' };
    }

    private scheduleRetryForTransientCandidate(
        blockId: string,
        reason: AutoCardCheckStatus,
        context: CandidateBlockContext
    ): boolean {
        const nextAttempt = context.retryAttempt + 1;
        if (nextAttempt > this.candidateRetryDelaysMs.length) {
            return false;
        }
        const delayMs = this.candidateRetryDelaysMs[nextAttempt - 1] ?? this.candidateRetryDelaysMs[this.candidateRetryDelaysMs.length - 1];
        const nextContext: CandidateBlockContext = {
            ...context,
            retryAttempt: nextAttempt,
            followUpRequested: false,
            enqueuedAt: Date.now(),
        };
        this.candidateContexts.set(blockId, nextContext);
        this.recordListenerCandidateLifecycle(nextContext, 'retry-scheduled', reason, {
            terminal: false,
            delayMs,
            attempt: nextAttempt,
        });
        this.scheduleCandidateTimer(blockId, delayMs, 'transient-retry', nextContext);
        return true;
    }

    private scheduleFollowUpCandidate(
        blockId: string,
        context: CandidateBlockContext,
        reason: string
    ): void {
        const nextContext: CandidateBlockContext = {
            ...context,
            retryAttempt: 0,
            followUpRequested: false,
            enqueuedAt: Date.now(),
        };
        this.candidateContexts.set(blockId, nextContext);
        this.recordListenerCandidateLifecycle(nextContext, 'retry-scheduled', reason, {
            terminal: false,
            delayMs: this.followUpEvaluationDelayMs,
        });
        this.scheduleCandidateTimer(blockId, this.followUpEvaluationDelayMs, reason, nextContext);
    }

    private enqueueCandidateBlock(blockId: string, txBatchId: string, action: string, opId: string): void {
        const existingContext = this.candidateContexts.get(blockId);
        const enqueuedAt = Date.now();
        const nextContext: CandidateBlockContext = existingContext
            ? {
                ...existingContext,
                txBatchId,
                actions: [...existingContext.actions, action],
                opIds: [...existingContext.opIds, opId],
                enqueuedAt,
                retryAttempt: 0,
            }
            : {
                candidateId: this.nextTraceId('listener-candidate'),
                blockId,
                txBatchId,
                actions: [action],
                enqueuedAt,
                opIds: [opId],
                retryAttempt: 0,
            };

        this.candidateContexts.set(blockId, nextContext);
        this.recordListenerCandidateLifecycle(nextContext, 'accepted', action, {
            terminal: false,
        });

        this.traceAutoCard('candidate.enqueue', {
            candidateId: nextContext.candidateId,
            blockId,
            txBatchId,
            action,
            opId,
            enqueueCount: nextContext.actions.length,
            delayMs: this.settledEvaluationDelayMs,
        });
        this.scheduleCandidateTimer(blockId, this.settledEvaluationDelayMs, 'settled-evaluation', nextContext);
    }

    private cancelPendingCandidate(blockId: string, txBatchId: string, reason: string): void {
        const existingContext = this.candidateContexts.get(blockId);
        const existingTimer = this.candidateTimers.get(blockId);
        if (existingTimer) {
            clearTimeout(existingTimer);
            this.candidateTimers.delete(blockId);
        }
        if (existingContext) {
            this.recordListenerCandidateLifecycle(existingContext, 'skipped', reason, {
                terminal: true,
            });
        }
        this.candidateContexts.delete(blockId);
        this.lastEvaluationFingerprintByBlock.delete(blockId);

        this.traceAutoCard('candidate.cancel', {
            blockId,
            txBatchId,
            reason,
        });
    }

    private async createXiuyuanFromBlocks(
        command: CreateXiuyuanFromBlocksCommand,
        source: AutoCardExecutionSource,
        decision?: CreationDecision
    ): Promise<XiuyuanCreateResult> {
        const xiuyuanAppService = await this.requireXiuyuanApplicationService();
        return measureRuntimePerformance('autocard', 'xiuyuan.create-from-blocks', () => xiuyuanAppService.createFromBlocks({
            ...command,
            source: command.source ?? this.mapXiuyuanSource(source),
            duplicatePolicy: command.duplicatePolicy ?? this.getDuplicatePolicyForSource(source),
            creationRuleId: command.creationRuleId ?? decision?.id,
            creationMode: command.creationMode ?? decision?.mode,
            renderProfile: command.renderProfile ?? decision?.renderProfile,
        }), {
            blockCount: command.blockIds?.length ?? 0,
            source,
            templateId: command.templateId,
        });
    }
    
    getTransactionConsumerId(): string {
        return 'autocard';
    }

    shouldHandleTransactionBatch(classification: TransactionClassification): boolean {
        return shouldDispatchAutoCard(classification);
    }

    handle(transactions: Transaction[], classification: TransactionClassification = classifyTransactionBatch(transactions)): void {
        const finishHandleSpan = startRuntimePerformanceSpan('autocard', 'handler.handle', {
            transactionCount: transactions.length,
        });

        const quickCardSettings = this.settingsService.getSettings().quickCard;
        logger.debug('[SiYuanMemo][AutoCard] Quick card settings:', quickCardSettings);
        if (!quickCardSettings?.enabled) {
            logger.debug('[SiYuanMemo][AutoCard] Quick card is disabled, skipping');
            finishHandleSpan({ quickCardEnabled: false, scheduledCount: 0 });
            return;
        }

        if (!this.shouldHandleTransactionBatch(classification)) {
            incrementRuntimePerformanceCounter('autocard', 'candidate-batches-skipped');
            finishHandleSpan({
                changedBlockCount: classification.changedBlockIds.length,
                pendingCandidateCount: this.candidateContexts.size,
                prefilteredCount: classification.autoCard.prefilteredNoOpCount,
                quickCardEnabled: true,
                scheduledCount: 0,
                skippedReason: 'classifier-no-match',
            });
            return;
        }
        
        logger.debug('[SiYuanMemo][AutoCard] Quick card is enabled, processing transactions');
        const txBatchId = this.nextTraceId('txbatch');
        const relevantOperations: Array<Record<string, unknown>> = [];
        let scheduledCount = 0;
        let cancelledCount = 0;
        const prefilteredCount = classification.autoCard.prefilteredNoOpCount;

        for (const operation of classification.autoCard.candidateOperations) {
            this.enqueueCandidateBlock(operation.blockId, txBatchId, operation.action, operation.opId);
            scheduledCount++;
            relevantOperations.push({
                action: operation.action,
                blockId: operation.blockId,
                evidence: operation.evidence,
                opId: operation.opId,
                scheduled: true,
            });
        }

        for (const blockId of classification.autoCard.cancelBlockIds) {
            this.cancelPendingCandidate(blockId, txBatchId, 'delete');
            cancelledCount++;
            relevantOperations.push({
                action: 'delete',
                blockId,
                cancelled: true,
                scheduled: false,
            });
        }

        if (prefilteredCount > 0) {
            recordRuntimePerformanceSpan('autocard', 'candidate.prefilter-no-op', 0, {
                prefilteredCount,
                txBatchId,
            });
        }

        this.traceAutoCard('handle.transactions', {
            txBatchId,
            pendingCandidateCount: this.candidateContexts.size,
            relevantOperations,
        });
        incrementRuntimePerformanceCounter('autocard', 'candidate-operations-scheduled', scheduledCount);
        incrementRuntimePerformanceCounter('autocard', 'candidate-operations-cancelled', cancelledCount);
        incrementRuntimePerformanceCounter('autocard', 'candidate-operations-prefiltered', prefilteredCount);
        finishHandleSpan({
            cancelledCount,
            pendingCandidateCount: this.candidateContexts.size,
            prefilteredCount,
            quickCardEnabled: true,
            scheduledCount,
            txBatchId,
        });
    }

    public async scanDocumentByRootId(rootId: string): Promise<AutoCardDocumentScanResult> {
        const requestedRootId = rootId.trim();
        const resolvedRootId = await this.resolveDocumentRootId(requestedRootId);
        const normalizedRootId = resolvedRootId || requestedRootId;
        const emptyResult: AutoCardDocumentScanResult = {
            rootId: normalizedRootId,
            scanned: 0,
            created: 0,
            skipped: 0,
            failed: 0,
            conflicted: 0,
            consumed: 0,
        };

        if (!normalizedRootId) {
            return emptyResult;
        }

        const backendClient = this.getSrsBackendClientOptional();
        const docScanQuickCardSettings: QuickCardSettings = {
            enabled: true,
            enabledSymbols: {
                basic: true,
                concept: true,
                descriptor: true,
                cloze: true,
                multiLine: true,
            },
            topicDerivation: {
                enabled: true,
                storageMode: 'workbench',
            },
        };

        const scanner = new DocumentPostCreationScanService(
            {
                getBlockKramdown: (blockId: string) => this.siyuanApi.getBlockKramdown(blockId),
            },
            this.hostBlockQuery,
            {
                executeSingleBlockDecision: async ({ blockId, content, decision }) => {
                    return this.executeAutoCardEnvelope({
                        kind: 'planner-decision',
                        blockId,
                        content,
                        decision,
                        source: 'doc-oneclick-scan',
                        docRootId: normalizedRootId,
                    });
                },
                executeStructuralDecision: async ({ blockId, content, decision }) => {
                    return this.executeAutoCardEnvelope({
                        kind: 'planner-decision',
                        blockId,
                        content,
                        decision,
                        source: 'doc-oneclick-scan',
                        docRootId: normalizedRootId,
                    });
                },
            },
            {
                planner: this.postCreationPlanner,
                conflictMediator: this.conflictMediator,
                resolveCardType: async ({ blockId, blockType, content }) => (
                    this.resolveDetectedCardType(blockId, blockType, content)
                ),
                resolveStructuralDecision: backendClient ? async ({ blockId, blockType, content, resolvedCardType }) => {
                    const decisionCoreResult = await this.resolveAutoCardDecisionCore({
                        blockId,
                        content,
                        blockType,
                        resolvedCardType: resolvedCardType === 'topic' ? 'topic' : 'item',
                        source: 'doc-oneclick-scan',
                        ruleScope: 'structural',
                        quickCardSettings: docScanQuickCardSettings,
                        sourceContext: null,
                    });
                    return {
                        matchedRuleIds: decisionCoreResult.matchedRuleIds,
                        enabledDecisions: decisionCoreResult.enabledDecisions,
                        selectedDecision: decisionCoreResult.selectedDecision,
                        conflicted: decisionCoreResult.conflicted,
                    };
                } : undefined,
                resolveSingleBlockDecision: async ({ blockId, blockType, content, resolvedCardType }) => {
                    const decisionCoreResult = await this.resolveAutoCardDecisionCore({
                        blockId,
                        content,
                        blockType,
                        resolvedCardType: resolvedCardType === 'topic' ? 'topic' : 'item',
                        source: 'doc-oneclick-scan',
                        ruleScope: 'single-block',
                        quickCardSettings: docScanQuickCardSettings,
                        sourceContext: null,
                    });
                    return {
                        matchedRuleIds: decisionCoreResult.matchedRuleIds,
                        enabledDecisions: decisionCoreResult.enabledDecisions,
                        selectedDecision: decisionCoreResult.selectedDecision,
                        conflicted: decisionCoreResult.conflicted,
                    };
                },
            }
        );

        const summary = await scanner.scanByRootId(normalizedRootId);
        return {
            rootId: summary.rootId,
            scanned: summary.scanned,
            created: summary.created,
            skipped: summary.skipped,
            failed: summary.failed,
            conflicted: summary.conflicted,
            consumed: summary.consumed,
        };
    }
    
    // Check a block for quick symbols and create all matched cards in one pass.
    private async checkQuickSymbols(blockId: string, options?: { force?: boolean }): Promise<AutoCardCheckStatus> {
        const finishCheckSpan = startRuntimePerformanceSpan('autocard', 'check-quick-symbols', {
            force: options?.force === true,
        });
        let status = 'started';
        let blockTypeForReport = '';
        let localCardCountForReport = 0;
        let enabledDecisionCountForReport = 0;
        let decisionStatusForReport: string | null = null;
        try {
            const traceContext = this.getActiveRunContext(blockId);

            const quickCardSettings = this.settingsService.getSettings().quickCard;
            if (!quickCardSettings) {
                status = 'no-settings';
                return status;
            }

            if (!quickCardSettings.enabled && !options?.force) {
                status = 'disabled';
                return status;
            }
            

            const { kramdown } = await measureRuntimePerformance(
                'autocard',
                'siyuan.get-block-kramdown',
                () => this.siyuanApi.getBlockKramdown(blockId),
                { blockId },
            );
            if (!kramdown) {
                logger.debug('[SiYuanMemo][AutoCard] Block has no content:', blockId);
                status = 'empty-content';
                return status;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Checking quick symbols:', blockId, 'content:', kramdown);
            

            const blockInfo = await measureRuntimePerformance(
                'autocard',
                'host-block-query.get-block',
                () => this.hostBlockQuery.getBlock(blockId),
                { blockId },
            );
            
            if (!blockInfo) {
                logger.debug('[SiYuanMemo][AutoCard] Block not found:', blockId);
                status = 'missing-block';
                return status;
            }
            
            const blockType = typeof blockInfo.type === 'string' ? blockInfo.type : '';
            blockTypeForReport = blockType;
            const rootId = typeof blockInfo.root_id === 'string' ? blockInfo.root_id.trim() : '';
            if (!this.isQuickSymbolSupportedBlockType(blockType)) {
                logger.debug(
                    '[SiYuanMemo][AutoCard] Block type not supported for symbol detection (type:',
                    blockType,
                    '), skipping'
                );
                status = 'unsupported-block-type';
                return status;
            }
            

            const attrs = await measureRuntimePerformance(
                'autocard',
                'siyuan.get-block-attrs',
                () => this.siyuanApi.getBlockAttrs(blockId),
                { blockId },
            );
            const existingCards = this.getLocalCardsByBlockId(blockId);
            localCardCountForReport = existingCards.length;
            
            const normalizedSettings: QuickCardSettings = {
                ...quickCardSettings,
                flashcard: {
                    mark: quickCardSettings.flashcard?.mark ?? true,
                    list: quickCardSettings.flashcard?.list ?? true,
                    heading: quickCardSettings.flashcard?.heading ?? true,
                    superBlock: quickCardSettings.flashcard?.superBlock ?? true,
                },
                enabledSymbols: {
                    basic: quickCardSettings.enabledSymbols?.basic ?? true,
                    concept: quickCardSettings.enabledSymbols?.concept ?? true,
                    descriptor: quickCardSettings.enabledSymbols?.descriptor ?? true,
                    cloze: quickCardSettings.enabledSymbols?.cloze ?? true,
                    multiLine: quickCardSettings.enabledSymbols?.multiLine ?? true,
                },
                topicDerivation: {
                    enabled: quickCardSettings.topicDerivation?.enabled ?? true,
                    storageMode: quickCardSettings.topicDerivation?.storageMode === 'source-child' ? 'source-child' : 'workbench',
                },
            };

            const resolvedCardType = await measureRuntimePerformance(
                'autocard',
                'resolve-detected-card-type',
                () => this.resolveDetectedCardType(blockId, blockType, kramdown),
                { blockType },
            );
            const progressiveSourceContext = await measureRuntimePerformance('autocard', 'resolve-progressive-source-context', () => resolveProgressiveSourceContext({
                blockId,
                rootId,
                cardLookup: {
                    getCardByBlockId: (candidateBlockId: string) => this.getLocalCardByBlockId(candidateBlockId),
                    getCardsByBlockId: (candidateBlockId: string) => this.getLocalCardsByBlockId(candidateBlockId),
                },
                attrLookup: {
                    getBlockAttrs: async (candidateBlockId: string) => this.siyuanApi.getBlockAttrs(candidateBlockId),
                },
            }), { rootKind: rootId ? 'document' : 'unknown' });
            const decisionCoreResult = await measureRuntimePerformance('autocard', 'decision.resolve-core', () => this.resolveAutoCardDecisionCore({
                blockId,
                content: kramdown,
                blockType,
                resolvedCardType,
                source: 'symbol-listener',
                quickCardSettings: normalizedSettings,
                sourceContext: progressiveSourceContext,
            }), {
                blockType,
                resolvedCardType,
                source: 'symbol-listener',
            });
            decisionStatusForReport = decisionCoreResult.status;
            const enabledDecisions = decisionCoreResult.enabledDecisions;
            enabledDecisionCountForReport = enabledDecisions.length;
            const evaluationFingerprint = this.buildEvaluationFingerprint({
                blockType,
                content: kramdown,
                attrs,
                localCardCount: existingCards.length,
                decisions: enabledDecisions,
            });
            const previousFingerprint = this.lastEvaluationFingerprintByBlock.get(blockId) ?? null;

            this.traceAutoCard('checkQuickSymbols.plan', {
                runId: traceContext?.runId ?? null,
                txBatchId: traceContext?.txBatchId ?? null,
                blockId,
                blockType,
                rootId,
                contentPreview: this.previewContent(kramdown),
                attrs: this.summarizeAttrs(attrs),
                localCardCount: existingCards.length,
                matchedRuleIds: decisionCoreResult.matchedRuleIds,
                enabledDecisions: enabledDecisions.map((decision) => this.summarizeDecision(decision)),
                hasBidirectionalBasicDecision: enabledDecisions.some((decision) => (
                    decision.id === 'BasicDirectionRule' && decision.direction === 'both'
                )),
                evaluationFingerprint,
                fingerprintChanged: previousFingerprint !== evaluationFingerprint,
                trigger: traceContext?.trigger ?? null,
                nextBlockId: traceContext?.nextBlockId ?? null,
            });

            if (previousFingerprint === evaluationFingerprint) {
                status = 'same-fingerprint';
                this.traceAutoCard('settledEvaluation.skipFingerprint', {
                    runId: traceContext?.runId ?? null,
                    txBatchId: traceContext?.txBatchId ?? null,
                    blockId,
                    evaluationFingerprint,
                });
                return status;
            }

            this.lastEvaluationFingerprintByBlock.set(blockId, evaluationFingerprint);

            if (
                progressiveSourceContext?.parentTopicCardId
                && enabledDecisions.length === 0
                && decisionCoreResult.markOnlyClozeCandidate
                && this.consumeSuppressedTopicDerivedMarkMutation(blockId)
            ) {
                logger.debug('[SiYuanMemo][AutoCard] Suppressed one programmatic Topic mark mutation after manual continuation', {
                    blockId,
                    rootId,
                });
                status = 'suppressed-topic-derived-mark';
                return status;
            }

            if (enabledDecisions.length === 0) {
                logger.debug('[SiYuanMemo][AutoCard] No enabled planner decision detected:', {
                    blockId,
                    matchedRules: decisionCoreResult.matchedRuleIds,
                });
                status = 'no-enabled-decisions';
                return status;
            }
            if (decisionCoreResult.shouldUseTopicDerivation) {
                const executionOwnership = this.resolveExecutionOwnership({
                    kind: 'topic-derived',
                });
                if (this.hasXiuyuanBinding(attrs) && progressiveSourceContext?.topicContext?.scope !== 'block') {
                    logger.debug('[SiYuanMemo][AutoCard] Skip topic derivation: current block already has a non-topic Xiuyuan binding', {
                        blockId,
                        rootId,
                    });
                    status = 'skip-topic-derived-bound-block';
                    return status;
                }

                this.traceAutoCard('decision.execute.begin', {
                    runId: traceContext?.runId ?? null,
                    txBatchId: traceContext?.txBatchId ?? null,
                    blockId,
                    candidateId: decisionCoreResult.candidateId,
                    decisionEventId: decisionCoreResult.decisionEventId,
                    decisionStatus: decisionCoreResult.status,
                    envelopeKind: 'topic-derived',
                    executionOwner: executionOwnership.owner,
                });
                const executed = await measureRuntimePerformance('autocard', 'execute-envelope.topic-derived', () => this.executeAutoCardEnvelope({
                    kind: 'topic-derived',
                    input: {
                        sourceBlockId: blockId,
                        sourceDocId: progressiveSourceContext.sourceDocId,
                        parentTopicCardId: progressiveSourceContext.parentTopicCardId!,
                        parentExcerptId: progressiveSourceContext.parentExcerptId,
                        sourceRootKind: progressiveSourceContext.rootKind,
                        plannerContent: kramdown,
                        mode: 'planner-derived',
                        decisions: enabledDecisions,
                        storageMode: normalizedSettings.topicDerivation?.storageMode,
                    },
                }), {
                    decisionStatus: decisionCoreResult.status,
                    enabledDecisionCount: enabledDecisions.length,
                });
                status = executed ? 'executed-topic-derived' : 'not-executed-topic-derived';
                this.traceAutoCard('decision.execute.end', {
                    runId: traceContext?.runId ?? null,
                    txBatchId: traceContext?.txBatchId ?? null,
                    blockId,
                    candidateId: decisionCoreResult.candidateId,
                    decisionEventId: decisionCoreResult.decisionEventId,
                    decisionStatus: decisionCoreResult.status,
                    envelopeKind: 'topic-derived',
                    executionOwner: executionOwnership.owner,
                    executed,
                });
                return status;
            }

            if (this.hasXiuyuanBinding(attrs)) {
                logger.debug('[SiYuanMemo][AutoCard] Block is already part of a Xiuyuan card, skipping:', blockId);
                status = 'skip-bound-block';
                return status;
            }

            if (existingCards.length > 0) {
                logger.debug('[SiYuanMemo][AutoCard] Block already has non-topic card and no topic derivation context:', {
                    blockId,
                    existingCardCount: existingCards.length,
                    rootId,
                });
                status = 'skip-existing-card';
                return status;
            }

            this.traceAutoCard('checkQuickSymbols.resolution', {
                runId: traceContext?.runId ?? null,
                txBatchId: traceContext?.txBatchId ?? null,
                blockId,
                candidateId: decisionCoreResult.candidateId,
                decisionEventId: decisionCoreResult.decisionEventId,
                decisionStatus: decisionCoreResult.status,
                decisionUnavailableClass: decisionCoreResult.unavailableClass,
                strategy: 'semantic-first',
                selectedDecision: this.summarizeDecision(decisionCoreResult.selectedDecision),
                enabledDecisionIds: enabledDecisions.map((decision) => decision.id),
            });

            if (!decisionCoreResult.selectedDecision) {
                logger.info('[SiYuanMemo][AutoCard] Planner decision skipped by conflict strategy', {
                    blockId,
                    strategy: 'semantic-first',
                    decisions: enabledDecisions.map((decision) => decision.id),
                });
                status = 'skip-conflict-strategy';
                return status;
            }

            this.traceAutoCard('decision.execute.begin', {
                executionOwner: this.resolveExecutionOwnership({
                    kind: 'planner-decision',
                }).owner,
                runId: traceContext?.runId ?? null,
                txBatchId: traceContext?.txBatchId ?? null,
                blockId,
                candidateId: decisionCoreResult.candidateId,
                decisionEventId: decisionCoreResult.decisionEventId,
                decisionStatus: decisionCoreResult.status,
                envelopeKind: 'planner-decision',
            });
            const executed = await measureRuntimePerformance('autocard', 'execute-envelope.planner-decision', () => this.executeAutoCardEnvelope({
                kind: 'planner-decision',
                blockId,
                content: kramdown,
                decision: decisionCoreResult.selectedDecision,
                source: 'symbol-listener',
            }), {
                decisionId: decisionCoreResult.selectedDecision.id,
                decisionStatus: decisionCoreResult.status,
            });
            status = executed ? 'executed-planner-decision' : 'not-executed-planner-decision';
            this.traceAutoCard('decision.execute.end', {
                executionOwner: this.resolveExecutionOwnership({
                    kind: 'planner-decision',
                }).owner,
                runId: traceContext?.runId ?? null,
                txBatchId: traceContext?.txBatchId ?? null,
                blockId,
                candidateId: decisionCoreResult.candidateId,
                decisionEventId: decisionCoreResult.decisionEventId,
                decisionStatus: decisionCoreResult.status,
                envelopeKind: 'planner-decision',
                executed,
            });
        } catch (error) {
            status = 'error';
            logger.error('[SiYuanMemo][AutoCard] Error checking quick symbols:', blockId, error);
            return status;
        } finally {
            finishCheckSpan({
                blockType: blockTypeForReport,
                decisionStatus: decisionStatusForReport,
                enabledDecisionCount: enabledDecisionCountForReport,
                localCardCount: localCardCountForReport,
                status,
            }, {
                ok: status !== 'error',
                errorName: status === 'error' ? 'AutoCardCheckError' : undefined,
            });
        }
        return status;
    }

    private isDecisionEnabledBySettings(
        decision: CreationDecision,
        settings: QuickCardSettings
    ): boolean {
        const enabledSymbols = settings.enabledSymbols ?? {};

        switch (decision.family) {
            case 'basic':
                return enabledSymbols.basic !== false;
            case 'cloze':
                return enabledSymbols.cloze !== false;
            case 'concept-definition':
                return enabledSymbols.concept !== false;
            case 'descriptor':
                return enabledSymbols.descriptor !== false;
            case 'list-template':
            case 'cdf-multiline':
                return enabledSymbols.multiLine !== false;
            case 'default-riff':
            default:
                return true;
        }
    }

    private async executePlannerDecision(params: {
        blockId: string;
        content: string;
        decision: CreationDecision;
        source: AutoCardExecutionSource;
        docRootId?: string;
    }): Promise<boolean> {
        const { blockId, content, decision, source, docRootId } = params;
        const inlineContent = this.normalizeInlineSymbolContent(content);
        const clozeContent = this.normalizeClozeSymbolContent(content);
        const attrs = await this.siyuanApi.getBlockAttrs(blockId);

        if (this.hasXiuyuanBinding(attrs)) {
            logger.debug('[SiYuanMemo][AutoCard] Skip planner decision: block already has Xiuyuan binding', {
                blockId,
                source,
                ruleId: decision.id,
                executorKind: decision.executorKind,
            });
            return false;
        }

        const existedBefore = this.getLocalCardsByBlockId(blockId).length > 0;
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
                const direction = decision.direction || 'forward';
                await this.createBasicCard(
                    blockId,
                    direction,
                    inlineContent,
                    this.normalizeTopicItemCardType(decision.cardType),
                    undefined,
                    source,
                    decision
                );
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
                await this.createClozeCard(
                    blockId,
                    clozeContent,
                    this.normalizeTopicItemCardType(decision.cardType),
                    decision,
                    source
                );
                break;
            }
            case 'concept-definition-inline': {
                const direction = decision.direction === 'backward'
                    ? 'reverse'
                    : decision.direction === 'forward'
                        ? 'forward'
                        : 'both';
                await this.createConceptCard(blockId, inlineContent, undefined, direction, source, {
                    skipEnsureConceptDocumentBlockId: source === 'doc-oneclick-scan' ? docRootId : undefined,
                }, decision);
                break;
            }
            case 'descriptor-inline': {
                const direction = decision.direction === 'backward'
                    ? 'reverse'
                    : decision.direction === 'both'
                        ? 'both'
                        : 'forward';
                await this.createDescriptorCard(blockId, inlineContent, undefined, direction, source, {
                    skipDocumentConceptAutoCreateBlockId: source === 'doc-oneclick-scan' ? docRootId : undefined,
                }, decision);
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
                    this.normalizeTopicItemCardType(decision.cardType)
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

        const existedAfter = this.getLocalCardsByBlockId(blockId).length > 0;
        return !existedBefore && existedAfter;
    }

    private async createListTemplateCardsByPlanner(
        parentBlockId: string,
        cardType: 'topic' | 'item'
    ): Promise<boolean> {
        const resolvedChildren = await resolveListChildrenBySubtype(parentBlockId, this.siyuanApi as never);
        const childBlocks = [...resolvedChildren.orderedChildren, ...resolvedChildren.unorderedChildren]
            .map((child) => ({ id: child.id }));

        if (childBlocks.length < 2) {
            logger.debug('[SiYuanMemo][AutoCard] Structural list-template skipped: not enough child list items', {
                parentBlockId,
                childCount: childBlocks.length,
            });
            return false;
        }

        const cardService = this.getCardService();
        const existingBefore = childBlocks.reduce((count, child) => (
            cardService.getCardByBlockId(child.id) ? count + 1 : count
        ), 0);

        await this.createListTemplateCards(parentBlockId, childBlocks, cardType);

        const existingAfter = childBlocks.reduce((count, child) => (
            cardService.getCardByBlockId(child.id) ? count + 1 : count
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

        const xiuyuanAppService = await this.requireXiuyuanApplicationService();
        const useCase = new CreateCdfMultilineCardsUseCase(
            xiuyuanAppService,
            {
                BUILTIN_DECK_ID: this.riffApi.BUILTIN_DECK_ID,
                getBlockAttrs: (blockId: string) => this.siyuanApi.getBlockAttrs(blockId),
                getBlockKramdown: (blockId: string) => this.siyuanApi.getBlockKramdown(blockId),
            },
            this.hostBlockQuery,
        );

        const result = await useCase.execute({
            parentBlockId,
            templateId,
            deckId: this.riffApi.BUILTIN_DECK_ID,
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

    private isQuickSymbolSupportedBlockType(blockType: string): boolean {
        // `p`: paragraph, `m`: formula block.
        return blockType === 'p' || blockType === 'm';
    }

    // Process one settled candidate block after the debounce window has converged.
    private async processSettledCandidate(blockId: string): Promise<void> {
        logger.debug('[SiYuanMemo][AutoCard] Processing settled candidate block:', blockId);
        const candidateContext = this.candidateContexts.get(blockId);
        const finishCandidateSpan = startRuntimePerformanceSpan('autocard', 'candidate.process-settled', {
            actionCount: candidateContext?.actions.length ?? 0,
            txBatchId: candidateContext?.txBatchId,
        });
        const runId = this.nextTraceId('run');
        const startedAt = Date.now();
        const alreadyProcessing = this.processing.has(blockId);
        const traceContext: AutoCardTraceContext = {
            runId,
            trigger: 'settled-candidate',
            ...(candidateContext?.txBatchId ? { txBatchId: candidateContext.txBatchId } : {}),
        };
        this.traceAutoCard('settledEvaluation.begin', {
            runId,
            blockId,
            trigger: traceContext.trigger,
            txBatchId: traceContext.txBatchId ?? null,
            alreadyProcessing,
            processingSizeBefore: this.processing.size,
            candidateActions: candidateContext?.actions ?? [],
            candidateOpIds: candidateContext?.opIds ?? [],
        });

        if (alreadyProcessing) {
            logger.debug('[SiYuanMemo][AutoCard] Block already processing:', blockId);
            if (candidateContext) {
                const nextContext: CandidateBlockContext = {
                    ...candidateContext,
                    followUpRequested: true,
                };
                this.candidateContexts.set(blockId, nextContext);
                this.recordListenerCandidateLifecycle(nextContext, 'retry-scheduled', 'already-processing', {
                    terminal: false,
                    runId,
                    delayMs: this.followUpEvaluationDelayMs,
                });
            }
            this.traceAutoCard('settledEvaluation.end', {
                runId,
                blockId,
                trigger: traceContext.trigger,
                txBatchId: traceContext.txBatchId ?? null,
                durationMs: Date.now() - startedAt,
                error: null,
                skipped: 'already-processing',
                processingSizeAfter: this.processing.size,
            });
            finishCandidateSpan({
                runId,
                skipped: 'already-processing',
                txBatchId: traceContext.txBatchId ?? null,
            });
            return;
        }
        
        this.processing.add(blockId);
        this.activeRunContexts.set(blockId, traceContext);
        let errorMessage: string | null = null;
        let checkStatus: AutoCardCheckStatus = 'started';
        let scheduledContinuation = false;
        
        try {
            checkStatus = await this.checkQuickSymbols(blockId);
        } catch (error) {
            errorMessage = this.getErrorMessage(error);
            checkStatus = 'error';
            logger.error('[SiYuanMemo][AutoCard] Failed to process settled candidate block:', blockId, error);
        } finally {
            this.processing.delete(blockId);
            this.activeRunContexts.delete(blockId);
            const currentContext = this.candidateContexts.get(blockId) ?? candidateContext ?? null;
            if (currentContext) {
                if (!errorMessage && this.isTransientReadinessStatus(checkStatus)) {
                    scheduledContinuation = this.scheduleRetryForTransientCandidate(blockId, checkStatus, currentContext);
                    if (!scheduledContinuation) {
                        this.recordListenerCandidateLifecycle(currentContext, 'retry-exhausted', checkStatus, {
                            terminal: true,
                            runId,
                        });
                    }
                } else if (!errorMessage && currentContext.followUpRequested) {
                    scheduledContinuation = true;
                    this.scheduleFollowUpCandidate(blockId, currentContext, 'already-processing-follow-up');
                } else {
                    const terminalOutcome = this.toTerminalCandidateOutcome(checkStatus);
                    this.recordListenerCandidateLifecycle(currentContext, terminalOutcome.status, terminalOutcome.reason, {
                        terminal: true,
                        runId,
                    });
                }
            }
            if (!scheduledContinuation && !this.candidateTimers.has(blockId)) {
                this.candidateContexts.delete(blockId);
            }
            this.traceAutoCard('settledEvaluation.end', {
                runId,
                blockId,
                trigger: traceContext.trigger,
                txBatchId: traceContext.txBatchId ?? null,
                durationMs: Date.now() - startedAt,
                error: errorMessage,
                status: checkStatus,
                scheduledContinuation,
                processingSizeAfter: this.processing.size,
            });
            finishCandidateSpan({
                hasError: Boolean(errorMessage),
                runId,
                status: checkStatus,
                scheduledContinuation,
                txBatchId: traceContext.txBatchId ?? null,
            }, {
                ok: !errorMessage,
                errorName: errorMessage ? 'AutoCardCandidateError' : undefined,
            });
        }
    }
    

    
    // Create one-way basic card or symbol card.
    private async createBasicCard(
        blockId: string,
        direction: string,
        content: string,
        cardType: 'topic' | 'item' = 'item',
        actualSymbol?: string,
        source: AutoCardExecutionSource = 'symbol-listener',
        decision?: CreationDecision
    ): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating basic card:', blockId, direction, 'symbol:', actualSymbol);

            const parsed = parseBasicDirectionContent(content);
            if (!parsed || parsed.direction !== direction) {
                logger.error('[SiYuanMemo][AutoCard] Failed to parse basic card content:', content);
                return;
            }

            const question = parsed.question;
            const answer = parsed.answer;

            if (parsed.direction === 'both') {
                await this.createBidirectionalCard(blockId, question, answer, cardType, source, decision);
                return;
            }


            const { ClozeDetector } = await import('@/utils/cloze-detector');
            const backClozes = ClozeDetector.extractClozes(answer);
            

            if (backClozes.length > 0) {
                logger.debug('[SiYuanMemo][AutoCard] Detected back clozes:', backClozes.length);

                const result = await this.createXiuyuanFromBlocks({
                    blockIds: [blockId],
                    templateId: 'builtin-quick-card',
                    fieldMapping: { content: blockId },
                    deckId: this.riffApi.BUILTIN_DECK_ID,
                    cardType,
                    backClozeInfo: {
                        originalContent: content,
                        front: question,
                        back: answer,
                        clozes: backClozes,
                        direction: 'forward',
                        symbol: actualSymbol ?? parsed.symbol
                    },
                }, source, decision);
                
                if (isErr(result)) {
                    throw new Error(`Failed to create cards with back cloze: ${result.error?.message}`);
                }
                
                await this.siyuanApi.pushMsg(`已创建 ${result.value.cards.length} 张卡片（背面挖空）`);
                return;
            }

            const result = await this.createXiuyuanFromBlocks({
                blockIds: [blockId],
                templateId: 'builtin-quick-card',
                fieldMapping: { content: blockId },
                deckId: this.riffApi.BUILTIN_DECK_ID,
                cardType,
            }, source, decision);

            if (isErr(result)) {
                throw new Error(`Failed to create symbol card: ${this.getErrorMessage(result.error)}`);
            }

            logger.debug('[SiYuanMemo][AutoCard] Basic card created successfully:', blockId, direction);

            const symbolText = parsed.symbol;
            await this.siyuanApi.pushMsg(`已创建${direction === 'forward' ? '正向' : '反向'}卡片 (${symbolText})`);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create basic card:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建基础卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create bidirectional concept card with term/definition.
    private async createBidirectionalCard(
        blockId: string,
        term: string,
        definition: string,
        cardType: 'topic' | 'item' = 'item',
        source: AutoCardExecutionSource = 'symbol-listener',
        decision?: CreationDecision
    ): Promise<void> {
        try {
            const traceContext = this.getActiveRunContext(blockId);
            logger.debug('[SiYuanMemo][AutoCard] Creating bidirectional card using Xiuyuan:', blockId);
            
            const { ClozeDetector } = await import('@/utils/cloze-detector');
            const backClozes = ClozeDetector.extractClozes(definition);
            const templateId = backClozes.length > 0 ? 'builtin-quick-card' : 'builtin-bidirectional-single';
            this.traceAutoCard('createBidirectionalCard.begin', {
                runId: traceContext?.runId ?? null,
                txBatchId: traceContext?.txBatchId ?? null,
                blockId,
                templateId,
                termPreview: this.previewContent(term),
                definitionPreview: this.previewContent(definition),
                backClozeCount: backClozes.length,
            });
            
                        

            if (backClozes.length > 0) {
                logger.debug('[SiYuanMemo][AutoCard] Detected back clozes in bidirectional card:', backClozes.length);
                
                const result = await this.createXiuyuanFromBlocks({
                    blockIds: [blockId],
                    templateId: 'builtin-quick-card',
                    fieldMapping: { content: blockId },
                    deckId: this.riffApi.BUILTIN_DECK_ID,
                    cardType,
                    backClozeInfo: {
                        originalContent: `${term} <> ${definition}`,
                        front: term,
                        back: definition,
                        clozes: backClozes,
                        direction: 'both',
                        symbol: '<>'
                    },
                }, source, decision);
                
                if (isErr(result)) {
                    throw new Error(`Failed to create bidirectional card with back cloze: ${result.error?.message}`);
                }
                
                const totalCards = backClozes.length + 1;
                this.traceAutoCard('createBidirectionalCard.success', {
                    runId: traceContext?.runId ?? null,
                    txBatchId: traceContext?.txBatchId ?? null,
                    blockId,
                    templateId,
                    xiuyuanId: result.value.xiuyuan.id,
                    cardCount: result.value.cards.length,
                    backClozeCount: backClozes.length,
                    reportedTotalCards: totalCards,
                });
                                await this.siyuanApi.pushMsg(`已创建双向卡片 (<>)，共 ${totalCards} 张（背面挖空）`);
                return;
            }
            
            const result = await this.createXiuyuanFromBlocks({
                blockIds: [blockId],
                templateId: 'builtin-bidirectional-single',
                fieldMapping: {
                    content: blockId
                },
                deckId: this.riffApi.BUILTIN_DECK_ID,
                cardType,
            }, source, decision);
            
            if (isErr(result)) {
                throw new Error('Failed to create bidirectional card via Xiuyuan');
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Bidirectional card created via Xiuyuan:', {
                xiuyuanID: result.value.xiuyuan.id,
                cardCount: result.value.cards.length,
                blockId
            });
            this.traceAutoCard('createBidirectionalCard.success', {
                runId: traceContext?.runId ?? null,
                txBatchId: traceContext?.txBatchId ?? null,
                blockId,
                templateId,
                xiuyuanId: result.value.xiuyuan.id,
                cardCount: result.value.cards.length,
                backClozeCount: 0,
                reportedTotalCards: result.value.cards.length,
            });
            

                        await this.siyuanApi.pushMsg(`已创建双向卡片 (<>)，共 ${result.value.cards.length} 张`);
        } catch (error) {
            const traceContext = this.getActiveRunContext(blockId);
            this.traceAutoCard('createBidirectionalCard.error', {
                runId: traceContext?.runId ?? null,
                txBatchId: traceContext?.txBatchId ?? null,
                blockId,
                error: this.getErrorMessage(error),
            });
            logger.error('[SiYuanMemo][AutoCard] Failed to create bidirectional card:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建双向卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create concept-definition style cards from block reference syntax.
    private async createConceptCard(
        blockId: string, 
        content: string, 
        actualSymbol?: string,
        direction: 'both' | 'forward' | 'reverse' = 'both',
        source: AutoCardExecutionSource = 'symbol-listener',
        options?: {
            skipEnsureConceptDocumentBlockId?: string;
        },
        decision?: CreationDecision
    ): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating concept card:', blockId, 'symbol:', actualSymbol, 'direction:', direction);
            


            let blockRefPattern: RegExp;
            if (direction === 'forward') {
                blockRefPattern = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)\s*(:>|：》)\s*(.+)/;
            } else if (direction === 'reverse') {
                blockRefPattern = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)\s*(:<|：《)\s*(.+)/;
            } else {
                blockRefPattern = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)\s*(::|：：)\s*(.+)/;
            }
            
            const blockRefMatch = content.match(blockRefPattern);
            
            if (blockRefMatch) {

                const refId = blockRefMatch[1];
                const definition = blockRefMatch[3].trim();
                
                logger.debug('[SiYuanMemo][AutoCard] Detected block reference format:', refId, definition);
                

                const refBlock = await this.hostBlockQuery.getBlockTypeAndContent(refId);
                
                if (!refBlock) {
                    logger.error('[SiYuanMemo][AutoCard] Block reference not found:', refId);
                    return;
                }
                
                if (refBlock.type !== 'd') {
                    logger.debug('[SiYuanMemo][AutoCard] Block reference is not a document block, skipping:', refId);
                                        await this.siyuanApi.pushErrMsg('概念定义卡要求引用文档块，当前引用不是文档块');
                    return;
                }
                
                const conceptName = refBlock.content;
                logger.debug('[SiYuanMemo][AutoCard] Concept name from document block:', conceptName);
                

                const clozePattern = /==(.+?)==|\{\{(.+?)\}\}/g;
                const clozes = [...definition.matchAll(clozePattern)];
                
                logger.debug('[SiYuanMemo][AutoCard] Detected clozes in definition:', clozes.length);
                

                if (clozes.length > 0) {

                    logger.debug('[SiYuanMemo][AutoCard] Creating multi-cloze concept definition cards, direction:', direction);
                    

                    const dynamicCardRules = [];
                    for (let i = 0; i < clozes.length; i++) {
                        if (direction === 'both' || direction === 'forward') {
                            dynamicCardRules.push({
                                typeMarker: `concept-definition-cloze-${i}-forward`,
                                frontFields: ['concept'],
                                backFields: ['definition'],
                            });
                        }
                        if (direction === 'both' || direction === 'reverse') {
                            dynamicCardRules.push({
                                typeMarker: `concept-definition-cloze-${i}-reverse`,
                                frontFields: ['definition'],
                                backFields: ['concept'],
                            });
                        }
                    }
                    

                    const directionSuffix = direction === 'both' ? 'both' : direction === 'forward' ? 'fwd' : 'rev';
                    const tempTemplateId = `cd-cloze-${directionSuffix}-${blockId.slice(-7)}`;
                    const tempTemplate = {
                        id: tempTemplateId,
                        name: 'Concept Definition (Multi Cloze - Bidirectional)',
                        description: 'Concept definition cards with multi-cloze support.',
                        fields: [
                            { name: 'concept', description: 'Concept block' },
                            { name: 'definition', description: 'Definition block with cloze' },
                        ],
                        cardRules: dynamicCardRules,
                    };
                    

                    await xiuyuanAppService.createTemplate(tempTemplate);
                    

                    const result = await this.createXiuyuanFromBlocks({
                        blockIds: [blockId, refId],
                        templateId: tempTemplateId,
                        fieldMapping: {
                            concept: refId,
                            definition: blockId
                        },
                        deckId: this.riffApi.BUILTIN_DECK_ID,
                    }, source, decision);
                    
                    if (isErr(result)) {
                        const errorMsg = this.getErrorMessage(result.error);
                        logger.error('[SiYuanMemo][AutoCard] Failed to create multi-cloze concept card:', errorMsg);
                        return;
                    }
                    
                    logger.debug('[SiYuanMemo][AutoCard] Created', clozes.length * 2, 'concept definition cards (bidirectional with cloze)');
                    
                } else {

                    logger.debug('[SiYuanMemo][AutoCard] Creating concept definition card, direction:', direction);
                    logger.debug('[SiYuanMemo][AutoCard] blockIds order:', [blockId, refId], 'definition first, concept second');
                    
                    let templateId: string;
                    let cardCount: number;
                    
                    if (direction === 'both') {

                        templateId = 'builtin-concept-definition';
                        cardCount = 2;
                    } else if (direction === 'forward') {

                        templateId = 'builtin-concept-definition-forward';
                        cardCount = 1;
                    } else {

                        templateId = 'builtin-concept-definition-reverse';
                        cardCount = 1;
                    }
                    
                    const result = await this.createXiuyuanFromBlocks({
                        blockIds: [blockId, refId],
                        templateId: templateId,
                        fieldMapping: {
                            concept: refId,
                            definition: blockId
                        },
                        deckId: this.riffApi.BUILTIN_DECK_ID,
                        cardType: 'descriptor'
                    }, source, decision);
                    
                    if (isErr(result)) {
                        const errorMsg = this.getErrorMessage(result.error);
                        logger.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan concept card:', errorMsg);
                        return;
                    }
                    
                    logger.debug('[SiYuanMemo][AutoCard] Created', cardCount, 'concept definition card(s)');
                }
                
                logger.debug('[SiYuanMemo][AutoCard] Concept definition card created successfully:', blockId);
                

                const skipEnsureConceptDocumentBlockId = typeof options?.skipEnsureConceptDocumentBlockId === 'string'
                    ? options.skipEnsureConceptDocumentBlockId.trim()
                    : '';
                if (skipEnsureConceptDocumentBlockId && refId === skipEnsureConceptDocumentBlockId) {
                    logger.info('[SiYuanMemo][AutoCard] Skip ensuring concept document card for current doc root in doc scan', {
                        blockId,
                        refId,
                        skipEnsureConceptDocumentBlockId,
                    });
                } else {
                    logger.debug('[SiYuanMemo][AutoCard] About to ensure concept document card for:', refId, conceptName);
                    await this.ensureConceptBlockCard(refId, conceptName);
                    logger.debug('[SiYuanMemo][AutoCard] Finished ensuring concept document card');
                }
                
                const directionText = direction === 'both' ? 'bidirectional' : direction === 'forward' ? 'forward' : 'reverse';
                let message: string;
                if (clozes.length > 0) {
                    const totalCards = direction === 'both' ? clozes.length * 2 : clozes.length;
                    message = `Created ${totalCards} concept-definition cards (${directionText} + cloze).`;
                } else {
                    const cardCount = direction === 'both' ? 2 : 1;
                    message = `Created ${cardCount} concept-definition cards (${directionText}).`;
                }
                await this.siyuanApi.pushMsg(message);
                
            } else {

                logger.debug('[SiYuanMemo][AutoCard] Not a valid block reference format, skipping');
                                await this.siyuanApi.pushErrMsg('概念定义卡格式错误：需要使用 [[概念]]::定义 格式，且概念必须是文档块引用');
            }
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create concept card:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建概念卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create descriptor cards linked to nearest/derived concept card.
    private async createDescriptorCard(
        blockId: string, 
        content: string, 
        actualSymbol?: string,
        direction: 'forward' | 'reverse' | 'both' = 'forward',
        source: AutoCardExecutionSource = 'symbol-listener',
        options?: {
            skipDocumentConceptAutoCreateBlockId?: string;
        },
        decision?: CreationDecision
    ): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating descriptor card:', blockId, 'symbol:', actualSymbol, 'direction:', direction);
            

            let match: RegExpMatchArray | null = null;
            if (direction === 'both') {
                match = content.match(this.patterns.descriptorBoth);
            } else if (direction === 'reverse') {
                match = content.match(this.patterns.descriptorReverse);
            } else {
                match = content.match(this.patterns.descriptor);
            }
            
            if (!match) {
                logger.error('[SiYuanMemo][AutoCard] Failed to parse descriptor card content:', content);
                return;
            }
            
            const attribute = match[1].trim();
            const description = match[3].trim();
            
            if (!attribute || !description) {
                logger.error('[SiYuanMemo][AutoCard] Empty attribute or description:', content);
                return;
            }
            

            const hasListParent = await this.hasListItemParent(blockId);
            logger.debug('[SiYuanMemo][AutoCard] Has list item parent:', hasListParent);
            
            let foundConceptId: string | null = null;
            
            if (hasListParent) {

                logger.debug('[SiYuanMemo][AutoCard] Case A: Has list parent, searching ancestors...');
                foundConceptId = await this.findConceptInAncestors(blockId, 4);
            } else {

                logger.debug('[SiYuanMemo][AutoCard] Case B: No list parent, searching heading/document...');
                foundConceptId = await this.findConceptWithoutListParent(
                    blockId,
                    options?.skipDocumentConceptAutoCreateBlockId
                );
            }
            
            if (!foundConceptId) {
                logger.warn('[SiYuanMemo][AutoCard] No concept card found for descriptor, skipping creation');
                await this.siyuanApi.pushErrMsg('描述符卡创建失败：未找到可关联的概念卡');
                return;
            }
            logger.debug('[SiYuanMemo][AutoCard] Found concept card:', foundConceptId, ', creating Xiuyuan descriptor card');
            

            
                        

            let templateId: string;
            let cardCount: number;
            
            if (direction === 'forward') {

                templateId = 'builtin-concept-descriptor';
                cardCount = 1;
            } else if (direction === 'reverse') {

                templateId = 'builtin-concept-descriptor-reverse';
                cardCount = 1;
            } else {

                templateId = 'builtin-concept-descriptor-both';
                cardCount = 2;
            }
            

                        const currentAttrs = await this.siyuanApi.getBlockAttrs(blockId);
            if (this.hasXiuyuanBinding(currentAttrs)) {
                logger.debug('[SiYuanMemo][AutoCard] Block already has Xiuyuan card (race condition detected), skipping:', blockId);
                return;
            }
            

            const result = await this.createXiuyuanFromBlocks({
                blockIds: [foundConceptId, blockId],
                templateId: templateId,
                fieldMapping: {
                    concept: foundConceptId,
                    descriptor: blockId
                },
                deckId: this.riffApi.BUILTIN_DECK_ID,
                cardType: 'descriptor'
            }, source, decision);
            
            if (isErr(result)) {
                const errorMsg = this.getErrorMessage(result.error);
                logger.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan descriptor card:', errorMsg);
                await this.siyuanApi.pushErrMsg(`创建描述符卡片失败：${errorMsg}`);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Descriptor card created successfully:', blockId);
            

            const directionText = direction === 'forward' ? 'forward' : direction === 'reverse' ? 'reverse' : 'bidirectional';
            await this.siyuanApi.pushMsg(`已创建${cardCount}张描述符卡片（${directionText}）`);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create descriptor card:', blockId, error);
            await this.siyuanApi.pushErrMsg(`创建描述符卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create cloze cards, switching to multi-card flow for multiple clozes.
    private async createClozeCard(
        blockId: string,
        content: string,
        resolvedCardType: 'topic' | 'item' = 'item',
        initialDecision?: CreationDecision,
        source: AutoCardExecutionSource = 'symbol-listener'
    ): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating cloze card:', blockId);
            

            const clozes = ClozeDetector.extractClozes(content);
            
            if (clozes.length === 0) {
                logger.error('[SiYuanMemo][AutoCard] No cloze found in content:', content);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Found clozes:', clozes.length, clozes);

            const postCreationPlan = initialDecision ? null : this.postCreationPlanner.plan({
                blockId,
                content,
                source: 'symbol-listener',
                resolvedCardType,
            });
            const clozeDecision = initialDecision?.executorKind === 'quick-cloze'
                ? initialDecision
                : postCreationPlan?.decisions.find((decision) => decision.executorKind === 'quick-cloze');
            const clozeRenderMode = clozeDecision?.renderProfile === 'quick-inline-formula'
                ? 'inline-formula-cloze'
                : 'default';

            logger.debug('[SiYuanMemo][AutoCard] Post-creation plan for cloze card:', {
                blockId,
                mode: clozeDecision?.mode || 'single',
                templateId: clozeDecision?.templateId || 'builtin-multi-cloze',
                renderMode: clozeRenderMode,
                ruleId: clozeDecision?.id,
            });
            
            await this.createMultipleClozeCards(
                blockId,
                content,
                clozes,
                clozeRenderMode,
                resolvedCardType,
                source,
                clozeDecision ?? initialDecision
            );
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create cloze card:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建填空卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create multi-cloze cards through Xiuyuan template.
    private async createMultipleClozeCards(
        blockId: string,
        content: string,
        clozes: Array<{ text: string; type: 'brace' | 'equal' | 'mark' | 'latex' }>,
        clozeRenderMode: 'inline-formula-cloze' | 'default' = 'default',
        cardType: 'topic' | 'item' = 'item',
        source: AutoCardExecutionSource = 'symbol-listener',
        decision?: CreationDecision
    ): Promise<void> {
        try {
            const clozesWithPosition = ClozeDetector.extractClozes(content);
            clozesWithPosition.sort((a, b) => a.start - b.start);
            
            logger.debug('[SiYuanMemo][AutoCard] Extracted clozes with positions:', clozesWithPosition);
            

            const result = await this.createXiuyuanFromBlocks({
                blockIds: [blockId],
                templateId: 'builtin-multi-cloze',
                fieldMapping: {
                    content: blockId
                },
                deckId: this.riffApi.BUILTIN_DECK_ID,
                cardType,
                clozeRenderMode,
                clozeInfo: {
                    originalContent: content,
                    clozes: clozesWithPosition
                }
            }, source, decision);
            
            if (isErr(result)) {
                const errorMsg = this.getErrorMessage(result.error);
                logger.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan cloze cards:', errorMsg);
                await this.siyuanApi.pushErrMsg(`创建填空卡片失败：${errorMsg}`);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Multiple cloze cards created:', blockId, 'count:', result.value.cards.length);
            

            const hasEqual = clozes.some(c => c.type === 'equal');
            const hasBrace = clozes.some(c => c.type === 'brace');
            const hasMark = clozes.some(c => c.type === 'mark');
            const hasLatex = clozes.some(c => c.type === 'latex');
            let symbolText = '';
            if (hasLatex) {
                symbolText = '\\cloze{}';
            } else if (hasMark) {
                symbolText = 'mark';
            } else if (hasEqual && hasBrace) {
                symbolText = '{{}} / ==';
            } else if (hasEqual) {
                symbolText = '==';
            } else {
                symbolText = '{{}}';
            }
            await this.siyuanApi.pushMsg(`Created ${clozes.length} cloze cards (${symbolText})`);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Error creating multiple cloze cards:', error);
            await this.siyuanApi.pushErrMsg(`创建填空卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create list template cards based on parent question and child entries.
    private async createListTemplateCards(
        blockId: string,
        children: ListChildBlock[],
        cardType: 'topic' | 'item' = 'item'
    ): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating list template cards:', blockId, 'children:', children.length);
            

            const cardService = this.getCardService();
            const existingCard = cardService.getCardByBlockId(blockId);
            
            if (existingCard) {
                logger.debug('[SiYuanMemo][AutoCard] Block already has card:', blockId);
                return;
            }
            

                        const { kramdown: parentContent } = await this.siyuanApi.getBlockKramdown(blockId);
            if (!parentContent) {
                logger.error('[SiYuanMemo][AutoCard] Parent block has no content:', blockId);
                return;
            }
            

            const questionMatch = parentContent.match(this.patterns.multiLine);
            if (!questionMatch) {
                logger.error('[SiYuanMemo][AutoCard] Failed to parse list template question:', parentContent);
                return;
            }
            // Note: question is extracted but not used directly, as it's part of the parent block
            

            const childBlocks = [];
            for (const child of children) {
                const { kramdown: childContent } = await this.siyuanApi.getBlockKramdown(child.id);
                if (!childContent) continue;
                

                const cueMatch = childContent.match(this.patterns.listCue);
                if (cueMatch) {

                    childBlocks.push({
                        id: child.id,
                        cue: cueMatch[1].trim(),
                        answer: cueMatch[2].trim()
                    });
                } else {

                    childBlocks.push({
                        id: child.id,
                        cue: '',
                        answer: childContent.trim()
                    });
                }
            }
            
            if (childBlocks.length < 2) {
                logger.error('[SiYuanMemo][AutoCard] Not enough valid child blocks:', blockId);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Parsed child blocks:', childBlocks);
            

            const blockIDs = [blockId, ...childBlocks.map(c => c.id)];
            
            const result = await this.createXiuyuanFromBlocks({
                blockIds: blockIDs,
                templateId: 'builtin-list-item',
                fieldMapping: {
                    question: blockId,
                    items: childBlocks.map(c => c.id).join(',')
                },
                deckId: this.riffApi.BUILTIN_DECK_ID,
                cardType
            }, 'doc-oneclick-scan');
            
            if (isErr(result)) {
                const errorMsg = this.getErrorMessage(result.error);
                logger.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan cards:', errorMsg);
                                await this.siyuanApi.pushErrMsg(`创建列表模板卡片失败：${errorMsg}`);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] List template cards created successfully:', blockId, 'cards:', result.value.cards?.length);
            

                        await this.siyuanApi.pushMsg(`已创建列表模板卡片 (>>>), ${childBlocks.length} 个子项`);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create list template cards:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建列表模板卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Ensure referenced concept document has its own concept card.
    private async ensureConceptBlockCard(conceptBlockId: string, conceptName: string): Promise<void> {
        if (this.conceptCardEnsureInFlight.has(conceptBlockId)) {
            logger.debug('[SiYuanMemo][AutoCard] Concept document ensure already in flight, skipping:', conceptBlockId);
            return;
        }

        this.conceptCardEnsureInFlight.add(conceptBlockId);
        try {
            logger.debug('[SiYuanMemo][AutoCard] Ensuring concept document card:', conceptBlockId, conceptName);

            const attrs = await this.siyuanApi.getBlockAttrs(conceptBlockId);
            const hasXiuyuanId = this.hasXiuyuanBinding(attrs);
            const existingCard = this.getLocalCardByBlockId(conceptBlockId);

            if (hasXiuyuanId || existingCard) {
                logger.debug('[SiYuanMemo][AutoCard] Concept document already has card metadata:', conceptBlockId);
                return;
            }

            logger.debug('[SiYuanMemo][AutoCard] Creating Xiuyuan concept card for:', conceptName);
            
            const result = await this.createXiuyuanFromBlocks({
                blockIds: [conceptBlockId],
                templateId: 'builtin-concept-simple',
                fieldMapping: {
                    concept: conceptBlockId
                },
                deckId: this.riffApi.BUILTIN_DECK_ID
            }, 'symbol-listener');
            
            if (isErr(result)) {
                const errorMsg = this.getErrorMessage(result.error);
                logger.error('[SiYuanMemo][AutoCard] Failed to create concept card:', errorMsg);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Concept card created for document:', conceptBlockId);
            
                        await this.siyuanApi.pushMsg(`已为概念「${conceptName}」创建概念卡`);
            
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to ensure concept document card:', error);
        } finally {
            this.conceptCardEnsureInFlight.delete(conceptBlockId);
        }
    }
    
    // Cleanup timers and in-memory queues.
    dispose(): void {
        for (const timer of this.candidateTimers.values()) {
            clearTimeout(timer);
        }
        this.candidateTimers.clear();
        this.candidateContexts.clear();
        this.listenerCandidateDiagnostics.clear();
        this.listenerCandidateDiagnosticOrder.length = 0;
        this.activeRunContexts.clear();
        this.suppressedTopicDerivedMarkMutations.clear();
        this.lastEvaluationFingerprintByBlock.clear();
        this.processing.clear();
        this.conceptCardEnsureInFlight.clear();
        
        logger.debug('[SiYuanMemo][AutoCard] Handler disposed');
    }
    // Find or create concept card from block reference content.
    private async findOrCreateConceptFromBlockRef(content: string): Promise<string | null> {
        try {

            const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
            const matches = [...content.matchAll(refPattern)];

            logger.debug('[SiYuanMemo][AutoCard] Block reference matches:', matches.length);
            
            if (matches.length === 0) {
                return null;
            }

                        

            for (const match of matches) {
                const refId = match[1];
                logger.debug('[SiYuanMemo][AutoCard] Checking block reference:', refId);
                

                const refBlock = await this.hostBlockQuery.getBlockTypeAndContent(refId);
                
                if (!refBlock || refBlock.type !== 'd') {
                    logger.debug('[SiYuanMemo][AutoCard] Block reference is not a document block, skipping:', refId);
                    continue;
                }
                
                logger.debug('[SiYuanMemo][AutoCard] Block reference is a document block:', refId);
                
                if (this.hasLocalConceptCard(refId)) {
                    logger.debug('[SiYuanMemo][AutoCard] Found existing concept card:', refId);
                    return refId;
                }
                

                const { kramdown: refContent } = await this.siyuanApi.getBlockKramdown(refId);
                if (refContent && this.patterns.concept.test(refContent)) {
                    logger.debug('[SiYuanMemo][AutoCard] Block has concept symbol, already a concept:', refId);
                    return refId;
                }
                

                logger.debug('[SiYuanMemo][AutoCard] Auto-marking block as concept card:', refId);
                

                const conceptName = refBlock.content;
                logger.debug('[SiYuanMemo][AutoCard] Marking as concept card:', conceptName);
                

                try {
                    await this.ensureConceptBlockCard(refId, conceptName);
                    logger.debug('[SiYuanMemo][AutoCard] Empty concept card created:', refId);
                } catch (error) {
                    logger.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', error);
                }
                

                await this.siyuanApi.pushMsg(`Auto-created concept card: ${conceptName}`);
                
                return refId;
            }

            return null;
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Error finding/creating concept from block ref:', error);
            return null;
        }
    }
    
    // Check whether current block is under a list-item ancestor.
    private async hasListItemParent(blockId: string): Promise<boolean> {
                
        let currentId = blockId;
        const maxDepth = 10;
        
        for (let depth = 0; depth < maxDepth; depth++) {
            const parentId = await this.hostBlockQuery.getParentId(currentId);
            
            if (!parentId) {
                break;
            }

            const parentType = await this.hostBlockQuery.getBlockType(parentId);
            if (parentType) {
                

                if (parentType === 'i') {
                    logger.debug('[SiYuanMemo][AutoCard] Found list item parent at depth', depth, ':', parentId);
                    return true;
                }
                

                if (parentType === 'd') {
                    logger.debug('[SiYuanMemo][AutoCard] Reached document block without finding list parent');
                    break;
                }
            }
            
            currentId = parentId;
        }
        
        return false;
    }
    
    // Resolve concept card from heading/document ancestors when no list parent exists.
    private async findConceptWithoutListParent(
        blockId: string,
        skipDocumentConceptAutoCreateBlockId?: string
    ): Promise<string | null> {
                
        let currentId = blockId;
        let firstHeadingId: string | null = null;
        let documentId: string | null = null;
        const maxDepth = 20;
        
        for (let depth = 0; depth < maxDepth; depth++) {
            const parentId = await this.hostBlockQuery.getParentId(currentId);
            
            if (!parentId) {
                break;
            }

            const parentBlock = await this.hostBlockQuery.getBlockTypeAndContent(parentId);
            if (parentBlock) {
                const parentType = parentBlock.type || '';
                const parentContent = parentBlock.content;
                

                if (parentType === 'h' && !firstHeadingId) {
                    firstHeadingId = parentId;
                    logger.debug('[SiYuanMemo][AutoCard] Found first heading block:', parentId, parentContent);
                }
                

                if (parentType === 'd') {
                    documentId = parentId;
                    logger.debug('[SiYuanMemo][AutoCard] Found document block:', parentId);
                    break;
                }
            }
            
            currentId = parentId;
        }
        

        let conceptId: string | null = null;
        let conceptType: 'heading' | 'document' | null = null;
        
        if (firstHeadingId) {
            conceptId = firstHeadingId;
            conceptType = 'heading';
            logger.debug('[SiYuanMemo][AutoCard] Using heading block as concept card:', conceptId);
        } else if (documentId) {
            conceptId = documentId;
            conceptType = 'document';
            logger.debug('[SiYuanMemo][AutoCard] Using document block as concept card:', conceptId);
        }
        
        if (!conceptId) {
            logger.warn('[SiYuanMemo][AutoCard] No concept block found (no heading or document)');
            return null;
        }

        const normalizedSkipDocId = typeof skipDocumentConceptAutoCreateBlockId === 'string'
            ? skipDocumentConceptAutoCreateBlockId.trim()
            : '';
        if (normalizedSkipDocId && conceptType === 'document' && conceptId === normalizedSkipDocId) {
            const attrs = await this.siyuanApi.getBlockAttrs(conceptId);
            const hasXiuyuanId = this.hasXiuyuanBinding(attrs);
            const existingCard = this.getLocalCardByBlockId(conceptId);
            if (!hasXiuyuanId && !existingCard) {
                logger.info('[SiYuanMemo][AutoCard] Skip auto-creating concept card on current document block during doc scan', {
                    blockId,
                    conceptId,
                    skipDocumentConceptAutoCreateBlockId: normalizedSkipDocId,
                });
                return null;
            }
        }

        try {
            const conceptBlock = await this.hostBlockQuery.getBlockTypeAndContent(conceptId);
            const conceptName = conceptBlock?.content || 'unknown concept';

            await this.ensureConceptBlockCard(conceptId, conceptName);
            logger.debug('[SiYuanMemo][AutoCard] Empty concept card created:', conceptId);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', error);
        }
        

        const conceptTypeName = conceptType === 'heading' ? 'heading block' : 'document block';
        await this.siyuanApi.pushMsg(`Auto-created concept card: ${conceptTypeName}`);
        
        return conceptId;
    }
    
    // Resolve concept card by traversing ancestors up to maxDepth.
    private async findConceptInAncestors(blockId: string, maxDepth: number): Promise<string | null> {
                
        let currentId = blockId;
        
        for (let depth = 0; depth < maxDepth; depth++) {
            const parentId = await this.hostBlockQuery.getParentId(currentId);
            
            if (!parentId) {
                logger.debug(`[SiYuanMemo][AutoCard] No parent at depth ${depth}`);
                break;
            }
            logger.debug(`[SiYuanMemo][AutoCard] Checking parent at depth ${depth}:`, parentId);
            

            const { kramdown: parentContent } = await this.siyuanApi.getBlockKramdown(parentId);
            logger.debug(`[SiYuanMemo][AutoCard] Parent content at depth ${depth}:`, parentContent?.substring(0, 100));
            
            if (parentContent) {

                if (this.patterns.concept.test(parentContent)) {
                    logger.debug(`[SiYuanMemo][AutoCard] Found concept card with :: symbol at depth ${depth}:`, parentId);

                    if (this.hasLocalConceptCard(parentId)) {
                        logger.debug(`[SiYuanMemo][AutoCard] Parent is already marked as concept card`);
                        return parentId;
                    }
                    

                    logger.debug(`[SiYuanMemo][AutoCard] Parent has :: symbol but not yet created as concept card`);
                    return null;
                }
                

                logger.debug(`[SiYuanMemo][AutoCard] Checking for block reference at depth ${depth}...`);
                const refResult = await this.findOrCreateConceptFromBlockRef(parentContent);
                if (refResult) {
                    logger.debug(`[SiYuanMemo][AutoCard] Found/created concept card from reference at depth ${depth}:`, refResult);
                    return refResult;
                }
            }
            
            currentId = parentId;
        }
        
        return null;
    }

    private async resolveDocumentRootId(nodeId: string): Promise<string> {
        const normalizedNodeId = nodeId.trim();
        if (!normalizedNodeId) {
            return '';
        }

        try {
            const rootId = await this.hostBlockQuery.getDocumentRootId(normalizedNodeId);
            return rootId || normalizedNodeId;
        } catch (error) {
            logger.warn('[SiYuanMemo][AutoCard] Failed to resolve document root id, fallback to input id:', normalizedNodeId, error);
            return normalizedNodeId;
        }
    }

    private normalizeInlineSymbolContent(content: string): string {
        return selectPreferredInlineSymbolLine(content);
    }

    private normalizeClozeSymbolContent(content: string): string {
        return String(content || '')
            .replace(/\{:[^{}\n]*\}/g, '')
            .replace(/\r/g, '')
            .trim();
    }

    // Normalize unknown error input to a readable message.
    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string' && error.length > 0) {
            return error;
        }
        return 'unknown error';
    }

}
