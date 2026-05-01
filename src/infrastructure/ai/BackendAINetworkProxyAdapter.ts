import type {
  AINetworkProxyPort,
  AINetworkProxyRequest,
  AINetworkProxyResponse,
} from '@/application/ports/AINetworkProxyPort';

function normalizeHeaderMap(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }
  return result;
}

function redactSecrets(raw: string, redactionKeys: string[]): string {
  let output = String(raw || '');
  for (const key of redactionKeys) {
    const normalized = String(key || '').trim();
    if (!normalized) {
      continue;
    }
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const valuePattern = new RegExp(`("${escaped}"\\s*:\\s*")[^"]*(")`, 'gi');
    output = output.replace(valuePattern, '$1***REDACTED***$2');
  }
  output = output.replace(/(Authorization\s*:\s*Bearer\s+)[^\s"']+/gi, '$1***REDACTED***');
  return output;
}

export class BackendAINetworkProxyAdapter implements AINetworkProxyPort {
  async execute(request: AINetworkProxyRequest): Promise<AINetworkProxyResponse> {
    const url = String(request.url || '').trim();
    if (!url) {
      throw new Error('INVALID_REQUEST: ai network proxy requires url');
    }
    const controller = new AbortController();
    const timeoutMs = Math.max(500, Math.floor(Number(request.timeoutMs || 15_000)));
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: request.method || 'GET',
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
      const body = await response.text();
      return {
        status: response.status,
        headers: normalizeHeaderMap(response.headers),
        body: redactSecrets(body, request.redactionKeys || []),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'unknown error');
      if ((error as { name?: string })?.name === 'AbortError') {
        throw new Error('TIMEOUT: ai network proxy request timed out');
      }
      throw new Error(`BACKEND_UNAVAILABLE: ai network proxy unavailable (${redactSecrets(message, request.redactionKeys || [])})`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
