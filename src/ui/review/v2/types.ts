import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import type { Ref } from 'vue';

export interface ReviewUIState {
  header: {
    stats: {
      current: number;
      total: number;
      label: string;
      queueName: string;
      newCards?: number;
      reviewCards?: number;
    };
    breadcrumbs: Array<{
      icon: string;
      text: string;
      id?: string;
      action?: string;
    }>;
    toolbar?: Array<{
      icon: string;
      type: 'filter' | 'fullscreen' | 'more' | 'sticktab';
      ariaLabel?: string;
      disabled?: boolean;
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
      emoji?: string;
      nextDue?: string;
    }>;
    menu: IQueueCommand<unknown>[];
    toolbar: Array<{
      icon: string;
      label: string;
      command: string;
    }>;
    cardMeta?: {
      lapses?: number;
      reps?: number;
      state?: number;
      lastReview?: number;
      cardID?: string;
      blockID?: string;
      deckID?: string;
      isReviewCard?: boolean;
    };
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
    hasHiddenContent?: boolean;
    canSkip?: boolean;
  };
}

export type { AdapterContext, IAdapter } from '@/core/extensions';

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
