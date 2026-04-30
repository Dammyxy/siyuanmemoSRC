import {
  createAIWorkbenchRunStatus,
} from '@/application/services/AIWorkbenchRunProjection';
import type {
  AISkillId,
  AISkillTabId,
  AIWorkbenchRunMode,
  AIWorkbenchRunStatus,
  AIWorkbenchState,
} from '@/types/ai';
import type { AIWorkbenchSkillTabDescriptor } from '@/application/services/AIWorkbenchSkillRegistry';
import type { AIArenaEventType } from '@/types/arena';

type AIWorkbenchRunRuntimeDeps = {
  state: AIWorkbenchState;
  normalizeTabForCurrentSettings: (tabId: AISkillTabId, skillId: AISkillId) => AISkillTabId;
  getSkillTabs: () => AIWorkbenchSkillTabDescriptor[];
  getActiveTabDescriptor: () => AIWorkbenchSkillTabDescriptor;
  ensureSkillRuntimeState: (skillId: AISkillId) => void;
  syncDerivedStateFromThreads: () => void;
  persistCurrentSession: () => Promise<void>;
  recordArenaEvent: (
    eventType: AIArenaEventType,
    input?: {
      metadata?: Record<string, unknown>;
    },
  ) => Promise<void>;
};

export class AIWorkbenchRunRuntime {
  constructor(private readonly deps: AIWorkbenchRunRuntimeDeps) {}

  createRunStatus(mode: AIWorkbenchRunMode, tabIds: AISkillTabId[]): AIWorkbenchRunStatus {
    const skillId = this.deps.state.activeSkillId;
    return createAIWorkbenchRunStatus({
      mode,
      skillId,
      tabIds: tabIds.map((tabId) => this.deps.normalizeTabForCurrentSettings(tabId, skillId)),
      activeTabId: this.deps.state.activeTabId,
      tabs: this.deps.getSkillTabs(),
      activeTabTitle: this.deps.getActiveTabDescriptor().title,
    });
  }

  async runTask(tabIds: AISkillTabId[], runner: () => Promise<void>, mode: AIWorkbenchRunMode): Promise<void> {
    this.deps.state.isLoading = true;
    this.deps.state.error = null;
    this.deps.state.failureDiagnostic = null;
    const skillId = this.deps.state.activeSkillId;
    this.deps.ensureSkillRuntimeState(skillId);
    const normalizedTabIds = tabIds.map((tabId) => this.deps.normalizeTabForCurrentSettings(tabId, skillId));
    this.deps.state.runStatus = this.createRunStatus(mode, normalizedTabIds);
    for (const tabId of normalizedTabIds) {
      const thread = this.deps.state.threads[skillId][tabId];
      thread.stale = false;
      thread.staleReason = null;
    }
    try {
      await runner();
      for (const tabId of normalizedTabIds) {
        const thread = this.deps.state.threads[skillId][tabId];
        thread.resultContextSignature = this.deps.state.contextSignature;
        thread.stale = false;
        thread.staleReason = null;
      }
      this.deps.state.legacyNotice = null;
      this.deps.syncDerivedStateFromThreads();
      await this.deps.persistCurrentSession();
      if (mode === 'tab-rerun') {
        await this.deps.recordArenaEvent('rerun', {
          metadata: {
            tabIds: normalizedTabIds,
            skillId,
          },
        });
      }
    } catch (error) {
      this.deps.state.error = error instanceof Error ? error.message : String(error);
      await this.deps.recordArenaEvent('abandon', {
        metadata: {
          mode,
          tabIds: normalizedTabIds,
          skillId,
          error: this.deps.state.error,
        },
      });
    } finally {
      this.deps.state.isLoading = false;
      this.deps.state.runStatus = null;
    }
  }
}
