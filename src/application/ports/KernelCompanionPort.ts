import type {
  KernelAiStreamEvent,
  KernelBroadcastEvent,
  KernelFastPathCapabilities,
  KernelFastPathUnavailableReason,
} from '../../../packages/contracts/src/kernel-rpc';

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

export type KernelCompanionBroadcastConnectionState =
  | 'connecting'
  | 'open'
  | 'closed'
  | 'degraded'
  | 'unavailable';

export interface KernelCompanionBroadcastDiagnostics {
  state: KernelCompanionBroadcastConnectionState;
  openedAt?: number;
  closedAt?: number;
  lastEventAt?: number;
  reconnectAttempts: number;
  unavailableReason?: KernelFastPathUnavailableReason;
  message?: string;
}

export interface KernelCompanionBroadcastHandlers {
  onEvent(event: KernelBroadcastEvent): void;
  onStateChange?(diagnostics: KernelCompanionBroadcastDiagnostics): void;
}

export interface KernelCompanionBroadcastSubscription {
  close(): void;
  getDiagnostics(): KernelCompanionBroadcastDiagnostics;
}

export interface KernelCompanionAiStreamHandlers {
  onEvent(event: KernelAiStreamEvent): void;
  onError?(error: Error): void;
  onClose?(): void;
}

export interface KernelCompanionAiStreamSubscription {
  close(): void;
}

export interface KernelCompanionStatusBase {
  checkedAt: number;
  pluginName: string;
  pluginState?: string;
  methods: KernelCompanionMethod[];
  capabilities: KernelFastPathCapabilities;
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
  subscribeBroadcast?(handlers: KernelCompanionBroadcastHandlers): KernelCompanionBroadcastSubscription;
  subscribeAiStream?(streamId: string, handlers: KernelCompanionAiStreamHandlers): KernelCompanionAiStreamSubscription;
}
