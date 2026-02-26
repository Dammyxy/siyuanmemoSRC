interface SiyuanSystemConfig {
  host?: string;
  httpPort?: string | number;
  workspaceDir?: string;
}

interface SiyuanRuntime {
  ws?: {
    ws?: WebSocket | null;
  };
  config?: {
    system?: SiyuanSystemConfig;
  };
}

interface RuntimeWindowPort {
  location?: Location;
  siyuan?: SiyuanRuntime;
}

function getRuntimeWindow(): RuntimeWindowPort | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window as unknown as RuntimeWindowPort;
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePort(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.floor(value));
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) {
      return normalized;
    }
  }

  return null;
}

export function resolveMainWebSocket(): WebSocket | null {
  return getRuntimeWindow()?.siyuan?.ws?.ws ?? null;
}

export function resolveWorkspaceDir(defaultValue = 'unknown'): string {
  const workspaceDir = getRuntimeWindow()?.siyuan?.config?.system?.workspaceDir;
  return normalizeNonEmptyString(workspaceDir) ?? defaultValue;
}

export function resolveWebSocketBaseUrl(): string | null {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) {
    return null;
  }

  const location = runtimeWindow.location;
  const locationHost = normalizeNonEmptyString(location?.hostname);
  if (location && locationHost) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const portSegment = location.port ? `:${location.port}` : '';
    return `${protocol}://${locationHost}${portSegment}/ws`;
  }

  const system = runtimeWindow.siyuan?.config?.system;
  const host = normalizeNonEmptyString(system?.host);
  const port = normalizePort(system?.httpPort);
  if (host && port) {
    return `ws://${host}:${port}/ws`;
  }

  return null;
}
