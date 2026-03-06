import type { Component } from 'vue';
import type { QueueProvider } from './QueueProvider.ts';

export interface ReviewSessionHistoryEntry {
  action: 'rate' | 'skip' | 'custom';
  answeredDelta: number;
  correctDelta: number;
}

export interface AdapterSessionState {
  startTime: number;
  resumed?: boolean;
  initialTotal?: number;
  answeredCount?: number;
  correctCount?: number;
  baselineVersion?: number;
  reviewHistory?: ReviewSessionHistoryEntry[];
}

export interface AdapterContext {
  showAnswer: boolean;
  session?: AdapterSessionState;
}

export interface IAdapter<TItem = unknown, TUIState = unknown> {
  toUIState(
    queue: QueueProvider<TItem> | unknown,
    item: TItem | null,
    context: AdapterContext,
  ): Promise<TUIState>;

  fetchAuxiliaryData?(
    item: TItem | null,
    queue?: QueueProvider<TItem> | unknown,
    context?: AdapterContext,
  ): Promise<Partial<TUIState>>;
  resetSessionState?(): void;
  cleanup?(): void;
}

export interface ProviderContext {
  queue?: Record<string, unknown>;
  ui?: Record<string, unknown>;
}

export interface ReviewUIProvider<TItem = unknown, TUIState = unknown> {
  component: Component;
  adapter: IAdapter<TItem, TUIState>;
  context?: ProviderContext;
}
