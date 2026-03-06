export interface SiyuanFlashcardConfig {
  mark: boolean;
  list: boolean;
  heading: boolean;
  superBlock: boolean;
}

type RawFlashcardConfig = Partial<Record<keyof SiyuanFlashcardConfig, unknown>>;

const DEFAULT_FLASHCARD_CONFIG: SiyuanFlashcardConfig = {
  mark: true,
  list: true,
  heading: true,
  superBlock: true,
};

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeSiyuanFlashcardConfig(config?: RawFlashcardConfig | null): SiyuanFlashcardConfig {
  return {
    mark: toBoolean(config?.mark, DEFAULT_FLASHCARD_CONFIG.mark),
    list: toBoolean(config?.list, DEFAULT_FLASHCARD_CONFIG.list),
    heading: toBoolean(config?.heading, DEFAULT_FLASHCARD_CONFIG.heading),
    superBlock: toBoolean(config?.superBlock, DEFAULT_FLASHCARD_CONFIG.superBlock),
  };
}

export function readSiyuanFlashcardConfig(): SiyuanFlashcardConfig | null {
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

  return normalizeSiyuanFlashcardConfig(flashcard as RawFlashcardConfig);
}

export function getDefaultSiyuanFlashcardConfig(): SiyuanFlashcardConfig {
  return { ...DEFAULT_FLASHCARD_CONFIG };
}
