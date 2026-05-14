import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script, createContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type RpcHandler = (params?: unknown) => unknown | Promise<unknown>;

interface KernelHarness {
  handlers: Record<string, RpcHandler>;
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
  const siyuan = {
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
      broadcast: vi.fn(async () => undefined),
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
  return { handlers };
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

  it('allows primary app to reclaim from a provisional active browser frontend', async () => {
    const { handlers } = await loadKernelHarness();
    await expect(handlers['writer.acquireLease']({
      instanceId: 'browser-front',
      locationHref: 'http://127.0.0.1:6806/stage/build/desktop/?r=secret',
      visibilityState: 'visible',
      writerProfile: browserProfile,
    })).resolves.toMatchObject({
      ok: true,
      lease: {
        instanceId: 'browser-front',
        writerProfile: {
          surfaceRole: 'active-frontend',
          writerEligibility: 'provisional-candidate',
        },
      },
    });

    await expect(handlers['writer.acquireLease']({
      instanceId: 'primary-app',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/',
      visibilityState: 'visible',
      writerProfile: primaryProfile,
    })).resolves.toMatchObject({
      ok: true,
      lease: {
        instanceId: 'primary-app',
        writerProfile: {
          surfaceRole: 'primary-app',
          writerEligibility: 'canonical',
        },
      },
    });
  });

  it('keeps the kernel companion out of SiYuanMemo database ownership', async () => {
    const { handlers } = await loadKernelHarness();

    await expect(handlers.capabilities()).resolves.toMatchObject({
      writesSiyuanMemoDb: false,
      writerLease: {
        payloadFields: expect.arrayContaining(['leaseEpoch', 'ownerChangedAt']),
      },
    });
  });
});
