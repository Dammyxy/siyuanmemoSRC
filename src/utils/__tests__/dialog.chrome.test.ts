// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeDialogOptions = {
  content?: string;
  title?: string;
  destroyCallback?: () => void;
};

const { fakeDialogs, FakeDialog } = vi.hoisted(() => {
  class FakeDialog {
    public readonly element: HTMLElement;
    public destroyed = false;

    constructor(public readonly options: FakeDialogOptions) {
      this.element = document.createElement('div');
      this.element.innerHTML = `
        <div class="b3-dialog__scrim"></div>
        <div class="b3-dialog__container">
          <div class="b3-dialog__header">${options.title || ''}</div>
          ${options.content || ''}
        </div>
      `;
      fakeDialogs.push(this);
    }

    destroy(): void {
      this.destroyed = true;
      this.options.destroyCallback?.();
    }
  }

  const fakeDialogs: FakeDialog[] = [];
  return { fakeDialogs, FakeDialog };
});

vi.mock('siyuan', () => ({
  Dialog: FakeDialog,
}));

describe('dialog chrome helpers', () => {
  beforeEach(() => {
    fakeDialogs.length = 0;
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('normalizes class input and decorates existing dialog chrome', async () => {
    const { applyDialogChrome, normalizeDialogClassList } = await import('../dialog');
    const dialog = new FakeDialog({
      content: '<div class="siyuanmemo-dialog-root"></div>',
    });

    expect(normalizeDialogClassList([' one two ', 'two', 'three'])).toEqual(['one', 'two', 'three']);

    applyDialogChrome(dialog as never, {
      visualVariant: 'manager',
      containerClass: 'custom-shell another-shell',
      contentClass: ['custom-content'],
      dataKey: 'memo-dialog',
      transparent: true,
      dialogWidth: '100vw',
      dialogHeight: '100vh',
    });

    const container = dialog.element.querySelector('.b3-dialog__container') as HTMLElement;
    const scrim = dialog.element.querySelector('.b3-dialog__scrim') as HTMLElement;
    const content = dialog.element.querySelector('.siyuanmemo-dialog-root') as HTMLElement;

    expect(container.classList.contains('siyuanmemo-dialog-shell')).toBe(true);
    expect(container.classList.contains('siyuanmemo-dialog-shell--manager')).toBe(true);
    expect(container.classList.contains('custom-shell')).toBe(true);
    expect(container.getAttribute('data-key')).toBe('memo-dialog');
    expect(scrim.classList.contains('siyuanmemo-dialog-scrim')).toBe(true);
    expect(scrim.classList.contains('siyuanmemo-dialog-scrim--transparent')).toBe(true);
    expect(content.classList.contains('custom-content')).toBe(true);
    expect(container.style.width).toBe('100vw');
  });

  it('uses the shared shell for confirm and input dialogs', async () => {
    const { confirmDialog, inputDialog } = await import('../dialog');

    const confirmPromise = confirmDialog({
      title: 'Confirm',
      content: 'Proceed?',
      confirmText: 'Yes',
      cancelText: 'No',
    });
    const confirmDialogInstance = fakeDialogs[0]!;
    expect(confirmDialogInstance.element.querySelector('.b3-dialog__container')?.classList.contains('siyuanmemo-dialog-shell')).toBe(true);
    expect(confirmDialogInstance.element.querySelector('.siyuanmemo-simple-dialog')).not.toBeNull();
    confirmDialogInstance.element.querySelectorAll('button')[1]!.dispatchEvent(new MouseEvent('click'));
    await expect(confirmPromise).resolves.toBe(true);
    expect(confirmDialogInstance.destroyed).toBe(true);

    const inputPromise = inputDialog({
      title: 'Name',
      defaultValue: 'Preset',
      confirmText: 'OK',
      cancelText: 'Cancel',
    });
    const inputDialogInstance = fakeDialogs[1]!;
    const input = inputDialogInstance.element.querySelector('input') as HTMLInputElement;
    expect(inputDialogInstance.element.querySelector('.b3-dialog__container')?.classList.contains('siyuanmemo-input-dialog-container')).toBe(true);
    input.value = 'Custom preset';
    inputDialogInstance.element.querySelectorAll('button')[1]!.dispatchEvent(new MouseEvent('click'));
    await expect(inputPromise).resolves.toBe('Custom preset');
    expect(inputDialogInstance.destroyed).toBe(true);
  });

  it('marks review dialogs with a focused scrim variant', async () => {
    const { applyDialogChrome } = await import('../dialog');
    const dialog = new FakeDialog({
      content: '<div class="siyuanmemo-dialog-root"></div>',
    });

    applyDialogChrome(dialog as never, {
      scrimVariant: 'review-focus',
    });

    const scrim = dialog.element.querySelector('.b3-dialog__scrim') as HTMLElement;

    expect(scrim.classList.contains('siyuanmemo-dialog-scrim')).toBe(true);
    expect(scrim.classList.contains('siyuanmemo-dialog-scrim--review-focus')).toBe(true);
    expect(scrim.classList.contains('siyuanmemo-dialog-scrim--transparent')).toBe(false);
  });
});
