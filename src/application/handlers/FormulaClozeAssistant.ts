import { showMessage } from 'siyuan';
import type FSRSPlugin from '@/index';
import { createLogger } from '@/utils/logger';

type SupportedEditable = HTMLTextAreaElement | HTMLInputElement | HTMLElement;
type ClozeInsertMode = 'new' | 'reuse';
type KatexMacroMap = Record<string, string>;
type KatexRenderOptions = {
  macros?: Record<string, unknown> | string;
  [key: string]: unknown;
};
type KatexRenderFn = (expression: string, baseNode: HTMLElement, options?: KatexRenderOptions) => void;
type KatexRenderToStringFn = (expression: string, options?: KatexRenderOptions) => string;
type KatexLike = {
  render?: KatexRenderFn;
  renderToString?: KatexRenderToStringFn;
  __siyuanmemoClozeMacroPatched?: boolean;
};
type SiyuanConfigLike = {
  config?: {
    editor?: {
      katexMacros?: KatexMacroMap | string;
    };
  };
};

const logger = createLogger('FormulaClozeAssistant');
const FORMULA_MARKER_REGEX = /(latex|katex|math|\u516c\u5f0f)/i;
const KATEX_CLOZE_MACRO_KEY = '\\cloze';
const KATEX_CLOZE_MACRO_EXPANSION = '#2';
const KATEX_READY_RETRY_MS = 400;
const CLOZE_COMMAND = '\\cloze';

function isTextInputLike(element: Element): element is HTMLTextAreaElement | HTMLInputElement {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && element.type === 'text';
}

export class FormulaClozeAssistant {
  private started = false;
  private lastUsedClozeId = 0;
  private katexPatchTimer: number | null = null;

  constructor(private readonly plugin: FSRSPlugin) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.ensureKatexClozeMacro();
    document.addEventListener('keydown', this.handleKeyDown, true);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.katexPatchTimer !== null) {
      window.clearInterval(this.katexPatchTimer);
      this.katexPatchTimer = null;
    }
    document.removeEventListener('keydown', this.handleKeyDown, true);
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

  private ensureKatexClozeMacro(): void {
    const macroReady = this.ensureSiyuanKatexMacroConfig();
    const patchReady = this.patchKatexGlobal();
    if (macroReady && patchReady) {
      return;
    }

    if (this.katexPatchTimer !== null) {
      return;
    }

    this.katexPatchTimer = window.setInterval(() => {
      const macroReadyTick = this.ensureSiyuanKatexMacroConfig();
      const patchReadyTick = this.patchKatexGlobal();
      if (macroReadyTick && patchReadyTick) {
        if (this.katexPatchTimer !== null) {
          window.clearInterval(this.katexPatchTimer);
          this.katexPatchTimer = null;
        }
      }
    }, KATEX_READY_RETRY_MS);
  }

  private ensureSiyuanKatexMacroConfig(): boolean {
    const siyuan = (window as Window & { siyuan?: SiyuanConfigLike }).siyuan;
    const editorConfig = siyuan?.config?.editor;
    if (!editorConfig) {
      return false;
    }

    const rawMacros = editorConfig.katexMacros;
    const macros = this.normalizeKatexMacros(editorConfig.katexMacros);
    const currentMacro = macros[KATEX_CLOZE_MACRO_KEY];
    if (typeof currentMacro !== 'string' || currentMacro.trim() !== KATEX_CLOZE_MACRO_EXPANSION) {
      macros[KATEX_CLOZE_MACRO_KEY] = KATEX_CLOZE_MACRO_EXPANSION;
    }

    // Keep a deterministic JSON string to avoid Siyuan parsing `[object Object]` on reload.
    const serializedMacros = JSON.stringify(macros);
    if (typeof rawMacros !== 'string' || rawMacros.trim() !== serializedMacros) {
      editorConfig.katexMacros = serializedMacros;
    }
    return true;
  }

  private patchKatexGlobal(): boolean {
    const katex = (window as Window & { katex?: KatexLike }).katex;
    if (!katex) {
      return false;
    }
    if (katex.__siyuanmemoClozeMacroPatched) {
      return true;
    }

    const originalRender = katex.render;
    if (typeof originalRender === 'function') {
      const boundRender = originalRender.bind(katex);
      katex.render = ((expression: string, baseNode: HTMLElement, options?: KatexRenderOptions): void => {
        const normalizedExpression = this.normalizeFormulaClozeExpression(expression);
        boundRender(normalizedExpression, baseNode, options);
      }) as KatexRenderFn;
    }

    const originalRenderToString = katex.renderToString;
    if (typeof originalRenderToString === 'function') {
      const boundRenderToString = originalRenderToString.bind(katex);
      katex.renderToString = ((expression: string, options?: KatexRenderOptions): string => {
        const normalizedExpression = this.normalizeFormulaClozeExpression(expression);
        return boundRenderToString(normalizedExpression, options);
      }) as KatexRenderToStringFn;
    }

    katex.__siyuanmemoClozeMacroPatched = true;
    logger.info('KaTeX cloze render patch installed');
    return true;
  }

  private normalizeKatexMacros(rawMacros: unknown): KatexMacroMap {
    if (!rawMacros) {
      return {};
    }

    if (typeof rawMacros === 'string') {
      const trimmed = rawMacros.trim();
      if (!trimmed) {
        return {};
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === 'object') {
          return this.sanitizeKatexMacroMap(parsed as Record<string, unknown>);
        }
      } catch (error) {
        logger.warn('Invalid katex macro config, expected JSON string', error);
      }
      return {};
    }

    if (typeof rawMacros === 'object') {
      return this.sanitizeKatexMacroMap(rawMacros as Record<string, unknown>);
    }

    return {};
  }

  private normalizeFormulaClozeExpression(expression: string): string {
    if (!expression || !expression.includes(CLOZE_COMMAND)) {
      return expression;
    }

    let cursor = 0;
    let output = '';

    while (cursor < expression.length) {
      const commandStart = expression.indexOf(CLOZE_COMMAND, cursor);
      if (commandStart < 0) {
        output += expression.slice(cursor);
        break;
      }

      output += expression.slice(cursor, commandStart);
      const afterCommand = commandStart + CLOZE_COMMAND.length;

      const firstArg = this.parseBracedArgument(expression, afterCommand);
      if (!firstArg) {
        output += CLOZE_COMMAND;
        cursor = afterCommand;
        continue;
      }

      const secondArg = this.parseBracedArgument(expression, firstArg.nextIndex);
      if (secondArg) {
        output += `{${secondArg.content}}`;
        cursor = secondArg.nextIndex;
        continue;
      }

      // Fallback: support one-argument form \cloze{...}
      output += `{${firstArg.content}}`;
      cursor = firstArg.nextIndex;
    }

    return output;
  }

  private parseBracedArgument(source: string, fromIndex: number): { content: string; nextIndex: number } | null {
    let index = fromIndex;
    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }

    if (source[index] !== '{') {
      return null;
    }

    const contentStart = index + 1;
    let depth = 1;

    for (let i = contentStart; i < source.length; i += 1) {
      const char = source[i];
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === '{') {
        depth += 1;
        continue;
      }
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return {
            content: source.slice(contentStart, i),
            nextIndex: i + 1,
          };
        }
      }
    }

    return null;
  }

  private sanitizeKatexMacroMap(input: Record<string, unknown>): KatexMacroMap {
    const output: KatexMacroMap = {};
    for (const [key, value] of Object.entries(input)) {
      if (typeof value !== 'string') {
        continue;
      }
      const normalizedKey = key.trim();
      if (!normalizedKey) {
        continue;
      }
      output[normalizedKey] = value;
    }
    return output;
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

