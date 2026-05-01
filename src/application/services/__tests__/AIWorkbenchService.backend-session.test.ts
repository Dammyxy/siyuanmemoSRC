import { describe, expect, it, vi } from 'vitest';
import { AIWorkbenchService, type AIWorkbenchServiceDeps } from '../AIWorkbenchService';

function createDeps(overrides: Partial<AIWorkbenchServiceDeps> = {}): AIWorkbenchServiceDeps {
  return {
    getAISettings: () => ({
      providers: [],
      selectedProviderId: '',
      selectedModelId: '',
      requestTimeoutMs: 30_000,
      temperature: 0.5,
      customPromptTemplate: '',
      chatDefaults: {
        reviewDefaultSkillId: 'concept-coach',
        standaloneDefaultSkillId: 'general-chat',
        stream: false,
      },
      workbench: {
        autoSave: true,
      },
      webSearch: { backend: 'none', apiKey: '' },
    } as unknown as ReturnType<AIWorkbenchServiceDeps['getAISettings']>),
    cardContentQueryService: {} as AIWorkbenchServiceDeps['cardContentQueryService'],
    siyuanPort: {} as AIWorkbenchServiceDeps['siyuanPort'],
    llmPort: {} as AIWorkbenchServiceDeps['llmPort'],
    ...overrides,
  };
}

describe('AIWorkbenchService backend session lifecycle hooks', () => {
  it('creates and updates backend session when sync helpers run', async () => {
    const createSession = vi.fn(async () => ({ ok: true }));
    const updateSession = vi.fn(async () => ({ ok: true }));
    const service = new AIWorkbenchService(createDeps({
      backendSessionService: {
        createSession,
        updateSession,
        cancelSession: vi.fn(),
      },
    }));

    service.state.sessionId = 'ai-session-1';
    service.state.surface = 'standalone-dialog';
    service.state.sourceReviewSessionId = null;
    service.state.runStatus = null;

    await (service as unknown as {
      syncBackendSessionCreate: () => Promise<void>;
      syncBackendSessionUpdate: () => Promise<void>;
    }).syncBackendSessionCreate();
    await (service as unknown as {
      syncBackendSessionUpdate: () => Promise<void>;
    }).syncBackendSessionUpdate();

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'ai-session-1',
      surfaceId: 'standalone-dialog',
      owner: 'backend',
    }));
    expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'ai-session-1',
      state: 'active',
    }));
  });

  it('cancels backend session on delete hook', async () => {
    const cancelSession = vi.fn(async () => ({ ok: true }));
    const service = new AIWorkbenchService(createDeps({
      backendSessionService: {
        createSession: vi.fn(),
        updateSession: vi.fn(),
        cancelSession,
      },
    }));

    await (service as unknown as {
      syncBackendSessionCancel: (sessionId: string) => Promise<void>;
    }).syncBackendSessionCancel('ai-session-2');

    expect(cancelSession).toHaveBeenCalledWith({
      sessionId: 'ai-session-2',
      reason: 'deleted',
    });
  });
});
