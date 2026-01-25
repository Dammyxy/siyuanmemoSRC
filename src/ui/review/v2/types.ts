import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import type { Ref } from 'vue';

export interface ReviewUIState {
  header: {
    stats: {
      current: number;
      total: number;
      label: string;
      queueName: string;
    };
    breadcrumbs: Array<{
      icon: string;
      text: string;
      id?: string;
      action?: string;
    }>;
  };

  content: {
    type: 'protyle' | 'html' | 'empty';
    data: string;
    id: string;
  };

  overlay?: {
    component: string;
    layout: 'top' | 'bottom' | 'cover' | 'sidebar';
    props: Record<string, unknown>;
  };

  actions: {
    showAnswer: boolean;
    grades: Array<{
      label: string;
      value: number;
      color: string;
      kb: string;
    }>;
    menu: IQueueCommand<unknown>[];
    toolbar: Array<{
      icon: string;
      label: string;
      command: string;
    }>;
  };

  meta: {
    transition: 'slide-left' | 'slide-right' | 'fade' | 'none';
    resumePrompt?: {
      message: string;
      data: unknown;
    };
    drillStats?: {
      correct: number;
      total: number;
      duration: number;
    };
    breadcrumbState?: {
      isLocked: boolean;
      contextId: string;
    };
  };
}

export interface AdapterContext {
  showAnswer: boolean;
}

export interface IAdapter<T = any> {
  toUIState(queue: any, item: T | null, context: AdapterContext): Promise<ReviewUIState>;
  fetchAuxiliaryData?(item: T | null): Promise<Partial<ReviewUIState>>;
  cleanup?(): void;
}

export interface ReviewSessionHook {
  state: Ref<ReviewUIState>;
  reveal: () => void;
  grade: (rating: number) => Promise<void>;
  skip: () => Promise<void>;
  executeCommand: (cmdId: string) => Promise<void>;
  onMounted: () => void;
  onUnmounted: () => void;
}

export function createEmptyReviewUIState(): ReviewUIState {
  return {
    header: {
      stats: {
        current: 0,
        total: 0,
        label: '',
        queueName: '',
      },
      breadcrumbs: [],
    },
    content: {
      type: 'empty',
      data: '',
      id: 'empty',
    },
    actions: {
      showAnswer: true,
      grades: [],
      menu: [],
      toolbar: [],
    },
    meta: {
      transition: 'none',
    },
  };
}

