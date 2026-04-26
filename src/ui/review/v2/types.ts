import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import type { FSRSCard } from '@/types/card';
import type { QueueType, ReviewQueueProgressSnapshot } from '@/types/unified-data-source';
import type { HeaderVisualTone } from '@/ui/shared/cardVisualTokens';
import type { Ref } from 'vue';

export type ReviewCardKind = 'item' | 'topic' | 'concept' | 'descriptor' | 'cloze';

export type ReviewEditableRendererKind =
  | 'main-protyle'
  | 'list-template'
  | 'multi-cloze'
  | 'quick'
  | 'concept'
  | 'concept-definition'
  | 'descriptor';

export interface ReviewEditableSource {
  blockId: string;
  title: string;
  sourceKind: 'block-markdown';
  rendererKind: ReviewEditableRendererKind;
}

export type ReviewNativeSplitGuardRendererKind =
  | ReviewEditableRendererKind
  | 'image-occlusion'
  | 'empty'
  | 'html'
  | 'unsupported';

export interface ReviewNativeSplitGuardState {
  rendererKind: ReviewNativeSplitGuardRendererKind;
  blockNativeTabSplit: boolean;
}

export type ReviewHeaderVariant =
  | 'retrieval-practice'
  | 'incremental-learning'
  | 'final-drill'
  | 'filter-group'
  | 'neural-roam'
  | 'subset-review'
  | 'temporary-drill'
  | 'leech';

export type ReviewHeaderCounterBadgeKind = 'ratio' | 'value';

export interface ReviewHeaderCounterSummaryPart {
  id: string;
  label: string;
  tone?: HeaderVisualTone;
  remaining: number;
  total: number;
}

export interface ReviewHeaderCounterSummary {
  kind: 'ratio' | 'value';
  text: string;
  tooltip: string;
  ariaLabel: string;
  value?: number | string;
  parts?: ReviewHeaderCounterSummaryPart[];
  total?: number;
  forceParentheses?: boolean;
}

export interface ReviewHeaderCounterBadge {
  id: string;
  label: string;
  kind: ReviewHeaderCounterBadgeKind;
  tone?: HeaderVisualTone;
  text: string;
  ariaLabel: string;
  remaining?: number;
  total?: number;
  value?: number | string;
}

export interface ReviewHeaderPriorityBadge {
  label: string;
  value: string;
  priority: number | null;
  ariaLabel: string;
}

const DEFAULT_REVIEW_HEADER_VARIANT_BY_QUEUE_TYPE: Record<QueueType, ReviewHeaderVariant> = {
  'retrieval-practice': 'retrieval-practice',
  'incremental-learning': 'incremental-learning',
  'final-drill': 'final-drill',
  'filter-group': 'filter-group',
  'neural-roam': 'neural-roam',
  'leech': 'leech',
};

export function resolveReviewHeaderVariant(
  queueType: QueueType | string | null | undefined,
  fallback: ReviewHeaderVariant = 'retrieval-practice',
): ReviewHeaderVariant {
  const key = String(queueType || '').trim() as QueueType;
  return DEFAULT_REVIEW_HEADER_VARIANT_BY_QUEUE_TYPE[key] || fallback;
}

export interface ReviewUIState {
  header: {
    title?: string;
    stats: {
      current: number;
      total: number;
      label: string;
      queueName: string;
    };
    counterSummary: ReviewHeaderCounterSummary | null;
    counterBadges: ReviewHeaderCounterBadge[];
    priorityBadge: ReviewHeaderPriorityBadge;
    breadcrumbs: Array<{
      icon: string;
      text: string;
      id?: string;
      action?: string;
    }>;
    toolbar?: Array<{
      icon: string;
      type: string;
      label?: string;
      ariaLabel?: string;
      tooltip?: string;
      disabled?: boolean;
    }>;
    navigationState?: {
      currentPathIndex: number;
      currentNodeId?: string | null;
      navigationMode: 'explore' | 'follow';
      hasBookmark: boolean;
      pathLength: number;
    };
  };

  content: {
    type: 'protyle' | 'html' | 'empty';
    data: string;
    id: string;
    answerBlockID?: string;
    card?: FSRSCard;
    isXiuyuanListTemplate?: boolean;
    xiuyuanMeta?: Record<string, unknown> | null;
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
      type?: ReviewCardKind;
      cardType?: ReviewCardKind;
    };
  };

  meta: {
    transition: 'slide-left' | 'slide-right' | 'fade' | 'none';
    emptyStateMode?: 'placeholder' | 'completed';
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
    canBack?: boolean;
    queueSize?: number;
    remainingSize?: number;
    queueProgress?: ReviewQueueProgressSnapshot | null;
  };
}

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

export interface IAdapter<TItem = unknown> {
  toUIState(
    queue: unknown,
    item: TItem | null,
    context: AdapterContext,
  ): Promise<ReviewUIState>;

  fetchAuxiliaryData?(
    item: TItem | null,
    queue?: unknown,
    context?: AdapterContext,
  ): Promise<Partial<ReviewUIState>>;

  resetSessionState?(): void;
  cleanup?(): void;
}

export interface RefreshCurrentItemOptions {
  expectedCurrentCardId?: string;
  expectedCurrentBlockId?: string;
}

export interface ReviewSessionHook {
  state: Ref<ReviewUIState>;
  context: Ref<AdapterContext>;
  reveal: () => void;
  grade: (rating: number) => Promise<void>;
  skip: () => Promise<void>;
  back: () => Promise<void>;
  executeCommand: (cmdId: string) => Promise<void>;
  reload: () => Promise<void>;
  refreshCurrentItem: (item: unknown, options?: RefreshCurrentItemOptions) => Promise<void>;
  getQueueStrategy: () => unknown;
  loadCardByBlockId: (blockId: string) => Promise<void>;
  onMounted: () => void;
  onUnmounted: () => void;
}

export interface ReviewViewTabBridge {
  syncToNeuralQueueCurrentNode: (fallbackNodeId?: string | null) => Promise<boolean>;
  refreshTabSurface: (preferredCardId?: string | null) => Promise<boolean>;
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
      counterSummary: null,
      counterBadges: [],
      priorityBadge: {
        label: 'P',
        value: '-',
        priority: null,
        ariaLabel: 'Priority -',
      },
      breadcrumbs: [],
      toolbar: [],
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
      emptyStateMode: 'placeholder',
      queueProgress: null,
    },
  };
}
