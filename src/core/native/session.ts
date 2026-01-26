/**
 * 原生复习界面会话
 * 复制自思源源生复习界面逻辑，提供原生体验
 */

import { Dialog } from 'siyuan';
import { Protyle } from 'siyuan';
import type { App } from 'siyuan';
import type { ICard, ICardData } from '@/global';

/**
 * 生成卡片计数 HTML
 */
function genCardCount(cardsData: ICardData, allIndex = 0): string {
  let newIndex = 0;
  let oldIndex = 0;
  cardsData.cards.forEach((item, index) => {
    if (index > allIndex) {
      return;
    }
    if (item.state === 0) {
      newIndex++;
    } else {
      oldIndex++;
    }
  });

  const languages = (window as any)?.siyuan?.languages || {};
  return `<span class="ariaLabel" aria-label="${languages.flashcardNewCard || '新卡'}">
    <span class="ft__error">${newIndex}</span> /
    <span class="ariaLabel ft__primary" aria-label="${languages.flashcardNewCard || '新卡'}">${cardsData.unreviewedNewCardCount}</span>
</span>
<span class="fn__space"></span>+<span class="fn__space"></span>
<span class="ariaLabel" aria-label="${languages.flashcardReviewCard || '复习卡'}">
  <span class="ft__error">${oldIndex}</span> /
  <span class="ft__success">${cardsData.unreviewedOldCardCount}</span>
</span>`;
}

/**
 * 生成卡片界面 HTML
 */
function genCardHTML(options: {
  id: string;
  cardType: 'all' | 'doc' | 'notebook';
  cardsData: ICardData;
  isTab: boolean;
  title?: string;
}): string {
  const languages = (window as any)?.siyuan?.languages || {};
  const titleText = options.title || languages.riffCard || '闪卡';

  const iconsHTML = `<div class="block__icons">
    <div class="block__logo">
      <svg class="block__logoicon"><use xlink:href="#iconRiffCard"></use></svg>
      <span>${titleText}</span>
    </div>
    <span class="fn__flex-1 resize__move" style="min-height: 100%"></span>
    <div data-type="count" class="ft__on-surface ft__smaller fn__flex-center${options.cardsData.cards.length === 0 ? " fn__none" : " fn__flex"}">${genCardCount(options.cardsData)}</div>
    <div class="fn__space"></div>
    <div class="fn__space"></div>
    <div data-type="more" class="${options.cardsData.cards.length === 0 ? "fn__none " : ""}b3-tooltips b3-tooltips__sw block__icon block__icon--show" aria-label="${languages.more || '更多'}">
      <svg><use xlink:href="#iconMore"></use></svg>
    </div>
  </div>`;

  return `<div class="card__main">
    ${iconsHTML}
    <div class="card__block fn__flex-1 ${options.cardsData.cards.length === 0 ? "fn__none" : ""}" data-type="render"></div>
    <div class="card__empty card__empty--space${options.cardsData.cards.length === 0 ? "" : " fn__none"}" data-type="empty">
      <div>🔮</div>
      ${languages.noDueCard || '没有待复习的卡片'}
    </div>
    <div class="fn__flex card__action fn__none">
      <button class="b3-button b3-button--cancel" disabled="disabled" data-type="-2" style="width: 25%;min-width: 86px;display: flex">
        <span>${languages.previousCard || '上一张'}</span>
      </button>
      <div style="width: 50%; display: flex;">
        <button class="b3-button b3-button--error" data-type="1" style="flex: 1">${languages.flashcardAgain || '重来'}</button>
        <button class="b3-button b3-button--warning" data-type="2" style="flex: 1">${languages.flashcardHard || '困难'}</button>
        <button class="b3-button b3-button--primary" data-type="3" style="flex: 1">${languages.flashcardGood || '一般'}</button>
        <button class="b3-button b3-button--success" data-type="4" style="flex: 1">${languages.flashcardEasy || '简单'}</button>
      </div>
      <button class="b3-button b3-button--cancel" disabled="disabled" data-type="-1" style="width: 25%;min-width: 86px;display: flex">
        <span>${languages.showAnswer || '显示答案'}</span>
      </button>
    </div>
  </div>`;
}

/**
 * 获取卡片内容
 */
async function getCardContent(card: ICard, protyle: any): Promise<void> {
  if (!card.blockID) return;

  try {
    const response = await fetch('/api/block/getBlockInfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: card.blockID }),
    });

    const data = await response.json();
    if (data.code === 0 && data.data) {
      // 使用 Protyle 渲染内容
      protyle.insert(data.data, true);
    }
  } catch (err) {
    console.error('[NativeReviewSession] Failed to get card content:', err);
  }
}

/**
 * 原生复习界面会话
 */
export class NativeReviewSession {
  private dialog: Dialog | null = null;
  private protyle: Protyle | null = null;
  private currentIndex: number = 0;
  private cardsData: ICardData;

  constructor(
    private app: App,
    cardsData: ICardData,
    private options: {
      cardType: 'all' | 'doc' | 'notebook';
      id?: string;
      title?: string;
      onRating?: (card: ICard, rating: number) => Promise<void>;
      onSkip?: (card: ICard) => Promise<void>;
    }
  ) {
    this.cardsData = cardsData;
  }

  /**
   * 打开复习界面
   */
  open() {
    if (this.dialog) {
      this.dialog.destroy();
    }

    const htmlContent = genCardHTML({
      id: this.options.id || '',
      cardType: this.options.cardType,
      cardsData: this.cardsData,
      isTab: false,
      title: this.options.title,
    });

    this.dialog = new Dialog({
      title: this.options.title || '复习',
      content: htmlContent,
      width: '80vw',
      height: '70vh',
      destroyCallback: () => {
        this.protyle?.destroy();
        this.dialog = null;
      },
    });

    this.bindEvents();
  }

  /**
   * 绑定事件
   */
  private async bindEvents() {
    if (!this.dialog) return;

    const element = this.dialog.element;

    // 初始化 Protyle 编辑器
    const renderElement = element.querySelector('[data-type="render"]') as HTMLElement;
    if (renderElement) {
      this.protyle = new Protyle(this.app, renderElement, {
        blockId: '',
        action: [],
        render: {
          background: false,
          gutter: true,
          breadcrumbDocName: true,
          title: true,
        },
      });

      // 加载第一张卡片
      await this.loadCard(0);
    }

    // 绑定按钮事件
    element.addEventListener('click', async (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const type = target.getAttribute('data-type');

      if (!type) return;

      // 评分按钮 (1-4)
      if (['1', '2', '3', '4'].includes(type)) {
        const rating = parseInt(type, 10);
        await this.handleRating(rating);
      }
      // 显示答案 (-1)
      else if (type === '-1') {
        this.showAnswer();
      }
      // 上一张 (-2)
      else if (type === '-2') {
        await this.previousCard();
      }
    });

    // 键盘快捷键
    element.addEventListener('keydown', (event: KeyboardEvent) => {
      if (['1', '2', '3', '4', ' ', 'Enter'].includes(event.key)) {
        event.preventDefault();
        const rating = event.key === ' ' || event.key === 'Enter' ? '-1' : event.key;
        const type = parseInt(rating, 10);
        if (!isNaN(type)) {
          void this.handleRating(type);
        } else {
          this.showAnswer();
        }
      }
    });
  }

  /**
   * 加载卡片
   */
  private async loadCard(index: number) {
    if (index < 0 || index >= this.cardsData.cards.length) return;

    this.currentIndex = index;
    const card = this.cardsData.cards[index];

    if (this.protyle && card.blockID) {
      await getCardContent(card, this.protyle);
    }

    this.updateUI();
  }

  /**
   * 更新 UI 状态
   */
  private updateUI() {
    if (!this.dialog) return;

    const element = this.dialog.element;

    // 更新计数器
    const countElement = element.querySelector('[data-type="count"]');
    if (countElement) {
      countElement.innerHTML = genCardCount(this.cardsData, this.currentIndex);
    }

    // 更新按钮状态
    const actionElement = element.querySelector('.card__action');
    if (actionElement) {
      actionElement.classList.remove('fn__none');

      const prevButton = actionElement.querySelector('[data-type="-2"]') as HTMLButtonElement;
      const showAnswerButton = actionElement.querySelector('[data-type="-1"]') as HTMLButtonElement;

      if (this.currentIndex === 0) {
        prevButton?.setAttribute('disabled', 'disabled');
        showAnswerButton?.removeAttribute('disabled');
      } else {
        prevButton?.removeAttribute('disabled');
        showAnswerButton?.removeAttribute('disabled');
      }
    }
  }

  /**
   * 显示答案
   */
  private showAnswer() {
    const actionElement = this.dialog?.element.querySelector('.card__action');
    if (actionElement) {
      const ratingButtons = actionElement.querySelectorAll('[data-type="1"], [data-type="2"], [data-type="3"], [data-type="4"]');
      ratingButtons.forEach(btn => btn.classList.remove('fn__none'));

      const showAnswerBtn = actionElement.querySelector('[data-type="-1"]');
      showAnswerBtn?.classList.add('fn__none');
    }
  }

  /**
   * 处理评分
   */
  private async handleRating(rating: number) {
    const card = this.cardsData.cards[this.currentIndex];
    if (!card) return;

    // 调用回调
    if (this.options.onRating) {
      await this.options.onRating(card, rating);
    }

    // 移动到下一张卡片
    await this.nextCard();
  }

  /**
   * 下一张卡片
   */
  private async nextCard() {
    if (this.currentIndex < this.cardsData.cards.length - 1) {
      await this.loadCard(this.currentIndex + 1);
    } else {
      // 复习完成
      this.complete();
    }
  }

  /**
   * 上一张卡片
   */
  private async previousCard() {
    if (this.currentIndex > 0) {
      await this.loadCard(this.currentIndex - 1);
    }
  }

  /**
   * 复习完成
   */
  private complete() {
    const languages = (window as any)?.siyuan?.languages || {};
    const element = this.dialog?.element;

    // 显示完成状态
    const renderElement = element?.querySelector('[data-type="render"]');
    if (renderElement) {
      renderElement.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
          <div style="font-size: 64px;">🎉</div>
          <div style="font-size: 20px; margin-top: 16px; color: var(--b3-theme-on-surface);">
            ${languages.allCardReviewsCompleted || '所有卡片已复习完成'}
          </div>
        </div>
      `;
    }

    // 隐藏评分按钮
    const actionElement = element?.querySelector('.card__action');
    actionElement?.classList.add('fn__none');
  }

  /**
   * 更新卡片数据（用于动态更新队列）
   */
  updateCards(newCardsData: ICardData) {
    this.cardsData = newCardsData;
    this.updateUI();
  }

  /**
   * 关闭对话框
   */
  close() {
    this.dialog?.destroy();
    this.dialog = null;
    this.protyle = null;
  }
}
