import { describe, expect, it, vi } from 'vitest';
import { SemanticActivationBrowserReadClient } from '../SemanticActivationBrowserReadClient';

describe('SemanticActivationBrowserReadClient', () => {
  it('routes semantic sidebar reads through the backend client', async () => {
    const semanticSidebarRead = vi.fn(async (request) => ({
      status: 'ok',
      requestId: request.requestId,
      model: {
        bindingState: { type: 'follow-current', rootFocusNodeId: 'block-1' },
        session: null,
        currentNode: null,
        activePath: [],
        activePathNodes: [],
        branches: [],
        candidates: { assimilation: [], accommodation: [], free: [] },
        edgeExplanations: [],
        later: [],
        suggestions: [],
        nodes: [],
      },
      diagnosticEventId: 'diag-sidebar',
    }));
    const client = new SemanticActivationBrowserReadClient({
      backendClient: {
        semanticBrowserRead: vi.fn(),
        semanticSidebarRead,
      } as never,
    });

    const result = await client.readSidebar({
      requestId: 'sidebar-1',
      method: 'semantic.sidebar.read',
      callerIntent: 'test-sidebar',
      currentNodeId: 'block-1',
      bindingMode: 'follow-current',
    });

    expect(result.status).toBe('ok');
    expect(semanticSidebarRead).toHaveBeenCalledWith(expect.objectContaining({
      method: 'semantic.sidebar.read',
      currentNodeId: 'block-1',
    }));
  });

  it('returns explicit unavailable for invalid sidebar read requests', async () => {
    const client = new SemanticActivationBrowserReadClient({
      backendClient: {
        semanticBrowserRead: vi.fn(),
        semanticSidebarRead: vi.fn(),
      } as never,
    });

    const result = await client.readSidebar({ method: 'semantic.browser.read' } as never);

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'invalid-request',
      message: 'semantic.sidebar.read requires request',
    });
  });
});
