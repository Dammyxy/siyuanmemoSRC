/**
 * 原生复习界面会话
 * 复制自思源源生复习界面逻辑，提供原生体验
 */

import { Dialog } from 'siyuan';
import { Protyle } from 'siyuan';
import { Constants } from 'siyuan';
import { Menu } from 'siyuan';
import type { App } from 'siyuan';
import type { ICard, ICardData } from '@/global';
import { createLogger } from '@/utils/logger';

const logger = createLogger('NativeReviewSession');

type SiyuanDialogEntry = {
  element?: Element | null;
};

type SiyuanRuntime = {
  languages?: Record<string, string>;
  dialogs?: SiyuanDialogEntry[];
};

type WindowWithSiyuan = Window & {
  siyuan?: SiyuanRuntime;
  fullscreen?: (element: Element, btn?: Element) => void;
  resize?: (protyle: Protyle | { resize?: () => void } | null) => void;
};

function getRuntimeWindow(): WindowWithSiyuan {
  return window as WindowWithSiyuan;
}

function getLanguages(): Record<string, string> {
  return getRuntimeWindow().siyuan?.languages ?? {};
}

function readHotkeyDetail(event: MouseEvent): string | null {
  const detail = (event as unknown as { detail?: unknown }).detail;
  return typeof detail === 'string' ? detail.toLowerCase() : null;
}

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

  const languages = getLanguages();
  return `<span class="ariaLabel" aria-label="${languages.flashcardNewCard || 'New Card'}">
    <span class="ft__error">${newIndex}</span> /
    <span class="ariaLabel ft__primary" aria-label="${languages.flashcardNewCard || 'New Card'}">${cardsData.unreviewedNewCardCount}</span>
</span>
<span class="fn__space"></span>+<span class="fn__space"></span>
<span class="ariaLabel" aria-label="${languages.flashcardReviewCard || 'Review Card'}">
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
  const languages = getLanguages();
  const titleText = options.title || languages.riffCard || 'Flashcard';

  const iconsHTML = `<div class="block__icons">
    <div class="block__logo">
      <svg class="block__logoicon"><use xlink:href="#iconRiffCard"></use></svg>
      <span>${titleText}</span>
    </div>
    <span class="fn__flex-1 resize__move" style="min-height: 100%"></span>
    <div data-type="count" class="ft__on-surface ft__smaller fn__flex-center${options.cardsData.cards.length === 0 ? " fn__none" : " fn__flex"}">${genCardCount(options.cardsData)}</div>
    <div class="fn__space"></div>
    <div class="fn__space"></div>
    <div data-type="fullscreen" class="b3-tooltips b3-tooltips__sw block__icon block__icon--show" aria-label="${languages.fullscreen || 'Fullscreen'}">
      <svg><use xlink:href="#iconFullscreen"></use></svg>
    </div>
    <div class="fn__space${options.cardsData.cards.length === 0 ? " fn__none" : ""}"></div>
    <div data-type="more" class="${options.cardsData.cards.length === 0 ? "fn__none " : ""}b3-tooltips b3-tooltips__sw block__icon block__icon--show" aria-label="${languages.more || 'More'}">
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
    <!-- 第一个 card__action: 上一张 + 显示答案 -->
    <div class="fn__flex card__action fn__none">
      <button class="b3-button b3-button--cancel" disabled="disabled" data-type="-2" style="width: 25%;min-width: 86px;display: flex">
        <svg style="width: 14px; height: 14px;"><use xlink:href="#iconLeft"></use></svg>
        <span style="margin-left: 4px;">${languages.previousCard || '上一张'}</span>
      </button>
      <span class="fn__space"></span>
      <button data-type="-1" class="b3-button fn__flex-1">
        ${languages.showAnswer || '显示答案'} (${languages.space || '空格'} / ${languages.enterKey || '回车'})
      </button>
    </div>
    <!-- 第二个 card__action: 上一张 + 跳过 + 评分按钮 -->
    <div class="fn__flex card__action fn__none">
      <div>
        <button class="b3-button b3-button--cancel" disabled="disabled" style="display: flex;margin-bottom: 8px;height: 28px;padding: 0;" data-type="-2">
          <svg style="width: 14px; height: 14px;"><use xlink:href="#iconLeft"></use></svg>
          ${languages.previousCard || '上一张'}
        </button>
        <button data-type="-3" aria-label="0 / x" class="b3-button b3-button--cancel b3-tooltips__n b3-tooltips">
          <div class="card__icon">💤</div>
          ${languages.skip || '跳过'} (0)
        </button>
      </div>
      <div>
        <span></span>
        <button data-type="1" aria-label="1 / j / a" class="b3-button b3-button--error b3-tooltips__n b3-tooltips">
          <div class="card__icon">🙈</div>
          ${languages.cardRatingAgain || '重来'} (1)
        </button>
      </div>
      <div>
        <span></span>
        <button data-type="2" aria-label="2 / k / s" class="b3-button b3-button--warning b3-tooltips__n b3-tooltips">
          <div class="card__icon">😬</div>
          ${languages.cardRatingHard || '困难'} (2)
        </button>
      </div>
      <div>
        <span></span>
        <button data-type="3" aria-label="3 / l / d" class="b3-button b3-button--info b3-tooltips__n b3-tooltips">
          <div class="card__icon">😊</div>
          ${languages.cardRatingGood || '良好'} (3)
        </button>
      </div>
      <div>
        <span></span>
        <button data-type="4" aria-label="4 / ; / f" class="b3-button b3-button--success b3-tooltips__n b3-tooltips">
          <div class="card__icon">🌈</div>
          ${languages.cardRatingEasy || '简单'} (4)
        </button>
      </div>
    </div>
  </div>`;
}

/**
 * 原生复习界面会话
 */
export class NativeReviewSession {
  private dialog: Dialog | null = null;
  private protyle: Protyle | null = null;
  private answerProtyle: Protyle | null = null;
  private currentIndex: number = 0;
  private currentAnswerBlockID: string | null = null;
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
      content: htmlContent,
      width: '80vw',
      height: '70vh',
      destroyCallback: () => {
        this.protyle?.destroy();
        this.dialog = null;
      },
    });

    // 设置 data-key 属性，让思源热键系统能够识别这个对话框
    this.dialog.element.setAttribute('data-key', 'dialog-opencard');
    logger.debug('Set data-key attribute on dialog');

    // 调试：检查思源热键系统能否识别
    setTimeout(() => {
      const runtime = getRuntimeWindow();
      logger.debug('Checking SiYuan hotkey system:', {
        dialogElement: this.dialog?.element,
        dataKey: this.dialog?.element.getAttribute('data-key'),
        siyuanDialogs: runtime.siyuan?.dialogs,
        foundInDialogsArray: runtime.siyuan?.dialogs?.find((item) =>
          item.element?.getAttribute('data-key') === 'dialog-opencard'
        ),
        foundInDOM: document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]'),
        foundInDOM2: document.querySelector('div[data-key="dialog-opencard"]'),
      });
    }, 100);

    // 设置最大宽度以匹配思源原生复习界面
    const container = this.dialog.element.querySelector('.b3-dialog__container') as HTMLElement;
    if (container) {
      container.style.maxWidth = '1024px';
    }

    this.bindEvents();

    // 聚焦特效（匹配思源原生复习界面）
    setTimeout(() => {
      const focusElement = this.dialog.element.querySelector('.block__icons button.block__icon') as HTMLElement;
      if (focusElement) {
        focusElement.focus();
        try {
          const range = document.createRange();
          range.selectNodeContents(focusElement);
          range.collapse();
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } catch (err) {
          // 忽略 range 错误
        }
      }
    }, 100);
  }

  /**
   * 绑定事件
   */
  private bindEvents() {
    if (!this.dialog) return;

    const element = this.dialog.element;

    // 初始化 Protyle 编辑器
    const renderElement = element.querySelector('[data-type="render"]') as HTMLElement;
    if (renderElement) {
      this.protyle = new Protyle(this.app, renderElement, {
        blockId: '',
        action: [Constants.CB_GET_ALL],
        render: {
          background: false,
          gutter: true,
          breadcrumbDocName: true,
          title: true,
        },
      });

      // 加载第一张卡片
      this.loadCard(0);
    }

    // 获取 .card__main 元素（思源原生绑定在 firstChild）
    const cardMain = element.querySelector('.card__main') as HTMLElement;
    if (!cardMain) return;

    // 思源的热键系统会 dispatch CustomEvent 到对话框的 firstElementChild
    // 我们需要在那里监听并转发到 cardMain
    if (element.firstElementChild) {
      element.firstElementChild.addEventListener('click', (event: MouseEvent) => {
        logger.debug('Click on firstElementChild:', {
          detail: event.detail,
          detailType: typeof event.detail,
        });

        // 处理来自思源热键系统的 CustomEvent（event.detail 为字符串）
        const key = readHotkeyDetail(event);
        if (key) {
          logger.debug('Hotkey CustomEvent received:', key);

          // 检查是否已显示答案（第二个 action div 是否隐藏）
          const actionElements = this.dialog?.element.querySelectorAll('.card__action');
          const isAnswerShown = actionElements && actionElements[1] && !actionElements[1].classList.contains('fn__none');

          // 显示答案 (空格/enter) - 只在未显示答案时工作
          if ([' ', 'enter'].includes(key)) {
            if (!isAnswerShown) {
              event.preventDefault();
              event.stopPropagation();
              this.showAnswer();
            }
            return;
          }

          // 评分按钮 (1/j/a = 1, 2/k/s = 2, 3/l/d = 3, 4/;/f = 4)
          // 只在显示答案后才能评分
          if (['1', 'j', 'a'].includes(key)) {
            if (isAnswerShown) {
              event.preventDefault();
              event.stopPropagation();
              void this.handleRating(1);
            }
            return;
          } else if (['2', 'k', 's'].includes(key)) {
            if (isAnswerShown) {
              event.preventDefault();
              event.stopPropagation();
              void this.handleRating(2);
            }
            return;
          } else if (['3', 'l', 'd'].includes(key)) {
            if (isAnswerShown) {
              event.preventDefault();
              event.stopPropagation();
              void this.handleRating(3);
            }
            return;
          } else if (['4', ';', 'f'].includes(key)) {
            if (isAnswerShown) {
              event.preventDefault();
              event.stopPropagation();
              void this.handleRating(4);
            }
            return;
          }
          // 跳过 (0/x) - 任何时候都能工作
          else if (['0', 'x'].includes(key)) {
            event.preventDefault();
            event.stopPropagation();
            void this.handleSkip();
            return;
          }
          // 上一张 (p/q)
          else if (['p', 'q'].includes(key)) {
            event.preventDefault();
            event.stopPropagation();
            void this.previousCard();
            return;
          }
        }

        // 其他点击事件，转发到 cardMain 处理（按钮点击等）
        // 但不冒泡，避免重复处理
        const forwardedEvent = new MouseEvent('click', {
          bubbles: false,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
        });
        Object.defineProperty(forwardedEvent, 'target', { value: event.target, writable: false });
        cardMain.dispatchEvent(forwardedEvent);
      });
    }

    // 绑定按钮事件（绑定在 .card__main 上，而非整个 dialog）
    cardMain.addEventListener('click', async (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // 处理来自思源热键系统的 CustomEvent（event.detail 为字符串）
      const key = readHotkeyDetail(event);
      if (key) {
        logger.debug('Hotkey CustomEvent received:', key);

        // 评分按钮 (1/j/a = 1, 2/k/s = 2, 3/l/d = 3, 4/;/f = 4)
        if (['1', 'j', 'a'].includes(key)) {
          await this.handleRating(1);
          return;
        } else if (['2', 'k', 's'].includes(key)) {
          await this.handleRating(2);
          return;
        } else if (['3', 'l', 'd'].includes(key)) {
          await this.handleRating(3);
          return;
        } else if (['4', ';', 'f'].includes(key)) {
          await this.handleRating(4);
          return;
        }
        // 显示答案 (空格/回车)
        else if ([' ', 'enter'].includes(key)) {
          this.showAnswer();
          return;
        }
        // 跳过 (0/x)
        else if (['0', 'x'].includes(key)) {
          await this.handleSkip();
          return;
        }
        // 上一张 (p/q)
        else if (['p', 'q'].includes(key)) {
          await this.previousCard();
          return;
        }
      }

      // 向上查找最近的带有 data-type 的元素
      let currentTarget: HTMLElement | null = target;
      let type: string | null = null;

      while (currentTarget && element !== currentTarget) {
        type = currentTarget.getAttribute('data-type');
        if (type) break;
        currentTarget = currentTarget.parentElement as HTMLElement;
      }

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
      // 跳过 (-3)
      else if (type === '-3') {
        await this.handleSkip();
      }
      // 全屏
      else if (type === 'fullscreen') {
        event.stopPropagation();
        event.preventDefault();
        this.toggleFullscreen();
      }
      // 更多菜单
      else if (type === 'more') {
        event.stopPropagation();
        event.preventDefault();

        // 找到"更多"按钮的实际元素（向上查找带有 data-type="more" 的元素）
        let moreButton: HTMLElement | null = target;
        while (moreButton && element !== moreButton) {
          if (moreButton.getAttribute('data-type') === 'more') {
            break;
          }
          moreButton = moreButton.parentElement as HTMLElement;
        }

        // 使用找到的按钮作为锚点定位菜单
        const rect = moreButton?.getBoundingClientRect?.();
        logger.debug('More button rect:', { rect, moreButton });

        const languages = getLanguages();
        const menu = new Menu();
        menu.addItem({
          icon: 'iconPause',
          label: languages.skip || 'Skip',
          click: () => {
            void this.handleSkip();
          },
        });
        menu.addSeparator();
        menu.addItem({
          icon: 'iconFullscreen',
          label: languages.fullscreen || 'Fullscreen',
          click: () => {
            this.toggleFullscreen();
          },
        });

        if (!rect) {
          logger.error('Failed to open more menu: anchor rect is unavailable');
          return;
        }

        menu.open({
          x: rect.left,
          y: rect.bottom,
          isLeft: true,
        });
      }
    });

    // 键盘快捷键
    element.addEventListener('keydown', (event: KeyboardEvent) => {
      logger.debug('Keydown event:', {
        key: event.key,
        code: event.code,
        target: event.target,
        currentTarget: event.currentTarget,
      });

      if (['1', '2', '3', '4', ' ', 'Enter', '0', 'x', 'X'].includes(event.key)) {
        event.preventDefault();
        logger.debug('Key matched, executing action');
        if (event.key === ' ' || event.key === 'Enter') {
          // 显示答案或跳到下一张
          const actionElements = element.querySelectorAll('.card__action');
          const secondAction = actionElements[1];
          if (secondAction && !secondAction.classList.contains('fn__none')) {
            // 如果评分按钮已显示，3/空格/回车 = 良好 (3)
            void this.handleRating(3);
          } else {
            this.showAnswer();
          }
        } else if (event.key === '0' || event.key === 'x' || event.key === 'X') {
          void this.handleSkip();
        } else {
          const rating = parseInt(event.key, 10);
          void this.handleRating(rating);
        }
      }
    });
  }

  /**
   * 加载卡片
   */
  private loadCard(index: number): void {
    if (index < 0 || index >= this.cardsData.cards.length) return;

    this.currentIndex = index;
    const card = this.cardsData.cards[index];

    // 保存当前卡片的答案块 ID（从 meta 中获取，Xiuyuan 模板卡片）
    const cardMeta = (card as unknown as { meta?: { answerBlockID?: unknown } }).meta;
    this.currentAnswerBlockID = typeof cardMeta?.answerBlockID === 'string'
      ? cardMeta.answerBlockID
      : null;

    if (this.protyle && card.blockID) {
      // 方法：重新创建 Protyle 实例，传入正确的 blockId
      // 这样 Protyle 会自动加载并渲染内容，无需手动调用渲染函数

      logger.debug('Loading card:', card.blockID, 'answerBlock:', this.currentAnswerBlockID);

      // 销毁旧实例
      if (this.protyle) {
        this.protyle.destroy();
      }
      // 销毁答案 Protyle
      if (this.answerProtyle) {
        this.answerProtyle.destroy();
        this.answerProtyle = null;
      }

      // 获取渲染容器
      const renderElement = this.dialog?.element.querySelector('[data-type="render"]') as HTMLElement;
      if (!renderElement) {
        logger.error('Render element not found');
        return;
      }

      // 清理答案容器（如果存在）
      const existingAnswerContainer = renderElement.querySelector('.xiuyuan-answer-container');
      if (existingAnswerContainer) {
        existingAnswerContainer.remove();
      }

      // 创建新的 Protyle 实例，传入 blockId
      // Protyle 会自动调用 API 加载并渲染内容
      this.protyle = new Protyle(this.app, renderElement, {
        blockId: card.blockID,  // 关键：传入 blockId，让 Protyle 自动加载
        action: [Constants.CB_GET_ALL],
        render: {
          background: false,
          gutter: true,
          breadcrumbDocName: true,
          title: true,
        },
      });

      logger.debug('Protyle created for block:', card.blockID);

      // 更新 UI（按钮状态等）
      setTimeout(() => {
        this.updateUI();
      }, 100);
    } else {
      this.updateUI();
    }
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

    // 获取两个 card__action 元素
    const actionElements = element.querySelectorAll('.card__action');

    // 显示第一个 action div（上一张 + 显示答案）
    if (actionElements[0]) {
      actionElements[0].classList.remove('fn__none');

      const prevButtons = actionElements[0].querySelectorAll('[data-type="-2"]') as NodeListOf<HTMLButtonElement>;
      const showAnswerButton = actionElements[0].querySelector('[data-type="-1"]') as HTMLButtonElement;

      if (this.currentIndex === 0) {
        prevButtons.forEach(btn => btn?.setAttribute('disabled', 'disabled'));
        showAnswerButton?.removeAttribute('disabled');
      } else {
        prevButtons.forEach(btn => btn?.removeAttribute('disabled'));
        showAnswerButton?.removeAttribute('disabled');
      }
    }

    // 隐藏第二个 action div（评分按钮）
    if (actionElements[1]) {
      actionElements[1].classList.add('fn__none');
    }
  }

  /**
   * 显示答案
   */
  private showAnswer() {
    const actionElements = this.dialog?.element.querySelectorAll('.card__action');

    if (actionElements && actionElements[0] && actionElements[1]) {
      // 隐藏第一个 action div
      actionElements[0].classList.add('fn__none');

      // 显示第二个 action div（评分按钮）
      actionElements[1].classList.remove('fn__none');
    }

    // 🆕 如果有答案块 ID（Xiuyuan 模板卡片），渲染答案块
    if (this.currentAnswerBlockID) {
      const renderElement = this.dialog?.element.querySelector('[data-type="render"]') as HTMLElement;
      if (renderElement) {
        // 创建答案容器
        let answerContainer = renderElement.querySelector('.xiuyuan-answer-container') as HTMLElement;
        if (!answerContainer) {
          answerContainer = document.createElement('div');
          answerContainer.className = 'xiuyuan-answer-container';
          answerContainer.style.cssText = 'margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--b3-border-color);';
          renderElement.appendChild(answerContainer);
        }

        // 渲染答案块
        if (this.answerProtyle) {
          this.answerProtyle.destroy();
        }
        this.answerProtyle = new Protyle(this.app, answerContainer, {
          blockId: this.currentAnswerBlockID,
          action: [Constants.CB_GET_ALL],
          render: {
            background: false,
            gutter: true,
            breadcrumbDocName: false,
            title: false,
          },
        });
        logger.debug('Answer block rendered:', this.currentAnswerBlockID);
      }
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
   * 处理跳过
   */
  private async handleSkip() {
    const card = this.cardsData.cards[this.currentIndex];
    if (!card) return;

    // 调用跳过回调
    if (this.options.onSkip) {
      await this.options.onSkip(card);
    }

    // 移动到下一张卡片
    await this.nextCard();
  }

  /**
   * 切换全屏
   */
  private toggleFullscreen() {
    const cardMain = this.dialog?.element.querySelector('.card__main') as HTMLElement;
    const fullscreenBtn = this.dialog?.element.querySelector('[data-type="fullscreen"]') as HTMLElement;

    if (cardMain && this.protyle) {
      const runtime = getRuntimeWindow();
      const fullscreen = runtime.fullscreen || ((_element: Element, _btn?: Element) => {
        // 简化版全屏实现（如果全局函数不可用）
        const isFullscreen = _element.classList.contains('fullscreen');
        if (isFullscreen) {
          _element.classList.remove('fullscreen');
        } else {
          _element.classList.add('fullscreen');
        }
      });
      const resize = runtime.resize || ((protyle: Protyle | { resize?: () => void } | null) => {
        // 简化版 resize（如果全局函数不可用）
        if (protyle && protyle.resize) {
          protyle.resize();
        }
      });

      fullscreen(cardMain, fullscreenBtn);
      resize(this.protyle);
    }
  }

  /**
   * 复习完成
   */
  private complete() {
    const languages = getLanguages();
    const element = this.dialog?.element;

    // 显示完成状态
    const renderElement = element?.querySelector('[data-type="render"]');
    if (renderElement) {
      renderElement.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
          <div style="font-size: 64px;">🎉</div>
          <div style="font-size: 20px; margin-top: 16px; color: var(--b3-theme-on-surface);">
            ${languages.allCardReviewsCompleted || 'All cards reviewed'}
          </div>
        </div>
      `;
    }

    // 隐藏所有按钮
    const actionElements = element?.querySelectorAll('.card__action');
    actionElements?.forEach(el => el.classList.add('fn__none'));
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
    this.answerProtyle = null;
  }
}
