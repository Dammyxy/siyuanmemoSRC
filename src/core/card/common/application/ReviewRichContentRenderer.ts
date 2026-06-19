import {
  renderReviewMarkdown,
  type ReviewMarkdownRenderOptions,
} from './reviewMarkdownRender';
import type {
  RichContentAtom,
  RichContentAtomKind,
  RichContentDiagnostic,
  RichContentResult,
  RichContentSourceMeta,
} from './richContent';

export interface ReviewRichContentRenderOptions {
  sourceId?: string;
  sourceKind?: RichContentSourceMeta['kind'];
  kind?: RichContentSourceMeta['kind'];
  field?: string;
  forceRenderKind?: ReviewMarkdownRenderOptions['forceRenderKind'];
  preferSpinBlockDOM?: boolean;
}

export interface ReviewRichContentMarkdownAdapter {
  renderMarkdown?: (
    markdown: string,
    options?: ReviewMarkdownRenderOptions,
  ) => {
    html: string;
    renderKind: RichContentResult['renderKind'];
    normalizedKramdown: string;
  };
}

const BLOCK_REF_SELECTOR = '[data-type~="block-ref"][data-id]';
const BLOCK_REF_KRAMDOWN_RE = /\(\(([0-9]{14}-[a-z0-9]{7})(?:\s+["']([^"']*)["'])?\)\)/giu;
const MARKDOWN_LINK_RE = /!?\[([^\]\n]*)\]\(([^)\s]+)\)/giu;
const MATH_RE = /\$\$[\s\S]+?\$\$|\$(?!\$)[^$\n]+?\$/gu;
const FENCED_CODE_RE = /```([^\n`]*)\n[\s\S]*?```/gu;

function escapeHtml(source: string): string {
  return String(source || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nextAtomId(kind: RichContentAtomKind, index: number): string {
  return `${kind}-${index + 1}`;
}

function isImageTarget(target: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:[?#].*)?$/iu.test(target);
}

function isAudioTarget(target: string): boolean {
  return /\.(?:mp3|wav|ogg|m4a|aac|flac|opus)(?:[?#].*)?$/iu.test(target);
}

function isVideoTarget(target: string): boolean {
  return /\.(?:mp4|webm|mov|mkv|avi)(?:[?#].*)?$/iu.test(target);
}

function isPdfTarget(target: string): boolean {
  return /\.pdf(?:[?#].*)?$/iu.test(target);
}

function isAssetTarget(target: string): boolean {
  return /^(?:\.{0,2}\/)?assets\//iu.test(target) || /^\/assets\//iu.test(target);
}

function isExternalTarget(target: string): boolean {
  return /^https?:\/\//iu.test(target);
}

function isSiyuanBlockTarget(target: string): boolean {
  return /^siyuan:\/\/blocks\/[^/?#]+/iu.test(target);
}

function isAllowedDataUri(target: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml|bmp|avif);base64,/iu.test(target);
}

function isAllowedHref(target: string): boolean {
  const normalized = target.trim();
  if (!normalized) {
    return false;
  }
  return isSiyuanBlockTarget(normalized)
    || isExternalTarget(normalized)
    || isAssetTarget(normalized)
    || isAllowedDataUri(normalized);
}

function classifyTarget(target: string, isImageSyntax = false): RichContentAtomKind {
  if (isSiyuanBlockTarget(target)) {
    return 'siyuan-link';
  }
  if (isExternalTarget(target)) {
    return 'external-link';
  }
  if (isImageSyntax || isImageTarget(target) || isAllowedDataUri(target)) {
    return 'image';
  }
  if (isAudioTarget(target)) {
    return 'audio';
  }
  if (isVideoTarget(target)) {
    return 'video';
  }
  if (isPdfTarget(target)) {
    return 'pdf';
  }
  if (isAssetTarget(target)) {
    return 'asset';
  }
  return 'file';
}

function readHref(element: Element): string {
  return (element.getAttribute('href') || element.getAttribute('data-href') || element.getAttribute('src') || '').trim();
}

function buildAtom(
  kind: RichContentAtomKind,
  index: number,
  target?: string,
  label?: string,
  extra?: Partial<RichContentAtom>,
): RichContentAtom {
  return {
    id: nextAtomId(kind, index),
    kind,
    target,
    label,
    ...extra,
  };
}

function sanitizeHtml(html: string): { html: string; diagnostics: RichContentDiagnostic[] } {
  const diagnostics: RichContentDiagnostic[] = [];
  const template = document.createElement('template');
  template.innerHTML = String(html || '');

  template.content.querySelectorAll('script, style, template').forEach((element) => {
    diagnostics.push({
      code: 'unsafe-element-removed',
      severity: 'warning',
      message: `Removed unsafe <${element.tagName.toLowerCase()}> element`,
    });
    element.remove();
  });

  expandInlineMarkdownInHtmlFragment(template.content);

  template.content.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith('on')) {
        diagnostics.push({
          code: 'unsafe-attribute-removed',
          severity: 'warning',
          message: `Removed unsafe ${attr.name} attribute`,
        });
        element.removeAttribute(attr.name);
        continue;
      }

      if ((name === 'href' || name === 'data-href' || name === 'src') && value.trim().length > 0 && !isAllowedHref(value)) {
        diagnostics.push({
          code: 'unsafe-link-disabled',
          severity: 'warning',
          message: 'Disabled unsafe rich-content target',
          target: value,
        });
        element.removeAttribute(attr.name);
      }
    }
  });

  return {
    html: template.innerHTML,
    diagnostics,
  };
}

function shouldSkipInlineMarkdownExpansion(parent: Element | null): boolean {
  return Boolean(parent?.closest('a, pre, code, textarea, math, .katex, [data-type~="block-ref"], [data-type~="a"]'));
}

function appendInlineMarkdownFragment(fragment: DocumentFragment, source: string): void {
  const tokenPattern = /\[([^\]\n]*)\]\(([^)\s]+)\)|\(\(([0-9]{14}-[a-z0-9]{7})(?:\s+["']([^"']*)["'])?\)\)/giu;
  let cursor = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      fragment.appendChild(document.createTextNode(source.slice(cursor, start)));
    }

    const markdownLabel = match[1];
    const markdownHref = match[2];
    const blockId = match[3];
    const blockLabel = match[4];

    if (typeof markdownLabel === 'string' && typeof markdownHref === 'string') {
      const href = markdownHref.trim();
      if (isAllowedHref(href)) {
        const anchor = document.createElement('a');
        anchor.setAttribute('href', href);
        anchor.textContent = markdownLabel || href;
        fragment.appendChild(anchor);
      } else {
        fragment.appendChild(document.createTextNode(match[0]));
      }
    } else if (typeof blockId === 'string') {
      const blockRef = document.createElement('span');
      blockRef.dataset.type = 'block-ref';
      blockRef.dataset.id = blockId;
      blockRef.textContent = typeof blockLabel === 'string' && blockLabel.trim().length > 0
        ? blockLabel.trim()
        : '*';
      fragment.appendChild(blockRef);
    } else {
      fragment.appendChild(document.createTextNode(match[0]));
    }

    cursor = start + match[0].length;
  }

  if (cursor < source.length) {
    fragment.appendChild(document.createTextNode(source.slice(cursor)));
  }
}

function expandInlineMarkdownInHtmlFragment(root: DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const source = textNode.textContent || '';
    if (!source.includes('](') && !source.includes('((')) {
      continue;
    }
    if (shouldSkipInlineMarkdownExpansion(textNode.parentElement)) {
      continue;
    }
    textNodes.push(textNode);
  }

  for (const textNode of textNodes) {
    const source = textNode.textContent || '';
    const fragment = document.createDocumentFragment();
    appendInlineMarkdownFragment(fragment, source);
    if (fragment.childNodes.length > 0) {
      textNode.replaceWith(fragment);
    }
  }
}

function extractAtomsFromMarkdown(markdown: string): RichContentAtom[] {
  const atoms: RichContentAtom[] = [];

  for (const match of markdown.matchAll(BLOCK_REF_KRAMDOWN_RE)) {
    atoms.push(buildAtom('block-ref', atoms.length, match[1], match[2] || '*', {
      source: 'markdown',
    }));
  }

  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const full = match[0] || '';
    const isImageSyntax = full.startsWith('!');
    const target = (match[2] || '').trim();
    if (!target || !isAllowedHref(target)) {
      continue;
    }
    atoms.push(buildAtom(classifyTarget(target, isImageSyntax), atoms.length, target, match[1] || target, {
      source: 'markdown',
    }));
  }

  for (const _match of markdown.matchAll(MATH_RE)) {
    atoms.push(buildAtom('math', atoms.length, undefined, undefined, {
      source: 'markdown',
    }));
  }

  for (const match of markdown.matchAll(FENCED_CODE_RE)) {
    atoms.push(buildAtom('code', atoms.length, undefined, undefined, {
      language: (match[1] || '').trim(),
      source: 'markdown',
    }));
  }

  return atoms;
}

function extractDiagnosticsFromMarkdown(markdown: string): RichContentDiagnostic[] {
  const diagnostics: RichContentDiagnostic[] = [];
  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const target = (match[2] || '').trim();
    if (!target || isAllowedHref(target)) {
      continue;
    }
    diagnostics.push({
      code: 'unsafe-link-disabled',
      severity: 'warning',
      message: 'Disabled unsafe rich-content target',
      target,
    });
  }
  return diagnostics;
}

function extractAtomsFromHtml(html: string): RichContentAtom[] {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const atoms: RichContentAtom[] = [];

  template.content.querySelectorAll(BLOCK_REF_SELECTOR).forEach((element) => {
    atoms.push(buildAtom('block-ref', atoms.length, element.getAttribute('data-id') || '', element.textContent?.trim() || '*', {
      source: 'html',
    }));
  });

  template.content.querySelectorAll('a[href], [data-type~="a"][data-href], [data-href], img[src], audio[src], video[src], source[src]').forEach((element) => {
    const target = readHref(element);
    if (!target) {
      return;
    }
    const tagName = element.tagName.toLowerCase();
    const isImageSyntax = tagName === 'img';
    const kind = tagName === 'audio' || element.closest('audio')
      ? 'audio'
      : tagName === 'video' || element.closest('video')
        ? 'video'
        : classifyTarget(target, isImageSyntax);
    atoms.push(buildAtom(kind, atoms.length, target, element.textContent?.trim() || element.getAttribute('alt') || target, {
      source: 'html',
    }));
  });

  template.content.querySelectorAll('.katex, .rich-markdown__math-inline, .rich-markdown__math-block').forEach(() => {
    atoms.push(buildAtom('math', atoms.length, undefined, undefined, {
      source: 'html',
    }));
  });

  template.content.querySelectorAll('pre code, code[class*="language-"]').forEach((element) => {
    const languageClass = Array.from(element.classList).find(className => className.startsWith('language-')) || '';
    atoms.push(buildAtom('code', atoms.length, undefined, undefined, {
      language: languageClass.replace(/^language-/, ''),
      source: 'html',
    }));
  });

  return atoms;
}

function mergeAtoms(primary: RichContentAtom[], secondary: RichContentAtom[]): RichContentAtom[] {
  const seen = new Set<string>();
  const result: RichContentAtom[] = [];

  for (const atom of [...primary, ...secondary]) {
    const key = `${atom.kind}:${atom.target || ''}:${atom.label || ''}:${atom.language || ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      ...atom,
      id: nextAtomId(atom.kind, result.length),
    });
  }

  return result;
}

export class ReviewRichContentRenderer {
  constructor(private readonly adapter: ReviewRichContentMarkdownAdapter = {}) {}

  renderMarkdown(markdown: string, options: ReviewRichContentRenderOptions): RichContentResult {
    const source: RichContentSourceMeta = {
      id: options.sourceId,
      kind: options.sourceKind ?? options.kind,
      field: options.field,
    } as RichContentSourceMeta;
    const sourceText = String(markdown || '');

    try {
      const rendered = this.adapter.renderMarkdown
        ? this.adapter.renderMarkdown(sourceText, {
            forceRenderKind: options.forceRenderKind,
            preferSpinBlockDOM: options.preferSpinBlockDOM,
          })
        : renderReviewMarkdown(sourceText, {
            forceRenderKind: options.forceRenderKind,
            preferSpinBlockDOM: options.preferSpinBlockDOM,
          });
      const sanitized = sanitizeHtml(rendered.html);
      const atoms = mergeAtoms(
        extractAtomsFromMarkdown(sourceText),
        extractAtomsFromHtml(sanitized.html),
      );

      return {
        html: sanitized.html,
        atoms,
        diagnostics: [
          ...extractDiagnosticsFromMarkdown(sourceText),
          ...sanitized.diagnostics,
        ],
        source,
        renderKind: rendered.renderKind,
      };
    } catch (error) {
      const fallback = `<pre class="review-rich-content__render-fallback">${escapeHtml(sourceText)}</pre>`;
      return {
        html: fallback,
        atoms: extractAtomsFromMarkdown(sourceText),
        diagnostics: [{
          code: 'render-failed',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        }],
        source,
        renderKind: options.forceRenderKind ?? 'block-flow',
      };
    }
  }

  renderHtml(html: string, options: RichContentSourceMeta): RichContentResult {
    const sanitized = sanitizeHtml(html);
    return {
      html: sanitized.html,
      atoms: extractAtomsFromHtml(sanitized.html),
      diagnostics: sanitized.diagnostics,
      source: options,
      renderKind: 'html',
    };
  }
}
