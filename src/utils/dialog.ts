/**
 * Dialog Helper
 * 封装思源 Dialog API，方便在 Vue 组件中使用
 */

import { Dialog } from 'siyuan';
import { createApp, type Component } from 'vue';
import { createLogger } from '@/utils/logger';

type DialogEventHandler = (...args: unknown[]) => void;
type CustomEventLike = Event & {
    detail?: unknown;
    _fsrsForwarded?: boolean;
};

const logger = createLogger('DialogHelper');

/**
 * 创建一个 Vue 组件的 Dialog
 */
export function createVueDialog<T extends Component>(options: {
    title?: string;  // 改为可选
    hideTitle?: boolean;  // 添加选项：隐藏默认标题栏
    component: T;
    props?: Record<string, unknown>;
    events?: Record<string, DialogEventHandler>;
    width?: string;
    height?: string;
    onClose?: () => void;
    dataKey?: string; // 添加 dataKey 选项，用于思源热键系统识别
    transparent?: boolean;  // 添加透明遮罩层选项
    isReview?: boolean;  // 添加标识：是否为复习对话框（用于控制 maxWidth）
    isMobile?: boolean;  // 是否为移动端（用于全屏策略）
    responsive?: boolean;  // 🆕 添加响应式选项
    disableClose?: boolean;
}): { dialog: Dialog; destroy: () => void } {
    const containerId = `fsrs-dialog-${Date.now()}`;

    logger.debug('Creating dialog with events', {
        events: options.events ? Object.keys(options.events) : [],
    });

    // 将 events 转换为 onXxx 格式的 props
    const eventProps: Record<string, unknown> = {};
    if (options.events) {
        for (const [key, handler] of Object.entries(options.events)) {
            // 将 kebab-case 转换为 camelCase，然后加上 'on' 前缀
            // 例如: 'convert-to-tab' -> 'convertToTab' -> 'onConvertToTab'
            const camelCase = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            const propKey = `on${camelCase.charAt(0).toUpperCase()}${camelCase.slice(1)}`;
            eventProps[propKey] = handler;
            logger.debug('Event mapping', { source: key, target: propKey });
        }
    }

    logger.debug('Final event props', { keys: Object.keys(eventProps) });

    // 创建 Vue 应用
    const app = createApp(options.component, {
        ...options.props,
        ...eventProps,
    });

    // 🆕 响应式尺寸计算
    let dialogWidth = options.width || '700px';
    let dialogHeight = options.height || '500px';
    
    if (options.responsive) {
        const vw = window.innerWidth;
        
        // 根据视口大小调整对话框尺寸
        // 小屏幕（< 768px）：使用 90% 视口宽度
        // 中等屏幕（768px - 1200px）：使用 80% 视口宽度
        // 大屏幕（> 1200px）：使用固定宽度或最大宽度
        if (vw < 768) {
            dialogWidth = '90vw';
            dialogHeight = '85vh';
        } else if (vw < 1200) {
            dialogWidth = '80vw';
            dialogHeight = '80vh';
        } else {
            // 大屏幕使用指定宽度，但不超过 90vw
            const specifiedWidth = parseInt(options.width || '700');
            dialogWidth = `min(${specifiedWidth}px, 90vw)`;
            dialogHeight = `min(${options.height || '80vh'}, 85vh)`;
        }
    }

    const dialog = new Dialog({
        title: options.hideTitle ? undefined : options.title,  // 如果 hideTitle，不传 title
        content: `<div id="${containerId}" class="fn__flex-column" style="height: 100%; width: 100%; overflow: hidden;"></div>`,
        width: dialogWidth,
        height: dialogHeight,
        transparent: options.transparent,  // 传递 transparent 选项
        disableClose: options.disableClose === true,
        destroyCallback: () => {
            // 销毁 Vue 应用
            try {
                app.unmount();
            } catch (e) {
                logger.warn('Unmount error', e);
            }
            options.onClose?.();
        },
    });

    // 只为复习对话框设置最大宽度和圆角
    const dialogContainer = dialog.element.querySelector('.b3-dialog__container') as HTMLElement;
    if (dialogContainer) {
        const isFullScreenDialog = dialogWidth === '100vw' && dialogHeight === '100vh';
        if (isFullScreenDialog) {
            dialogContainer.style.maxWidth = '100vw';
            dialogContainer.style.width = '100vw';
            dialogContainer.style.height = '100vh';
            dialogContainer.style.setProperty('border-radius', '0', 'important');
        }

        if (options.isReview) {
            dialogContainer.classList.add('siyuanmemo-review-dialog-container');
            if (options.isMobile) {
                dialogContainer.classList.add('fsrs-mobile-review-dialog');
                dialogContainer.style.maxWidth = '100vw';
                dialogContainer.style.width = '100vw';
                dialogContainer.style.height = '100vh';
                dialogContainer.style.setProperty('border-radius', '0', 'important');
            } else {
                // 复习界面：设置 maxWidth 以确保圆角样式生效
                dialogContainer.style.maxWidth = '1024px';
                // 强制设置圆角（使用具体像素值，不使用 CSS 变量）
                dialogContainer.style.setProperty('border-radius', '12px', 'important');
            }
        }

        // 同时设置 data-key 到容器上，让圆角样式选择器能匹配
        if (options.dataKey) {
            dialogContainer.setAttribute('data-key', options.dataKey);
        }
    }

    // 设置遮罩层背景色（白色半透明）
    if (options.transparent) {
        const scrim = dialog.element.querySelector('.b3-dialog__scrim') as HTMLElement;
        if (scrim) {
            scrim.style.backgroundColor = 'var(--b3-theme-surface)';
        }
    }

    // 立即挂载 Vue 组件
    const container = dialog.element.querySelector(`#${containerId}`) as HTMLElement | null;
    if (container) {
        app.mount(container);

        // 聚焦对话框内容，像思原生一样遮挡思源编辑器
        setTimeout(() => {
            // ✅ 尝试聚焦到顶栏按钮（类似原生复习界面的实现）
            const focusElement = dialog.element.querySelector('.block__icons button.block__icon, .block__icons .block__icon') as HTMLElement;
            if (focusElement) {
                focusElement.focus();
                // 创建选区以触发聚焦模式
                try {
                    const range = document.createRange();
                    range.selectNodeContents(focusElement);
                    range.collapse();
                    const selection = window.getSelection();
                    if (selection) {
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                } catch (e) {
                    logger.warn('Range selection error', e);
                }
            } else {
                // 如果没有按钮，聚焦到容器
                container.focus({ preventScroll: true });
            }
        }, 100);

        // 如果设置了 dataKey，需要在 dialog.element.firstElementChild 上监听思源热键系统的 CustomEvent
        // 并转发到 Vue 组件
        if (options.dataKey && dialog.element.firstElementChild) {
            const forwardEvent = (event: Event) => {
                const sourceEvent = event as CustomEventLike;
                // 检查是否是来自思源热键系统的 CustomEvent
                if (typeof sourceEvent.detail === 'string') {
                    // 防止无限递归：如果事件已经是我们转发的，不再处理
                    if (sourceEvent._fsrsForwarded) {
                        return;
                    }

                    // 创建一个新的点击事件，detail 保持不变，让 Vue 组件处理
                    const forwardedEvent = new MouseEvent('click', {
                        bubbles: false,  // 关键修改：不冒泡，避免触发 firstElementChild 的监听器
                        cancelable: true,
                    });
                    Object.defineProperty(forwardedEvent, 'detail', {
                        value: sourceEvent.detail,
                        writable: false,
                    });
                    // 标记为已转发，防止二次处理
                    Object.defineProperty(forwardedEvent, '_fsrsForwarded', {
                        value: true,
                        writable: false,
                    });
                    // 转发到 Vue 组件根元素
                    const vueRoot = container.firstElementChild as HTMLElement;
                    if (vueRoot) {
                        vueRoot.dispatchEvent(forwardedEvent);
                    }
                }
            };

            dialog.element.firstElementChild.addEventListener('click', forwardEvent);
        }
    } else {
        logger.error('Container not found', { containerId });
    }

    return {
        dialog,
        destroy: () => {
            try {
                app.unmount();
            } catch (e) {
                logger.warn('Unmount error', e);
            }
            dialog.destroy();
        },
    };
}

/**
 * 创建简单的确认对话框
 */
export function confirmDialog(options: {
    title: string;
    content: string;
    confirmText?: string;
    cancelText?: string;
}): Promise<boolean> {
    return new Promise((resolve) => {
        const dialog = new Dialog({
            title: options.title,
            content: `
        <div class="b3-dialog__content">
          <div class="ft__breakword">${options.content}</div>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel">${options.cancelText || 'Cancel'}</button>
          <div class="fn__space"></div>
          <button class="b3-button b3-button--text">${options.confirmText || 'Confirm'}</button>
        </div>
      `,
            width: '400px',
        });

        const buttons = dialog.element.querySelectorAll('.b3-button');
        buttons[0].addEventListener('click', () => {
            dialog.destroy();
            resolve(false);
        });
        buttons[1].addEventListener('click', () => {
            dialog.destroy();
            resolve(true);
        });
    });
}

/**
 * 创建输入对话框
 */
export function inputDialog(options: {
    title: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
}): Promise<string | null> {
    return new Promise((resolve) => {
        const inputId = `fsrs-input-${Date.now()}`;

        const dialog = new Dialog({
            title: options.title,
            content: `
        <div class="b3-dialog__content">
          <input 
            id="${inputId}"
            class="b3-text-field fn__block" 
            placeholder="${options.placeholder || ''}"
            value="${options.defaultValue || ''}"
          />
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel">${options.cancelText || 'Cancel'}</button>
          <div class="fn__space"></div>
          <button class="b3-button b3-button--text">${options.confirmText || 'Confirm'}</button>
        </div>
      `,
            width: '400px',
        });

        const input = dialog.element.querySelector(`#${inputId}`) as HTMLInputElement;
        const buttons = dialog.element.querySelectorAll('.b3-button');

        buttons[0].addEventListener('click', () => {
            dialog.destroy();
            resolve(null);
        });
        buttons[1].addEventListener('click', () => {
            dialog.destroy();
            resolve(input.value);
        });

        // Enter 键确认
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                dialog.destroy();
                resolve(input.value);
            }
        });

        // 自动聚焦
        setTimeout(() => input.focus(), 100);
    });
}
