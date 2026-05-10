import { CardType, type FSRSCard } from '@/types/card';
import type { DialogManager } from '@/application/managers/DialogManager';
import type { CoreReviewEntryActionId } from '@/application/entries/CoreReviewEntryRegistry';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { getCurrentDayEnd } from '@/utils/dateUtils';

export interface CoreReviewEntryServiceDeps {
  i18n: Record<string, string>;
  dialogManager: DialogManager;
  notify: (message: string) => Promise<void>;
  getDayStartHour?: () => number;
}

export interface CoreReviewMenuAction {
  id: CoreReviewEntryActionId;
  icon: string;
  label: string;
  execute: () => Promise<void>;
}

export interface CoreReviewScopeOptions {
  scopeDocIds?: string[];
}

export class CoreReviewEntryService {
  constructor(private readonly deps: CoreReviewEntryServiceDeps) {}

  createMenuActions(cards: FSRSCard[], options?: CoreReviewScopeOptions): CoreReviewMenuAction[] {
    const retrievalCards = this.toRetrievalCards(cards);
    const dueRetrievalCards = this.filterDueCards(retrievalCards);
    const dueAllCards = this.filterDueCards(cards);

    return [
      {
        id: 'retrieval-due',
        icon: 'iconRiffCard',
        label: `${this.text('retrievalPractice', '提取练习')} - ${this.text('dueMode', '到期')} <span class="ft__secondary">(${dueRetrievalCards.length}/${retrievalCards.length})</span>`,
        execute: async () => this.execute('retrieval-due', cards, options),
      },
      {
        id: 'retrieval-all',
        icon: 'iconRiffCard',
        label: `${this.text('retrievalPractice', '提取练习')} - ${this.text('allMode', '全部')} <span class="ft__secondary">(${retrievalCards.length})</span>`,
        execute: async () => this.execute('retrieval-all', cards, options),
      },
      {
        id: 'incremental-due',
        icon: 'iconBook',
        label: `${this.text('incrementalLearning', '渐进学习')} - ${this.text('dueMode', '到期')} <span class="ft__secondary">(${dueAllCards.length}/${cards.length})</span>`,
        execute: async () => this.execute('incremental-due', cards, options),
      },
      {
        id: 'incremental-all',
        icon: 'iconBook',
        label: `${this.text('incrementalLearning', '渐进学习')} - ${this.text('allMode', '全部')} <span class="ft__secondary">(${cards.length})</span>`,
        execute: async () => this.execute('incremental-all', cards, options),
      },
      {
        id: 'temporary-drill',
        icon: 'iconEye',
        label: `${this.text('temporaryDrill', '临时练习')} <span class="ft__secondary">(${cards.length})</span>`,
        execute: async () => this.execute('temporary-drill', cards, options),
      },
    ];
  }

  async execute(actionId: CoreReviewEntryActionId, cards: FSRSCard[], options?: CoreReviewScopeOptions): Promise<void> {
    switch (actionId) {
      case 'retrieval-due': {
        const dueRetrievalCards = this.filterDueCards(this.toRetrievalCards(cards));
        if (dueRetrievalCards.length === 0) {
          await this.deps.notify(this.text('noDueCards', '当前范围内没有到期的闪卡'));
          return;
        }
        await this.deps.dialogManager.openRetrievalPracticeWithFilter(
          this.buildFilterOptions(dueRetrievalCards, true, options),
        );
        return;
      }
      case 'retrieval-all': {
        const retrievalCards = this.toRetrievalCards(cards);
        if (retrievalCards.length === 0) {
          await this.deps.notify(this.text('drillNoCards', '当前范围内没有可练习的闪卡'));
          return;
        }
        await this.deps.dialogManager.openRetrievalPracticeWithFilter(
          this.buildFilterOptions(retrievalCards, false, options),
        );
        return;
      }
      case 'incremental-due': {
        const dueAllCards = this.filterDueCards(cards);
        if (dueAllCards.length === 0) {
          await this.deps.notify(this.text('noDueCards', '当前范围内没有到期的闪卡'));
          return;
        }
        await this.deps.dialogManager.openIncrementalLearningWithFilter(
          this.buildFilterOptions(dueAllCards, true, options),
        );
        return;
      }
      case 'incremental-all': {
        if (cards.length === 0) {
          await this.deps.notify(this.text('drillNoCards', '当前范围内没有可练习的闪卡'));
          return;
        }
        await this.deps.dialogManager.openIncrementalLearningWithFilter(
          this.buildFilterOptions(cards, false, options),
        );
        return;
      }
      case 'temporary-drill': {
        if (cards.length === 0) {
          await this.deps.notify(this.text('drillNoCards', '当前范围内没有可练习的闪卡'));
          return;
        }
        const blockIds = Array.from(new Set(cards.map((card) => card.blockId).filter(Boolean)));
        if (blockIds.length === 0) {
          await this.deps.notify(this.text('drillNoCards', '当前范围内没有可练习的闪卡'));
          return;
        }
        await this.deps.dialogManager.openTemporaryDrill(blockIds, this.buildExactCardOptions(cards));
        return;
      }
      default: {
        const unreachable: never = actionId;
        throw new Error(`Unsupported core review action: ${unreachable}`);
      }
    }
  }

  private toRetrievalCards(cards: FSRSCard[]): FSRSCard[] {
    return cards.filter((card) => (
      (card.type === CardType.Item || card.type === CardType.Descriptor)
      && !isCardDismissed(card)
    ));
  }

  private buildFilterOptions(
    cards: FSRSCard[],
    dueOnly: boolean,
    options?: CoreReviewScopeOptions,
  ): {
    blockIds: string[];
    cardIds: string[];
    preferredCardId?: string;
    scopeDocIds?: string[];
    dueOnly: boolean;
  } {
    const blockIds = Array.from(new Set(cards.map((card) => card.blockId).filter(Boolean)));
    const exactCardOptions = this.buildExactCardOptions(cards);
    const filterOptions: {
      blockIds: string[];
      cardIds: string[];
      preferredCardId?: string;
      scopeDocIds?: string[];
      dueOnly: boolean;
    } = { blockIds, ...exactCardOptions, dueOnly };

    if (options?.scopeDocIds && options.scopeDocIds.length > 0) {
      filterOptions.scopeDocIds = options.scopeDocIds;
    }

    return filterOptions;
  }

  private buildExactCardOptions(cards: FSRSCard[]): {
    cardIds: string[];
    preferredCardId?: string;
  } {
    const cardIds = Array.from(new Set(cards.map((card) => String(card.id || '').trim()).filter(Boolean)));
    return {
      cardIds,
      preferredCardId: cardIds[0],
    };
  }

  private filterDueCards(cards: FSRSCard[]): FSRSCard[] {
    const dayEnd = getCurrentDayEnd(this.resolveDayStartHour());
    return cards.filter((card) => (
      card.due <= dayEnd
      && !card.skipped
      && (!card.skipUntil || card.skipUntil <= dayEnd)
      && !isCardDismissed(card)
    ));
  }

  private resolveDayStartHour(): number {
    try {
      const value = this.deps.getDayStartHour?.();
      if (Number.isFinite(value)) {
        return Number(value);
      }
    } catch {
      // Keep menu availability resilient; queue code also defaults to 4.
    }
    return 4;
  }

  private text(key: string, fallback: string): string {
    const value = this.deps.i18n?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
  }
}
