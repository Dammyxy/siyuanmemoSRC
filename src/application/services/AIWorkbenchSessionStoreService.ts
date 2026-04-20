import type { IFileService } from '@/infrastructure/services/FileService';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
  type AIConceptCoachResult,
  type AIUserSkillStructuredResult,
  type AISkillId,
  type AISkillTabId,
  type AIWorkbenchContextSnapshot,
  type AIWorkbenchConversationTree,
  type AIWorkbenchMessage,
  type AIWorkbenchNodeScope,
  type AIWorkbenchSelfTestCardTargetMemory,
  type AIWorkbenchSessionRecord,
  type AIWorkbenchSessionSummary,
  type AIWorkbenchSource,
  type AIWorkbenchSurface,
  type AIWorkbenchThreadRecord,
  type AIWorkbenchThreads,
  type AIWorkbenchTreeNode,
  type AIWorkbenchTreeNodeVersion,
} from '@/types/ai';

type SessionIndex = {
  sessions: AIWorkbenchSessionSummary[];
};

type FindByContextInput = {
  contextSignature: string | null;
  source: AIWorkbenchSource;
  sourceReviewSessionId: string | null;
};

type FindByReviewChatKeyInput = {
  reviewChatKey: string | null;
  source?: AIWorkbenchSource;
};

const SESSION_INDEX_FILE = 'ai-workbench/sessions/index.json';
const SESSION_RECORD_PREFIX = 'ai-workbench/sessions/records';
const SELF_TEST_CARD_TARGET_MEMORY_FILE = 'ai-workbench/self-test-card-target.json';
const CONCEPT_SKILL: AISkillId = AI_CONCEPT_COACH_SKILL_ID;
const GENERAL_SKILL: AISkillId = AI_GENERAL_CHAT_SKILL_ID;
const DEFAULT_TAB: AISkillTabId = 'working-definition';
const CURRENT_SCHEMA_VERSION = 5;
const EMPTY_CONTEXT_KEY = '__empty_context__';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSelfTestCardTargetMemory(value: unknown): AIWorkbenchSelfTestCardTargetMemory | null {
  if (!isRecord(value)) {
    return null;
  }
  const mode = value.mode === 'block' ? 'block' : 'daily-note';
  const notebookId = normalizeString(value.notebookId);
  if (!notebookId) {
    return null;
  }
  const targetBlockId = normalizeString(value.targetBlockId) || null;
  if (mode === 'block' && !targetBlockId) {
    return null;
  }
  return {
    mode,
    notebookId,
    notebookName: normalizeString(value.notebookName) || notebookId,
    targetBlockId: mode === 'block' ? targetBlockId : null,
    targetLabel: normalizeString(value.targetLabel) || (mode === 'daily-note' ? '今日日记' : targetBlockId || ''),
    updatedAt: Number(value.updatedAt) || Date.now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSurface(value: unknown): value is AIWorkbenchSurface {
  return value === 'standalone-dialog' || value === 'review-dialog-sidecar' || value === 'review-tab-companion';
}

function normalizeSource(value: unknown): AIWorkbenchSource {
  return value === 'review' || value === 'browser' || value === 'template-dialog'
    ? value
    : 'standalone';
}

function normalizeTabId(value: unknown): AISkillTabId {
  if (typeof value === 'string' && value.startsWith('user:')) {
    return value as AISkillTabId;
  }
  return value === AI_GENERAL_CHAT_TAB_ID
    ? AI_GENERAL_CHAT_TAB_ID
    : AI_CONCEPT_COACH_TAB_IDS.includes(value as typeof AI_CONCEPT_COACH_TAB_IDS[number])
    ? value as AISkillTabId
    : DEFAULT_TAB;
}

function normalizeSkillId(value: unknown): AISkillId {
  if (typeof value === 'string' && /^user:[a-z0-9_-]+$/.test(value)) {
    return value as AISkillId;
  }
  return value === GENERAL_SKILL ? GENERAL_SKILL : CONCEPT_SKILL;
}

function isUserSkillId(value: unknown): value is AISkillId {
  return typeof value === 'string' && /^user:[a-z0-9_-]+$/.test(value);
}

function getSkillTabIds(skillId: AISkillId, fallbackTabId: AISkillTabId): AISkillTabId[] {
  if (skillId === GENERAL_SKILL) {
    return [AI_GENERAL_CHAT_TAB_ID];
  }
  if (skillId === CONCEPT_SKILL) {
    return [...AI_CONCEPT_COACH_TAB_IDS];
  }
  return [fallbackTabId];
}

function buildViewKey(skillId: AISkillId, tabId: AISkillTabId): string {
  return `${skillId}::${tabId}`;
}

function cloneMessage<T extends AIWorkbenchMessage>(message: T): T {
  return JSON.parse(JSON.stringify(message)) as T;
}

function createEmptyThread(skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchThreadRecord {
  return {
    skillId,
    tabId,
    messages: [],
    resultContextSignature: null,
    stale: false,
    staleReason: null,
  };
}

function createEmptyThreads(): AIWorkbenchThreads {
  const makeSkillThreads = (skillId: AISkillId): AIWorkbenchThreads[AISkillId] => ({
    chat: createEmptyThread(skillId, 'chat'),
    'working-definition': createEmptyThread(skillId, 'working-definition'),
    perspectives: createEmptyThread(skillId, 'perspectives'),
    'integrated-understanding': createEmptyThread(skillId, 'integrated-understanding'),
    'self-test-cards': createEmptyThread(skillId, 'self-test-cards'),
    'cdf-structure': createEmptyThread(skillId, 'cdf-structure'),
    'real-world-triggers': createEmptyThread(skillId, 'real-world-triggers'),
  });
  return {
    [GENERAL_SKILL]: makeSkillThreads(GENERAL_SKILL),
    [CONCEPT_SKILL]: makeSkillThreads(CONCEPT_SKILL),
  };
}

function createEmptyTree(): AIWorkbenchConversationTree {
  return {
    rootNodeId: null,
    activeLeafNodeId: null,
    activeLeafNodeIds: {},
    nodes: {},
  };
}

function normalizeMessage(value: unknown, skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchMessage | null {
  if (!isRecord(value) || value.kind === 'candidate-board') {
    return null;
  }
  const kind = normalizeString(value.kind);
  if (
    kind !== 'user'
    && kind !== 'assistant-text'
    && kind !== 'assistant-result'
    && kind !== 'tool-log'
    && kind !== 'approval'
    && kind !== 'separator'
  ) {
    return null;
  }
  return {
    ...value,
    id: normalizeString(value.id) || `ai-msg-${Date.now().toString(36)}`,
    skillId: normalizeSkillId(value.skillId || skillId),
    tabId: normalizeTabId(value.tabId || tabId),
    view: value.view || skillId,
    contextSignature: normalizeString(value.contextSignature) || null,
  } as unknown as AIWorkbenchMessage;
}

function normalizeThreadRecord(value: unknown, skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchThreadRecord {
  if (!isRecord(value)) {
    return createEmptyThread(skillId, tabId);
  }
  const resultContextSignature = normalizeString(value.resultContextSignature) || null;
  const messages = Array.isArray(value.messages)
    ? value.messages
      .map((message) => normalizeMessage(message, skillId, tabId))
      .filter((message): message is AIWorkbenchMessage => Boolean(message))
      .map((message) => (
        skillId === CONCEPT_SKILL && tabId !== AI_GENERAL_CHAT_TAB_ID && !normalizeString(message.contextSignature)
          ? { ...message, contextSignature: resultContextSignature }
          : message
      ))
    : [];
  return {
    skillId,
    tabId,
    messages,
    resultContextSignature,
    stale: value.stale === true,
    staleReason: normalizeString(value.staleReason) || null,
  };
}

function normalizeThreads(value: unknown): { threads: AIWorkbenchThreads; legacyExplainMessages?: AIWorkbenchMessage[] } {
  const threads = createEmptyThreads();
  const raw = isRecord(value) ? value : {};
  const generalThreads = isRecord(raw[GENERAL_SKILL]) ? raw[GENERAL_SKILL] as Record<string, unknown> : null;
  const conceptThreads = isRecord(raw[CONCEPT_SKILL]) ? raw[CONCEPT_SKILL] as Record<string, unknown> : null;

  if (generalThreads) {
    threads[GENERAL_SKILL][AI_GENERAL_CHAT_TAB_ID] = normalizeThreadRecord(generalThreads[AI_GENERAL_CHAT_TAB_ID], GENERAL_SKILL, AI_GENERAL_CHAT_TAB_ID);
  }

  if (conceptThreads) {
    for (const tabId of AI_CONCEPT_COACH_TAB_IDS) {
      threads[CONCEPT_SKILL][tabId] = normalizeThreadRecord(conceptThreads[tabId], CONCEPT_SKILL, tabId);
    }
  } else {
    for (const tabId of AI_CONCEPT_COACH_TAB_IDS) {
      if (isRecord(raw[tabId])) {
        threads[CONCEPT_SKILL][tabId] = normalizeThreadRecord(raw[tabId], CONCEPT_SKILL, tabId);
      }
    }
  }

  if (isRecord(raw.explain)) {
    const legacyThread = normalizeThreadRecord(raw.explain, CONCEPT_SKILL, DEFAULT_TAB);
    if (legacyThread.messages.length > 0) {
      threads[CONCEPT_SKILL][DEFAULT_TAB] = legacyThread;
      return { threads, legacyExplainMessages: [...legacyThread.messages] };
    }
  }

  for (const [rawSkillId, rawSkillThreads] of Object.entries(raw)) {
    if (!isUserSkillId(rawSkillId) || !isRecord(rawSkillThreads)) {
      continue;
    }
    const skillId = normalizeSkillId(rawSkillId);
    threads[skillId] = threads[skillId] || {};
    for (const [rawTabId, rawThread] of Object.entries(rawSkillThreads)) {
      const tabId = normalizeTabId(rawTabId);
      threads[skillId][tabId] = normalizeThreadRecord(rawThread, skillId, tabId);
    }
  }

  return { threads };
}

function normalizeContext(value: unknown): AIWorkbenchContextSnapshot | null {
  return isRecord(value) ? value as AIWorkbenchContextSnapshot : null;
}

function buildReviewChatKey(queueType: unknown, queueLabel: unknown): string | null {
  const normalizedQueueType = normalizeString(queueType);
  const normalizedQueueLabel = normalizeString(queueLabel);
  if (!normalizedQueueType || !normalizedQueueLabel) {
    return null;
  }
  return `${normalizedQueueType}::${normalizedQueueLabel}`;
}

function deriveReviewChatKeyFromContext(context: AIWorkbenchContextSnapshot | null): string | null {
  if (!context || context.source !== 'review') {
    return null;
  }
  return buildReviewChatKey(context.queueType, context.queueProgress?.queueLabel);
}

function normalizeContextKey(value: unknown): string {
  return normalizeString(value) || EMPTY_CONTEXT_KEY;
}

function normalizeSkillResults(value: unknown): Record<AISkillId, AIConceptCoachResult | null> {
  const raw = isRecord(value) ? value : {};
  const result = isRecord(raw[CONCEPT_SKILL]) ? raw[CONCEPT_SKILL] as AIConceptCoachResult : null;
  return {
    [GENERAL_SKILL]: null,
    [CONCEPT_SKILL]: result,
  };
}

function normalizeConceptCoachResultsByContext(
  value: unknown,
  fallbackContextSignature: string | null,
  fallbackSkillResults?: Record<AISkillId, AIConceptCoachResult | null> | null,
): Record<string, AIConceptCoachResult | null> {
  const raw = isRecord(value) ? value : {};
  const result: Record<string, AIConceptCoachResult | null> = {};
  for (const [contextKey, contextValue] of Object.entries(raw)) {
    result[normalizeContextKey(contextKey)] = isRecord(contextValue)
      ? contextValue as AIConceptCoachResult
      : null;
  }
  const fallbackResult = fallbackSkillResults?.[CONCEPT_SKILL] || null;
  if (fallbackResult && Object.keys(result).length === 0) {
    result[normalizeContextKey(fallbackContextSignature)] = fallbackResult;
  }
  return result;
}

function normalizeGenericSkillResults(value: unknown): Record<string, AIUserSkillStructuredResult | null> {
  const raw = isRecord(value) ? value : {};
  const result: Record<string, AIUserSkillStructuredResult | null> = {};
  for (const [skillId, skillResult] of Object.entries(raw)) {
    if (isUserSkillId(skillId)) {
      result[skillId] = isRecord(skillResult) ? skillResult as AIUserSkillStructuredResult : null;
    }
  }
  return result;
}

function countMessages(threads: AIWorkbenchThreads): number {
  return Object.values(threads).reduce((total, skillThreads) => (
    total + Object.values(skillThreads).reduce((innerTotal, thread) => innerTotal + (thread.messages.length || 0), 0)
  ), 0);
}

function countTreeMessages(tree: AIWorkbenchConversationTree): number {
  return Object.values(tree.nodes).filter((node) => (
    node.kind === 'message'
    && node.versions.some((version) => version.message.kind !== 'separator')
  )).length;
}

function collectActiveSkillsFromThreads(threads: AIWorkbenchThreads): AISkillId[] {
  return Object.entries(threads)
    .filter(([, skillThreads]) => Object.values(skillThreads).some((thread) => thread.messages.length > 0))
    .map(([skillId]) => normalizeSkillId(skillId));
}

function collectActiveSkillsFromTree(tree: AIWorkbenchConversationTree): AISkillId[] {
  return Array.from(new Set(
    Object.values(tree.nodes)
      .filter((node) => node.kind === 'message')
      .map((node) => node.skillId),
  )).map((skillId) => normalizeSkillId(skillId));
}

function inferNodeScope(message: AIWorkbenchMessage): AIWorkbenchNodeScope {
  if (message.skillId === GENERAL_SKILL) {
    return 'skill';
  }
  return 'tab';
}

function createVersion(message: AIWorkbenchMessage): AIWorkbenchTreeNodeVersion {
  return {
    id: `${message.id}::v1`,
    createdAt: Number(message.createdAt) || Date.now(),
    message: cloneMessage(message),
  };
}

function pushNodeToTree(
  tree: AIWorkbenchConversationTree,
  node: AIWorkbenchTreeNode,
  scope: AIWorkbenchNodeScope,
): void {
  tree.nodes[node.id] = node;
  if (!tree.rootNodeId) {
    tree.rootNodeId = node.id;
  }
  if (node.parentId && tree.nodes[node.parentId]) {
    const parent = tree.nodes[node.parentId];
    if (!parent.childIds.includes(node.id)) {
      parent.childIds.push(node.id);
    }
  }
  tree.activeLeafNodeId = node.id;
  tree.activeLeafNodeIds = tree.activeLeafNodeIds || {};
  for (const tabId of getSkillTabIds(node.skillId, node.tabId)) {
    if (scope === 'skill' || tabId === node.tabId) {
      tree.activeLeafNodeIds[buildViewKey(node.skillId, tabId)] = node.id;
    }
  }
}

function migrateThreadsToTree(threads: AIWorkbenchThreads): AIWorkbenchConversationTree {
  const tree = createEmptyTree();
  const entries = Object.entries(threads)
    .flatMap(([skillId, skillThreads]) => Object.entries(skillThreads).flatMap(([tabId, thread]) => (
      thread.messages.map((message, index) => ({
        skillId: skillId as AISkillId,
        tabId: tabId as AISkillTabId,
        message,
        order: index,
      }))
    )))
    .sort((left, right) => (
      (Number(left.message.createdAt) || 0) - (Number(right.message.createdAt) || 0)
      || left.order - right.order
      || left.skillId.localeCompare(right.skillId)
      || left.tabId.localeCompare(right.tabId)
    ));

  for (const entry of entries) {
    const message = cloneMessage(entry.message);
    message.skillId = normalizeSkillId(message.skillId || entry.skillId);
    message.tabId = normalizeTabId(message.tabId || entry.tabId);
    const scope = inferNodeScope(message);
    const leafKey = buildViewKey(message.skillId, message.tabId);
    const parentId = (tree.activeLeafNodeIds || {})[leafKey] || tree.activeLeafNodeId || null;
    const version = createVersion(message);
    pushNodeToTree(tree, {
      id: message.id,
      kind: message.kind === 'separator' ? 'separator' : 'message',
      skillId: message.skillId,
      tabId: message.tabId,
      scope,
      parentId,
      childIds: [],
      createdAt: Number(message.createdAt) || Date.now(),
      hidden: false,
      pinned: false,
      status: 'ready',
      activeVersionId: version.id,
      versions: [version],
    }, scope);
  }

  return tree;
}

function normalizeVersion(value: unknown, fallbackMessage: AIWorkbenchMessage): AIWorkbenchTreeNodeVersion | null {
  if (!isRecord(value)) {
    return null;
  }
  const normalizedMessage = normalizeMessage(value.message, fallbackMessage.skillId, fallbackMessage.tabId)
    || cloneMessage(fallbackMessage);
  normalizedMessage.id = fallbackMessage.id;
  return {
    id: normalizeString(value.id) || `${fallbackMessage.id}::v${Date.now().toString(36)}`,
    createdAt: Number(value.createdAt) || normalizedMessage.createdAt || Date.now(),
    message: normalizedMessage,
  };
}

function normalizeNode(
  value: unknown,
  fallbackThreads: AIWorkbenchThreads,
): AIWorkbenchTreeNode | null {
  if (!isRecord(value)) {
    return null;
  }
  const skillId = normalizeSkillId(value.skillId);
  const tabId = normalizeTabId(value.tabId);
  const fallbackThread = fallbackThreads[skillId]?.[tabId];
  const fallbackMessage = fallbackThread?.messages[0] || {
    id: normalizeString(value.id) || `ai-node-${Date.now().toString(36)}`,
    skillId,
    tabId,
    view: skillId,
    kind: 'separator',
    label: '分隔',
    createdAt: Number(value.createdAt) || Date.now(),
  } as AIWorkbenchMessage;
  const activeMessage = normalizeMessage(value.message, skillId, tabId) || cloneMessage(fallbackMessage);
  activeMessage.id = normalizeString(value.id) || activeMessage.id;
  const initialVersion = createVersion(activeMessage);
  const versions = Array.isArray(value.versions)
    ? value.versions
      .map((version) => normalizeVersion(version, activeMessage))
      .filter((version): version is AIWorkbenchTreeNodeVersion => Boolean(version))
    : [initialVersion];
  return {
    id: normalizeString(value.id) || activeMessage.id,
    kind: value.kind === 'separator' ? 'separator' : 'message',
    skillId,
    tabId,
    scope: value.scope === 'skill' ? 'skill' : 'tab',
    parentId: normalizeString(value.parentId) || null,
    childIds: Array.isArray(value.childIds)
      ? value.childIds.map((id) => normalizeString(id)).filter(Boolean)
      : [],
    createdAt: Number(value.createdAt) || activeMessage.createdAt || Date.now(),
    hidden: value.hidden === true,
    pinned: value.pinned === true,
    status: value.status === 'streaming' || value.status === 'interrupted' ? value.status : 'ready',
    activeVersionId: normalizeString(value.activeVersionId) || versions[versions.length - 1]?.id || null,
    versions: versions.length > 0 ? versions : [initialVersion],
  };
}

function normalizeTree(value: unknown, fallbackThreads: AIWorkbenchThreads): AIWorkbenchConversationTree {
  if (!isRecord(value) || !isRecord(value.nodes)) {
    return migrateThreadsToTree(fallbackThreads);
  }
  const tree = createEmptyTree();
  const nodes: Record<string, AIWorkbenchTreeNode> = {};
  for (const [nodeId, nodeValue] of Object.entries(value.nodes)) {
    const normalizedNode = normalizeNode({
      id: nodeId,
      ...((isRecord(nodeValue) ? nodeValue : {}) as Record<string, unknown>),
    }, fallbackThreads);
    if (normalizedNode) {
      nodes[normalizedNode.id] = normalizedNode;
    }
  }
  if (Object.keys(nodes).length === 0) {
    return migrateThreadsToTree(fallbackThreads);
  }
  tree.nodes = nodes;
  tree.rootNodeId = normalizeString(value.rootNodeId) || Object.keys(nodes)[0] || null;
  tree.activeLeafNodeId = normalizeString(value.activeLeafNodeId) || tree.rootNodeId;
  tree.activeLeafNodeIds = isRecord(value.activeLeafNodeIds)
    ? Object.fromEntries(
      Object.entries(value.activeLeafNodeIds)
        .map(([key, nodeId]) => [key, normalizeString(nodeId) || null] as const),
    )
    : {};
  return tree;
}

function buildSummary(record: AIWorkbenchSessionRecord): AIWorkbenchSessionSummary {
  const threads = normalizeThreads(record.threads).threads;
  const tree = normalizeTree(record.tree, threads);
  const messageCount = Object.keys(tree.nodes).length > 0 ? countTreeMessages(tree) : countMessages(threads);
  const activeSkills = Object.keys(tree.nodes).length > 0
    ? collectActiveSkillsFromTree(tree)
    : collectActiveSkillsFromThreads(threads);
  return {
    id: record.id,
    title: record.title,
    source: record.source,
    sourceReviewSessionId: record.sourceReviewSessionId,
    reviewChatKey: normalizeString(record.reviewChatKey) || deriveReviewChatKeyFromContext(record.context),
    surface: record.surface,
    contextSignature: record.contextSignature,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    activeSkillId: normalizeSkillId(record.activeSkillId),
    activeTabId: normalizeTabId(record.activeTabId),
    activeSkills,
    messageCount,
    lastActiveView: normalizeSkillId(record.activeSkillId),
    activeViews: activeSkills,
  };
}

function normalizeRecord(value: unknown): AIWorkbenchSessionRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = normalizeString(value.id);
  if (!id) {
    return null;
  }
  const normalizedThreads = normalizeThreads(value.threads);
  const tree = normalizeTree(value.tree, normalizedThreads.threads);
  const messageCount = Object.keys(tree.nodes).length > 0 ? countTreeMessages(tree) : countMessages(normalizedThreads.threads);
  const activeSkills = Object.keys(tree.nodes).length > 0
    ? collectActiveSkillsFromTree(tree)
    : collectActiveSkillsFromThreads(normalizedThreads.threads);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    title: normalizeString(value.title) || '未命名会话',
    source: normalizeSource(value.source),
    sourceReviewSessionId: normalizeString(value.sourceReviewSessionId) || null,
    reviewChatKey: normalizeString(value.reviewChatKey) || deriveReviewChatKeyFromContext(normalizeContext(value.context)),
    surface: isSurface(value.surface) ? value.surface : 'standalone-dialog',
    contextSignature: normalizeString(value.contextSignature) || null,
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Date.now(),
    activeSkillId: normalizeSkillId(value.activeSkillId),
    activeTabId: normalizeTabId(value.activeTabId),
    activeSkills,
    messageCount,
    lastActiveView: normalizeSkillId(value.lastActiveView || value.activeSkillId),
    activeViews: activeSkills,
    context: normalizeContext(value.context),
    messages: Array.isArray(value.messages)
      ? value.messages
        .map((message) => normalizeMessage(message, normalizeSkillId((message as { skillId?: unknown })?.skillId), normalizeTabId((message as { tabId?: unknown })?.tabId)))
        .filter((message): message is AIWorkbenchMessage => Boolean(message))
      : undefined,
    threads: normalizedThreads.threads,
    tree,
    skillResults: normalizeSkillResults(value.skillResults),
    conceptCoachResultsByContext: normalizeConceptCoachResultsByContext(
      value.conceptCoachResultsByContext,
      normalizeString(value.contextSignature) || null,
      normalizeSkillResults(value.skillResults),
    ),
    genericSkillResults: normalizeGenericSkillResults(value.genericSkillResults),
    vars: Array.isArray(value.vars) ? value.vars as AIWorkbenchSessionRecord['vars'] : [],
    diagnostics: Array.isArray(value.diagnostics) ? value.diagnostics as AIWorkbenchSessionRecord['diagnostics'] : [],
    legacyExplainMessages: Array.isArray(value.legacyExplainMessages)
      ? value.legacyExplainMessages
        .map((message) => normalizeMessage(message, CONCEPT_SKILL, DEFAULT_TAB))
        .filter((message): message is AIWorkbenchMessage => Boolean(message))
      : normalizedThreads.legacyExplainMessages,
  };
}

export class AIWorkbenchSessionStoreService {
  constructor(
    private readonly fileService: Pick<IFileService, 'readJSON' | 'writeJSON' | 'deleteFile'>,
  ) {}

  async listSummaries(): Promise<AIWorkbenchSessionSummary[]> {
    const index = await this.fileService.readJSON<SessionIndex>(SESSION_INDEX_FILE);
    const sessions = Array.isArray(index?.sessions) ? index.sessions : [];
    return sessions
      .map((summary) => {
        const messageCount = Number(summary.messageCount) || 0;
        const activeSkillId = normalizeSkillId(summary.activeSkillId || summary.lastActiveView);
        const activeSkills: AISkillId[] = Array.isArray(summary.activeSkills) && summary.activeSkills.length > 0
          ? Array.from(new Set(summary.activeSkills.map(normalizeSkillId)))
          : (messageCount > 0 ? [activeSkillId] : []);
        return {
          id: normalizeString(summary.id),
          title: normalizeString(summary.title) || '未命名会话',
          source: normalizeSource(summary.source),
          sourceReviewSessionId: normalizeString(summary.sourceReviewSessionId) || null,
          reviewChatKey: normalizeString(summary.reviewChatKey) || null,
          surface: isSurface(summary.surface) ? summary.surface : 'standalone-dialog',
          contextSignature: normalizeString(summary.contextSignature) || null,
          createdAt: Number(summary.createdAt) || Date.now(),
          updatedAt: Number(summary.updatedAt) || Date.now(),
          activeSkillId,
          activeTabId: normalizeTabId(summary.activeTabId),
          activeSkills,
          messageCount,
          lastActiveView: activeSkillId,
          activeViews: activeSkills,
        } satisfies AIWorkbenchSessionSummary;
      })
      .filter((summary) => summary.id)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async loadSession(sessionId: string): Promise<AIWorkbenchSessionRecord | null> {
    const normalizedId = normalizeString(sessionId);
    if (!normalizedId) {
      return null;
    }
    return normalizeRecord(await this.fileService.readJSON<AIWorkbenchSessionRecord>(this.getSessionFileName(normalizedId)));
  }

  async findLatestByContext(input: FindByContextInput): Promise<AIWorkbenchSessionSummary | null> {
    const normalizedSignature = normalizeString(input.contextSignature) || null;
    if (!normalizedSignature) {
      return null;
    }
    const summaries = await this.listSummaries();
    return summaries.find((summary) => (
      summary.contextSignature === normalizedSignature
      && summary.source === input.source
      && (summary.sourceReviewSessionId || null) === (normalizeString(input.sourceReviewSessionId) || null)
    )) || null;
  }

  async findLatestByReviewChatKey(input: FindByReviewChatKeyInput): Promise<AIWorkbenchSessionSummary | null> {
    const normalizedReviewChatKey = normalizeString(input.reviewChatKey) || null;
    if (!normalizedReviewChatKey) {
      return null;
    }
    const targetSource = input.source || 'review';
    const summaries = await this.listSummaries();
    const directMatch = summaries.find((summary) => (
      summary.source === targetSource
      && (summary.reviewChatKey || null) === normalizedReviewChatKey
    ));
    if (directMatch) {
      return directMatch;
    }

    for (const summary of summaries) {
      if (summary.source !== targetSource) {
        continue;
      }
      const record = await this.loadSession(summary.id);
      if (!record) {
        continue;
      }
      if ((record.reviewChatKey || deriveReviewChatKeyFromContext(record.context) || null) === normalizedReviewChatKey) {
        return {
          ...summary,
          reviewChatKey: normalizedReviewChatKey,
        };
      }
    }

    return null;
  }

  async loadSelfTestCardTargetMemory(): Promise<AIWorkbenchSelfTestCardTargetMemory | null> {
    return normalizeSelfTestCardTargetMemory(
      await this.fileService.readJSON<AIWorkbenchSelfTestCardTargetMemory>(SELF_TEST_CARD_TARGET_MEMORY_FILE),
    );
  }

  async saveSelfTestCardTargetMemory(memory: AIWorkbenchSelfTestCardTargetMemory): Promise<AIWorkbenchSelfTestCardTargetMemory | null> {
    const normalized = normalizeSelfTestCardTargetMemory(memory);
    if (!normalized) {
      return null;
    }
    const persisted = {
      ...normalized,
      updatedAt: normalized.updatedAt || Date.now(),
    };
    await this.fileService.writeJSON(SELF_TEST_CARD_TARGET_MEMORY_FILE, persisted);
    return persisted;
  }

  async saveSession(record: AIWorkbenchSessionRecord): Promise<AIWorkbenchSessionRecord> {
    const normalized = normalizeRecord(record);
    if (!normalized) {
      throw new Error('AI session record is invalid.');
    }
    const summary = buildSummary(normalized);
    const persisted: AIWorkbenchSessionRecord = {
      ...normalized,
      ...summary,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      threads: normalizeThreads(normalized.threads).threads,
      tree: normalizeTree(normalized.tree, normalized.threads),
      skillResults: normalizeSkillResults(normalized.skillResults),
      conceptCoachResultsByContext: normalizeConceptCoachResultsByContext(
        normalized.conceptCoachResultsByContext,
        normalized.contextSignature,
        normalized.skillResults,
      ),
      genericSkillResults: normalizeGenericSkillResults(normalized.genericSkillResults),
    };
    await this.fileService.writeJSON(this.getSessionFileName(persisted.id), persisted);

    const index = await this.fileService.readJSON<SessionIndex>(SESSION_INDEX_FILE);
    const summaries = Array.isArray(index?.sessions) ? [...index.sessions] : [];
    const existingIndex = summaries.findIndex((entry) => entry.id === persisted.id);
    if (existingIndex >= 0) {
      summaries.splice(existingIndex, 1, summary);
    } else {
      summaries.push(summary);
    }
    summaries.sort((left, right) => right.updatedAt - left.updatedAt);
    await this.fileService.writeJSON(SESSION_INDEX_FILE, { sessions: summaries });
    return persisted;
  }

  async renameSession(sessionId: string, title: string): Promise<AIWorkbenchSessionRecord | null> {
    const record = await this.loadSession(sessionId);
    if (!record) {
      return null;
    }
    record.title = normalizeString(title) || record.title;
    record.updatedAt = Date.now();
    return this.saveSession(record);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const normalizedId = normalizeString(sessionId);
    if (!normalizedId) {
      return;
    }
    const index = await this.fileService.readJSON<SessionIndex>(SESSION_INDEX_FILE);
    const sessions = Array.isArray(index?.sessions) ? index.sessions.filter((entry) => entry.id !== normalizedId) : [];
    await this.fileService.writeJSON(SESSION_INDEX_FILE, { sessions });
    await this.fileService.deleteFile(this.getSessionFileName(normalizedId));
  }

  private getSessionFileName(sessionId: string): string {
    return `${SESSION_RECORD_PREFIX}/${sessionId}.json`;
  }
}
