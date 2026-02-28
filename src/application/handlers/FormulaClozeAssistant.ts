import { showMessage } from 'siyuan';
import type FSRSPlugin from '@/index';
import { createLogger } from '@/utils/logger';

type SupportedEditable = HTMLTextAreaElement | HTMLInputElement | HTMLElement;
type ClozeInsertMode = 'new' | 'reuse';

const logger = createLogger('FormulaClozeAssistant');
const FORMULA_MARKER_REGEX = /(latex|katex|math|\u516c\u5f0f)/i;

function isTextInputLike(element: Element): element is HTMLTextAreaElement | HTMLInputElement {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && element.type === 'text';
}

export class FormulaClozeAssistant {
  private readonly toolbars = new Map<SupportedEditable, HTMLElement>();
  private observer: MutationObserver | null = null;
  private started = false;
  private lastUsedClozeId = 0;

  constructor(private readonly plugin: FSRSPlugin) {}

  start(): void {
    if (this.started) return;
    this.started = true;

    document.addEventListener('keydown', this.handleKeyDown, true);

    this.observer = new MutationObserver(() => {
      this.syncToolbars();
    });
    if (!document.body) {
      document.removeEventListener('keydown', this.handleKeyDown, true);
      this.observer.disconnect();
      this.observer = null;
      this.started = false;
      window.setTimeout(() => this.start(), 60);
      return;
    }
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.syncToolbars();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    document.removeEventListener('keydown', this.handleKeyDown, true);
    this.observer?.disconnect();
    this.observer = null;

    for (const toolbar of this.toolbars.values()) {
      toolbar.remove();
    }
    this.toolbars.clear();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const mode: ClozeInsertMode | null = key === 'z' ? 'new' : key === 'c' ? 'reuse' : null;
    if (!mode) {
      return;
    }

    const editable = this.getActiveFormulaEditable();
    if (!editable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.insertCloze(editable, mode);
  };

  private syncToolbars(): void {
    // Remove stale toolbar nodes first.
    for (const [editable, toolbar] of this.toolbars.entries()) {
      if (!document.contains(editable) || !this.isLikelyFormulaEditor(editable)) {
        toolbar.remove();
        this.toolbars.delete(editable);
      }
    }

    const candidates = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
    candidates.forEach((candidate) => {
      const editable = candidate as SupportedEditable;
      if (!this.isLikelyFormulaEditor(editable)) {
        return;
      }
      if (this.toolbars.has(editable)) {
        return;
      }

      const toolbar = this.createToolbar(editable);
      this.mountToolbar(editable, toolbar);
      this.toolbars.set(editable, toolbar);
    });
  }

  private createToolbar(editable: SupportedEditable): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'siyuanmemo-formula-cloze-toolbar fn__flex';

    const createButton = document.createElement('button');
    createButton.className = 'b3-button b3-button--outline fn__flex-center';
    createButton.type = 'button';
    createButton.textContent = this.t('formulaClozeCreate', 'Create Cloze');
    createButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.insertCloze(editable, 'new');
    });

    const reuseButton = document.createElement('button');
    reuseButton.className = 'b3-button b3-button--outline fn__flex-center';
    reuseButton.type = 'button';
    reuseButton.textContent = this.t('formulaClozeReuse', 'Reuse Cloze');
    reuseButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.insertCloze(editable, 'reuse');
    });

    toolbar.appendChild(createButton);
    toolbar.appendChild(reuseButton);
    return toolbar;
  }

  private mountToolbar(editable: SupportedEditable, toolbar: HTMLElement): void {
    const host = editable.closest('.protyle-util, .b3-dialog__content, .protyle-wysiwyg') as HTMLElement | null;
    if (!host) {
      editable.parentElement?.appendChild(toolbar);
      return;
    }

    const rowLike = editable.closest('.fn__flex, .b3-label, .protyle-util__row') as HTMLElement | null;
    if (rowLike?.parentElement) {
      rowLike.insertAdjacentElement('afterend', toolbar);
      return;
    }

    host.appendChild(toolbar);
  }

  private getActiveFormulaEditable(): SupportedEditable | null {
    const activeElement = document.activeElement;
    if (!activeElement) return null;
    if (this.isLikelyFormulaEditor(activeElement)) {
      return activeElement as SupportedEditable;
    }

    const fallback = activeElement.querySelector?.('textarea, input[type="text"], [contenteditable="true"]');
    if (fallback && this.isLikelyFormulaEditor(fallback)) {
      return fallback as SupportedEditable;
    }
    return null;
  }

  private isLikelyFormulaEditor(element: Element): boolean {
    if (!(isTextInputLike(element) || (element instanceof HTMLElement && element.isContentEditable))) {
      return false;
    }

    const placeholder = isTextInputLike(element) ? (element.placeholder || '') : '';
    if (FORMULA_MARKER_REGEX.test(placeholder)) {
      return true;
    }

    const container = element.closest('.protyle-util, .b3-dialog, .b3-dialog__container, .protyle');
    if (!container) {
      return false;
    }

    if (container.querySelector('use[href="#iconMath"], use[xlink\\:href="#iconMath"]')) {
      return true;
    }

    const markerText = (container.textContent || '').slice(0, 256);
    return FORMULA_MARKER_REGEX.test(markerText);
  }

  private insertCloze(editable: SupportedEditable, mode: ClozeInsertMode): void {
    try {
      if (isTextInputLike(editable)) {
        this.insertToTextInput(editable, mode);
        return;
      }

      if (editable instanceof HTMLElement && editable.isContentEditable) {
        this.insertToContentEditable(editable, mode);
      }
    } catch (error) {
      logger.error('Failed to insert formula cloze:', error);
      showMessage(this.t('formulaClozeInsertFailed', 'Failed to insert formula cloze'));
    }
  }

  private insertToTextInput(editable: HTMLTextAreaElement | HTMLInputElement, mode: ClozeInsertMode): void {
    editable.focus();
    const value = editable.value || '';
    const start = editable.selectionStart ?? value.length;
    const end = editable.selectionEnd ?? start;
    const selectedText = value.slice(start, end);

    const clozeId = this.resolveClozeId(mode, value);
    const replacement = this.buildClozeToken(clozeId, selectedText);

    editable.setRangeText(replacement, start, end, 'end');
    const insertStart = start;
    const cursorOffset = selectedText.length > 0 ? replacement.length : replacement.length - 1;
    const caretPosition = insertStart + Math.max(0, cursorOffset);
    editable.setSelectionRange(caretPosition, caretPosition);
    editable.dispatchEvent(new Event('input', { bubbles: true }));

    this.reportInsert(clozeId, mode);
  }

  private insertToContentEditable(editable: HTMLElement, mode: ClozeInsertMode): void {
    editable.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editable.contains(range.commonAncestorContainer)) {
      return;
    }

    const textBeforeInsert = editable.textContent || '';
    const selectedText = range.toString();
    const clozeId = this.resolveClozeId(mode, textBeforeInsert);
    const replacement = this.buildClozeToken(clozeId, selectedText);

    range.deleteContents();
    const textNode = document.createTextNode(replacement);
    range.insertNode(textNode);

    const newRange = document.createRange();
    const cursorOffset = selectedText.length > 0 ? replacement.length : replacement.length - 1;
    newRange.setStart(textNode, Math.max(0, cursorOffset));
    newRange.collapse(true);

    selection.removeAllRanges();
    selection.addRange(newRange);
    editable.dispatchEvent(new Event('input', { bubbles: true }));

    this.reportInsert(clozeId, mode);
  }

  private reportInsert(clozeId: number, mode: ClozeInsertMode): void {
    const template = mode === 'new'
      ? this.t('formulaClozeCreated', 'Created cloze group c{id}')
      : this.t('formulaClozeReused', 'Reused cloze group c{id}');
    showMessage(template.replace('{id}', String(clozeId)));
  }

  private resolveClozeId(mode: ClozeInsertMode, sourceText: string): number {
    const maxInText = this.extractMaxClozeId(sourceText);
    if (mode === 'new') {
      const next = Math.max(this.lastUsedClozeId, maxInText) + 1;
      this.lastUsedClozeId = next;
      return next;
    }

    const resolved = this.lastUsedClozeId > 0
      ? this.lastUsedClozeId
      : maxInText > 0
        ? maxInText
        : 1;
    this.lastUsedClozeId = resolved;
    return resolved;
  }

  private extractMaxClozeId(content: string): number {
    if (!content) return 0;
    const matcher = /\\cloze\{c(\d+)\}\{/g;
    let max = 0;
    for (const match of content.matchAll(matcher)) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > max) {
        max = parsed;
      }
    }
    return max;
  }

  private buildClozeToken(clozeId: number, selectedText: string): string {
    const content = selectedText || '';
    return `\\cloze{c${clozeId}}{${content}}`;
  }

  private t(key: string, fallback: string): string {
    const value = (this.plugin.i18n as Record<string, string> | undefined)?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return fallback;
  }
}

