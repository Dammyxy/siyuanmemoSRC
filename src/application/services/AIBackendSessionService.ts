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
} from '../../../packages/contracts/src/backend-rpc';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import type { AINetworkProxyPort, AINetworkProxyRequest, AINetworkProxyResponse } from '@/application/ports/AINetworkProxyPort';

interface AIBackendSessionServiceDeps {
  backendClient: Pick<
    SrsBackendClient,
    | 'createAiSession'
    | 'getAiSession'
    | 'updateAiSession'
    | 'cancelAiSession'
    | 'startAiStream'
    | 'cancelAiStream'
    | 'getAiJob'
    | 'cancelAiJob'
    | 'executeAiPrompt'
  >;
  networkProxy?: AINetworkProxyPort | null;
  resolveSecret?: (name: string) => string | null | undefined;
}

function normalizeSecret(value: string | null | undefined): string {
  return String(value || '').trim();
}

export class AIBackendSessionService {
  constructor(private readonly deps: AIBackendSessionServiceDeps) {}

  createSession(request: BackendAiSessionCreateRequest): Promise<BackendAiSessionResult> {
    return this.deps.backendClient.createAiSession(request);
  }

  getSession(request: BackendAiSessionGetRequest): Promise<BackendAiSessionResult> {
    return this.deps.backendClient.getAiSession(request);
  }

  updateSession(request: BackendAiSessionUpdateRequest): Promise<BackendAiSessionResult> {
    return this.deps.backendClient.updateAiSession(request);
  }

  cancelSession(request: BackendAiSessionCancelRequest): Promise<BackendAiSessionResult> {
    return this.deps.backendClient.cancelAiSession(request);
  }

  startStream(request: BackendAiStreamStartRequest): Promise<BackendAiStreamResult> {
    return this.deps.backendClient.startAiStream(request);
  }

  cancelStream(request: BackendAiStreamCancelRequest): Promise<BackendAiStreamResult> {
    return this.deps.backendClient.cancelAiStream(request);
  }

  getJob(request: BackendAiJobGetRequest): Promise<BackendAiJobResult> {
    return this.deps.backendClient.getAiJob(request);
  }

  cancelJob(request: BackendAiJobCancelRequest): Promise<BackendAiJobResult> {
    return this.deps.backendClient.cancelAiJob(request);
  }

  async executePrompt(request: BackendAiPromptExecuteRequest & {
    requiredSecretName?: string;
  }): Promise<BackendAiPromptExecuteResult> {
    const requiredSecretName = String(request.requiredSecretName || '').trim();
    const { requiredSecretName: _requiredSecretName, ...rpcRequest } = request;
    void _requiredSecretName;
    const headers = {
      ...(request.request.headers || {}),
    } as Record<string, string>;
    if (requiredSecretName) {
      const secret = normalizeSecret(this.deps.resolveSecret?.(requiredSecretName));
      if (!secret) {
        throw new Error(`BACKEND_UNAVAILABLE: missing secret ${requiredSecretName}`);
      }
      if (!headers.Authorization) {
        headers.Authorization = `Bearer ${secret}`;
      }
    }
    return this.deps.backendClient.executeAiPrompt({
      ...rpcRequest,
      request: {
        ...rpcRequest.request,
        headers,
      },
    });
  }

  async proxyNetwork(request: AINetworkProxyRequest & {
    requiredSecretName?: string;
  }): Promise<AINetworkProxyResponse> {
    if (!this.deps.networkProxy) {
      throw new Error('BACKEND_UNAVAILABLE: ai network proxy unavailable');
    }
    if (request.requiredSecretName) {
      const secret = normalizeSecret(this.deps.resolveSecret?.(request.requiredSecretName));
      if (!secret) {
        throw new Error(`BACKEND_UNAVAILABLE: missing secret ${request.requiredSecretName}`);
      }
    }
    return this.deps.networkProxy.execute(request);
  }
}
