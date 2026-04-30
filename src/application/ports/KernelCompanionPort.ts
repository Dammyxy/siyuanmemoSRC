export interface KernelCompanionMethod {
  name: string;
  descriptions: string[];
}

export type KernelCompanionUnavailableReason =
  | 'not-loaded'
  | 'not-running'
  | 'network-error'
  | 'http-error'
  | 'rpc-error'
  | 'invalid-response';

export interface KernelCompanionStatusBase {
  checkedAt: number;
  pluginName: string;
  pluginState?: string;
  methods: KernelCompanionMethod[];
  message?: string;
}

export interface KernelCompanionAvailableStatus extends KernelCompanionStatusBase {
  kind: 'available';
  version?: string;
  platform?: string;
  uptimeMs?: number;
}

export interface KernelCompanionUnavailableStatus extends KernelCompanionStatusBase {
  kind: 'unavailable';
  reason: KernelCompanionUnavailableReason;
}

export type KernelCompanionStatus =
  | KernelCompanionAvailableStatus
  | KernelCompanionUnavailableStatus;

export interface KernelCompanionPort {
  getStatus(): Promise<KernelCompanionStatus>;
  call<TResult>(method: string, params?: unknown): Promise<TResult>;
}
