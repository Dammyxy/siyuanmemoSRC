export interface BlockContextResolverDeps {
  i18n: Record<string, string>;
  notify: (message: string) => void;
}

export interface BlockContextResolveInput {
  protyle?: unknown;
  nodeElement?: HTMLElement | null;
}

export interface BlockContextResolveResult {
  blockElements: HTMLElement[];
  source: 'selected' | 'node' | 'active' | 'selection';
}

export class BlockContextResolver {
  constructor(private readonly deps: BlockContextResolverDeps) {}

  resolve(input: BlockContextResolveInput): BlockContextResolveResult | null {
    const fromProtyleSelected = this.getSelectedElementsFromProtyle(input.protyle);
    if (fromProtyleSelected.length > 0) {
      return { blockElements: fromProtyleSelected, source: 'selected' };
    }

    const fromNode = this.normalizeBlockElement(input.nodeElement || null);
    if (fromNode) {
      return { blockElements: [fromNode], source: 'node' };
    }

    const fromProtyleBlock = this.getCurrentBlockFromProtyle(input.protyle);
    if (fromProtyleBlock) {
      return { blockElements: [fromProtyleBlock], source: 'active' };
    }

    const fromGlobalSelected = this.getSelectedElementsFromDocument();
    if (fromGlobalSelected.length > 0) {
      return { blockElements: fromGlobalSelected, source: 'selected' };
    }

    const fromActive = this.getCurrentBlockFromActiveElement();
    if (fromActive) {
      return { blockElements: [fromActive], source: 'active' };
    }

    const fromSelection = this.getCurrentBlockFromSelection();
    if (fromSelection) {
      return { blockElements: [fromSelection], source: 'selection' };
    }

    this.deps.notify(this.text('coreReviewNoBlockContext', '未找到块上下文，请先选中块或将光标放在块内'));
    return null;
  }

  private getSelectedElementsFromProtyle(protyle: unknown): HTMLElement[] {
    const root = this.getProtyleWysiwygElement(protyle);
    if (!root) {
      return [];
    }
    return this.extractSelectedElements(root);
  }

  private getSelectedElementsFromDocument(): HTMLElement[] {
    return this.normalizeUniqueBlockElements(
      Array.from(document.querySelectorAll<HTMLElement>('.protyle-wysiwyg--select')),
    );
  }

  private getCurrentBlockFromProtyle(protyle: unknown): HTMLElement | null {
    if (!protyle || typeof protyle !== 'object') {
      return null;
    }

    const blockId = this.normalizeNodeId(
      (protyle as { block?: { id?: string; rootID?: string; rootId?: string } }).block?.id
      ?? (protyle as { block?: { id?: string; rootID?: string; rootId?: string } }).block?.rootID
      ?? (protyle as { block?: { id?: string; rootID?: string; rootId?: string } }).block?.rootId,
    );

    if (!blockId) {
      return null;
    }

    const root = this.getProtyleWysiwygElement(protyle);
    if (root) {
      const escaped = this.escapeAttr(blockId);
      const inRoot = root.querySelector<HTMLElement>(`[data-node-id="${escaped}"]`);
      if (inRoot) {
        return inRoot;
      }
    }

    return document.querySelector<HTMLElement>(`[data-node-id="${this.escapeAttr(blockId)}"]`);
  }

  private getCurrentBlockFromActiveElement(): HTMLElement | null {
    const activeElement = document.activeElement as HTMLElement | null;
    return this.normalizeBlockElement(activeElement);
  }

  private getCurrentBlockFromSelection(): HTMLElement | null {
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    if (!anchorNode) {
      return null;
    }
    const nodeElement = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
    return this.normalizeBlockElement(nodeElement);
  }

  private getProtyleWysiwygElement(protyle: unknown): HTMLElement | null {
    if (!protyle || typeof protyle !== 'object') {
      return null;
    }

    const direct = (protyle as { wysiwyg?: { element?: HTMLElement } }).wysiwyg?.element;
    if (direct instanceof HTMLElement) {
      return direct;
    }

    const nested = (protyle as { protyle?: { wysiwyg?: { element?: HTMLElement } } }).protyle?.wysiwyg?.element;
    if (nested instanceof HTMLElement) {
      return nested;
    }

    return null;
  }

  private extractSelectedElements(root: HTMLElement): HTMLElement[] {
    const selected = Array.from(root.querySelectorAll<HTMLElement>('.protyle-wysiwyg--select'));
    return this.normalizeUniqueBlockElements(selected);
  }

  private normalizeUniqueBlockElements(elements: HTMLElement[]): HTMLElement[] {
    const blockElements: HTMLElement[] = [];
    const seen = new Set<string>();

    for (const element of elements) {
      const normalized = this.normalizeBlockElement(element);
      if (!normalized) {
        continue;
      }
      const blockId = normalized.getAttribute('data-node-id') || '';
      if (!blockId || seen.has(blockId)) {
        continue;
      }
      seen.add(blockId);
      blockElements.push(normalized);
    }

    return blockElements;
  }

  private normalizeBlockElement(element: HTMLElement | null): HTMLElement | null {
    if (!element) {
      return null;
    }
    const withNodeId = element.closest<HTMLElement>('[data-node-id]');
    if (!withNodeId) {
      return null;
    }
    const blockId = this.normalizeNodeId(withNodeId.getAttribute('data-node-id'));
    return blockId ? withNodeId : null;
  }

  private normalizeNodeId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private escapeAttr(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/"/g, '\\"');
  }

  private text(key: string, fallback: string): string {
    const value = this.deps.i18n?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
  }
}
