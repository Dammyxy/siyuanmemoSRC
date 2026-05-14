export const KERNEL_TRANSACTION_WRITER_UNAVAILABLE_EVENT = 'siyuanmemo:kernel-transaction-writer-unavailable';

export interface KernelTransactionWriterUnavailableDetail {
  method: string;
  message: string;
  runtimeMode: 'writer' | 'follower' | 'none';
  instanceId?: string;
  commandId?: string;
  timeoutMs?: number;
  occurredAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function dispatchKernelTransactionWriterUnavailableEvent(
  detail: KernelTransactionWriterUnavailableDetail,
): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new CustomEvent(KERNEL_TRANSACTION_WRITER_UNAVAILABLE_EVENT, {
    detail,
  }));
}

export function readKernelTransactionWriterUnavailableDetail(
  event: Event,
): KernelTransactionWriterUnavailableDetail | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isRecord(detail)) {
    return null;
  }
  const method = String(detail.method || '').trim();
  const message = String(detail.message || '').trim();
  const runtimeMode = detail.runtimeMode;
  if (!method || !message || (runtimeMode !== 'writer' && runtimeMode !== 'follower' && runtimeMode !== 'none')) {
    return null;
  }
  const occurredAt = Number(detail.occurredAt || Date.now());
  return {
    method,
    message,
    runtimeMode,
    ...(typeof detail.instanceId === 'string' && detail.instanceId.trim() ? { instanceId: detail.instanceId.trim() } : {}),
    ...(typeof detail.commandId === 'string' && detail.commandId.trim() ? { commandId: detail.commandId.trim() } : {}),
    ...(typeof detail.timeoutMs === 'number' && Number.isFinite(detail.timeoutMs) ? { timeoutMs: detail.timeoutMs } : {}),
    occurredAt: Number.isFinite(occurredAt) ? occurredAt : Date.now(),
  };
}
