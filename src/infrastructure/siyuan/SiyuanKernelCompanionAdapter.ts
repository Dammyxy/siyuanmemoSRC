import type {
  KernelCompanionBroadcastDiagnostics,
  KernelCompanionBroadcastHandlers,
  KernelCompanionBroadcastSubscription,
  KernelCompanionMethod,
  KernelCompanionPort,
  KernelCompanionStatus,
  KernelCompanionUnavailableReason,
} from '@/application/ports/KernelCompanionPort';
import type {
  KernelBroadcastEvent,
  KernelFastPathCapabilities,
  KernelFastPathUnavailableReason,
} from '../../../packages/contracts/src/kernel-rpc';

const DEFAULT_PLUGIN_NAME = 'siyuan-plugin-siyuanmemo';
const JSON_RPC_VERSION = '2.0';
const BROADCAST_RECONNECT_DELAY_MS = 1_000;
const BROADCAST_RECONNECT_MAX_DELAY_MS = 15_000;

interface SiyuanApiEnvelope<T> {
  code: number;
  msg?: string;
  data: T;
}

interface LoadedPluginData {
  name?: string;
  state?: string;
  methods?: Array<{
    name?: string;
    descriptions?: unknown[];
  }>;
}

interface KernelHealthResult {
  ok?: boolean;
  plugin?: string;
  version?: string;
  platform?: string;
  uptimeMs?: number;
}

interface KernelCapabilitiesResult {
  methods?: string[];
  kernelNetworkProxy?: boolean;
  privateSse?: boolean;
  privateHttp?: boolean;
}

interface JsonRpcSuccess<TResult> {
  jsonrpc: string;
  result: TResult;
  id: number | string | null;
}

interface JsonRpcError {
  jsonrpc: string;
  error: {
    code?: number;
    message?: string;
  };
  id: number | string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSiyuanApiEnvelope<T>(value: unknown): value is SiyuanApiEnvelope<T> {
  return isRecord(value) && typeof value.code === 'number';
}

function normalizeMethods(methods: LoadedPluginData['methods']): KernelCompanionMethod[] {
  if (!Array.isArray(methods)) {
    return [];
  }

  return methods
    .filter((method): method is NonNullable<LoadedPluginData['methods']>[number] => typeof method?.name === 'string')
    .map((method) => ({
      name: method.name!,
      descriptions: Array.isArray(method.descriptions)
        ? method.descriptions.map((description) => String(description))
        : [],
    }));
}

function normalizeJsonRpcParams(params: unknown): unknown[] | Record<string, unknown> {
  if (params === undefined || params === null) {
    return [];
  }
  if (Array.isArray(params)) {
    return params;
  }
  if (isRecord(params)) {
    return params;
  }
  return [params];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildUnknownFastPathCapabilities(): KernelFastPathCapabilities {
  return {
    rpcWebSocketPush: {
      state: 'unknown',
      reason: 'not-configured',
    },
    backendRealWorkerTransport: {
      state: 'unknown',
      reason: 'not-configured',
    },
    kernelNetworkProxy: {
      state: 'unknown',
      reason: 'smoke-required',
    },
    privateHttp: {
      state: 'unknown',
      reason: 'smoke-required',
    },
    privateSse: {
      state: 'unknown',
      reason: 'smoke-required',
    },
  };
}

function buildUnavailableFastPathCapabilities(
  reason: KernelFastPathUnavailableReason,
  message?: string,
): KernelFastPathCapabilities {
  const checkedAt = Date.now();
  return {
    rpcWebSocketPush: {
      state: 'unavailable',
      reason,
      message,
      checkedAt,
    },
    backendRealWorkerTransport: {
      state: 'unknown',
      reason: 'not-configured',
      checkedAt,
    },
    kernelNetworkProxy: {
      state: 'unavailable',
      reason,
      message,
      checkedAt,
    },
    privateHttp: {
      state: 'unavailable',
      reason,
      message,
      checkedAt,
    },
    privateSse: {
      state: 'unavailable',
      reason,
      message,
      checkedAt,
    },
  };
}

function buildAvailableCompanionFastPathCapabilities(
  checkedAt: number,
  capabilities?: KernelCapabilitiesResult,
): KernelFastPathCapabilities {
  const methods = new Set((capabilities?.methods || []).map((method) => String(method)));
  const kernelNetworkProxyAvailable = capabilities?.kernelNetworkProxy === true
    || methods.has('network.fetchExternal');
  const privateHttpAvailable = capabilities?.privateHttp === true
    || (methods.has('private.http.status') && methods.has('private.http.command'));
  return {
    ...buildUnknownFastPathCapabilities(),
    rpcWebSocketPush: {
      state: 'available',
      checkedAt,
    },
    backendRealWorkerTransport: {
      state: 'unknown',
      reason: 'not-configured',
      checkedAt,
    },
    kernelNetworkProxy: {
      state: kernelNetworkProxyAvailable ? 'available' : 'unknown',
      reason: kernelNetworkProxyAvailable ? undefined : 'smoke-required',
      checkedAt,
    },
    privateHttp: {
      state: privateHttpAvailable ? 'available' : 'unknown',
      reason: privateHttpAvailable ? undefined : 'smoke-required',
      checkedAt,
    },
    privateSse: {
      state: capabilities?.privateSse === true ? 'available' : 'unknown',
      reason: capabilities?.privateSse === true ? undefined : 'smoke-required',
      checkedAt,
    },
  };
}

function buildUnavailable(input: {
  checkedAt: number;
  pluginName: string;
  pluginState?: string;
  methods?: KernelCompanionMethod[];
  reason: KernelCompanionUnavailableReason;
  message?: string;
}): KernelCompanionStatus {
  return {
    kind: 'unavailable',
    checkedAt: input.checkedAt,
    pluginName: input.pluginName,
    pluginState: input.pluginState,
    methods: input.methods ?? [],
    capabilities: buildUnavailableFastPathCapabilities(input.reason, input.message),
    reason: input.reason,
    message: input.message,
  };
}

function normalizeLocationWsBase(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const location = window.location;
  const hostname = typeof location?.hostname === 'string' ? location.hostname.trim() : '';
  if (!hostname) {
    return null;
  }
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const port = location.port ? `:${location.port}` : '';
  return `${protocol}://${hostname}${port}/ws`;
}

function isKernelBroadcastMethod(value: unknown): value is KernelBroadcastEvent['method'] {
  return value === 'memo.kernel.ready'
    || value === 'memo.writer.leaseChanged'
    || value === 'memo.writer.command'
    || value === 'memo.writer.commandResult'
    || value === 'memo.queueProjection.identityChanged';
}

function normalizeBroadcastEvent(message: unknown): KernelBroadcastEvent | null {
  if (!isRecord(message) || message.jsonrpc !== JSON_RPC_VERSION || !isKernelBroadcastMethod(message.method)) {
    return null;
  }
  return {
    method: message.method,
    params: 'params' in message ? message.params : undefined,
  } as KernelBroadcastEvent;
}

class StaticBroadcastSubscription implements KernelCompanionBroadcastSubscription {
  constructor(private diagnostics: KernelCompanionBroadcastDiagnostics) {}

  close(): void {
    this.diagnostics = {
      ...this.diagnostics,
      state: this.diagnostics.state === 'unavailable' ? 'unavailable' : 'closed',
      closedAt: Date.now(),
    };
  }

  getDiagnostics(): KernelCompanionBroadcastDiagnostics {
    return { ...this.diagnostics };
  }
}

export class SiyuanKernelCompanionAdapter implements KernelCompanionPort {
  constructor(private readonly pluginName = DEFAULT_PLUGIN_NAME) {}

  async getStatus(): Promise<KernelCompanionStatus> {
    const checkedAt = Date.now();
    let loadedPlugin: LoadedPluginData;

    try {
      const response = await fetch('/api/plugin/getLoadedPlugin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.pluginName }),
      });
      if (!response.ok) {
        return buildUnavailable({
          checkedAt,
          pluginName: this.pluginName,
          reason: 'http-error',
          message: `Kernel companion status HTTP error ${response.status}: ${response.statusText}`,
        });
      }
      const envelope: unknown = await response.json();
      if (!isSiyuanApiEnvelope<LoadedPluginData>(envelope)) {
        return buildUnavailable({
          checkedAt,
          pluginName: this.pluginName,
          reason: 'invalid-response',
          message: 'Invalid kernel companion status response',
        });
      }
      if (envelope.code !== 0) {
        return buildUnavailable({
          checkedAt,
          pluginName: this.pluginName,
          reason: envelope.code === -32001 ? 'not-loaded' : 'rpc-error',
          message: envelope.msg || 'Kernel companion is not loaded',
        });
      }
      loadedPlugin = envelope.data || {};
    } catch (error) {
      return buildUnavailable({
        checkedAt,
        pluginName: this.pluginName,
        reason: 'network-error',
        message: toErrorMessage(error),
      });
    }

    const pluginState = String(loadedPlugin.state || '');
    const methods = normalizeMethods(loadedPlugin.methods);
    if (pluginState !== 'running') {
      return buildUnavailable({
        checkedAt,
        pluginName: String(loadedPlugin.name || this.pluginName),
        pluginState,
        methods,
        reason: 'not-running',
        message: pluginState ? `Plugin state is ${pluginState}` : 'Plugin is not running',
      });
    }

    try {
      const health = await this.call<KernelHealthResult>('health');
      let capabilities: KernelCapabilitiesResult | undefined;
      try {
        capabilities = await this.call<KernelCapabilitiesResult>('capabilities');
      } catch {
        capabilities = undefined;
      }
      return {
        kind: 'available',
        checkedAt,
        pluginName: String(loadedPlugin.name || health.plugin || this.pluginName),
        pluginState,
        methods,
        capabilities: buildAvailableCompanionFastPathCapabilities(checkedAt, capabilities),
        version: health.version,
        platform: health.platform,
        uptimeMs: typeof health.uptimeMs === 'number' ? health.uptimeMs : undefined,
      };
    } catch (error) {
      return buildUnavailable({
        checkedAt,
        pluginName: String(loadedPlugin.name || this.pluginName),
        pluginState,
        methods,
        reason: 'rpc-error',
        message: toErrorMessage(error),
      });
    }
  }

  async call<TResult>(method: string, params?: unknown): Promise<TResult> {
    const body: Record<string, unknown> = {
      jsonrpc: JSON_RPC_VERSION,
      method,
      params: normalizeJsonRpcParams(params),
      id: 1,
    };

    const response = await fetch(`/api/plugin/rpc/${this.pluginName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Kernel companion HTTP error ${response.status}: ${response.statusText}`);
    }

    const result: unknown = await response.json();
    if (!isRecord(result) || result.jsonrpc !== JSON_RPC_VERSION) {
      throw new Error('Kernel companion RPC returned invalid response');
    }
    if ('error' in result) {
      const rpcError = result as JsonRpcError;
      const code = typeof rpcError.error.code === 'number' ? rpcError.error.code : -32603;
      const message = rpcError.error.message || 'Unknown error';
      throw new Error(`Kernel companion RPC error ${code}: ${message}`);
    }

    return (result as JsonRpcSuccess<TResult>).result;
  }

  subscribeBroadcast(handlers: KernelCompanionBroadcastHandlers): KernelCompanionBroadcastSubscription {
    const wsBase = normalizeLocationWsBase();
    if (!wsBase || typeof WebSocket === 'undefined') {
      return new StaticBroadcastSubscription({
        state: 'unavailable',
        reconnectAttempts: 0,
        unavailableReason: 'websocket-url-unavailable',
        message: 'Kernel companion RPC WebSocket URL is unavailable',
      });
    }

    let socket: WebSocket | null = null;
    let closedByClient = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let diagnostics: KernelCompanionBroadcastDiagnostics = {
      state: 'connecting',
      reconnectAttempts,
    };

    const emitState = (next: Partial<KernelCompanionBroadcastDiagnostics>) => {
      diagnostics = {
        ...diagnostics,
        ...next,
        reconnectAttempts,
      };
      handlers.onStateChange?.({ ...diagnostics });
    };

    const connect = () => {
      const url = `${wsBase}/plugin/rpc/${encodeURIComponent(this.pluginName)}`;
      emitState({
        state: 'connecting',
        message: undefined,
        unavailableReason: undefined,
      });
      try {
        socket = new WebSocket(url);
      } catch (error) {
        emitState({
          state: 'unavailable',
          unavailableReason: 'network-error',
          message: toErrorMessage(error),
          closedAt: Date.now(),
        });
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        reconnectAttempts = 0;
        emitState({
          state: 'open',
          openedAt: Date.now(),
          message: undefined,
          unavailableReason: undefined,
        });
      };
      socket.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') {
          return;
        }
        try {
          const parsed = JSON.parse(event.data) as unknown;
          const normalized = normalizeBroadcastEvent(parsed);
          if (!normalized) {
            return;
          }
          emitState({
            lastEventAt: Date.now(),
          });
          handlers.onEvent(normalized);
        } catch (error) {
          emitState({
            state: diagnostics.state === 'open' ? 'open' : 'degraded',
            message: `Invalid kernel broadcast event: ${toErrorMessage(error)}`,
          });
        }
      };
      socket.onerror = () => {
        emitState({
          state: diagnostics.state === 'open' ? 'degraded' : 'unavailable',
          unavailableReason: 'network-error',
          message: 'Kernel companion RPC WebSocket error',
        });
      };
      socket.onclose = () => {
        socket = null;
        emitState({
          state: closedByClient ? 'closed' : 'degraded',
          closedAt: Date.now(),
          unavailableReason: closedByClient ? undefined : 'websocket-closed',
          message: closedByClient ? undefined : 'Kernel companion RPC WebSocket closed',
        });
        if (!closedByClient) {
          scheduleReconnect();
        }
      };
    };

    const scheduleReconnect = () => {
      if (closedByClient || reconnectTimer) {
        return;
      }
      reconnectAttempts += 1;
      const delayMs = Math.min(
        BROADCAST_RECONNECT_MAX_DELAY_MS,
        BROADCAST_RECONNECT_DELAY_MS * 2 ** Math.max(0, reconnectAttempts - 1),
      );
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    };

    connect();

    return {
      close: () => {
        closedByClient = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        const currentSocket = socket;
        socket = null;
        if (currentSocket && currentSocket.readyState !== WebSocket.CLOSED) {
          currentSocket.close();
        } else {
          emitState({
            state: 'closed',
            closedAt: Date.now(),
            unavailableReason: undefined,
            message: undefined,
          });
        }
      },
      getDiagnostics: () => ({ ...diagnostics }),
    };
  }

}
