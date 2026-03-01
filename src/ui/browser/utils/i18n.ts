export type FlashcardI18n = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getFlashcardI18n(): FlashcardI18n {
  const languages = window?.siyuan?.languages;
  if (!isRecord(languages)) return {};

  const flashcard = languages.flashcard;
  if (!isRecord(flashcard)) return {};

  return flashcard as FlashcardI18n;
}

export function tFlashcard(key: string, fallback: string): string {
  const i18n = getFlashcardI18n();
  return i18n[key] ?? fallback;
}

export function interpolateI18n(
  template: string,
  vars: Record<string, string | number>,
): string {
  if (!template || !vars || Object.keys(vars).length === 0) {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, key) => {
    if (!(key in vars)) {
      return token;
    }
    return String(vars[key]);
  });
}
