import type {
  BackendSemanticBrowserReadRequest,
  BackendSemanticBrowserReadResult,
} from '../../../packages/contracts/src/backend-rpc';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';

interface SemanticActivationBrowserReadClientDeps {
  backendClient: Pick<SrsBackendClient, 'semanticBrowserRead'>;
}

export class SemanticActivationBrowserReadClient {
  constructor(private readonly deps: SemanticActivationBrowserReadClientDeps) {}

  async read(request: BackendSemanticBrowserReadRequest): Promise<BackendSemanticBrowserReadResult> {
    if (!request || request.method !== 'semantic.browser.read') {
      return {
        status: 'unavailable',
        unavailableReason: 'invalid-request',
        message: 'semantic.browser.read requires request',
        diagnosticEventId: `semantic-browser-read-unavailable:${Date.now()}`,
      };
    }
    return this.deps.backendClient.semanticBrowserRead(request);
  }
}
