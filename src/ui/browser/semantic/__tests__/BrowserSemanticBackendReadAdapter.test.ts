import { describe, expect, it, vi } from 'vitest';
import { BrowserSemanticBackendReadAdapter } from '../BrowserSemanticBackendReadAdapter';
import type { BackendSemanticBrowserReadRequest, BackendSemanticBrowserReadResult } from '../../../../../packages/contracts/src/backend-rpc';

function okRead(overrides: Partial<Extract<BackendSemanticBrowserReadResult, { status: 'ok' }>> = {}): BackendSemanticBrowserReadResult {
  const session = {
    sessionId: 'session-1',
    rootFocusNodeId: 'root',
    currentNodeId: 'current',
    activeLens: 'assimilation' as const,
    narrativePath: [{ nodeId: 'root', lens: 'assimilation' as const, eventId: 'event-root', visitedAt: 1 }],
    startedAt: 1,
    endedAt: null,
  };
  const rootNode = {
    nodeId: 'root',
    nodeType: 'concept' as const,
    title: 'Root',
    preview: 'Root preview',
    location: { blockId: 'root' },
  };
  const currentNode = {
    nodeId: 'current',
    nodeType: 'implicit-knowledge' as const,
    title: 'Current',
    preview: 'Current preview',
    location: { blockId: 'current' },
  };
  return {
    status: 'ok',
    requestId: 'read-1',
    activeSession: session,
    session,
    rootNode,
    currentNode,
    candidates: { assimilation: [], accommodation: [], free: [] },
    stations: [],
    stationNodes: [],
    rootScopedStations: [],
    diagnosticEventId: 'semantic-browser-read:read-1',
    ...overrides,
  };
}

describe('BrowserSemanticBackendReadAdapter', () => {
  it('loads active same-root session through backend read API', async () => {
    const read = vi.fn(async (_request: BackendSemanticBrowserReadRequest) => okRead());
    const adapter = new BrowserSemanticBackendReadAdapter({
      readClient: { read },
      idFactory: () => 'read-active',
    });

    const session = await adapter.findActiveSessionByRoot('root');

    expect(session?.sessionId).toBe('session-1');
    expect(read).toHaveBeenCalledWith(expect.objectContaining({
      method: 'semantic.browser.read',
      callerIntent: 'semantic.browser.active-session.read',
      rootFocusNodeId: 'root',
    }));
  });

  it('builds Browser read model from backend read data and maps unavailable read failures', async () => {
    const read = vi.fn(async (request: BackendSemanticBrowserReadRequest): Promise<BackendSemanticBrowserReadResult> => {
      if (request.sessionId === 'missing-session') {
        return {
          status: 'unavailable',
          unavailableReason: 'session-unavailable',
          message: 'session missing',
          diagnosticEventId: 'semantic-browser-read-failed:missing',
        };
      }
      return okRead();
    });
    const adapter = new BrowserSemanticBackendReadAdapter({
      readClient: { read },
      idFactory: () => 'read-model',
    });

    const ready = await adapter.loadReadModel('session-1');
    const unavailable = await adapter.loadReadModel('missing-session');

    expect(ready.status).toBe('ready');
    if (ready.status === 'ready') {
      expect(ready.session.sessionId).toBe('session-1');
      expect(ready.candidateState).toBe('empty');
    }
    expect(unavailable).toMatchObject({
      status: 'unavailable',
      reason: 'session-unavailable',
    });
  });
});
