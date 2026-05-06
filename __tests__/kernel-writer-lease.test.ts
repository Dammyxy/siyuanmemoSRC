import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Script, createContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

async function loadKernelRpc() {
  const rpcHandlers = new Map<string, (params?: unknown) => unknown | Promise<unknown>>();
  const context = createContext({
    Date,
    Math,
    String,
    Number,
    Array,
    Map,
    Error,
    Promise,
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
    },
  });
  const source = readFileSync(join(process.cwd(), 'kernel.js'), 'utf8');
  new Script(source, { filename: 'kernel.js' }).runInContext(context);
  const lifecycle = (context.siyuan as {
    plugin: { lifecycle: { onload?: () => Promise<void> } };
  }).plugin.lifecycle;
  await lifecycle.onload?.();
  return {
    call: async (method: string, params?: unknown) => {
      const handler = rpcHandlers.get(method);
      if (!handler) {
        throw new Error(`missing rpc handler: ${method}`);
      }
      return handler(params);
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

  it('lets focused normal app window reclaim an unfocused normal visible owner', async () => {
    const kernel = await loadKernelRpc();

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
        documentHasFocus: false,
      }),
    });

    await expect(kernel.call('writer.acquireLease', {
      instanceId: 'focused-main-instance',
      surfaceId: 'focused-main-scope',
      ttlMs: 60_000,
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
    })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({
        instanceId: 'focused-main-instance',
        surfaceId: 'focused-main-scope',
        documentHasFocus: true,
      }),
    });
  });

  it('keeps unfocused normal visible owner protected from another unfocused normal visible requester', async () => {
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
      locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
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
});
