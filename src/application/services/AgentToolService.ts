import { CardState } from '@/types/card';
import {
  buildAgentSuccessResult,
  buildAgentUnavailableResult,
  buildAgentUnsupportedResult,
  buildAgentValidationErrorResult,
  type AgentToolName,
  type AgentToolResult,
  validateAgentToolAction,
} from '@/application/agent/AgentToolContracts';

type MaybePromise<T> = T | Promise<T>;

type AgentBrowserService = {
  getQueueCounts?: (request?: { forceRefresh?: boolean }) => MaybePromise<Record<string, number>>;
};

type AgentCardService = {
  getDueCount?: () => MaybePromise<number>;
  getTotalCount?: () => MaybePromise<number>;
  getCard?: (query: { cardId: string }) => MaybePromise<{ card: unknown | null }>;
  getCards?: (query?: { filter?: { blockIds?: string[] } }) => MaybePromise<{ cards: unknown[]; total: number }>;
  createCard?: (command: Record<string, unknown>) => MaybePromise<unknown>;
  updateFSRSCard?: (command: { cardId: string; updates: Record<string, unknown> }) => MaybePromise<unknown>;
};

type AgentDialogManager = {
  openBrowserDialog?: (options?: unknown) => MaybePromise<void>;
  openReviewDialog?: () => MaybePromise<void>;
  openAiWorkbenchDialog?: (options?: unknown) => MaybePromise<void>;
  openMobileQueueLauncherDialog?: () => MaybePromise<void>;
};

type AgentTabManager = {
  focusReviewAICompanionTab?: (reviewSessionId: string) => boolean;
  openReviewAICompanionTab?: (options: Record<string, unknown> & { sessionId: string; title: string }) => MaybePromise<void>;
};

type AgentReviewSessionRegistry = {
  getSession?: <TSession = unknown>(sessionId: string) => TSession | null;
};

type AgentCardDraftServicePort = {
  draft: (args: Record<string, unknown>) => MaybePromise<AgentToolResult>;
};

export interface AgentToolExecutionRequest {
  tool: AgentToolName;
  args: Record<string, unknown>;
  source?: 'mcp' | 'frontend' | 'writer-relay' | 'test';
}

export interface AgentDraftCandidate {
  draftId: string;
  type: 'qa' | 'cloze' | 'concept' | 'descriptor';
  front: string;
  back: string;
  sourceRefs: Array<{
    blockId?: string;
    docId?: string;
    title?: string;
  }>;
  validationWarnings: string[];
  persisted?: boolean;
}

export interface AgentToolServiceDeps {
  browserService?: AgentBrowserService | null;
  cardService?: AgentCardService | null;
  dialogManager?: AgentDialogManager | null;
  tabManager?: AgentTabManager | null;
  reviewSessionRegistry?: AgentReviewSessionRegistry | null;
  cardDraftService?: AgentCardDraftServicePort | null;
  now?: () => number;
}

const RESULT_ARRAY_LIMIT = 20;
const RESULT_TEXT_LIMIT = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map(normalizeString).filter(Boolean)));
}

function shortText(value: unknown, fallback: string): string {
  const text = normalizeString(value);
  return text ? text.slice(0, RESULT_TEXT_LIMIT) : fallback;
}

function mapDraftTypeToCardType(type: AgentDraftCandidate['type']): string {
  if (type === 'concept') {
    return 'concept';
  }
  if (type === 'descriptor') {
    return 'descriptor';
  }
  return 'item';
}

function normalizeDraftCandidate(value: unknown): AgentDraftCandidate | null {
  if (!isRecord(value)) {
    return null;
  }
  const draftId = normalizeString(value.draftId);
  const type = normalizeString(value.type);
  if (!draftId || !['qa', 'cloze', 'concept', 'descriptor'].includes(type)) {
    return null;
  }
  const sourceRefs = Array.isArray(value.sourceRefs)
    ? value.sourceRefs
        .filter(isRecord)
        .map((ref) => ({
          blockId: normalizeString(ref.blockId) || undefined,
          docId: normalizeString(ref.docId) || undefined,
          title: normalizeString(ref.title) || undefined,
        }))
    : [];
  return {
    draftId,
    type: type as AgentDraftCandidate['type'],
    front: shortText(value.front, 'Untitled prompt'),
    back: shortText(value.back, 'Draft answer pending user refinement.'),
    sourceRefs,
  validationWarnings: normalizeStringArray(value.validationWarnings),
    persisted: value.persisted === true ? true : undefined,
  };
}

function readResultOk(value: unknown): boolean {
  if (!isRecord(value)) {
    return true;
  }
  if ('ok' in value) {
    return value.ok !== false;
  }
  return true;
}

function boundValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > RESULT_TEXT_LIMIT
      ? `${value.slice(0, RESULT_TEXT_LIMIT)}...`
      : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, RESULT_ARRAY_LIMIT).map(boundValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.keys(value).reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = boundValue(value[key]);
    return acc;
  }, {});
}

function getCardFromSession(session: unknown): unknown | null {
  if (!isRecord(session)) {
    return null;
  }
  if (typeof session.getCurrentCard === 'function') {
    return session.getCurrentCard();
  }
  if (typeof session.getCurrentItem === 'function') {
    return session.getCurrentItem();
  }
  if ('currentCard' in session) {
    return session.currentCard ?? null;
  }
  return null;
}

export class AgentToolService {
  constructor(private readonly deps: AgentToolServiceDeps = {}) {}

  async execute(request: AgentToolExecutionRequest): Promise<AgentToolResult> {
    const validation = validateAgentToolAction(request.tool, request.args?.action);
    if (!validation.ok) {
      return validation;
    }

    try {
      switch (request.tool) {
        case 'memo_query':
          return await this.executeMemoQuery(validation.action, request.args);
        case 'memo_card':
          return await this.executeMemoCard(validation.action, request.args);
        case 'memo_review':
          return await this.executeMemoReview(validation.action, request.args);
        case 'memo_ui':
          return await this.executeMemoUi(validation.action, request.args);
      }
    } catch (error) {
      return buildAgentUnavailableResult(
        'BACKEND_UNAVAILABLE',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async executeMemoQuery(action: string, args: Record<string, unknown>): Promise<AgentToolResult> {
    if (this.isRawDatabaseQueryRequest(args)) {
      return buildAgentUnsupportedResult('memo_query does not allow raw SQL, unrestricted database access, or broad dumps');
    }
    if (action !== 'status' && action !== 'query') {
      return buildAgentUnsupportedResult(`memo_query action is unsupported: ${action}`);
    }

    const cardService = this.deps.cardService;
    const browserService = this.deps.browserService;
    const unavailable: string[] = [];
    let dueCount: number | null = null;
    let totalCount: number | null = null;
    let queueCounts: Record<string, number> | null = null;

    if (cardService?.getDueCount) {
      dueCount = await cardService.getDueCount();
    } else {
      unavailable.push('CardApplicationService.getDueCount unavailable');
    }

    if (cardService?.getTotalCount) {
      totalCount = await cardService.getTotalCount();
    } else {
      unavailable.push('CardApplicationService.getTotalCount unavailable');
    }

    if (browserService?.getQueueCounts) {
      queueCounts = await browserService.getQueueCounts({ forceRefresh: args.forceRefresh === true });
    } else {
      unavailable.push('BrowserApplicationService.getQueueCounts unavailable');
    }

    if (dueCount === null && totalCount === null && queueCounts === null) {
      return buildAgentUnavailableResult('READ_MODEL_UNAVAILABLE', 'memo_query overview requires Browser or Card read owners');
    }

    return buildAgentSuccessResult(boundValue({
      overview: {
        dueCount,
        totalCount,
        queueCounts,
        unavailable,
      },
      readOwners: [
        ...(cardService ? ['CardApplicationService'] : []),
        ...(browserService ? ['BrowserApplicationService'] : []),
      ],
      checkedAt: this.now(),
    }));
  }

  private isRawDatabaseQueryRequest(args: Record<string, unknown>): boolean {
    const rawKeys = ['sql', 'statement', 'rawSql', 'database', 'dump'];
    return rawKeys.some((key) => normalizeString(args[key]).length > 0)
      || normalizeString(args.queryType).toLowerCase() === 'sql'
      || normalizeString(args.scope).toLowerCase() === 'workspace';
  }

  private async executeMemoCard(action: string, args: Record<string, unknown>): Promise<AgentToolResult> {
    if (action === 'draft') {
      if (!this.deps.cardDraftService?.draft) {
        return buildAgentUnavailableResult('AGENT_API_UNAVAILABLE', 'memo_card draft requires AgentCardDraftService');
      }
      return await this.deps.cardDraftService.draft(args);
    }
    if (action === 'save') {
      return await this.saveSelectedDrafts(args);
    }
    if (action === 'create') {
      return await this.createCard(args);
    }
    if (action === 'suspend' || action === 'resume') {
      return await this.updateCardSuspension(action, args);
    }
    return await this.inspectCards(args);
  }

  private async saveSelectedDrafts(args: Record<string, unknown>): Promise<AgentToolResult> {
    const cardService = this.deps.cardService;
    if (!cardService?.createCard) {
      return buildAgentUnavailableResult('WRITER_RELAY_UNAVAILABLE', 'memo_card save requires CardApplicationService.createCard');
    }
    const selectedDraftIds = normalizeStringArray(args.selectedDraftIds);
    if (selectedDraftIds.length === 0) {
      return buildAgentValidationErrorResult('memo_card save requires selectedDraftIds');
    }
    const drafts = Array.isArray(args.drafts)
      ? args.drafts.map(normalizeDraftCandidate).filter((candidate): candidate is AgentDraftCandidate => candidate !== null)
      : [];
    if (drafts.length === 0) {
      return buildAgentValidationErrorResult('memo_card save requires draft candidates');
    }

    const selected = drafts.filter((draft) => selectedDraftIds.includes(draft.draftId));
    const skippedDraftIds = drafts
      .filter((draft) => !selectedDraftIds.includes(draft.draftId))
      .map((draft) => draft.draftId);
    const savedDraftIds: string[] = [];
    const failedDraftIds: string[] = [];

    for (const draft of selected) {
      const blockId = draft.sourceRefs.find((ref) => ref.blockId)?.blockId;
      if (!blockId) {
        failedDraftIds.push(draft.draftId);
        continue;
      }
      const result = await cardService.createCard({
        blockId,
        cardType: mapDraftTypeToCardType(draft.type),
        faces: [{ question: draft.front, answer: draft.back }],
        metadata: {
          source: 'auto',
          agentTool: 'memo_card',
          draftId: draft.draftId,
        },
      });
      if (readResultOk(result)) {
        savedDraftIds.push(draft.draftId);
      } else {
        failedDraftIds.push(draft.draftId);
      }
    }

    return buildAgentSuccessResult({
      savedCount: savedDraftIds.length,
      savedDraftIds,
      skippedDraftIds,
      failedDraftIds,
      checkedAt: this.now(),
    });
  }

  private async createCard(args: Record<string, unknown>): Promise<AgentToolResult> {
    const cardService = this.deps.cardService;
    if (!cardService?.createCard) {
      return buildAgentUnavailableResult('WRITER_RELAY_UNAVAILABLE', 'memo_card create requires CardApplicationService.createCard');
    }
    const command = isRecord(args.command) ? args.command : args.card;
    if (!isRecord(command)) {
      return buildAgentValidationErrorResult('memo_card create requires command or card payload');
    }
    const result = await cardService.createCard(command);
    return buildAgentSuccessResult({
      result: boundValue(result),
      checkedAt: this.now(),
    });
  }

  private async updateCardSuspension(action: string, args: Record<string, unknown>): Promise<AgentToolResult> {
    const cardService = this.deps.cardService;
    if (!cardService?.updateFSRSCard) {
      return buildAgentUnavailableResult('WRITER_RELAY_UNAVAILABLE', `memo_card ${action} requires CardApplicationService.updateFSRSCard`);
    }
    const cardIds = normalizeStringArray(args.cardIds);
    const singleCardId = normalizeString(args.cardId);
    const targetCardIds = cardIds.length > 0 ? cardIds : [singleCardId].filter(Boolean);
    if (targetCardIds.length === 0) {
      return buildAgentValidationErrorResult(`memo_card ${action} requires cardId or cardIds`);
    }

    const updates = action === 'suspend'
      ? { state: CardState.Suspended }
      : { state: CardState.Review };
    const updatedCardIds: string[] = [];
    for (const cardId of targetCardIds) {
      const result = await cardService.updateFSRSCard({ cardId, updates });
      if (readResultOk(result)) {
        updatedCardIds.push(cardId);
      }
    }
    return buildAgentSuccessResult({
      action,
      updatedCardIds,
      checkedAt: this.now(),
    });
  }

  private async inspectCards(args: Record<string, unknown>): Promise<AgentToolResult> {
    const cardService = this.deps.cardService;
    if (!cardService) {
      return buildAgentUnavailableResult('READ_MODEL_UNAVAILABLE', 'memo_card inspect requires CardApplicationService');
    }
    const cardId = normalizeString(args.cardId);
    if (cardId && cardService.getCard) {
      const result = await cardService.getCard({ cardId });
      return buildAgentSuccessResult({
        card: boundValue(result.card),
        checkedAt: this.now(),
      });
    }
    const blockId = normalizeString(args.blockId);
    if (blockId && cardService.getCards) {
      const result = await cardService.getCards({ filter: { blockIds: [blockId] } });
      return buildAgentSuccessResult({
        cards: boundValue(result.cards),
        total: result.total,
        checkedAt: this.now(),
      }, {
        returnedItemCount: Math.min(result.cards.length, RESULT_ARRAY_LIMIT),
        totalItemCount: result.total,
      });
    }
    return buildAgentValidationErrorResult('memo_card inspect requires cardId or blockId');
  }

  private async executeMemoReview(action: string, args: Record<string, unknown>): Promise<AgentToolResult> {
    if (!['get', 'status', 'query', 'search'].includes(action)) {
      return buildAgentUnsupportedResult(`memo_review action is unsupported: ${action}`);
    }

    const currentCard = args.currentCard || args.card || this.resolveCurrentReviewCard(args);
    if (!currentCard) {
      return buildAgentUnavailableResult('READ_MODEL_UNAVAILABLE', 'memo_review requires current review card context');
    }

    return buildAgentSuccessResult({
      currentCard: boundValue(currentCard),
      mode: normalizeString(args.mode) || 'explain',
      allowedAssistance: ['explain', 'hint', 'source_lookup', 'score_suggestion'],
      blockedActions: ['answer', 'grade', 'feedback', 'submit', 'commit'],
      committedFeedback: false,
      checkedAt: this.now(),
    });
  }

  private resolveCurrentReviewCard(args: Record<string, unknown>): unknown | null {
    const sessionId = normalizeString(args.sessionId || args.reviewSessionId);
    if (!sessionId || !this.deps.reviewSessionRegistry?.getSession) {
      return null;
    }
    return getCardFromSession(this.deps.reviewSessionRegistry.getSession(sessionId));
  }

  private async executeMemoUi(action: string, args: Record<string, unknown>): Promise<AgentToolResult> {
    const target = normalizeString(args.target || args.surface || args.tab || 'browser');
    if (action !== 'open' && action !== 'focus' && action !== 'get' && action !== 'status') {
      return buildAgentUnsupportedResult(`memo_ui action is unsupported: ${action}`);
    }
    if (action === 'get' || action === 'status') {
      return buildAgentSuccessResult({
        availableTargets: ['browser', 'review', 'ai', 'ai-companion', 'mobile-review'],
        editorContext: isRecord(args.editorContext) ? boundValue(args.editorContext) : null,
        checkedAt: this.now(),
      });
    }
    const dialogManager = this.deps.dialogManager;
    if (!dialogManager) {
      return buildAgentUnavailableResult('FRONTEND_CONTEXT_UNAVAILABLE', 'memo_ui requires frontend dialog context');
    }

    if (target === 'browser') {
      if (!dialogManager.openBrowserDialog) {
        return buildAgentUnavailableResult('FRONTEND_CONTEXT_UNAVAILABLE', 'Browser dialog manager unavailable');
      }
      await dialogManager.openBrowserDialog(args.initialOpenState ? { initialOpenState: args.initialOpenState } : undefined);
      return buildAgentSuccessResult({ target, checkedAt: this.now() });
    }
    if (target === 'review') {
      if (!dialogManager.openReviewDialog) {
        return buildAgentUnavailableResult('FRONTEND_CONTEXT_UNAVAILABLE', 'Review dialog manager unavailable');
      }
      await dialogManager.openReviewDialog();
      return buildAgentSuccessResult({ target, checkedAt: this.now() });
    }
    if (target === 'ai') {
      if (!dialogManager.openAiWorkbenchDialog) {
        return buildAgentUnavailableResult('FRONTEND_CONTEXT_UNAVAILABLE', 'AI workbench dialog manager unavailable');
      }
      await dialogManager.openAiWorkbenchDialog({});
      return buildAgentSuccessResult({ target, checkedAt: this.now() });
    }
    if (target === 'ai-companion') {
      return await this.openOrFocusReviewAiCompanion(args);
    }
    if (target === 'mobile-review') {
      if (!dialogManager.openMobileQueueLauncherDialog) {
        return buildAgentUnavailableResult('FRONTEND_CONTEXT_UNAVAILABLE', 'Mobile review launcher unavailable');
      }
      await dialogManager.openMobileQueueLauncherDialog();
      return buildAgentSuccessResult({ target, checkedAt: this.now() });
    }

    return buildAgentUnsupportedResult(`memo_ui target is unsupported: ${target}`);
  }

  private async openOrFocusReviewAiCompanion(args: Record<string, unknown>): Promise<AgentToolResult> {
    const sessionId = normalizeString(args.sessionId || args.reviewSessionId);
    if (!sessionId) {
      return buildAgentValidationErrorResult('memo_ui ai-companion requires sessionId');
    }
    const tabManager = this.deps.tabManager;
    if (!tabManager) {
      return buildAgentUnavailableResult('FRONTEND_CONTEXT_UNAVAILABLE', 'Review AI companion tab manager unavailable');
    }
    const focused = tabManager.focusReviewAICompanionTab?.(sessionId) === true;
    if (!focused && tabManager.openReviewAICompanionTab) {
      await tabManager.openReviewAICompanionTab({
        sessionId,
        title: normalizeString(args.title) || 'AI Workbench',
      });
    }
    return buildAgentSuccessResult({
      target: 'ai-companion',
      sessionId,
      focused,
      checkedAt: this.now(),
    });
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}
