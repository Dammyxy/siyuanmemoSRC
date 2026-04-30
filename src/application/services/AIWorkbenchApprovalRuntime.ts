import type {
  AIChatApprovalRequest,
  AIChatRuntimeDiagnostic,
  AIChatToolExecutionResult,
  AISkillId,
  AISkillTabId,
  AIWorkbenchApprovalMessage,
  AIWorkbenchAssistantTextMessage,
  AIWorkbenchMessage,
  AIWorkbenchState,
  AIWorkbenchToolLogMessage,
} from '@/types/ai';

type ApprovalResolver = {
  request: AIChatApprovalRequest;
  resolve: (value: { approved: boolean; rejectReason?: string }) => void;
};

type AIWorkbenchApprovalRuntimeDeps = {
  state: AIWorkbenchState;
  approvalResolvers: Map<string, ApprovalResolver>;
  appendMessage: (tabId: AISkillTabId, message: AIWorkbenchMessage) => void;
  patchActiveNodeMessage: (
    messageId: string,
    updater: (message: AIWorkbenchMessage) => AIWorkbenchMessage,
  ) => AIWorkbenchMessage | null;
  findApprovalMessageNodeId: (requestId: string) => string | null;
  syncDerivedStateFromThreads: () => void;
  persistCurrentSession: () => Promise<void>;
};

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class AIWorkbenchApprovalRuntime {
  constructor(private readonly deps: AIWorkbenchApprovalRuntimeDeps) {}

  appendToolLogMessage(
    result: AIChatToolExecutionResult,
    skillId: AISkillId = this.deps.state.activeSkillId,
    tabId: AISkillTabId = this.deps.state.activeTabId,
    runGroupId?: string | null,
  ): void {
    this.deps.appendMessage(tabId, {
      id: createEntryId('ai-tool'),
      skillId,
      tabId,
      view: skillId,
      kind: 'tool-log',
      createdAt: result.createdAt,
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      group: result.group,
      status: result.status,
      content: result.finalText,
      argsText: result.argsText || null,
      resultText: result.resultText || null,
      error: result.error || null,
      argsVarRef: result.argsVarRef || null,
      varRef: result.varRef || null,
      durationMs: result.durationMs || null,
      roundIndex: result.roundIndex || null,
      llmUsage: result.llmUsage || null,
      runGroupId: normalizeString(runGroupId) || null,
      presentation: 'supplemental',
    } satisfies AIWorkbenchToolLogMessage);
  }

  appendApprovalMessage(
    request: AIChatApprovalRequest,
    skillId: AISkillId = this.deps.state.activeSkillId,
    tabId: AISkillTabId = this.deps.state.activeTabId,
    runGroupId?: string | null,
  ): void {
    this.deps.appendMessage(tabId, {
      id: createEntryId('ai-approval'),
      skillId,
      tabId,
      view: skillId,
      kind: 'approval',
      createdAt: request.createdAt,
      request,
      runGroupId: normalizeString(runGroupId) || null,
      presentation: 'supplemental',
    } satisfies AIWorkbenchApprovalMessage);
  }

  updateApprovalMessage(request: AIChatApprovalRequest): void {
    const nodeId = this.deps.findApprovalMessageNodeId(request.id);
    if (nodeId) {
      this.deps.patchActiveNodeMessage(nodeId, (message) => ({
        ...(message as AIWorkbenchApprovalMessage),
        request,
      } satisfies AIWorkbenchApprovalMessage));
    }
    this.deps.syncDerivedStateFromThreads();
  }

  addRuntimeDiagnostic(diagnostic: AIChatRuntimeDiagnostic): void {
    this.deps.state.diagnostics = [
      ...this.deps.state.diagnostics,
      diagnostic,
    ].slice(-40);
  }

  async requestInlineToolApproval(request: AIChatApprovalRequest): Promise<{ approved: boolean; rejectReason?: string }> {
    this.deps.state.pendingApprovals.push(request);
    this.appendApprovalMessage(
      request,
      request.skillId || this.deps.state.activeSkillId,
      request.tabId || this.deps.state.activeTabId,
      request.runGroupId,
    );
    this.addRuntimeDiagnostic({
      type: 'approval',
      message: request.type === 'result'
        ? `工具 ${request.toolName} 的结果等待用户审批。`
        : `工具 ${request.toolName} 等待用户审批后执行。`,
      detail: request.argsText || JSON.stringify(request.args, null, 2),
      createdAt: Date.now(),
    });
    this.deps.appendMessage(request.tabId || this.deps.state.activeTabId, {
      id: createEntryId('ai-msg'),
      skillId: request.skillId || this.deps.state.activeSkillId,
      tabId: request.tabId || this.deps.state.activeTabId,
      view: request.skillId || this.deps.state.activeSkillId,
      kind: 'assistant-text',
      content: request.type === 'result'
        ? `工具「${request.title}」已经得到结果，等你确认后我就继续。`
        : `我准备执行工具「${request.title}」，请先确认。`,
      createdAt: Date.now(),
      sourceContent: null,
      appliedContexts: [],
      runGroupId: request.runGroupId || null,
      presentation: 'supplemental',
    } satisfies AIWorkbenchAssistantTextMessage);
    return new Promise((resolve) => {
      this.deps.approvalResolvers.set(request.id, { request, resolve });
    });
  }

  async resolveToolApproval(approvalId: string, approved: boolean, rejectReason = ''): Promise<void> {
    const normalizedId = normalizeString(approvalId);
    if (!normalizedId) {
      return;
    }
    const nextPending: AIChatApprovalRequest[] = [];
    for (const request of this.deps.state.pendingApprovals) {
      if (request.id !== normalizedId) {
        nextPending.push(request);
        continue;
      }
      const resolved: AIChatApprovalRequest = {
        ...request,
        status: approved ? 'approved' : 'rejected',
        resolvedAt: Date.now(),
        rejectReason: approved ? undefined : normalizeString(rejectReason) || '用户拒绝执行。',
      };
      this.updateApprovalMessage(resolved);
      this.addRuntimeDiagnostic({
        type: 'approval',
        message: approved
          ? `用户已批准工具 ${request.toolName}。`
          : `用户已拒绝工具 ${request.toolName}。`,
        detail: approved ? undefined : resolved.rejectReason,
        createdAt: Date.now(),
      });
      const resolver = this.deps.approvalResolvers.get(request.id);
      if (resolver) {
        resolver.resolve({
          approved,
          rejectReason: approved ? undefined : resolved.rejectReason,
        });
        this.deps.approvalResolvers.delete(request.id);
      }
    }
    this.deps.state.pendingApprovals = nextPending;
    await this.deps.persistCurrentSession();
  }
}
