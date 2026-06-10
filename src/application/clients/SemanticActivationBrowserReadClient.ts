import type {
  BackendSemanticBrowserReadRequest,
  BackendSemanticBrowserReadResult,
  BackendSemanticSidebarReadRequest,
  BackendSemanticSidebarReadResult,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendSemanticClientFacet } from '@/application/clients/backend';

export type SemanticActivationReadBackendClient = Pick<
  BackendSemanticClientFacet,
  'semanticBrowserRead' | 'semanticSidebarRead'
>;

interface SemanticActivationBrowserReadClientDeps {
  backendClient: SemanticActivationReadBackendClient;
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

  async readSidebar(request: BackendSemanticSidebarReadRequest): Promise<BackendSemanticSidebarReadResult> {
    if (!request || request.method !== 'semantic.sidebar.read') {
      return {
        status: 'unavailable',
        unavailableReason: 'invalid-request',
        message: 'semantic.sidebar.read requires request',
        diagnosticEventId: `semantic-sidebar-read-unavailable:${Date.now()}`,
      };
    }
    return this.deps.backendClient.semanticSidebarRead(request);
  }
}
