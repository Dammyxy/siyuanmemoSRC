interface FlashcardVisibilityConfig {
  mark?: unknown;
  list?: unknown;
  superBlock?: unknown;
  heading?: unknown;
}

function readFlashcardConfig(): FlashcardVisibilityConfig | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const siyuan = (window as Window & { siyuan?: unknown }).siyuan;
  if (!siyuan || typeof siyuan !== 'object') {
    return null;
  }

  const config = (siyuan as { config?: unknown }).config;
  if (!config || typeof config !== 'object') {
    return null;
  }

  const flashcard = (config as { flashcard?: unknown }).flashcard;
  if (!flashcard || typeof flashcard !== 'object') {
    return null;
  }

  return flashcard as FlashcardVisibilityConfig;
}

/**
 * 获取需要隐藏的内容类型
 *
 * 根据思源笔记的闪卡设置，确定需要隐藏的内容类型。
 * 这个函数参考了原生实现 siyuan/app/src/card/openCard.ts
 *
 * @returns 需要隐藏的内容类型数组
 */
export function getHiddenContentTypes(): string[] {
  const hiddenContentTypes: string[] = [];

  const config = readFlashcardConfig();
  if (config) {
    if (Boolean(config.mark)) hiddenContentTypes.push('mark');
    if (Boolean(config.list)) hiddenContentTypes.push('list');
    if (Boolean(config.superBlock)) hiddenContentTypes.push('superBlock');
    if (Boolean(config.heading)) hiddenContentTypes.push('heading');
  }

  return hiddenContentTypes;
}
