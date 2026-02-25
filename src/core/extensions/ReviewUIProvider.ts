import type { Component } from 'vue';
import type { QueueProvider } from './QueueProvider.ts';

export interface AdapterContext {
  showAnswer: boolean;
  session?: {
    startTime: number;
    resumed?: boolean;
    initialTotal?: number;
  };
}

export interface IAdapter<TItem = any, TUIState = unknown> {
  toUIState(
    queue: QueueProvider<TItem> | any,
    item: TItem | null,
    context: AdapterContext,
  ): Promise<TUIState>;

  fetchAuxiliaryData?(item: TItem | null): Promise<Partial<TUIState>>;
  cleanup?(): void;
}

export interface ProviderContext {
  queue?: Record<string, unknown>;
  ui?: Record<string, unknown>;
}

export interface ReviewUIProvider<TItem = any, TUIState = unknown> {
  component: Component;
  adapter: IAdapter<TItem, TUIState>;
  context?: ProviderContext;
}
