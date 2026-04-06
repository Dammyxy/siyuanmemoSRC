import { CardType, type FSRSCard } from '@/types/card';
import type { DialogManager } from '@/application/managers/DialogManager';
import type { CoreReviewEntryActionId } from '@/application/entries/CoreReviewEntryRegistry';

export interface CoreReviewEntryServiceDeps {
  i18n: Record<string, string>;
  dialogManager: DialogManager;
  notify: (message: string) => Promise<void>;
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
    const itemCards = this.toItemCards(cards);
    const dueItemCards = this.filterDueCards(itemCards);
    const dueAllCards = this.filterDueCards(cards);

    return [
      {
        id: 'retrieval-due',
        icon: 'iconRiffCard',
        label: `${this.text('retrievalPractice', '提取练习')} - ${this.text('dueMode', '到期')} <span class="ft__secondary">(${dueItemCards.length}/${itemCards.length})</span>`,
        execute: async () => this.execute('retrieval-due', cards, options),
      },
      {
        id: 'retrieval-all',
        icon: 'iconRiffCard',
        label: `${this.text('retrievalPractice', '提取练习')} - ${this.text('allMode', '全部')} <span class="ft__secondary">(${itemCards.length})</span>`,
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
        const dueItemCards = this.filterDueCards(this.toItemCards(cards));
        if (dueItemCards.length === 0) {
          await this.deps.notify(this.text('noDueCards', '当前范围内没有到期的闪卡'));
          return;
        }
        await this.deps.dialogManager.openRetrievalPracticeWithFilter({
          blockIds: dueItemCards.map((card) => card.blockId),
          scopeDocIds: options?.scopeDocIds,
          dueOnly: true,
        });
        return;
      }
      case 'retrieval-all': {
        const itemCards = this.toItemCards(cards);
        if (itemCards.length === 0) {
          await this.deps.notify(this.text('drillNoCards', '当前范围内没有可练习的闪卡'));
          return;
        }
        await this.deps.dialogManager.openRetrievalPracticeWithFilter({
          blockIds: itemCards.map((card) => card.blockId),
          scopeDocIds: options?.scopeDocIds,
          dueOnly: false,
        });
        return;
      }
      case 'incremental-due': {
        const dueAllCards = this.filterDueCards(cards);
        if (dueAllCards.length === 0) {
          await this.deps.notify(this.text('noDueCards', '当前范围内没有到期的闪卡'));
          return;
        }
        await this.deps.dialogManager.openIncrementalLearningWithFilter({
          blockIds: dueAllCards.map((card) => card.blockId),
          scopeDocIds: options?.scopeDocIds,
          dueOnly: true,
        });
        return;
      }
      case 'incremental-all': {
        if (cards.length === 0) {
          await this.deps.notify(this.text('drillNoCards', '当前范围内没有可练习的闪卡'));
          return;
        }
        await this.deps.dialogManager.openIncrementalLearningWithFilter({
          blockIds: cards.map((card) => card.blockId),
          scopeDocIds: options?.scopeDocIds,
          dueOnly: false,
        });
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
        await this.deps.dialogManager.openTemporaryDrill(blockIds);
        return;
      }
      default: {
        const unreachable: never = actionId;
        throw new Error(`Unsupported core review action: ${unreachable}`);
      }
    }
  }

  private toItemCards(cards: FSRSCard[]): FSRSCard[] {
    return cards.filter((card) => card.type !== CardType.Topic);
  }

  private filterDueCards(cards: FSRSCard[]): FSRSCard[] {
    const now = Date.now();
    return cards.filter((card) => (
      card.due <= now
      && !card.skipped
      && (!card.skipUntil || card.skipUntil <= now)
    ));
  }

  private text(key: string, fallback: string): string {
    const value = this.deps.i18n?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
  }
}
