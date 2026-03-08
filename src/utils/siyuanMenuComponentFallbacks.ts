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
