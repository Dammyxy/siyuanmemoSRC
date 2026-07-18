import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script, createContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type RpcHandler = (params?: unknown) => unknown | Promise<unknown>;

interface KernelHarness {
  handlers: Record<string, RpcHandler>;
  broadcasts: Array<{ method: string; params: unknown }>;
  clientFetch: ReturnType<typeof vi.fn>;
  registeredMcpTools: Array<{
    name: string;
    config: {
      inputSchema?: {
        required?: string[];
        properties?: Record<string, { type?: string; enum?: string[] }>;
      };
    };
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }>;
  unregisteredMcpTools: string[];
  unload: () => Promise<void>;
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

async function loadKernelHarness(options: { mcp?: boolean } = {}): Promise<KernelHarness> {
  const handlers: Record<string, RpcHandler> = {};
  const broadcasts: Array<{ method: string; params: unknown }> = [];
  const clientFetch = vi.fn();
  const registeredMcpTools: KernelHarness['registeredMcpTools'] = [];
  const unregisteredMcpTools: string[] = [];
  const siyuan = {
    client: {
      fetch: clientFetch,
    },
    mcp: {
      registerTool: vi.fn(async (name: string, config: unknown, handler: KernelHarness['registeredMcpTools'][number]['handler']) => {
        registeredMcpTools.push({
          name,
          config: config as KernelHarness['registeredMcpTools'][number]['config'],
          handler,
        });
        return { name: `plugin__siyuanmemo__${name}` };
      }),
      unregisterTool: vi.fn(async (name: string) => {
        unregisteredMcpTools.push(name);
      }),
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
  if (options.mcp === false) {
    delete (siyuan as { mcp?: unknown }).mcp;
  }
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
  return {
    handlers,
    broadcasts,
    clientFetch,
    registeredMcpTools,
    unregisteredMcpTools,
    unload: siyuan.plugin.lifecycle.onunload,
  };
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
      agentMcp: {
        available: true,
      },
      writerLease: {
        payloadFields: expect.arrayContaining(['leaseEpoch', 'ownerChangedAt']),
      },
    });
  });

  it('registers Agent MCP tools with action-required schemas', async () => {
    const { registeredMcpTools } = await loadKernelHarness();

    expect(registeredMcpTools.map((tool) => tool.name)).toEqual([
      'memo_query',
      'memo_card',
      'memo_review',
      'memo_ui',
    ]);
    for (const tool of registeredMcpTools) {
      expect(tool.config.inputSchema?.required).toContain('action');
      expect(tool.config.inputSchema?.properties?.action).toMatchObject({
        type: 'string',
      });
    }
  });

  it('reports Agent MCP unavailable without installing shims when siyuan.mcp is missing', async () => {
    const { handlers, registeredMcpTools } = await loadKernelHarness({ mcp: false });

    expect(registeredMcpTools).toEqual([]);
    await expect(handlers.capabilities()).resolves.toMatchObject({
      agentMcp: {
        available: false,
        reason: 'siyuan.mcp.registerTool missing',
        registeredTools: [],
      },
    });
  });

  it('rejects empty Agent MCP action before writer relay routing', async () => {
    const { registeredMcpTools, handlers } = await loadKernelHarness();
    const memoQuery = registeredMcpTools.find((tool) => tool.name === 'memo_query');

    await expect(memoQuery?.handler({ action: '   ' })).resolves.toMatchObject({
      ok: false,
      status: 'validation-error',
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
    await expect(handlers['writer.takeCommand']({ instanceId: 'writer-a' })).resolves.toMatchObject({
      ok: false,
    });
  });

  it('routes Agent MCP calls through writer relay and returns relayed results', async () => {
    const { registeredMcpTools, handlers } = await loadKernelHarness();
    await handlers['writer.acquireLease']({
      instanceId: 'writer-a',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/',
      visibilityState: 'visible',
      writerProfile: primaryProfile,
    });
    const memoQuery = registeredMcpTools.find((tool) => tool.name === 'memo_query');
    const toolCall = memoQuery!.handler({ action: 'status' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const command = await handlers['writer.takeCommand']({ instanceId: 'writer-a' }) as {
      command?: {
        commandId: string;
        method: string;
        params?: unknown;
      };
    };
    expect(command.command).toMatchObject({
      method: 'agent.tool.execute',
      params: {
        tool: 'memo_query',
        args: {
          action: 'status',
        },
        source: 'mcp',
      },
    });
    await handlers['writer.completeCommand']({
      instanceId: 'writer-a',
      commandId: command.command!.commandId,
      result: {
        ok: true,
        status: 'success',
        data: {
          overview: {
            dueCount: 2,
          },
        },
      },
    });

    await expect(toolCall).resolves.toMatchObject({
      ok: true,
      status: 'success',
      data: {
        overview: {
          dueCount: 2,
        },
      },
    });
  });

  it('rejects memo_card draft before relay so kernel never owns AI prompt or candidates', async () => {
    const kernelSource = readFileSync(resolve(process.cwd(), 'src/kernel.ts'), 'utf8');
    expect(kernelSource).not.toContain('AgentCardDraftService');
    expect(kernelSource).not.toContain('OpenAICompatibleLLMAdapter');
    expect(kernelSource).not.toContain('getBlockText');
    expect(kernelSource).not.toContain('sourceContent missing');

    const { registeredMcpTools, handlers } = await loadKernelHarness();
    await handlers['writer.acquireLease']({
      instanceId: 'writer-a',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/',
      visibilityState: 'visible',
      writerProfile: primaryProfile,
    });
    const memoCard = registeredMcpTools.find((tool) => tool.name === 'memo_card');
    const toolCall = memoCard!.handler({
      action: 'draft',
      sourceBlockId: 'block-source',
      count: 3,
    });
    await expect(toolCall).resolves.toMatchObject({
      ok: false,
      status: 'unsupported-operation',
      error: {
        code: 'UNSUPPORTED_OPERATION',
      },
    });
    const command = await handlers['writer.takeCommand']({ instanceId: 'writer-a' }) as { command?: unknown };
    expect(command.command).toBeNull();
  });

  it('unregisters Agent MCP tools on unload when the API exists', async () => {
    const { unload, unregisteredMcpTools } = await loadKernelHarness();

    await unload();

    expect(unregisteredMcpTools).toEqual([
      'memo_query',
      'memo_card',
      'memo_review',
      'memo_ui',
    ]);
  });

  it('serializes Truth Device Identity initialization independently of writer ownership', async () => {
    const { handlers } = await loadKernelHarness();
    const first = await handlers['identity.acquireInitializationFence']({
      instanceId: 'origin-a',
      ttlMs: 15_000,
    }) as { ok: boolean; fence: { token: string } };
    expect(first).toMatchObject({ ok: true, fence: { instanceId: 'origin-a' } });

    await expect(handlers['identity.acquireInitializationFence']({
      instanceId: 'origin-b',
      ttlMs: 15_000,
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'FENCE_UNAVAILABLE' },
      fence: { instanceId: 'origin-a' },
    });

    await expect(handlers['identity.releaseInitializationFence']({
      instanceId: 'origin-a',
      token: first.fence.token,
    })).resolves.toMatchObject({ ok: true, fence: null });
    await expect(handlers['identity.acquireInitializationFence']({
      instanceId: 'origin-b',
    })).resolves.toMatchObject({ ok: true, fence: { instanceId: 'origin-b' } });
  });

  it('cleans the identity initialization fence when the kernel plugin unloads', async () => {
    const { handlers, unload } = await loadKernelHarness();
    await handlers['identity.acquireInitializationFence']({ instanceId: 'origin-a' });
    await unload();
    await expect(handlers['identity.acquireInitializationFence']({ instanceId: 'origin-b' }))
      .resolves.toMatchObject({ ok: true, fence: { instanceId: 'origin-b' } });
  });

});
