// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const topbarContextmenuMocks = vi.hoisted(() => ({
  topBarMenuOpen: vi.fn(),
  pushMsgMock: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Plugin: class {},
  getFrontend: vi.fn(() => 'desktop'),
  showMessage: vi.fn(),
}));

vi.mock('@/infrastructure/siyuan/api', () => ({
  pushErrMsg: vi.fn(),
  pushMsg: topbarContextmenuMocks.pushMsgMock,
}));

vi.mock('@/application/ApplicationContext', () => ({
  ApplicationContext: {
    create: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/application/handlers/FormulaClozeAssistant', () => ({
  FormulaClozeAssistant: class {
    start() {}
    stop() {}
  },
}));

vi.mock('@/application/handlers/ImageOcclusionHandler', () => ({
  ImageOcclusionHandler: class {
    dispose() {}
  },
}));

vi.mock('@/application/entries/BlockContextResolver', () => ({
  BlockContextResolver: class {},
}));

vi.mock('@/utils/siyuanMenuComponentFallbacks', () => ({
  ensureSiyuanMenuComponentFallbacks: vi.fn(() => []),
  isSiyuanMenuInjectionError: vi.fn(() => false),
}));

vi.mock('@/index.scss', () => ({}));

import FSRSPlugin from '@/index';

describe('FSRSPlugin top bar contextmenu', () => {
  beforeEach(() => {
    topbarContextmenuMocks.topBarMenuOpen.mockReset();
    topbarContextmenuMocks.pushMsgMock.mockReset();
  });

  it('stops contextmenu propagation before opening the plugin top bar menu', () => {
    const plugin = new FSRSPlugin();
    const topBarElement = document.createElement('button');

    (plugin as unknown as { addIcons: (value: string) => void }).addIcons = vi.fn();
    (plugin as unknown as { addTopBar: (config: unknown) => HTMLElement }).addTopBar = vi.fn(() => topBarElement);
    (plugin as unknown as {
      context: { getMenuManager: () => { openTopBarMenu: typeof topbarContextmenuMocks.topBarMenuOpen } };
    }).context = {
      getMenuManager: () => ({
        openTopBarMenu: topbarContextmenuMocks.topBarMenuOpen,
      }),
    };
    (plugin as unknown as { isInitialized: boolean }).isInitialized = true;
    (plugin as unknown as { i18n: Record<string, string> }).i18n = {};

    (plugin as unknown as { setupTopBar: () => void }).setupTopBar();

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const stopPropagation = vi.fn();
    const stopImmediatePropagation = vi.fn();
    Object.defineProperty(event, 'stopPropagation', { value: stopPropagation });
    Object.defineProperty(event, 'stopImmediatePropagation', { value: stopImmediatePropagation });

    topBarElement.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(topbarContextmenuMocks.topBarMenuOpen).toHaveBeenCalledWith(event);
    expect(topbarContextmenuMocks.pushMsgMock).not.toHaveBeenCalled();
  });
});
