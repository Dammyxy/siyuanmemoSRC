import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script, createContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type RpcHandler = (params?: unknown) => unknown | Promise<unknown>;

interface KernelHarness {
  handlers: Record<string, RpcHandler>;
  broadcasts: Array<{ method: string; params: unknown }>;
  clientFetch: ReturnType<typeof vi.fn>;
}

const primaryProfile = {
  backendContainer: 'std',
  frontendKind: 'desktop',
  surfaceRole: 'primary-app',
  writerEligibility: 'canonical',
  confidence: 'high',
  reason: 'desktop Electron primary app is canonical writer',
  sanitizedLocationHref: 'http://127.0.0.1:61082/stage/build/app/?v=<redacted>',
};

const documentWindowProfile = {
  backendContainer: 'std',
  frontendKind: 'desktop-window',
  surfaceRole: 'document-window',
  writerEligibility: 'follower-only',
  confidence: 'high',
  reason: 'desktop Electron document window is follower-only',
  sanitizedLocationHref: 'http://127.0.0.1:61082/stage/build/app/window.html?enhance=<redacted>',
};

const browserProfile = {
  backendContainer: 'std',
  frontendKind: 'browser-desktop',
  surfaceRole: 'active-frontend',
  writerEligibility: 'provisional-candidate',
  confidence: 'medium',
  reason: 'browser frontend active-writer policy is provisional until backend-specific evidence exists',
  sanitizedLocationHref: 'http://127.0.0.1:6806/stage/build/desktop/?r=<redacted>',
};

async function loadKernelHarness(): Promise<KernelHarness> {
  const handlers: Record<string, RpcHandler> = {};
  const broadcasts: Array<{ method: string; params: unknown }> = [];
  const clientFetch = vi.fn();
  const siyuan = {
    client: {
      fetch: clientFetch,
    },
    logger: {
      info: vi.fn(async () => undefined),
      warn: vi.fn(async () => undefined),
    },
    plugin: {
      lifecycle: {} as Record<string, () => Promise<void>>,
      name: 'siyuanmemo',
      platform: 'desktop',
      version: 'test',
    },
    rpc: {
      bind: vi.fn(async (name: string, handler: RpcHandler) => {
        handlers[name] = handler;
      }),
      broadcast: vi.fn(async (method: string, params: unknown) => {
        broadcasts.push({ method, params });
      }),
    },
    server: {
      private: {
        es: {},
        http: {},
      },
    },
  };
  const context = createContext({
    Buffer,
    Date,
    Map,
    Math,
    Promise,
    Set,
    String,
    URL,
    clearTimeout,
    console,
    fetch: vi.fn(),
    setTimeout,
    siyuan,
  });
  const source = readFileSync(resolve(process.cwd(), 'src/kernel.ts'), 'utf8');
  new Script(source, { filename: 'src/kernel.ts' }).runInContext(context);
  await siyuan.plugin.lifecycle.onload();
  return { handlers, broadcasts, clientFetch };
}

describe('kernel writer lease profile policy', () => {
  it('lets desktop primary app acquire canonical writer lease and preserves bounded profile fields', async () => {
    const { handlers } = await loadKernelHarness();

    await expect(handlers['writer.acquireLease']({
      instanceId: 'primary-app',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/?v=secret',
      visibilityState: 'visible',
      writerProfile: primaryProfile,
    })).resolves.toMatchObject({
      ok: true,
      lease: {
        instanceId: 'primary-app',
        writerProfile: {
          surfaceRole: 'primary-app',
          writerEligibility: 'canonical',
          sanitizedLocationHref: 'http://127.0.0.1:61082/stage/build/app/?v=<redacted>',
        },
      },
    });
  });

  it('lets hidden desktop primary app recover an empty writer lease', async () => {
    const { handlers } = await loadKernelHarness();

    await expect(handlers['writer.acquireLease']({
      instanceId: 'primary-app',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/?v=secret',
      visibilityState: 'hidden',
      documentHasFocus: false,
      writerProfile: primaryProfile,
    })).resolves.toMatchObject({
      ok: true,
      lease: {
        instanceId: 'primary-app',
        visibilityState: 'hidden',
        documentHasFocus: false,
        writerProfile: {
          surfaceRole: 'primary-app',
          writerEligibility: 'canonical',
        },
      },
    });
  });

  it('relays queue projection identity broadcasts without rows or DB ownership', async () => {
    const { handlers, broadcasts } = await loadKernelHarness();

    await expect(handlers['queueProjection.publishIdentityChanged']({
      queueId: 'filter-group',
      queueType: 'filter-group',
      policyId: 'policy-a',
      generation: 3,
      reason: 'refreshed',
      source: 'runtime',
      sourceInstanceId: 'writer-a',
      sourceSurfaceId: 'surface-a',
      sourceMode: 'writer',
      timestamp: 10,
      diagnosticEventId: 'event-a',
    })).resolves.toMatchObject({
      ok: true,
      broadcast: {
        queueType: 'filter-group',
        policyId: 'policy-a',
        generation: 3,
        sourceInstanceId: 'writer-a',
      },
    });
    expect(broadcasts).toEqual([
      {
        method: 'memo.queueProjection.identityChanged',
        params: expect.objectContaining({
          queueId: 'filter-group',
          queueType: 'filter-group',
          policyId: 'policy-a',
          generation: 3,
          sourceInstanceId: 'writer-a',
        }),
      },
    ]);
    expect(JSON.stringify(broadcasts)).not.toContain('rows');
  });

  it('fails closed when a desktop document window tries to acquire with no primary writer observed', async () => {
    const { handlers } = await loadKernelHarness();

    await expect(handlers['writer.acquireLease']({
      instanceId: 'doc-window',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/window.html?enhance=true',
      visibilityState: 'visible',
      writerProfile: documentWindowProfile,
    })).resolves.toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'writer unavailable: current runtime profile is follower-only',
      },
      lease: null,
      ok: false,
    });
  });

  it('fails closed when a hidden desktop document window tries to acquire an empty writer lease', async () => {
    const { handlers } = await loadKernelHarness();

    await expect(handlers['writer.acquireLease']({
      instanceId: 'doc-window',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/window.html?enhance=true',
      visibilityState: 'hidden',
      documentHasFocus: false,
      writerProfile: documentWindowProfile,
    })).resolves.toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'writer unavailable: current runtime profile is follower-only',
      },
      lease: null,
      ok: false,
    });
  });

  it('keeps document windows from reclaiming a primary-app owner', async () => {
    const { handlers } = await loadKernelHarness();
    await handlers['writer.acquireLease']({
      instanceId: 'primary-app',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/',
      visibilityState: 'visible',
      writerProfile: primaryProfile,
    });

    await expect(handlers['writer.acquireLease']({
      instanceId: 'doc-window',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/window.html',
      visibilityState: 'visible',
      writerProfile: documentWindowProfile,
    })).resolves.toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'writer lease held by another instance: primary-app',
      },
      lease: {
        instanceId: 'primary-app',
        writerProfile: {
          surfaceRole: 'primary-app',
        },
      },
      ok: false,
    });
  });

  it('rejects ordinary std desktop browser frontend as writer', async () => {
    const { handlers } = await loadKernelHarness();
    await expect(handlers['writer.acquireLease']({
      instanceId: 'browser-front',
      locationHref: 'http://127.0.0.1:6806/stage/build/desktop/?r=secret',
      visibilityState: 'visible',
      writerProfile: browserProfile,
    })).resolves.toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'writer unavailable: current runtime profile is provisional-candidate',
      },
      lease: null,
      ok: false,
    });
  });

  it('keeps the kernel companion out of SiYuanMemo database ownership', async () => {
    const { handlers } = await loadKernelHarness();

    await expect(handlers.capabilities()).resolves.toMatchObject({
      writesSiyuanMemoDb: false,
      riffReadAuditProxy: true,
      methods: expect.arrayContaining(['riff.read', 'riff.audit']),
      writerLease: {
        payloadFields: expect.arrayContaining(['leaseEpoch', 'ownerChangedAt']),
      },
    });
  });

  it('reads native Riff cards through the kernel API without returning block content', async () => {
    const { handlers, clientFetch } = await loadKernelHarness();
    clientFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        code: 0,
        data: {
          total: 1,
          pageCount: 1,
          blocks: [
            {
              id: '20260525120000-cardaaa',
              type: 'l',
              content: 'secret question text',
              path: '/secret/path',
              hPath: '/secret/hpath',
              riffCardID: 'riff-card-a',
              riffCard: {
                id: 'riff-card-a',
                blockID: '20260525120000-cardaaa',
                deckID: '20210808180117-czj9bvb',
                state: 2,
                due: '2026-05-25',
                reps: 3,
                lapses: 1,
              },
            },
          ],
        },
      })),
    });

    await expect(handlers['riff.read']({
      requestId: 'riff-read-test',
      deckId: '20210808180117-czj9bvb',
      pageSize: 1,
      maxPages: 1,
    })).resolves.toMatchObject({
      requestId: 'riff-read-test',
      deckId: '20210808180117-czj9bvb',
      status: 'ready',
      total: 1,
      pageCount: 1,
      blocks: [
        {
          id: '20260525120000-cardaaa',
          type: 'l',
          riffCardID: 'riff-card-a',
          riffCard: {
            id: 'riff-card-a',
            blockID: '20260525120000-cardaaa',
            deckID: '20210808180117-czj9bvb',
          },
        },
      ],
      diagnostics: {
        returned: 1,
        contentReturned: false,
      },
    });
    expect(clientFetch).toHaveBeenCalledWith('/api/riff/getRiffCards', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        id: '20210808180117-czj9bvb',
        page: 1,
        pageSize: 1,
      }),
    }));
    const result = await handlers['riff.read']({
      requestId: 'riff-read-test-2',
      deckId: '20210808180117-czj9bvb',
      pageSize: 1,
      maxPages: 1,
    });
    expect(JSON.stringify(result)).not.toContain('secret question text');
    expect(JSON.stringify(result)).not.toContain('/secret/path');
  });

  it('audits native Riff cards with normalized and malformed counts', async () => {
    const { handlers, clientFetch } = await loadKernelHarness();
    clientFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        code: 0,
        data: {
          total: 2,
          pageCount: 1,
          blocks: [
            {
              id: '20260525120000-cardaaa',
              riffCardID: 'riff-card-a',
            },
            {
              id: '20260525120000-cardbbb',
              content: 'malformed card content',
            },
          ],
        },
      })),
    });

    await expect(handlers['riff.audit']({
      requestId: 'riff-audit-test',
      deckId: '20210808180117-czj9bvb',
      pageSize: 2,
      maxPages: 1,
    })).resolves.toMatchObject({
      requestId: 'riff-audit-test',
      deckId: '20210808180117-czj9bvb',
      status: 'ready',
      total: 2,
      normalized: 2,
      malformed: 1,
      diagnostics: {
        returned: 2,
        contentReturned: false,
      },
    });
  });
});
