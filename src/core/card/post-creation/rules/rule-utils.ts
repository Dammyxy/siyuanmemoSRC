import { hasTokenizedMarkSpan } from '@/utils/markDataType';
import { hasFormulaClozeMarkerTargets } from '@/utils/formula-cloze-parser';

export const BLOCK_REF_PATTERN = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)/i;
export const WIKI_LINK_PATTERN = /\[\[[^\]]+\]\]/;
const INLINE_SYMBOL_LINE_PATTERN = />>|》》|<<|《《|<>|《》|::|：：|:>|：》|:<|：《|;;|；；|;<|；<|；《|;<>|；<>|；《》/;

export type BasicDirectionParseResult = {
  direction: 'forward' | 'backward' | 'both';
  question: string;
  answer: string;
  symbol: '>>' | '<<' | '<>';
  normalizedLine: string;
};

function normalizeForSymbolDetection(content: string): string {
  return String(content || '')
    .replace(/\{:[^}]*\}/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .trim();
}

function normalizeInlineSymbolCandidateLines(content: string): string[] {
  const normalized = String(content || '')
    .replace(/\{:[^{}\n]*\}/g, '')
    .replace(/\r/g, '')
    .trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .trim())
    .filter((line) => line.length > 0);
}

function parseSingleBasicDirectionLine(line: string): BasicDirectionParseResult | null {
  const normalizedLine = String(line || '').trim();
  if (!normalizedLine || hasListTemplateTail(normalizedLine)) {
    return null;
  }

  const bidirectional = normalizedLine.match(/^(.+?)\s*(<>|《》)\s*(.+)$/u);
  if (bidirectional) {
    const question = String(bidirectional[1] || '').trim();
    const answer = String(bidirectional[3] || '').trim();
    if (!question || !answer) {
      return null;
    }
    return {
      direction: 'both',
      question,
      answer,
      symbol: '<>',
      normalizedLine,
    };
  }

  const forward = normalizedLine.match(/^(.+?)\s*(>>|》》)\s*(.+)$/u);
  if (forward) {
    const question = String(forward[1] || '').trim();
    const answer = String(forward[3] || '').trim();
    if (!question || !answer) {
      return null;
    }
    return {
      direction: 'forward',
      question,
      answer,
      symbol: '>>',
      normalizedLine,
    };
  }

  const backward = normalizedLine.match(/^(.+?)\s*(<<|《《)\s*(.+)$/u);
  if (backward) {
    const answer = String(backward[1] || '').trim();
    const question = String(backward[3] || '').trim();
    if (!question || !answer) {
      return null;
    }
    return {
      direction: 'backward',
      question,
      answer,
      symbol: '<<',
      normalizedLine,
    };
  }

  return null;
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
  return hasFormulaClozeMarkerTargets(content);
}

const BRACE_CLOZE_PATTERN = /(^|[^{}])\{\{(?!\{)[\s\S]*?\}\}(?!\})/;

export function hasBraceCloze(content: string): boolean {
  const normalized = normalizeForSymbolDetection(content);
  return BRACE_CLOZE_PATTERN.test(normalized);
}

export function hasMarkCloze(content: string): boolean {
  const normalized = normalizeForSymbolDetection(content);
  return /==([^=]+)==/.test(normalized)
    || hasTokenizedMarkSpan(normalized);
}

export function hasGenericCloze(content: string): boolean {
  const normalized = normalizeForSymbolDetection(content);
  return hasBraceCloze(normalized)
    || hasMarkCloze(normalized)
    || hasNumberedLatexCloze(normalized);
}

export function parseBasicDirectionContent(content: string): BasicDirectionParseResult | null {
  const lines = normalizeInlineSymbolCandidateLines(content);
  for (const line of lines) {
    const parsed = parseSingleBasicDirectionLine(line);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

export function selectPreferredInlineSymbolLine(content: string): string {
  const normalizedLines = normalizeInlineSymbolCandidateLines(content);
  if (normalizedLines.length === 0) {
    return '';
  }

  const validBasicLine = normalizedLines.find((line) => parseSingleBasicDirectionLine(line) !== null);
  if (validBasicLine) {
    return validBasicLine;
  }

  const symbolLine = normalizedLines.find((line) => INLINE_SYMBOL_LINE_PATTERN.test(line));
  return symbolLine || normalizedLines[0];
}

export function hasBasicDirectionSymbol(content: string): boolean {
  return parseBasicDirectionContent(content) !== null;
}

export function resolveBasicDirection(content: string): 'forward' | 'backward' | 'both' {
  return parseBasicDirectionContent(content)?.direction || 'forward';
}

export function hasConceptReference(content: string): boolean {
  return BLOCK_REF_PATTERN.test(content) || WIKI_LINK_PATTERN.test(content);
}
