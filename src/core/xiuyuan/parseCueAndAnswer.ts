const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u2060]/g;
const TRAILING_BLOCK_ATTR_PATTERN = /\s*\{:[^{}]*\}\s*$/s;

export type CueAnswerPair = {
  cue: string;
  answer: string;
};

export function normalizeCueAnswerSource(source: string): string {
  return String(source || '')
    .replace(TRAILING_BLOCK_ATTR_PATTERN, '')
    .replace(ZERO_WIDTH_RE, '')
    .trim();
}

export function parseCueAndAnswer(source: string): CueAnswerPair {
  const text = normalizeCueAnswerSource(source);
  const unicodeArrow = '\u2192';
  const delimiter = text.includes(unicodeArrow) ? unicodeArrow : '->';
  const parts = text.split(delimiter);

  if (parts.length >= 2) {
    return {
      cue: parts[0].trim(),
      answer: parts.slice(1).join(delimiter).trim(),
    };
  }

  return {
    cue: '',
    answer: text,
  };
}
