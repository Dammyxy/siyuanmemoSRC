import type { IFileService } from '@/infrastructure/services/FileService';
import type {
  AIMakeCardMode,
  AITaskType,
  AIWorkbenchContextSnapshot,
  AIWorkbenchMessage,
  AIWorkbenchSessionRecord,
  AIWorkbenchSessionSummary,
  AIWorkbenchSurface,
  AIWorkbenchThreadRecord,
  AIWorkbenchSource,
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

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createEmptyThread(view: AITaskType): AIWorkbenchThreadRecord {
  return {
    view,
    messages: [],
    resultContextSignature: null,
    stale: false,
    staleReason: null,
  };
}

function createEmptyThreads(): Record<AITaskType, AIWorkbenchThreadRecord> {
  return {
    tutor: createEmptyThread('tutor'),
    explain: createEmptyThread('explain'),
    'make-cards': createEmptyThread('make-cards'),
  };
}

function isTaskType(value: unknown): value is AITaskType {
  return value === 'tutor' || value === 'explain' || value === 'make-cards';
}

function isSurface(value: unknown): value is AIWorkbenchSurface {
  return value === 'standalone-dialog' || value === 'review-dialog-sidecar' || value === 'review-tab-companion';
}

function normalizeMessageCount(messages: AIWorkbenchMessage[] | undefined): number {
  return Array.isArray(messages) ? messages.length : 0;
}

function buildSummary(record: AIWorkbenchSessionRecord): AIWorkbenchSessionSummary {
  const activeViews = (['tutor', 'explain', 'make-cards'] as const).filter((view) => (
    record.threads[view].messages.length > 0
  ));
  const messageCount = (['tutor', 'explain', 'make-cards'] as const)
    .reduce((count, view) => count + normalizeMessageCount(record.threads[view].messages), 0);
  return {
    id: record.id,
    title: record.title,
    source: record.source,
    sourceReviewSessionId: record.sourceReviewSessionId,
    surface: record.surface,
    contextSignature: record.contextSignature,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastActiveView: record.lastActiveView,
    activeViews,
    messageCount,
  };
}

function normalizeThreadRecord(view: AITaskType, value: unknown): AIWorkbenchThreadRecord {
  const fallback = createEmptyThread(view);
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const raw = value as Partial<AIWorkbenchThreadRecord>;
  return {
    view,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    resultContextSignature: normalizeString(raw.resultContextSignature) || null,
    stale: raw.stale === true,
    staleReason: normalizeString(raw.staleReason) || null,
  };
}

function normalizeContext(value: unknown): AIWorkbenchContextSnapshot | null {
  return value && typeof value === 'object' ? (value as AIWorkbenchContextSnapshot) : null;
}

function normalizeMode(value: unknown): AIMakeCardMode {
  switch (value) {
    case 'cloze':
    case 'concept-descriptor':
    case 'cdf':
      return value;
    default:
      return 'qa';
  }
}

function normalizeRecord(value: unknown): AIWorkbenchSessionRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<AIWorkbenchSessionRecord>;
  const id = normalizeString(raw.id);
  if (!id) {
    return null;
  }
  const threads = raw.threads && typeof raw.threads === 'object'
    ? {
        tutor: normalizeThreadRecord('tutor', raw.threads.tutor),
        explain: normalizeThreadRecord('explain', raw.threads.explain),
        'make-cards': normalizeThreadRecord('make-cards', raw.threads['make-cards']),
      }
    : createEmptyThreads();
  return {
    id,
    title: normalizeString(raw.title) || '未命名会话',
    source: raw.source === 'review' || raw.source === 'browser' || raw.source === 'template-dialog'
      ? raw.source
      : 'standalone',
    sourceReviewSessionId: normalizeString(raw.sourceReviewSessionId) || null,
    surface: isSurface(raw.surface) ? raw.surface : 'standalone-dialog',
    contextSignature: normalizeString(raw.contextSignature) || null,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    lastActiveView: isTaskType(raw.lastActiveView) ? raw.lastActiveView : 'tutor',
    activeViews: [],
    messageCount: 0,
    context: normalizeContext(raw.context),
    makeCardMode: normalizeMode(raw.makeCardMode),
    requestBatchSummary: raw.requestBatchSummary === true,
    threads,
  };
}

export class AIWorkbenchSessionStoreService {
  constructor(
    private readonly fileService: Pick<IFileService, 'readJSON' | 'writeJSON' | 'deleteFile'>,
  ) {}

  async listSummaries(): Promise<AIWorkbenchSessionSummary[]> {
    const index = await this.fileService.readJSON<SessionIndex>(SESSION_INDEX_FILE);
    const sessions = Array.isArray(index?.sessions) ? index.sessions : [];
    return [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async loadSession(sessionId: string): Promise<AIWorkbenchSessionRecord | null> {
    const normalizedId = normalizeString(sessionId);
    if (!normalizedId) {
      return null;
    }
    const record = await this.fileService.readJSON<AIWorkbenchSessionRecord>(this.getSessionFileName(normalizedId));
    const normalized = normalizeRecord(record);
    if (!normalized) {
      return null;
    }
    const summary = buildSummary(normalized);
    return {
      ...normalized,
      activeViews: summary.activeViews,
      messageCount: summary.messageCount,
    };
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
    const summary = buildSummary(record);
    const persisted: AIWorkbenchSessionRecord = {
      ...record,
      activeViews: summary.activeViews,
      messageCount: summary.messageCount,
    };
    await this.fileService.writeJSON(this.getSessionFileName(record.id), persisted);

    const index = await this.fileService.readJSON<SessionIndex>(SESSION_INDEX_FILE);
    const summaries = Array.isArray(index?.sessions) ? [...index.sessions] : [];
    const existingIndex = summaries.findIndex((entry) => entry.id === record.id);
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
