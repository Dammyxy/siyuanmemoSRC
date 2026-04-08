import { AIWorkbenchService, type AIWorkbenchServiceDeps } from '@/application/services/AIWorkbenchService';
import type { AIWorkbenchOpenOptions, AIWorkbenchSurface } from '@/types/ai';

type ReviewSurface = Exclude<AIWorkbenchSurface, 'standalone-dialog'>;

function normalizeSessionId(value: unknown): string {
  return String(value || '').trim();
}

export class ReviewAIWorkbenchRegistry {
  private standaloneService: AIWorkbenchService | null = null;
  private readonly reviewSessions = new Map<string, AIWorkbenchService>();

  constructor(private readonly deps: AIWorkbenchServiceDeps) {}

  getStandaloneService(): AIWorkbenchService {
    if (!this.standaloneService) {
      this.standaloneService = new AIWorkbenchService(this.deps);
    }
    return this.standaloneService;
  }

  getReviewSession(sessionId: string): AIWorkbenchService | null {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      return null;
    }
    return this.reviewSessions.get(normalizedSessionId) || null;
  }

  hasReviewSession(sessionId: string): boolean {
    return this.getReviewSession(sessionId) !== null;
  }

  getOrCreateReviewSession(
    sessionId: string,
    _options?: {
      surface?: ReviewSurface;
      sourceReviewSessionId?: string | null;
    },
  ): AIWorkbenchService {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      throw new Error('reviewSessionId is required');
    }

    const existing = this.reviewSessions.get(normalizedSessionId);
    if (existing) {
      return existing;
    }

    const service = new AIWorkbenchService(this.deps);
    this.reviewSessions.set(normalizedSessionId, service);
    return service;
  }

  async openReviewSession(
    options: AIWorkbenchOpenOptions & {
      sessionId: string;
      surface: ReviewSurface;
    },
  ): Promise<AIWorkbenchService> {
    const normalizedSessionId = normalizeSessionId(options.sessionId);
    if (!normalizedSessionId) {
      throw new Error('reviewSessionId is required');
    }

    const service = this.getOrCreateReviewSession(normalizedSessionId, {
      surface: options.surface,
      sourceReviewSessionId: options.sourceReviewSessionId ?? normalizedSessionId,
    });
    await service.open({
      ...options,
      source: 'review',
      sessionId: normalizedSessionId,
      sourceReviewSessionId: options.sourceReviewSessionId ?? normalizedSessionId,
    });
    return service;
  }

  async updateReviewSessionContext(
    options: AIWorkbenchOpenOptions & {
      sessionId: string;
      surface: ReviewSurface;
    },
  ): Promise<AIWorkbenchService> {
    return this.openReviewSession(options);
  }

  disposeReviewSession(sessionId: string): void {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      return;
    }
    this.reviewSessions.delete(normalizedSessionId);
  }
}
