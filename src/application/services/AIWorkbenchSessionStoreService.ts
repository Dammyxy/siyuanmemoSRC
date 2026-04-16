import type { IFileService } from '@/infrastructure/services/FileService';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
  type AIConceptCoachResult,
  type AISkillId,
  type AISkillTabId,
  type AIWorkbenchContextSnapshot,
  type AIWorkbenchMessage,
  type AIWorkbenchSessionRecord,
  type AIWorkbenchSessionSummary,
  type AIWorkbenchSource,
  type AIWorkbenchSurface,
  type AIWorkbenchThreadRecord,
  type AIWorkbenchThreads,
} from '@/types/ai';

type SessionIndex = {
  sessions: AIWorkbenchSessionSummary[];
};

type FindByContextInput = {
  contextSignature: string | null;
  source: AIWorkbenchSource;
  sourceReviewSessionId: string | null;
};

const SESSION_INDEX_FILE = 'ai-workbench/sessions/index.json';
const SESSION_RECORD_PREFIX = 'ai-workbench/sessions/records';
const CONCEPT_SKILL: AISkillId = AI_CONCEPT_COACH_SKILL_ID;
const GENERAL_SKILL: AISkillId = AI_GENERAL_CHAT_SKILL_ID;
const DEFAULT_TAB: AISkillTabId = 'working-definition';
const ALL_TAB_IDS: AISkillTabId[] = [
  AI_GENERAL_CHAT_TAB_ID,
  ...AI_CONCEPT_COACH_TAB_IDS,
];

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
  return value === AI_GENERAL_CHAT_TAB_ID
    ? AI_GENERAL_CHAT_TAB_ID
    : AI_CONCEPT_COACH_TAB_IDS.includes(value as typeof AI_CONCEPT_COACH_TAB_IDS[number])
    ? value as AISkillTabId
    : DEFAULT_TAB;
}

function normalizeSkillId(value: unknown): AISkillId {
  return value === GENERAL_SKILL ? GENERAL_SKILL : CONCEPT_SKILL;
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
    'real-world-triggers': createEmptyThread(skillId, 'real-world-triggers'),
  });
  return {
    [GENERAL_SKILL]: makeSkillThreads(GENERAL_SKILL),
    [CONCEPT_SKILL]: makeSkillThreads(CONCEPT_SKILL),
  };
}

function normalizeMessage(value: unknown, skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchMessage | null {
  if (!isRecord(value) || value.kind === 'candidate-board') {
    return null;
  }
  const kind = normalizeString(value.kind);
  if (kind !== 'user' && kind !== 'assistant-text' && kind !== 'assistant-result' && kind !== 'tool-log' && kind !== 'approval') {
    return null;
  }
  return {
    ...value,
    skillId: normalizeSkillId(value.skillId || skillId),
    tabId: normalizeTabId(value.tabId || tabId),
    view: value.view || skillId,
  } as unknown as AIWorkbenchMessage;
}

function normalizeThreadRecord(value: unknown, skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchThreadRecord {
  if (!isRecord(value)) {
    return createEmptyThread(skillId, tabId);
  }
  return {
    skillId,
    tabId,
    messages: Array.isArray(value.messages)
      ? value.messages.map((message) => normalizeMessage(message, skillId, tabId)).filter((message): message is AIWorkbenchMessage => Boolean(message))
      : [],
    resultContextSignature: normalizeString(value.resultContextSignature) || null,
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
    return { threads };
  }

  for (const tabId of AI_CONCEPT_COACH_TAB_IDS) {
    if (isRecord(raw[tabId])) {
      threads[CONCEPT_SKILL][tabId] = normalizeThreadRecord(raw[tabId], CONCEPT_SKILL, tabId);
    }
  }

  if (isRecord(raw.explain)) {
    const legacyThread = normalizeThreadRecord(raw.explain, CONCEPT_SKILL, DEFAULT_TAB);
    if (legacyThread.messages.length > 0) {
      threads[CONCEPT_SKILL][DEFAULT_TAB] = legacyThread;
      return { threads, legacyExplainMessages: [...legacyThread.messages] };
    }
  }

  return { threads };
}

function normalizeContext(value: unknown): AIWorkbenchContextSnapshot | null {
  return isRecord(value) ? value as AIWorkbenchContextSnapshot : null;
}

function normalizeSkillResults(value: unknown): Record<AISkillId, AIConceptCoachResult | null> {
  const raw = isRecord(value) ? value : {};
  const result = isRecord(raw[CONCEPT_SKILL]) ? raw[CONCEPT_SKILL] as AIConceptCoachResult : null;
  return {
    [GENERAL_SKILL]: null,
    [CONCEPT_SKILL]: result,
  };
}

function countMessages(threads: AIWorkbenchThreads): number {
  return ([GENERAL_SKILL, CONCEPT_SKILL] as AISkillId[]).reduce((total, skillId) => (
    total + ALL_TAB_IDS.reduce((innerTotal, tabId) => innerTotal + (threads[skillId][tabId]?.messages.length || 0), 0)
  ), 0);
}

function buildSummary(record: AIWorkbenchSessionRecord): AIWorkbenchSessionSummary {
  const threads = normalizeThreads(record.threads).threads;
  const messageCount = countMessages(threads);
  const activeSkills: AISkillId[] = ([GENERAL_SKILL, CONCEPT_SKILL] as AISkillId[])
    .filter((skillId) => ALL_TAB_IDS.some((tabId) => (threads[skillId][tabId]?.messages.length || 0) > 0));
  return {
    id: record.id,
    title: record.title,
    source: record.source,
    sourceReviewSessionId: record.sourceReviewSessionId,
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
  const messageCount = countMessages(normalizedThreads.threads);
  const activeSkills: AISkillId[] = ([GENERAL_SKILL, CONCEPT_SKILL] as AISkillId[])
    .filter((skillId) => ALL_TAB_IDS.some((tabId) => (normalizedThreads.threads[skillId][tabId]?.messages.length || 0) > 0));
  return {
    schemaVersion: Number(value.schemaVersion) || 2,
    id,
    title: normalizeString(value.title) || '未命名会话',
    source: normalizeSource(value.source),
    sourceReviewSessionId: normalizeString(value.sourceReviewSessionId) || null,
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
      ? value.messages.map((message) => normalizeMessage(message, normalizeSkillId((message as { skillId?: unknown })?.skillId), normalizeTabId((message as { tabId?: unknown })?.tabId))).filter((message): message is AIWorkbenchMessage => Boolean(message))
      : undefined,
    threads: normalizedThreads.threads,
    skillResults: normalizeSkillResults(value.skillResults),
    vars: Array.isArray(value.vars) ? value.vars as AIWorkbenchSessionRecord['vars'] : [],
    diagnostics: Array.isArray(value.diagnostics) ? value.diagnostics as AIWorkbenchSessionRecord['diagnostics'] : [],
    legacyExplainMessages: Array.isArray(value.legacyExplainMessages)
      ? value.legacyExplainMessages.map((message) => normalizeMessage(message, CONCEPT_SKILL, DEFAULT_TAB)).filter((message): message is AIWorkbenchMessage => Boolean(message))
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
          ? summary.activeSkills.map(normalizeSkillId)
          : (messageCount > 0 ? [activeSkillId] : []);
        return {
          id: normalizeString(summary.id),
          title: normalizeString(summary.title) || '未命名会话',
          source: normalizeSource(summary.source),
          sourceReviewSessionId: normalizeString(summary.sourceReviewSessionId) || null,
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

  async saveSession(record: AIWorkbenchSessionRecord): Promise<AIWorkbenchSessionRecord> {
    const normalized = normalizeRecord(record);
    if (!normalized) {
      throw new Error('AI session record is invalid.');
    }
    const summary = buildSummary(normalized);
    const persisted: AIWorkbenchSessionRecord = {
      ...normalized,
      ...summary,
      threads: normalizeThreads(normalized.threads).threads,
      skillResults: normalizeSkillResults(normalized.skillResults),
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
