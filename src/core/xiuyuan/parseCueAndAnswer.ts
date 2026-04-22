const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u2060]/g;
const TRAILING_BLOCK_ATTR_PATTERN = /\s*\{:[^{}]*\}\s*$/s;
const FW_SEMICOLON = '\uFF1B';
const DESCRIPTOR_MULTILINE_TAIL_RE = new RegExp(`\\s*(;;;|${FW_SEMICOLON}{3})\\s*$`);

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

export function hasDescriptorGroupHintTail(source: string): boolean {
  const normalized = normalizeCueAnswerSource(source);
  return normalized.length > 0 && DESCRIPTOR_MULTILINE_TAIL_RE.test(normalized);
}

export function extractDescriptorGroupHint(source: string): string {
  const normalized = normalizeCueAnswerSource(source);
  if (!normalized) {
    return '';
  }

  const stripped = normalized.replace(DESCRIPTOR_MULTILINE_TAIL_RE, '').trim();
  return stripped || normalized;
}

export function extractDescriptorGroupHintFromCandidates(...sources: Array<string | undefined>): string {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    const hint = extractDescriptorGroupHint(source);
    if (hint.length > 0) {
      return hint;
    }
  }

  return '';
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
