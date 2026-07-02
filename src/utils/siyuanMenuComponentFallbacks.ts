const MENU_COMPONENT_NAMES = ['ViewSelect', 'MenuSeparator'] as const;

type MenuComponentName = (typeof MENU_COMPONENT_NAMES)[number];

type MenuComponentFactory = (args: unknown[]) => HTMLElement;

function decorateMenuFallbackNode(node: HTMLElement): HTMLElement {
  const state = node as unknown as Record<string, unknown>;
  state.element = node;
  state.render = () => node;
  state.mount = () => node;
  state.destroy = () => undefined;
  state.update = () => node;
  state.onSelect = () => undefined;
  return node;
}

function buildFallbackViewSelectItem(args: unknown[]): HTMLElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'b3-menu__item';

  const icon = document.createElement('span');
  icon.className = 'b3-menu__icon';
  item.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'b3-menu__label';
  const textArg = args.find(arg => typeof arg === 'string') as string | undefined;
  label.textContent = textArg ?? '';
  item.appendChild(label);

  return decorateMenuFallbackNode(item);
}

function buildFallbackMenuSeparator(): HTMLElement {
  const separator = document.createElement('button');
  separator.type = 'button';
  separator.className = 'b3-menu__separator';
  separator.tabIndex = -1;
  separator.setAttribute('aria-hidden', 'true');
  return decorateMenuFallbackNode(separator);
}

function installMenuComponentFallback(
  name: MenuComponentName,
  creator: MenuComponentFactory,
): boolean {
  const globalObject = globalThis as Record<string, unknown>;
  if (typeof globalObject[name] !== 'undefined') {
    return false;
  }

  globalObject[name] = function MenuComponentFallback(...args: unknown[]) {
    return creator(args);
  };
  return true;
}

export function ensureSiyuanMenuComponentFallbacks(): MenuComponentName[] {
  const patchedNames: MenuComponentName[] = [];

  if (installMenuComponentFallback('ViewSelect', buildFallbackViewSelectItem)) {
    patchedNames.push('ViewSelect');
  }

  if (installMenuComponentFallback('MenuSeparator', () => buildFallbackMenuSeparator())) {
    patchedNames.push('MenuSeparator');
  }

  return patchedNames;
}

export function isMissingSiyuanMenuComponentReferenceError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /(ViewSelect|MenuSeparator) is not defined/i.test(error.message);
}

function getErrorMessage(error: unknown): string {
  if (typeof ErrorEvent !== 'undefined' && error instanceof ErrorEvent) {
    return error.message || '';
  }
  if (error instanceof Error) {
    return error.message || '';
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return typeof error === 'string' ? error : '';
}

function getErrorStack(error: unknown): string {
  if (typeof ErrorEvent !== 'undefined' && error instanceof ErrorEvent) {
    const nestedError = error.error;
    return nestedError instanceof Error && typeof nestedError.stack === 'string'
      ? nestedError.stack
      : '';
  }
  if (error instanceof Error && typeof error.stack === 'string') {
    return error.stack;
  }
  if (typeof error === 'object' && error !== null && 'stack' in error) {
    const stack = (error as { stack?: unknown }).stack;
    return typeof stack === 'string' ? stack : '';
  }
  return '';
}

export function isSiyuanMenuInjectionError(error: unknown): boolean {
  const message = getErrorMessage(error);
  if (/(ViewSelect|MenuSeparator) is not defined/i.test(message)) {
    return true;
  }

  const stack = getErrorStack(error);
  const context = `${message}\n${stack}`;
  if (!/(InsertMenuItem|MenuShow)/i.test(context)) {
    return false;
  }

  return [
    /Failed to execute 'insertBefore' on 'Node': parameter 1 is not of type 'Node'/i,
    /Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node/i,
  ].some((pattern) => pattern.test(message));
}
