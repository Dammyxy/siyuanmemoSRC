import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import type { Ref } from 'vue';

export interface ReviewUIState {
  header: {
    stats: {
      current: number;
      currentNewCards?: number;
      currentReviewCards?: number;
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
      type: string; // 按钮类型（fullscreen, edit-srs, sticktab, filter, more 等）
      ariaLabel?: string;
      disabled?: boolean;
    }>;
  };

  content: {
    type: 'protyle' | 'html' | 'empty';
    data: string;
    id: string;
    /** Xiuyuan 模板卡片的答案块 ID（点击显示答案后渲染） */
    answerBlockID?: string;
    /** 当前渲染的卡片对象（含 meta 等信息） */
    card?: Record<string, unknown>;
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
    cardMeta?: {
      lapses?: number;
      reps?: number;
      state?: number;
      lastReview?: number;
      cardID?: string;
      blockID?: string;
      deckID?: string;
      isReviewCard?: boolean;
      type?: 'item' | 'topic'; // 🆕 卡片类型
      cardType?: 'item' | 'topic'; // 🆕 兼容字段
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
    queueSize?: number; // 🆕 队列总大小
    remainingSize?: number; // 🆕 剩余卡片数量
  };
}

export type { AdapterContext, IAdapter } from '@/core/extensions';

export interface ReviewSessionHook {
  state: Ref<ReviewUIState>;
  context: Ref<AdapterContext>;
  reveal: () => void;
  grade: (rating: number) => Promise<void>;
  skip: () => Promise<void>;
  executeCommand: (cmdId: string) => Promise<void>;
  getQueueStrategy: () => any; // 🆕 获取底层队列策略（用于神经漫游等特殊功能）
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
      toolbar: [], // ✅ toolbar 在 header 中
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
    },
    meta: {
      transition: 'none',
    },
  };
}
