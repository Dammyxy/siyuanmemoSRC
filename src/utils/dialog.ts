/**
 * Dialog Helper
 * 封装思源 Dialog API，方便在 Vue 组件中使用
 */

import { Dialog } from 'siyuan';
import { createApp, type Component } from 'vue';

/**
 * 创建一个 Vue 组件的 Dialog
 */
export function createVueDialog<T extends Component>(options: {
    title: string;
    component: T;
    props?: Record<string, any>;
    events?: Record<string, (...args: any[]) => void>;
    width?: string;
    height?: string;
    onClose?: () => void;
    dataKey?: string; // 添加 dataKey 选项，用于思源热键系统识别
}): { dialog: Dialog; destroy: () => void } {
    const containerId = `fsrs-dialog-${Date.now()}`;

    // 将 events 转换为 onXxx 格式的 props
    const eventProps: Record<string, any> = {};
    if (options.events) {
        for (const [key, handler] of Object.entries(options.events)) {
            // Vue 3 的 emit 会自动将 'save' 转换为 'onSave'
            const propKey = `on${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            eventProps[propKey] = handler;
        }
    }

    // 创建 Vue 应用
    const app = createApp(options.component, {
        ...options.props,
        ...eventProps,
    });

    const dialog = new Dialog({
        title: options.title,
        content: `<div id="${containerId}" class="fn__flex-column" style="height: 100%; width: 100%; overflow: hidden;"></div>`,
        width: options.width || '700px',
        height: options.height || '500px',
        destroyCallback: () => {
            // 销毁 Vue 应用
            try {
                app.unmount();
            } catch (e) {
                console.warn('[FSRS] Unmount error:', e);
            }
            options.onClose?.();
        },
    });

    // 设置 data-key 属性，让思源热键系统能够识别这个对话框
    if (options.dataKey) {
        dialog.element.setAttribute('data-key', options.dataKey);
        console.log('[FSRS Dialog] Set data-key attribute:', {
            dataKey: options.dataKey,
            element: dialog.element,
            hasAttribute: dialog.element.hasAttribute('data-key'),
            attributeValue: dialog.element.getAttribute('data-key'),
        });
    }

    // 立即挂载 Vue 组件
    const container = dialog.element.querySelector(`#${containerId}`);
    if (container) {
        app.mount(container);
        console.log('[FSRS] Vue component mounted to:', containerId);

        // 如果设置了 dataKey，需要在 dialog.element.firstElementChild 上监听思源热键系统的 CustomEvent
        // 并转发到 Vue 组件
        if (options.dataKey && dialog.element.firstElementChild) {
            const forwardEvent = (event: Event) => {
                // 检查是否是来自思源热键系统的 CustomEvent
                if ('detail' in event && typeof (event as any).detail === 'string') {
                    console.log('[FSRS Dialog] Forwarding hotkey event to Vue component:', (event as any).detail);
                    // 创建一个新的点击事件，detail 保持不变，让 Vue 组件处理
                    const forwardedEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                    });
                    Object.defineProperty(forwardedEvent, 'detail', {
                        value: (event as any).detail,
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
            console.log('[FSRS Dialog] Hotkey event listener attached to firstElementChild');
        }
    } else {
        console.error('[FSRS] Container not found:', containerId);
    }

    return {
        dialog,
        destroy: () => {
            try {
                app.unmount();
            } catch (e) {
                console.warn('[FSRS] Unmount error:', e);
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
