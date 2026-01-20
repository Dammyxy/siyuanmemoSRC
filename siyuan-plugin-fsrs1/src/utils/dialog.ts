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
    width?: string;
    height?: string;
    onClose?: () => void;
}): { dialog: Dialog; destroy: () => void } {
    const containerId = `fsrs-dialog-${Date.now()}`;

    const dialog = new Dialog({
        title: options.title,
        content: `<div id="${containerId}" style="height: 100%; display: flex; flex-direction: column;"></div>`,
        width: options.width || '700px',
        height: options.height || '500px',
        destroyCallback: () => {
            // 销毁 Vue 应用
            if (app) {
                app.unmount();
            }
            options.onClose?.();
        },
    });

    // 挂载 Vue 组件
    const container = dialog.element.querySelector(`#${containerId}`);
    const app = createApp(options.component, {
        ...options.props,
        onClose: () => dialog.destroy(),
    });

    app.mount(container!);

    return {
        dialog,
        destroy: () => {
            app.unmount();
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
          <button class="b3-button b3-button--cancel">${options.cancelText || '取消'}</button>
          <div class="fn__space"></div>
          <button class="b3-button b3-button--text">${options.confirmText || '确认'}</button>
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
          <button class="b3-button b3-button--cancel">取消</button>
          <div class="fn__space"></div>
          <button class="b3-button b3-button--text">${options.confirmText || '确认'}</button>
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
