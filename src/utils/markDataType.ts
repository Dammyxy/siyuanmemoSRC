export const MARK_DATA_TYPE_TOKEN = 'mark';
export const TEXT_DATA_TYPE_TOKEN = 'text';
export const MARK_DATA_TYPE_SELECTOR = '[data-type~="mark"]';

export function splitDataTypeTokens(value: string | null | undefined): string[] {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return [];
  }

  return Array.from(new Set(
    normalized
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  ));
}

export function hasDataTypeToken(value: string | null | undefined, token: string): boolean {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return false;
  }
  return splitDataTypeTokens(value).includes(normalizedToken);
}

export function appendDataTypeToken(
  value: string | null | undefined,
  token: string,
  options?: { ensureTextToken?: boolean },
): string {
  const normalizedToken = String(token || '').trim();
  const tokens = splitDataTypeTokens(value)
    .filter((current) => current !== normalizedToken);

  if (options?.ensureTextToken && !tokens.includes(TEXT_DATA_TYPE_TOKEN)) {
    tokens.unshift(TEXT_DATA_TYPE_TOKEN);
  }

  if (normalizedToken) {
    tokens.push(normalizedToken);
  }

  return Array.from(new Set(tokens)).join(' ');
}

export function removeDataTypeToken(value: string | null | undefined, token: string): string {
  const normalizedToken = String(token || '').trim();
  return splitDataTypeTokens(value)
    .filter((current) => current !== normalizedToken)
    .join(' ');
}

export function isMarkElement(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement
    && hasDataTypeToken(element.getAttribute('data-type'), MARK_DATA_TYPE_TOKEN);
}

function resolveReusableMarkHost(root: ParentNode): HTMLElement | null {
  const childNodes = Array.from(root.childNodes).filter((child) => {
    if (child.nodeType !== Node.TEXT_NODE) {
      return true;
    }
    return (child.textContent || '').trim().length > 0;
  });

  if (childNodes.length !== 1) {
    return null;
  }

  const [onlyChild] = childNodes;
  if (!(onlyChild instanceof HTMLElement) || onlyChild.tagName !== 'SPAN') {
    return null;
  }

  return onlyChild.hasAttribute('data-type')
    ? onlyChild
    : null;
}

export function createTokenizedMarkWrapper(
  documentRef: Document,
  fragment: DocumentFragment,
): HTMLElement {
  const reusableHost = resolveReusableMarkHost(fragment);
  if (reusableHost) {
    reusableHost.setAttribute(
      'data-type',
      appendDataTypeToken(reusableHost.getAttribute('data-type'), MARK_DATA_TYPE_TOKEN),
    );
    return reusableHost;
  }

  const wrapper = documentRef.createElement('span');
  wrapper.setAttribute(
    'data-type',
    appendDataTypeToken('', MARK_DATA_TYPE_TOKEN, { ensureTextToken: true }),
  );
  wrapper.append(fragment);
  return wrapper;
}

export function createTokenizedMarkHtml(
  innerHtml: string,
  documentRef: Document = document,
): string {
  const template = documentRef.createElement('template');
  template.innerHTML = String(innerHtml || '').trim();
  const wrapper = createTokenizedMarkWrapper(documentRef, template.content);
  return wrapper.outerHTML;
}

export function unwrapMarkTokenElements(root: ParentNode): void {
  for (const markElement of Array.from(root.querySelectorAll<HTMLElement>(MARK_DATA_TYPE_SELECTOR))) {
    const remainingDataType = removeDataTypeToken(
      markElement.getAttribute('data-type'),
      MARK_DATA_TYPE_TOKEN,
    );
    const remainingTokens = splitDataTypeTokens(remainingDataType);
    const shouldUnwrap = remainingTokens.length === 0
      || (remainingTokens.length === 1 && remainingTokens[0] === TEXT_DATA_TYPE_TOKEN);

    if (!shouldUnwrap) {
      markElement.setAttribute('data-type', remainingDataType);
      continue;
    }

    const parent = markElement.parentNode;
    if (!parent) {
      continue;
    }
    while (markElement.firstChild) {
      parent.insertBefore(markElement.firstChild, markElement);
    }
    parent.removeChild(markElement);
  }
}

export function getTokenizedMarkSpanRegex(): RegExp {
  return /<span\b[^>]*\bdata-type=(["'])([^"']*)\1[^>]*>([\s\S]*?)<\/span>/giu;
}

export function hasTokenizedMarkSpan(content: string): boolean {
  const regex = getTokenizedMarkSpanRegex();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(String(content || ''))) !== null) {
    if (hasDataTypeToken(match[2], MARK_DATA_TYPE_TOKEN)) {
      return true;
    }
  }

  return false;
}
