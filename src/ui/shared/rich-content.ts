import { Constants } from 'siyuan';

type WindowWithRichRuntime = Window & {
  Lute?: {
    New?: () => {
      Md2HTML?: (markdown: string) => string;
      Md2BlockDOM?: (markdown: string) => string;
    } | undefined;
  };
  hljs?: {
    highlightElement?: (element: Element) => void;
  };
  katex?: {
    renderToString?: (expression: string, options?: {
      displayMode?: boolean;
      throwOnError?: boolean;
      strict?: 'warn' | 'ignore' | ((errorCode: string) => 'warn' | 'ignore');
      trust?: boolean;
    }) => string;
  };
  mermaid?: {
    initialize?: (config: Record<string, unknown>) => void;
    render?: (id: string, code: string) => Promise<{ svg: string }>;
  };
  siyuan?: {
    config?: {
      appearance?: {
        mode?: number;
        codeBlockThemeLight?: string;
        codeBlockThemeDark?: string;
      };
    };
  };
};

const scriptPromises = new Map<string, Promise<void>>();
const stylePromises = new Map<string, Promise<void>>();

function getRuntimeWindow(): WindowWithRichRuntime {
  return window as WindowWithRichRuntime;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getProtyleCdn(): string {
  const fallback = '/stage/protyle';
  const constantValue = (Constants as { PROTYLE_CDN?: string } | undefined)?.PROTYLE_CDN;
  return typeof constantValue === 'string' && constantValue.trim().length > 0
    ? constantValue
    : fallback;
}

function loadStyleOnce(id: string, href: string): Promise<void> {
  if (stylePromises.has(id)) {
    return stylePromises.get(id)!;
  }
  const promise = new Promise<void>((resolve) => {
    const existing = document.getElementById(id) as HTMLLinkElement | null;
    if (existing && existing.href.includes(href)) {
      resolve();
      return;
    }
    if (existing) {
      existing.remove();
    }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  stylePromises.set(id, promise);
  return promise;
}

function loadScriptOnce(id: string, src: string): Promise<void> {
  if (scriptPromises.has(id)) {
    return scriptPromises.get(id)!;
  }
  const promise = new Promise<void>((resolve) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing && existing.src.includes(src)) {
      if ((existing as HTMLScriptElement).dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
      return;
    }
    if (existing) {
      existing.remove();
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  scriptPromises.set(id, promise);
  return promise;
}

async function ensureHighlightJs(): Promise<boolean> {
  const runtimeWindow = getRuntimeWindow();
  if (runtimeWindow.hljs?.highlightElement) {
    return true;
  }
  const appearance = runtimeWindow.siyuan?.config?.appearance;
  const theme = appearance?.mode === 1
    ? (appearance.codeBlockThemeDark || 'github-dark')
    : (appearance?.codeBlockThemeLight || 'default');
  const cdn = getProtyleCdn();
  await loadStyleOnce('siyuanmemo-rich-hljs-style', `${cdn}/js/highlight.js/styles/${theme}.min.css`);
  await loadScriptOnce('siyuanmemo-rich-hljs-script', `${cdn}/js/highlight.js/highlight.min.js`);
  await loadScriptOnce('siyuanmemo-rich-hljs-third-script', `${cdn}/js/highlight.js/third-languages.js`);
  return Boolean(getRuntimeWindow().hljs?.highlightElement);
}

async function ensureKatex(): Promise<boolean> {
  const runtimeWindow = getRuntimeWindow();
  if (runtimeWindow.katex?.renderToString) {
    return true;
  }
  const cdn = getProtyleCdn();
  await loadStyleOnce('siyuanmemo-rich-katex-style', `${cdn}/js/katex/katex.min.css`);
  await loadScriptOnce('siyuanmemo-rich-katex-script', `${cdn}/js/katex/katex.min.js`);
  return Boolean(getRuntimeWindow().katex?.renderToString);
}

async function ensureMermaid(): Promise<boolean> {
  const runtimeWindow = getRuntimeWindow();
  if (runtimeWindow.mermaid?.render) {
    return true;
  }
  const cdn = getProtyleCdn();
  await loadScriptOnce('siyuanmemo-rich-mermaid-script', `${cdn}/js/mermaid/mermaid.min.js`);
  const mermaid = getRuntimeWindow().mermaid;
  if (mermaid?.initialize) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: runtimeWindow.siyuan?.config?.appearance?.mode === 1 ? 'dark' : 'default',
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
      },
      sequence: {
        useMaxWidth: true,
        showSequenceNumbers: true,
      },
    });
  }
  return Boolean(getRuntimeWindow().mermaid?.render);
}

function renderMarkdownFallback(markdown: string): string {
  return `<div style="white-space: pre-wrap;">${escapeHtml(markdown)}</div>`;
}

export function renderMarkdownToHtml(markdown: string): string {
  const normalized = String(markdown || '');
  if (!normalized) {
    return '';
  }

  const lute = getRuntimeWindow().Lute?.New?.();
  if (lute?.Md2HTML) {
    return lute.Md2HTML(normalized);
  }
  if (lute?.Md2BlockDOM) {
    return lute.Md2BlockDOM(normalized);
  }
  return renderMarkdownFallback(normalized);
}

function normalizeMathExpression(expression: string): string {
  return expression.trim();
}

function buildMathFragment(text: string): DocumentFragment | null {
  const katex = getRuntimeWindow().katex;
  if (!katex?.renderToString || !text.includes('$')) {
    return null;
  }

  const regex = /\$\$([\s\S]+?)\$\$|\$(?!\$)([^$\n]+?)\$/g;
  let match: RegExpExecArray | null = null;
  let cursor = 0;
  let hasMath = false;
  const fragment = document.createDocumentFragment();

  while ((match = regex.exec(text)) !== null) {
    hasMath = true;
    const fullMatch = match[0];
    const displayExpression = match[1];
    const inlineExpression = match[2];
    const startIndex = match.index;
    if (startIndex > cursor) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, startIndex)));
    }
    const wrapper = document.createElement(displayExpression ? 'div' : 'span');
    wrapper.className = displayExpression ? 'rich-markdown__math-block' : 'rich-markdown__math-inline';
    try {
      wrapper.innerHTML = katex.renderToString(
        normalizeMathExpression(displayExpression || inlineExpression || ''),
        {
          displayMode: Boolean(displayExpression),
          throwOnError: false,
          strict: (errorCode) => (errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn'),
          trust: true,
        },
      );
    } catch {
      wrapper.textContent = fullMatch;
    }
    fragment.appendChild(wrapper);
    cursor = startIndex + fullMatch.length;
  }

  if (!hasMath) {
    return null;
  }
  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
  }
  return fragment;
}

async function renderInlineMath(container: HTMLElement): Promise<void> {
  const canRender = await ensureKatex();
  if (!canRender) {
    return;
  }
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent) {
      continue;
    }
    if (parent.closest('pre, code, script, style, textarea, .katex')) {
      continue;
    }
    if (!String(node.textContent || '').includes('$')) {
      continue;
    }
    textNodes.push(node);
  }

  for (const node of textNodes) {
    const fragment = buildMathFragment(node.textContent || '');
    if (!fragment) {
      continue;
    }
    node.replaceWith(fragment);
  }
}

function createCodeActionBar(language: string, code: string): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'rich-markdown__code-toolbar';

  const label = document.createElement('span');
  label.className = 'rich-markdown__code-language';
  label.textContent = language || 'text';
  bar.appendChild(label);

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'rich-markdown__code-copy';
  copyButton.textContent = '复制代码';
  copyButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
    }
  });
  bar.appendChild(copyButton);

  return bar;
}

async function renderMermaidCodeBlock(codeElement: HTMLElement): Promise<void> {
  const mermaidReady = await ensureMermaid();
  const mermaid = getRuntimeWindow().mermaid;
  if (!mermaidReady || !mermaid?.render) {
    return;
  }

  const code = String(codeElement.textContent || '').trim();
  if (!code) {
    return;
  }

  try {
    const result = await mermaid.render(`rich-mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, code);
    const host = codeElement.parentElement || codeElement;
    host.innerHTML = result.svg;
    host.classList.add('rich-markdown__mermaid');
  } catch {
    // Keep the original code block when Mermaid rendering fails.
  }
}

async function renderMathCodeBlock(codeElement: HTMLElement): Promise<void> {
  const katexReady = await ensureKatex();
  const katex = getRuntimeWindow().katex;
  if (!katexReady || !katex?.renderToString) {
    return;
  }

  const code = String(codeElement.textContent || '').trim();
  if (!code) {
    return;
  }

  const host = codeElement.parentElement || codeElement;
  try {
    host.innerHTML = katex.renderToString(code, {
      displayMode: true,
      throwOnError: false,
      strict: (errorCode) => (errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn'),
      trust: true,
    });
    host.classList.add('rich-markdown__math-code');
  } catch {
    // Keep the original code block when KaTeX rendering fails.
  }
}

export async function enhanceRenderedMarkdown(container: HTMLElement): Promise<void> {
  if (!container) {
    return;
  }

  await renderInlineMath(container);
  const codeBlocks = Array.from(container.querySelectorAll<HTMLElement>('pre > code'));
  if (codeBlocks.length === 0) {
    return;
  }

  const canHighlight = await ensureHighlightJs();
  for (const codeElement of codeBlocks) {
    const languageClass = Array.from(codeElement.classList).find((className) => className.startsWith('language-')) || '';
    const language = languageClass.replace(/^language-/, '').trim().toLowerCase();
    if (language === 'mermaid') {
      await renderMermaidCodeBlock(codeElement);
      continue;
    }
    if (language === 'math' || language === 'latex') {
      await renderMathCodeBlock(codeElement);
      continue;
    }

    if (canHighlight) {
      getRuntimeWindow().hljs?.highlightElement?.(codeElement);
    }
    const pre = codeElement.parentElement;
    if (!pre || pre.querySelector('.rich-markdown__code-toolbar')) {
      continue;
    }
    pre.prepend(createCodeActionBar(language || 'text', String(codeElement.textContent || '')));
    if (!language || ['text', 'plaintext', 'markdown', 'md'].includes(language)) {
      codeElement.style.whiteSpace = 'pre-wrap';
    }
  }
}
