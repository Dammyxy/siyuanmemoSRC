import type { AIChatApprovalRequest, AIChatToolDescriptor } from '@/types/ai';

function createApprovalId(): string {
  return `approval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class AIChatApprovalService {
  createRequest(input: {
    toolCallId: string;
    descriptor: AIChatToolDescriptor;
    args: Record<string, unknown>;
  }): AIChatApprovalRequest {
    return {
      id: createApprovalId(),
      toolCallId: input.toolCallId,
      toolName: input.descriptor.name,
      group: input.descriptor.group,
      title: input.descriptor.title,
      description: input.descriptor.description,
      args: { ...input.args },
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
