import type {
  BackendAiJobCancelRequest,
  BackendAiJobGetRequest,
  BackendAiJobResult,
  BackendAiPromptExecuteRequest,
  BackendAiPromptExecuteResult,
  BackendAiSessionCancelRequest,
  BackendAiSessionCreateRequest,
  BackendAiSessionGetRequest,
  BackendAiSessionResult,
  BackendAiSessionUpdateRequest,
  BackendAiStreamCancelRequest,
  BackendAiStreamResult,
  BackendAiStreamStartRequest,
  BackendAiToolJobApprovalRequest,
  BackendAiToolJobExecuteRequest,
  BackendAiToolJobResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendAiJobClientFacet {
  createAiSession(request: BackendAiSessionCreateRequest): Promise<BackendAiSessionResult>;
  getAiSession(request: BackendAiSessionGetRequest): Promise<BackendAiSessionResult>;
  updateAiSession(request: BackendAiSessionUpdateRequest): Promise<BackendAiSessionResult>;
  cancelAiSession(request: BackendAiSessionCancelRequest): Promise<BackendAiSessionResult>;
  executeAiPrompt(request: BackendAiPromptExecuteRequest): Promise<BackendAiPromptExecuteResult>;
  executeAiToolJob(request: BackendAiToolJobExecuteRequest): Promise<BackendAiToolJobResult>;
  submitAiToolJobApproval(request: BackendAiToolJobApprovalRequest): Promise<BackendAiToolJobResult>;
  startAiStream(request: BackendAiStreamStartRequest): Promise<BackendAiStreamResult>;
  cancelAiStream(request: BackendAiStreamCancelRequest): Promise<BackendAiStreamResult>;
  getAiJob(request: BackendAiJobGetRequest): Promise<BackendAiJobResult>;
  cancelAiJob(request: BackendAiJobCancelRequest): Promise<BackendAiJobResult>;
}

export class BackendAiJobRpcClient implements BackendAiJobClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  createAiSession(request: BackendAiSessionCreateRequest): Promise<BackendAiSessionResult> {
    return this.rpcCaller.call<BackendAiSessionResult>('ai.session.create', request);
  }

  getAiSession(request: BackendAiSessionGetRequest): Promise<BackendAiSessionResult> {
    return this.rpcCaller.call<BackendAiSessionResult>('ai.session.get', request);
  }

  updateAiSession(request: BackendAiSessionUpdateRequest): Promise<BackendAiSessionResult> {
    return this.rpcCaller.call<BackendAiSessionResult>('ai.session.update', request);
  }

  cancelAiSession(request: BackendAiSessionCancelRequest): Promise<BackendAiSessionResult> {
    return this.rpcCaller.call<BackendAiSessionResult>('ai.session.cancel', request);
  }

  executeAiPrompt(request: BackendAiPromptExecuteRequest): Promise<BackendAiPromptExecuteResult> {
    return this.rpcCaller.call<BackendAiPromptExecuteResult>('ai.prompt.execute', request);
  }

  executeAiToolJob(request: BackendAiToolJobExecuteRequest): Promise<BackendAiToolJobResult> {
    return this.rpcCaller.call<BackendAiToolJobResult>('ai.tool.job.execute', request);
  }

  submitAiToolJobApproval(request: BackendAiToolJobApprovalRequest): Promise<BackendAiToolJobResult> {
    return this.rpcCaller.call<BackendAiToolJobResult>('ai.tool.job.approval', request);
  }

  startAiStream(request: BackendAiStreamStartRequest): Promise<BackendAiStreamResult> {
    return this.rpcCaller.call<BackendAiStreamResult>('ai.stream.start', request);
  }

  cancelAiStream(request: BackendAiStreamCancelRequest): Promise<BackendAiStreamResult> {
    return this.rpcCaller.call<BackendAiStreamResult>('ai.stream.cancel', request);
  }

  getAiJob(request: BackendAiJobGetRequest): Promise<BackendAiJobResult> {
    return this.rpcCaller.call<BackendAiJobResult>('job.get', request);
  }

  cancelAiJob(request: BackendAiJobCancelRequest): Promise<BackendAiJobResult> {
    return this.rpcCaller.call<BackendAiJobResult>('job.cancel', request);
  }
}
