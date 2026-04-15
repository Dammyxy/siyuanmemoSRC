export type ReviewNativeTabSplitCommand = 'splitLR' | 'splitMoveR' | 'splitTB' | 'splitMoveB';

type ReviewNativeTabSplitKeymapEntry = {
  custom?: unknown;
};

type ReviewNativeTabSplitRuntimeWindow = {
  siyuan?: {
    config?: {
      keymap?: {
        general?: Partial<Record<ReviewNativeTabSplitCommand, ReviewNativeTabSplitKeymapEntry>>;
      };
    };
  };
};

const REVIEW_NATIVE_TAB_SPLIT_COMMANDS: ReviewNativeTabSplitCommand[] = ['splitLR', 'splitMoveR', 'splitTB', 'splitMoveB'];

const HOTKEY_CODELIST: Readonly<Record<number, string>> = Object.freeze({
  8: '⌫',
  9: '⇥',
  13: '↩',
  16: '⇧',
  17: '⌃',
  18: '⌥',
  19: 'Pause',
  20: 'CapsLock',
  27: 'Escape',
  32: ' ',
  33: 'PageUp',
  34: 'PageDown',
  35: 'End',
  36: 'Home',
  37: '←',
  38: '↑',
  39: '→',
  40: '↓',
  44: 'PrintScreen',
  45: 'Insert',
  46: '⌦',
  48: '0',
  49: '1',
  50: '2',
  51: '3',
  52: '4',
  53: '5',
  54: '6',
  55: '7',
  56: '8',
  57: '9',
  65: 'A',
  66: 'B',
  67: 'C',
  68: 'D',
  69: 'E',
  70: 'F',
  71: 'G',
  72: 'H',
  73: 'I',
  74: 'J',
  75: 'K',
  76: 'L',
  77: 'M',
  78: 'N',
  79: 'O',
  80: 'P',
  81: 'Q',
  82: 'R',
  83: 'S',
  84: 'T',
  85: 'U',
  86: 'V',
  87: 'W',
  88: 'X',
  89: 'Y',
  90: 'Z',
  91: '⌘',
  92: '⌘',
  93: 'ContextMenu',
  96: '0',
  97: '1',
  98: '2',
  99: '3',
  100: '4',
  101: '5',
  102: '6',
  103: '7',
  104: '8',
  105: '9',
  106: '*',
  107: '+',
  109: '-',
  110: '.',
  111: '/',
  112: 'F1',
  113: 'F2',
  114: 'F3',
  115: 'F4',
  116: 'F5',
  117: 'F6',
  118: 'F7',
  119: 'F8',
  120: 'F9',
  121: 'F10',
  122: 'F11',
  123: 'F12',
  124: 'F13',
  125: 'F14',
  126: 'F15',
  127: 'F16',
  128: 'F17',
  129: 'F18',
  130: 'F19',
  131: 'F20',
  132: 'F21',
  133: 'F22',
  134: 'F23',
  135: 'F24',
  136: 'F25',
  137: 'F26',
  138: 'F27',
  139: 'F28',
  140: 'F29',
  141: 'F30',
  142: 'F31',
  143: 'F32',
  144: 'NumLock',
  145: 'ScrollLock',
  186: ';',
  187: '=',
  188: ',',
  189: '-',
  190: '.',
  191: '/',
  192: '`',
  219: '[',
  220: '\\',
  221: ']',
  222: '\'',
});

function isMacPlatform(): boolean {
  return navigator.platform.toUpperCase().includes('MAC');
}

function isOnlyMeta(event: KeyboardEvent): boolean {
  return isMacPlatform()
    ? event.metaKey && !event.ctrlKey
    : !event.metaKey && event.ctrlKey;
}

function isNotCtrl(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey;
}

function replaceDirect(hotKey: string, keyCode: string): string[] {
  const placeholder = '\u200b';
  const hotKeys = hotKey.replace(keyCode, placeholder).split('');
  hotKeys.forEach((item, index) => {
    if (item === placeholder) {
      hotKeys[index] = keyCode;
    }
  });
  return hotKeys;
}

function resolveHotkeyTokenFromEvent(event: KeyboardEvent): string {
  const keyCode = Number(event.keyCode) || 0;
  if (HOTKEY_CODELIST[keyCode]) {
    return HOTKEY_CODELIST[keyCode];
  }

  const key = String(event.key || '').trim();
  switch (key) {
    case 'Tab':
      return '⇥';
    case 'Enter':
      return '↩';
    case 'Escape':
      return 'Escape';
    case ' ':
    case 'Spacebar':
    case 'Space':
      return ' ';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'Delete':
      return '⌦';
    case 'Backspace':
      return '⌫';
    default:
      break;
  }

  if (/^F\d{1,2}$/i.test(key)) {
    return key.toUpperCase();
  }
  if (key === 'PageUp' || key === 'PageDown' || key === 'Home' || key === 'End' || key === 'Insert') {
    return key;
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key;
}

function matchHotKey(hotKey: string, event: KeyboardEvent): boolean {
  if (!hotKey) {
    return false;
  }

  let normalizedHotKey = hotKey;
  if (normalizedHotKey.startsWith('⌃') && !isMacPlatform()) {
    if (normalizedHotKey === '⌃D') {
      return false;
    }
    normalizedHotKey = normalizedHotKey.replace('⌘', '').replace('⌃', '⌘')
      .replace('⌘⇧', '⇧⌘')
      .replace('⌘⌥⇧', '⌥⇧⌘')
      .replace('⌘⌥', '⌥⌘');
  }

  const eventToken = resolveHotkeyTokenFromEvent(event);

  if (
    !normalizedHotKey.includes('⇧')
    && !normalizedHotKey.includes('⌘')
    && !normalizedHotKey.includes('⌥')
    && !normalizedHotKey.includes('⌃')
  ) {
    return isNotCtrl(event) && !event.altKey && !event.shiftKey && normalizedHotKey === eventToken;
  }

  let hotKeys = normalizedHotKey.split('');
  if (normalizedHotKey.includes('F')) {
    hotKeys.forEach((item, index) => {
      if (item === 'F') {
        hotKeys[index] = `F${hotKeys.splice(index + 1, 1)}`;
        if (hotKeys[index + 1]) {
          hotKeys[index + 1] += hotKeys.splice(index + 1, 1);
        }
      }
    });
  } else if (normalizedHotKey.includes('PageUp')) {
    hotKeys = replaceDirect(normalizedHotKey, 'PageUp');
  } else if (normalizedHotKey.includes('PageDown')) {
    hotKeys = replaceDirect(normalizedHotKey, 'PageDown');
  } else if (normalizedHotKey.includes('Home')) {
    hotKeys = replaceDirect(normalizedHotKey, 'Home');
  } else if (normalizedHotKey.includes('End')) {
    hotKeys = replaceDirect(normalizedHotKey, 'End');
  }

  if (normalizedHotKey.startsWith('⇧') && hotKeys.length === 2) {
    return isNotCtrl(event) && !event.altKey && event.shiftKey && hotKeys[1] === eventToken;
  }

  if (normalizedHotKey.startsWith('⌥')) {
    let keyCode = hotKeys.length === 3 ? hotKeys[2] : hotKeys[1];
    if (hotKeys.length === 4) {
      keyCode = hotKeys[3];
    }
    const isMatchKey = keyCode === eventToken;
    if (
      isMatchKey
      && event.altKey
      && !event.shiftKey
      && hotKeys.length < 4
      && (hotKeys.length === 3 ? (isOnlyMeta(event) && normalizedHotKey.startsWith('⌥⌘')) : isNotCtrl(event))
    ) {
      return true;
    }
    if (isMatchKey && normalizedHotKey.startsWith('⌥⇧⌘') && hotKeys.length === 4 && event.altKey && event.shiftKey && isOnlyMeta(event)) {
      return true;
    }
    if (isMatchKey && normalizedHotKey.startsWith('⌥⇧') && hotKeys.length === 3 && event.altKey && event.shiftKey && isNotCtrl(event)) {
      return true;
    }
    return false;
  }

  if (normalizedHotKey.startsWith('⌃')) {
    if (!isMacPlatform()) {
      return false;
    }
    let keyCode = hotKeys.length === 3 ? hotKeys[2] : hotKeys[1];
    if (hotKeys.length === 4) {
      keyCode = hotKeys[3];
    } else if (hotKeys.length === 5) {
      keyCode = hotKeys[4];
    }
    const isMatchKey = keyCode === eventToken;
    if (
      isMatchKey
      && event.ctrlKey
      && !event.altKey
      && !event.shiftKey
      && hotKeys.length < 4
      && (hotKeys.length === 3 ? (event.metaKey && normalizedHotKey.startsWith('⌃⌘')) : !event.metaKey)
    ) {
      return true;
    }
    if (isMatchKey && normalizedHotKey.startsWith('⌃⇧') && hotKeys.length === 3 && event.ctrlKey && !event.altKey && event.shiftKey && !event.metaKey) {
      return true;
    }
    if (isMatchKey && normalizedHotKey.startsWith('⌃⌥') && hotKeys.length === 3 && event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey) {
      return true;
    }
    if (
      isMatchKey
      && hotKeys.length === 4
      && event.ctrlKey
      && (
        (normalizedHotKey.startsWith('⌃⌥⇧') && event.shiftKey && !event.metaKey && event.altKey)
        || (normalizedHotKey.startsWith('⌃⌥⌘') && !event.shiftKey && event.metaKey && event.altKey)
        || (normalizedHotKey.startsWith('⌃⇧⌘') && event.shiftKey && event.metaKey && !event.altKey)
      )
    ) {
      return true;
    }
    return isMatchKey && hotKeys.length === 5 && event.ctrlKey && event.shiftKey && event.metaKey && event.altKey;
  }

  const hasShift = hotKeys.length > 2 && hotKeys[0] === '⇧';
  return isOnlyMeta(event) && !event.altKey && ((!hasShift && !event.shiftKey) || (hasShift && event.shiftKey))
    && (hasShift ? hotKeys[2] : hotKeys[1]) === eventToken;
}

export function matchReviewNativeTabSplitCommand(
  event: KeyboardEvent,
  runtimeWindow: ReviewNativeTabSplitRuntimeWindow = window as ReviewNativeTabSplitRuntimeWindow,
): ReviewNativeTabSplitCommand | null {
  const generalKeymap = runtimeWindow.siyuan?.config?.keymap?.general;
  for (const command of REVIEW_NATIVE_TAB_SPLIT_COMMANDS) {
    const hotKey = typeof generalKeymap?.[command]?.custom === 'string'
      ? generalKeymap[command]?.custom?.trim()
      : '';
    if (hotKey && matchHotKey(hotKey, event)) {
      return command;
    }
  }
  return null;
}

export function pruneNativeTabSplitMenu(menuRoot: ParentNode | null | undefined): boolean {
  if (!menuRoot) {
    return false;
  }
  const splitItem = menuRoot.querySelector('.b3-menu__item[data-id="split"]');
  if (!splitItem) {
    return false;
  }
  splitItem.remove();
  return true;
}
