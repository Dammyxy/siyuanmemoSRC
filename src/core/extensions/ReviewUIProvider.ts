import type { Component } from 'vue';
import type { ReviewUIState } from '../../ui/review/v2/types.ts';
import type { QueueProvider } from './QueueProvider.ts';

export interface AdapterContext {
  showAnswer: boolean;
  session?: {
    startTime: number;
    resumed?: boolean;
    initialTotal?: number;
  };
}

export interface IAdapter<TItem = any> {
  toUIState(
    queue: QueueProvider<TItem> | any,
    item: TItem | null,
    context: AdapterContext,
  ): Promise<ReviewUIState>;

  fetchAuxiliaryData?(item: TItem | null): Promise<Partial<ReviewUIState>>;
  cleanup?(): void;
}

export interface ProviderContext {
  queue?: Record<string, unknown>;
  ui?: Record<string, unknown>;
}

export interface ReviewUIProvider<TItem = any> {
  component: Component;
  adapter: IAdapter<TItem>;
  context?: ProviderContext;
}
