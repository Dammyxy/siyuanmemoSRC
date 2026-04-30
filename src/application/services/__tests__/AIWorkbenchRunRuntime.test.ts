import { describe, expect, it, vi } from 'vitest';
import { AIWorkbenchRunRuntime } from '../AIWorkbenchRunRuntime';
import type { AIWorkbenchState } from '@/types/ai';

describe('AIWorkbenchRunRuntime', () => {
  it('marks tabs as running, clears stale state, persists successful runs, and records reruns', async () => {
    const state = {
      activeSkillId: 'general-chat',
      activeTabId: 'chat',
      contextSignature: 'ctx-1',
      isLoading: false,
      error: 'old',
      failureDiagnostic: { message: 'old' },
      runStatus: null,
      legacyNotice: 'legacy',
      threads: {
        'general-chat': {
          chat: {
            stale: true,
            staleReason: 'old',
            resultContextSignature: null,
          },
        },
      },
    } as unknown as AIWorkbenchState;
    const persistCurrentSession = vi.fn();
    const recordArenaEvent = vi.fn();
    const runtime = new AIWorkbenchRunRuntime({
      state,
      normalizeTabForCurrentSettings: (tabId) => tabId,
      getSkillTabs: () => [{ id: 'chat', title: 'Chat', runPrompt: '', followUpPrompt: '' }] as never,
      getActiveTabDescriptor: () => ({ id: 'chat', title: 'Chat', runPrompt: '', followUpPrompt: '' }) as never,
      ensureSkillRuntimeState: vi.fn(),
      syncDerivedStateFromThreads: vi.fn(),
      persistCurrentSession,
      recordArenaEvent,
    });

    await runtime.runTask(['chat'], vi.fn(async () => undefined), 'tab-rerun');

    expect(state.isLoading).toBe(false);
    expect(state.runStatus).toBeNull();
    expect(state.error).toBeNull();
    expect(state.failureDiagnostic).toBeNull();
    expect(state.legacyNotice).toBeNull();
    expect(state.threads['general-chat'].chat).toMatchObject({
      stale: false,
      staleReason: null,
      resultContextSignature: 'ctx-1',
    });
    expect(persistCurrentSession).toHaveBeenCalledTimes(1);
    expect(recordArenaEvent).toHaveBeenCalledWith('rerun', {
      metadata: {
        tabIds: ['chat'],
        skillId: 'general-chat',
      },
    });
  });
});
