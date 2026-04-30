import type {
  KernelCompanionMethod,
  KernelCompanionPort,
  KernelCompanionStatus,
  KernelCompanionUnavailableReason,
} from '@/application/ports/KernelCompanionPort';

const DEFAULT_PLUGIN_NAME = 'siyuan-plugin-siyuanmemo';
const JSON_RPC_VERSION = '2.0';

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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    reason: input.reason,
    message: input.message,
  };
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
      return {
        kind: 'available',
        checkedAt,
        pluginName: String(loadedPlugin.name || health.plugin || this.pluginName),
        pluginState,
        methods,
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
      params: params ?? null,
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
}
