export const BLOCK_REF_PATTERN = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)/i;
export const WIKI_LINK_PATTERN = /\[\[[^\]]+\]\]/;

function normalizeForSymbolDetection(content: string): string {
  return String(content || '')
    .replace(/\{:[^}]*\}/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .trim();
}

function hasLineTailMarker(content: string, markerPattern: RegExp): boolean {
  const normalized = normalizeForSymbolDetection(content);
  if (!normalized) {
    return false;
  }

  const lines = normalized.split('\n');
  return lines.some((line) => markerPattern.test(line.trim()));
}

export function hasListTemplateTail(content: string): boolean {
  return hasLineTailMarker(content, /(?:>>>|\u300b\u300b\u300b)\s*$/);
}

export function hasConceptMultilineTail(content: string): boolean {
  return hasLineTailMarker(content, /(?:::|\uff1a\uff1a\uff1a)\s*$/);
}

export function hasDescriptorMultilineTail(content: string): boolean {
  return hasLineTailMarker(content, /(?:;;;|\uff1b\uff1b\uff1b)\s*$/);
}

export function hasAnyConceptDefinitionSymbol(content: string): boolean {
  const normalized = normalizeForSymbolDetection(content);
  if (hasConceptMultilineTail(normalized)) {
    return false;
  }
  return /::|\uff1a\uff1a|:>|\uff1a\u300b|:<|\uff1a\u300a/.test(normalized);
}

export function resolveConceptDefinitionDirection(content: string): 'forward' | 'backward' | 'both' {
  const normalized = normalizeForSymbolDetection(content);
  if (/:>|\uff1a\u300b/.test(normalized)) {
    return 'forward';
  }
  if (/:<|\uff1a\u300a/.test(normalized)) {
    return 'backward';
  }
  return 'both';
}

export function hasAnyDescriptorSymbol(content: string): boolean {
  const normalized = normalizeForSymbolDetection(content);
  if (hasDescriptorMultilineTail(normalized)) {
    return false;
  }
  return /;;|\uff1b\uff1b|;<|\uff1b<|\uff1b\u300a|;<>|\uff1b<>|\uff1b\u300a\u300b/.test(normalized);
}

export function resolveDescriptorDirection(content: string): 'forward' | 'backward' | 'both' {
  const normalized = normalizeForSymbolDetection(content);
  if (/;<>|\uff1b<>|\uff1b\u300a\u300b/.test(normalized)) {
    return 'both';
  }
  if (/;<|\uff1b<|\uff1b\u300a/.test(normalized)) {
    return 'backward';
  }
  return 'forward';
}

export function hasNumberedLatexCloze(content: string): boolean {
  return /\\+cloze\{c\d+\}\{/i.test(content);
}

const BRACE_CLOZE_PATTERN = /(^|[^{}])\{\{(?!\{)[\s\S]*?\}\}(?!\})/;

export function hasGenericCloze(content: string): boolean {
  const normalized = normalizeForSymbolDetection(content);
  return BRACE_CLOZE_PATTERN.test(normalized)
    || /==([^=]+)==/.test(normalized)
    || /<span data-type="mark">/.test(normalized)
    || hasNumberedLatexCloze(normalized);
}

export function hasBasicDirectionSymbol(content: string): boolean {
  const normalized = normalizeForSymbolDetection(content);
  // Keep list-template marker out of basic-forward path.
  if (hasListTemplateTail(normalized)) {
    return false;
  }
  return />>|\u300b\u300b|<<|\u300a\u300a|<>|\u300a\u300b/.test(normalized);
}

export function resolveBasicDirection(content: string): 'forward' | 'backward' | 'both' {
  const normalized = normalizeForSymbolDetection(content);
  if (/<>\s*|\u300a\u300b\s*/.test(normalized)) {
    return 'both';
  }
  if (/<<|\u300a\u300a/.test(normalized)) {
    return 'backward';
  }
  return 'forward';
}

export function hasConceptReference(content: string): boolean {
  return BLOCK_REF_PATTERN.test(content) || WIKI_LINK_PATTERN.test(content);
}
