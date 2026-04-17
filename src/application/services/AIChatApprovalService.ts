import type { AIChatApprovalRequest, AIChatToolDescriptor } from '@/types/ai';

function createApprovalId(): string {
  return `approval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AIChatApprovalResolution {
  approved: boolean;
  rejectReason?: string;
}

export class AIChatApprovalService {
  createRequest(input: {
    type: AIChatApprovalRequest['type'];
    toolCallId: string;
    descriptor: AIChatToolDescriptor;
    args: Record<string, unknown>;
    argsText?: string;
    resultText?: string;
    resultStatus?: AIChatApprovalRequest['resultStatus'];
    argsVarRef?: string;
    resultVarRef?: string;
    runGroupId?: string | null;
    skillId?: AIChatApprovalRequest['skillId'];
    tabId?: AIChatApprovalRequest['tabId'];
  }): AIChatApprovalRequest {
    return {
      id: createApprovalId(),
      type: input.type,
      toolCallId: input.toolCallId,
      toolName: input.descriptor.name,
      group: input.descriptor.group,
      title: input.descriptor.title,
      description: input.descriptor.description,
      args: { ...input.args },
      argsText: input.argsText,
      resultText: input.resultText,
      resultStatus: input.resultStatus,
      argsVarRef: input.argsVarRef,
      resultVarRef: input.resultVarRef,
      runGroupId: input.runGroupId || null,
      skillId: input.skillId || null,
      tabId: input.tabId || null,
      status: 'pending',
      createdAt: Date.now(),
    };
  }

  approve(request: AIChatApprovalRequest): AIChatApprovalRequest {
    return {
      ...request,
      status: 'approved',
      resolvedAt: Date.now(),
      rejectReason: undefined,
    };
  }

  reject(request: AIChatApprovalRequest, reason = ''): AIChatApprovalRequest {
    return {
      ...request,
      status: 'rejected',
      resolvedAt: Date.now(),
      rejectReason: String(reason || '').trim() || undefined,
    };
  }
}
