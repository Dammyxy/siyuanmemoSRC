import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_GENERAL_CHAT_SKILL_ID,
  type AIChatRuntimeDiagnostic,
  type AIChatVarEntry,
  type AIConceptCoachResult,
  type AISkillId,
  type AISkillTabId,
  type AIUserSkillStructuredResult,
  type AIWorkbenchContextSnapshot,
  type AIWorkbenchConversationTree,
  type AIWorkbenchMessage,
  type AIWorkbenchSessionRecord,
  type AIWorkbenchSurface,
  type AIWorkbenchThreads,
} from '@/types/ai';

export const AI_WORKBENCH_SESSION_SCHEMA_VERSION = 5;
export const AI_WORKBENCH_SESSION_PERSIST_DELAY_MS = 220;

type PersistTask = () => Promise<void>;
type PersistErrorHandler = (error: unknown) => void;

export interface CreateAIWorkbenchSessionRecordInput {
  id: string;
  title: string;
  context: AIWorkbenchContextSnapshot;
  contextSignature: string | null;
  sourceReviewSessionId: string | null;
  reviewChatKey: string | null;
  surface: AIWorkbenchSurface;
  activeSkillId: AISkillId;
  activeTabId: AISkillTabId;
  skillTabIds: AISkillTabId[];
  now: number;
}

export interface BuildCurrentAIWorkbenchSessionRecordInput {
  sessionId: string;
  title: string;
  fallbackTitle: string;
  sourceReviewSessionId: string | null;
  reviewChatKey: string | null;
  surface: AIWorkbenchSurface;
  contextSignature: string | null;
  context: AIWorkbenchContextSnapshot | null;
  liveContext: AIWorkbenchContextSnapshot | null;
  createdAt: number;
  updatedAt: number;
  activeSkillId: AISkillId;
  activeTabId: AISkillTabId;
  tree: AIWorkbenchConversationTree;
  messages: AIWorkbenchMessage[];
  threads: AIWorkbenchThreads;
  conceptSkillResult: AIConceptCoachResult | null;
  conceptCoachResultsByContext: Record<string, AIConceptCoachResult | null>;
  genericSkillResults: Record<string, AIUserSkillStructuredResult | null>;
  vars: AIChatVarEntry[];
  diagnostics: AIChatRuntimeDiagnostic[];
  legacyExplainMessages?: AIWorkbenchMessage[];
}

export interface ProjectAIWorkbenchSessionRecordInput {
  record: AIWorkbenchSessionRecord;
  liveContext: AIWorkbenchContextSnapshot | null;
  liveContextSignature: string | null;
  fallbackReviewChatKey: string | null;
}

export interface AIWorkbenchSessionRecordProjection {
  sessionId: string;
  sessionTitle: string;
  surface: AIWorkbenchSurface;
  sourceReviewSessionId: string | null;
  reviewChatKey: string | null;
  context: AIWorkbenchContextSnapshot | null;
  contextSignature: string | null;
  liveContext: AIWorkbenchContextSnapshot | null;
  contextIsHistorical: boolean;
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function collectMessageNodes(tree: AIWorkbenchConversationTree) {
  return Object.values(tree.nodes).filter((node) => node.kind === 'message');
}

export function createEmptyConversationTree(): AIWorkbenchConversationTree {
  return {
    rootNodeId: null,
    activeLeafNodeId: null,
    activeLeafNodeIds: {},
    nodes: {},
  };
}

export function createEmptyThreadRecord(
  skillId: AISkillId,
  tabId: AISkillTabId,
): AIWorkbenchThreads[string][string] {
  return {
    skillId,
    tabId,
    messages: [],
    resultContextSignature: null,
    stale: false,
    staleReason: null,
  };
}

export function createInitialThreads(): AIWorkbenchThreads {
  const makeSkillThreads = (skillId: AISkillId): AIWorkbenchThreads[AISkillId] => ({
    chat: createEmptyThreadRecord(skillId, 'chat'),
    'working-definition': createEmptyThreadRecord(skillId, 'working-definition'),
    perspectives: createEmptyThreadRecord(skillId, 'perspectives'),
    'integrated-understanding': createEmptyThreadRecord(skillId, 'integrated-understanding'),
    'self-test-cards': createEmptyThreadRecord(skillId, 'self-test-cards'),
    'cdf-structure': createEmptyThreadRecord(skillId, 'cdf-structure'),
    'real-world-triggers': createEmptyThreadRecord(skillId, 'real-world-triggers'),
  });
  return {
    [AI_GENERAL_CHAT_SKILL_ID]: makeSkillThreads(AI_GENERAL_CHAT_SKILL_ID),
    [AI_CONCEPT_COACH_SKILL_ID]: makeSkillThreads(AI_CONCEPT_COACH_SKILL_ID),
  };
}

export function normalizeSurface(value: unknown): AIWorkbenchSurface {
  return value === 'review-dialog-sidecar'
    || value === 'review-tab-companion'
    || value === 'standalone-dialog'
    ? value
    : 'standalone-dialog';
}

export function createAIWorkbenchSessionRecord(
  input: CreateAIWorkbenchSessionRecordInput,
): AIWorkbenchSessionRecord {
  const threads = createInitialThreads();
  threads[input.activeSkillId] = threads[input.activeSkillId] || {};
  for (const tabId of input.skillTabIds) {
    threads[input.activeSkillId][tabId] = threads[input.activeSkillId][tabId]
      || createEmptyThreadRecord(input.activeSkillId, tabId);
  }

  return {
    id: input.id,
    title: input.title,
    source: input.context.source,
    sourceReviewSessionId: input.sourceReviewSessionId,
    reviewChatKey: input.reviewChatKey,
    surface: input.surface,
    contextSignature: input.contextSignature,
    createdAt: input.now,
    updatedAt: input.now,
    activeSkillId: input.activeSkillId,
    activeTabId: input.activeTabId,
    activeSkills: [],
    messageCount: 0,
    lastActiveView: input.activeSkillId,
    activeViews: [],
    context: input.context,
    schemaVersion: AI_WORKBENCH_SESSION_SCHEMA_VERSION,
    messages: [],
    threads,
    tree: createEmptyConversationTree(),
    skillResults: {
      [AI_GENERAL_CHAT_SKILL_ID]: null,
      [AI_CONCEPT_COACH_SKILL_ID]: null,
    },
    conceptCoachResultsByContext: {},
    genericSkillResults: {},
    vars: [],
    diagnostics: [],
  };
}

export function buildCurrentAIWorkbenchSessionRecord(
  input: BuildCurrentAIWorkbenchSessionRecordInput,
): AIWorkbenchSessionRecord | null {
  const sessionId = normalizeString(input.sessionId);
  if (!sessionId) {
    return null;
  }

  const messageNodes = collectMessageNodes(input.tree);
  const activeSkills = Array.from(new Set(messageNodes.map((node) => node.skillId)));

  return {
    schemaVersion: AI_WORKBENCH_SESSION_SCHEMA_VERSION,
    id: sessionId,
    title: normalizeString(input.title) || input.fallbackTitle,
    source: input.context?.source || input.liveContext?.source || 'standalone',
    sourceReviewSessionId: input.sourceReviewSessionId,
    reviewChatKey: input.reviewChatKey,
    surface: input.surface,
    contextSignature: input.contextSignature,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    activeSkillId: input.activeSkillId,
    activeTabId: input.activeTabId,
    activeSkills,
    messageCount: messageNodes.length,
    lastActiveView: input.activeSkillId,
    activeViews: activeSkills,
    context: input.context,
    messages: input.messages,
    threads: input.threads,
    tree: input.tree,
    skillResults: {
      [AI_GENERAL_CHAT_SKILL_ID]: null,
      [AI_CONCEPT_COACH_SKILL_ID]: input.conceptSkillResult,
    },
    conceptCoachResultsByContext: input.conceptCoachResultsByContext,
    genericSkillResults: input.genericSkillResults,
    vars: input.vars,
    diagnostics: input.diagnostics,
    legacyExplainMessages: input.legacyExplainMessages,
  };
}

export function projectAIWorkbenchSessionRecordApplication(
  input: ProjectAIWorkbenchSessionRecordInput,
): AIWorkbenchSessionRecordProjection {
  const { record, liveContext, liveContextSignature } = input;
  return {
    sessionId: record.id,
    sessionTitle: record.title,
    surface: normalizeSurface(record.surface),
    sourceReviewSessionId: record.sourceReviewSessionId,
    reviewChatKey: normalizeString(record.reviewChatKey) || input.fallbackReviewChatKey,
    context: record.context,
    contextSignature: record.contextSignature,
    liveContext,
    contextIsHistorical: Boolean(
      record.contextSignature
      && liveContext
      && record.contextSignature !== liveContextSignature
    ),
  };
}

export class AIWorkbenchSessionPersistScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly delayMs = AI_WORKBENCH_SESSION_PERSIST_DELAY_MS) {}

  schedule(task: PersistTask, onError: PersistErrorHandler): void {
    this.clear();
    this.timer = setTimeout(() => {
      this.timer = null;
      void task().catch(onError);
    }, this.delayMs);
  }

  clear(): void {
    if (!this.timer) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = null;
  }

  hasPending(): boolean {
    return this.timer !== null;
  }
}
