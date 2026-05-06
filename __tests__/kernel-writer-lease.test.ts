import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Script, createContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function loadKernelRpc(options: {
  nowMs?: () => number;
  clientFetch?: (path: string, init: unknown) => Promise<{
    status: number;
    headers?: Record<string, string>;
    text: () => Promise<string>;
  }>;
} = {}) {
  const rpcHandlers = new Map<string, (params?: unknown) => unknown | Promise<unknown>>();
  const clientFetchCalls: Array<{ path: string; init: unknown }> = [];
  const RuntimeDate = options.nowMs ? { now: options.nowMs } : Date;
  const context = createContext({
    Buffer,
    Date: RuntimeDate,
    Math,
    String,
    Number,
    Array,
    Map,
    Error,
    Promise,
    setTimeout,
    clearTimeout,
    console,
    siyuan: {
      plugin: {
        name: 'siyuan-plugin-siyuanmemo',
        version: 'test',
        platform: 'test',
        lifecycle: {},
      },
      rpc: {
        bind: async (method: string, handler: (params?: unknown) => unknown | Promise<unknown>) => {
          rpcHandlers.set(method, handler);
        },
        broadcast: async () => undefined,
      },
      logger: {
        info: async () => undefined,
        warn: async () => undefined,
      },
      client: {
        fetch: async (path: string, init: unknown) => {
          clientFetchCalls.push({ path, init });
          if (options.clientFetch) {
            return options.clientFetch(path, init);
          }
          return {
            status: 200,
            headers: { 'content-type': 'application/json' },
            text: async () => '{"ok":true}',
          };
        },
      },
      server: {
        private: {
          http: {},
        },
      },
    },
  });
  const source = readFileSync(join(process.cwd(), 'kernel.js'), 'utf8');
  new Script(source, { filename: 'kernel.js' }).runInContext(context);
  const lifecycle = (context.siyuan as {
    plugin: { lifecycle: { onload?: () => Promise<void> } };
  }).plugin.lifecycle;
  await lifecycle.onload?.();
  return {
    clientFetchCalls,
    call: async (method: string, params?: unknown) => {
      const handler = rpcHandlers.get(method);
      if (!handler) {
        throw new Error(`missing rpc handler: ${method}`);
      }
      return handler(params);
    },
    privateHttp: async (request: unknown) => {
      const handler = (context.siyuan as {
        server?: { private?: { http?: { handler?: (request: unknown) => Promise<unknown> } } };
      }).server?.private?.http?.handler;
      if (!handler) {
        throw new Error('missing private http handler');
      }
      return handler(request);
    },
  };
}

describe('kernel writer lease foreground policy', () => {
  it('rejects hidden requester when no writer lease exists', async () => {
    const kernel = await loadKernelRpc();

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'hidden-instance',
      surfaceId: 'hidden-scope',
      ttlMs: 60_000,
      visibilityState: 'hidden',
      documentHasFocus: false,
      locationHref: 'app://hidden',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
      lease: null,
    });
  });

  it('lets visible requester reclaim a lease that lacks foreground diagnostics', async () => {
    const kernel = await loadKernelRpc();

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'legacy-instance',
      surfaceId: 'legacy-scope',
      ttlMs: 60_000,
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'legacy-instance',
      }),
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'visible-instance',
      surfaceId: 'visible-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'app://visible',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'visible-instance',
        surfaceId: 'visible-scope',
        visibilityState: 'visible',
        documentHasFocus: true,
        locationHref: 'app://visible',
      }),
    });
  });

  it('keeps visible owner protected from hidden requester', async () => {
    const kernel = await loadKernelRpc();

    await kernel.call('writer.acquireLease', {
      instanceId: 'visible-instance',
      surfaceId: 'visible-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'app://visible',
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'hidden-instance',
      surfaceId: 'hidden-scope',
      ttlMs: 60_000,
      visibilityState: 'hidden',
      documentHasFocus: false,
      locationHref: 'app://hidden',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
      lease: expect.objectContaining({
        instanceId: 'visible-instance',
      }),
    });
  });

  it('lets normal app window reclaim an auxiliary visible owner that lacks document focus', async () => {
    const kernel = await loadKernelRpc();

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'quicknote-instance',
      surfaceId: 'quicknote-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?enhance=true&enWindowTitle=QuickNote&',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'quicknote-instance',
        documentHasFocus: false,
      }),
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'main-instance',
      surfaceId: 'main-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'main-instance',
        surfaceId: 'main-scope',
        visibilityState: 'visible',
        documentHasFocus: true,
      }),
    });
  });

  it('lets primary app surface reclaim a document-window owner immediately', async () => {
    const kernel = await loadKernelRpc();

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'document-window-instance',
      surfaceId: 'document-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#old',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'document-window-instance',
        documentHasFocus: false,
      }),
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'primary-app-instance',
      surfaceId: 'primary-app-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
    })).resolves.toMatchObject({
      lease: expect.objectContaining({
        instanceId: 'primary-app-instance',
        surfaceId: 'primary-app-scope',
        documentHasFocus: true,
      }),
    });
  });

  it('keeps primary app owner protected from document-window requester after grace', async () => {
    let now = 1_000;
    const kernel = await loadKernelRpc({ nowMs: () => now });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'primary-app-instance',
      surfaceId: 'primary-app-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'primary-app-instance',
        ownerChangedAt: 1_000,
      }),
    });

    now = 31_001;

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'document-window-instance',
      surfaceId: 'document-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#doc',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
      lease: expect.objectContaining({
        instanceId: 'primary-app-instance',
        surfaceId: 'primary-app-scope',
      }),
    });
  });

  it('lets focused document-window requester reclaim stale unfocused document-window owner after grace', async () => {
    let now = 1_000;
    const kernel = await loadKernelRpc({ nowMs: () => now });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'old-window-instance',
      surfaceId: 'old-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#old',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'old-window-instance',
        ownerChangedAt: 1_000,
      }),
    });

    now = 31_001;

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'focused-window-instance',
      surfaceId: 'focused-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#new',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'focused-window-instance',
        surfaceId: 'focused-window-scope',
        visibilityState: 'visible',
        documentHasFocus: true,
      }),
    });
  });

  it('keeps fresh hidden document-window owner protected from focused document-window requester', async () => {
    const kernel = await loadKernelRpc();

    await kernel.call('writer.acquireLease', {
      instanceId: 'first-window-instance',
      surfaceId: 'first-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#first',
    });

    await expect(kernel.call('writer.renewLease', {
      instanceId: 'first-window-instance',
      surfaceId: 'first-window-scope',
      ttlMs: 60_000,
      visibilityState: 'hidden',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#first',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'first-window-instance',
        visibilityState: 'hidden',
      }),
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'second-window-instance',
      surfaceId: 'second-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#second',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
      lease: expect.objectContaining({
        instanceId: 'first-window-instance',
        surfaceId: 'first-window-scope',
        visibilityState: 'hidden',
      }),
    });
  });

  it('lets focused normal visible requester reclaim stale hidden normal app owner after grace', async () => {
    let now = 1_000;
    const kernel = await loadKernelRpc({ nowMs: () => now });

    await kernel.call('writer.acquireLease', {
      instanceId: 'first-window-instance',
      surfaceId: 'first-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#first',
    });

    await expect(kernel.call('writer.renewLease', {
      instanceId: 'first-window-instance',
      surfaceId: 'first-window-scope',
      ttlMs: 60_000,
      visibilityState: 'hidden',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#first',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'first-window-instance',
        visibilityState: 'hidden',
        ownerChangedAt: 1_000,
      }),
    });

    now = 31_001;

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'second-window-instance',
      surfaceId: 'second-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'second-window-instance',
        surfaceId: 'second-window-scope',
        visibilityState: 'visible',
        documentHasFocus: true,
      }),
    });
  });

  it('lets a visible normal app window acquire after the writer releases its lease', async () => {
    const kernel = await loadKernelRpc();

    await kernel.call('writer.acquireLease', {
      instanceId: 'first-window-instance',
      surfaceId: 'first-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#first',
    });

    await expect(kernel.call('writer.releaseLease', {
      instanceId: 'first-window-instance',
    })).resolves.toMatchObject({
      ok: true,
      lease: null,
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'second-window-instance',
      surfaceId: 'second-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'second-window-instance',
        surfaceId: 'second-window-scope',
      }),
    });
  });

  it('lets a visible normal app window acquire after the writer lease expires', async () => {
    let now = 1_000;
    const kernel = await loadKernelRpc({ nowMs: () => now });

    await kernel.call('writer.acquireLease', {
      instanceId: 'first-window-instance',
      surfaceId: 'first-window-scope',
      ttlMs: 3_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#first',
    });

    now = 4_001;

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'second-window-instance',
      surfaceId: 'second-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'second-window-instance',
        surfaceId: 'second-window-scope',
      }),
    });
  });

  it('increments leaseEpoch only when owner changes', async () => {
    const kernel = await loadKernelRpc();

    const first = await kernel.call('writer.acquireLease', {
      instanceId: 'first-window-instance',
      surfaceId: 'first-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#first',
    }) as { lease: { leaseEpoch?: number; ownerChangedAt?: number } };
    expect(first.lease).toMatchObject({
      leaseEpoch: 1,
      ownerChangedAt: expect.any(Number),
    });

    const renewed = await kernel.call('writer.renewLease', {
      instanceId: 'first-window-instance',
      surfaceId: 'first-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#first',
    }) as { lease: { leaseEpoch?: number; ownerChangedAt?: number } };
    expect(renewed.lease.leaseEpoch).toBe(1);
    expect(renewed.lease.ownerChangedAt).toBe(first.lease.ownerChangedAt);

    await kernel.call('writer.releaseLease', {
      instanceId: 'first-window-instance',
    });

    const second = await kernel.call('writer.acquireLease', {
      instanceId: 'second-window-instance',
      surfaceId: 'second-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
    }) as { lease: { leaseEpoch?: number; ownerChangedAt?: number } };
    expect(second.lease.leaseEpoch).toBe(2);
    expect(second.lease.ownerChangedAt).toEqual(expect.any(Number));
  });

  it('keeps unfocused document-window owner protected from another fresh document-window requester', async () => {
    const kernel = await loadKernelRpc();

    await kernel.call('writer.acquireLease', {
      instanceId: 'first-window-instance',
      surfaceId: 'first-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#first',
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'second-window-instance',
      surfaceId: 'second-window-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#second',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
      lease: expect.objectContaining({
        instanceId: 'first-window-instance',
        surfaceId: 'first-window-scope',
        documentHasFocus: false,
      }),
    });
  });

  it('keeps normal visible owner protected from a focused auxiliary visible requester', async () => {
    const kernel = await loadKernelRpc();

    await kernel.call('writer.acquireLease', {
      instanceId: 'main-instance',
      surfaceId: 'main-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html',
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'quicknote-instance',
      surfaceId: 'quicknote-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?enhance=true&enWindowTitle=QuickNote&',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
      lease: expect.objectContaining({
        instanceId: 'main-instance',
        surfaceId: 'main-scope',
      }),
    });
  });

  it('keeps focused visible owner protected from an unfocused visible requester', async () => {
    const kernel = await loadKernelRpc();

    await kernel.call('writer.acquireLease', {
      instanceId: 'main-instance',
      surfaceId: 'main-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html',
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'quicknote-instance',
      surfaceId: 'quicknote-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: false,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?enhance=true&enWindowTitle=QuickNote&',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
      lease: expect.objectContaining({
        instanceId: 'main-instance',
        documentHasFocus: true,
      }),
    });
  });

  it('fetches external network requests through the SiYuan kernel network proxy', async () => {
    const kernel = await loadKernelRpc();
    const url = 'https://provider.test/v1/chat/completions?model=a b';
    const headers = {
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
    };

    await expect(kernel.call('network.fetchExternal', {
      requestId: 'network-1',
      url,
      method: 'POST',
      headers,
      body: '{"hello":"world"}',
      timeoutMs: 5_000,
    })).resolves.toEqual({
      requestId: 'network-1',
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    });

    expect(kernel.clientFetchCalls).toHaveLength(1);
    expect(kernel.clientFetchCalls[0]).toEqual({
      path: `/api/network/proxy?u=${base64Url(url)}&h=${base64Url(JSON.stringify({
        Authorization: ['Bearer secret'],
        'Content-Type': ['application/json'],
      }))}`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"hello":"world"}',
      },
    });
  });

  it('serves private HTTP status and relays command requests through the active writer', async () => {
    const kernel = await loadKernelRpc();

    const status = await kernel.privateHttp({
      context: { path: '/status' },
      request: { method: 'GET' },
    });
    expect(status).toMatchObject({
      statusCode: 200,
      body: {
        data: {
          data: {
            ok: true,
            runtime: 'siyuanmemo-kernel-private-http',
          },
        },
      },
    });

    await kernel.call('writer.acquireLease', {
      instanceId: 'writer-instance',
      surfaceId: 'main-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/',
    });

    const commandResponsePromise = kernel.privateHttp({
      context: { path: '/command' },
      request: {
        method: 'POST',
        body: {
          data: {
            text: async () => JSON.stringify({
              requestId: 'private-http-command-1',
              idempotencyKey: 'private-http-key',
              operation: 'browser.sourceExistence.applySweepHost',
              request: { blockIds: ['block-1'] },
              checkedAt: 123,
            }),
          },
        },
      },
    });

    let pendingCommand: { command?: { commandId: string; method: string; params?: unknown } | null } = {};
    for (let attempt = 0; attempt < 20; attempt += 1) {
      pendingCommand = await kernel.call('writer.takeCommand', { instanceId: 'writer-instance' }) as {
        command?: { commandId: string; method: string; params?: unknown } | null;
      };
      if (pendingCommand.command) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(pendingCommand.command).toMatchObject({
      commandId: 'private-http-command-1',
      method: 'private.command.execute',
    });
    expect(pendingCommand.command?.params).toMatchObject({
      method: 'private.command.execute',
      idempotencyKey: 'private-http-key',
      params: {
        operation: 'browser.sourceExistence.applySweepHost',
        request: { blockIds: ['block-1'] },
        checkedAt: 123,
      },
    });

    await kernel.call('writer.completeCommand', {
      instanceId: 'writer-instance',
      commandId: 'private-http-command-1',
      result: {
        ok: true,
        commandId: 'private-http-command-1',
        changed: { blockIds: ['block-1'] },
        result: { committed: true },
      },
    });

    await expect(commandResponsePromise).resolves.toMatchObject({
      statusCode: 200,
      body: {
        data: {
          data: {
            ok: true,
            commandId: 'private-http-command-1',
            result: {
              committed: true,
            },
          },
        },
      },
    });
  });
});
