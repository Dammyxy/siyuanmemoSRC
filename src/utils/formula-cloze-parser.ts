export interface FormulaClozeTarget {
  text: string;
  start: number;
  end: number;
  markerId?: string;
}

export type FormulaClozeMalformedReason =
  | 'missing-marker-argument'
  | 'missing-answer-argument'
  | 'unsupported-marker-syntax';

export interface FormulaClozeMalformed {
  start: number;
  commandEnd: number;
  reason: FormulaClozeMalformedReason;
}

export interface FormulaClozeParseResult {
  targets: FormulaClozeTarget[];
  malformed: FormulaClozeMalformed[];
}

interface BracedArgument {
  content: string;
  nextIndex: number;
}

function parseBracedArgument(source: string, fromIndex: number): BracedArgument | null {
  let index = fromIndex;

  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }

  if (source[index] !== '{') {
    return null;
  }

  const contentStart = index + 1;
  let depth = 1;

  for (let i = contentStart; i < source.length; i += 1) {
    const char = source[i];

    if (char === '\\') {
      i += 1;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          content: source.slice(contentStart, i),
          nextIndex: i + 1,
        };
      }
    }
  }

  return null;
}

function isSupportedMarker(value: string): boolean {
  return /^c\d+$/i.test(value) || /^#\d+$/.test(value);
}

export function parseFormulaClozeTargets(source: string): FormulaClozeParseResult {
  const targets: FormulaClozeTarget[] = [];
  const malformed: FormulaClozeMalformed[] = [];
  const normalizedSource = String(source || '');
  const commandRegex = /\\+cloze/g;
  let cursor = 0;

  while (cursor < normalizedSource.length) {
    commandRegex.lastIndex = cursor;
    const match = commandRegex.exec(normalizedSource);
    if (!match) {
      break;
    }

    const start = match.index;
    const commandEnd = start + match[0].length;
    const firstArg = parseBracedArgument(normalizedSource, commandEnd);
    if (!firstArg) {
      malformed.push({
        start,
        commandEnd,
        reason: 'missing-marker-argument',
      });
      cursor = commandEnd;
      continue;
    }

    const firstArgText = firstArg.content.trim();
    const secondArg = parseBracedArgument(normalizedSource, firstArg.nextIndex);
    if (isSupportedMarker(firstArgText)) {
      if (!secondArg) {
        malformed.push({
          start,
          commandEnd,
          reason: 'missing-answer-argument',
        });
        cursor = firstArg.nextIndex;
        continue;
      }

      const text = secondArg.content.trim();
      if (text) {
        targets.push({
          text,
          markerId: firstArgText,
          start,
          end: secondArg.nextIndex,
        });
      }
      cursor = secondArg.nextIndex;
      continue;
    }

    if (secondArg) {
      malformed.push({
        start,
        commandEnd,
        reason: 'unsupported-marker-syntax',
      });
      cursor = secondArg.nextIndex;
      continue;
    }

    if (firstArgText) {
      targets.push({
        text: firstArgText,
        start,
        end: firstArg.nextIndex,
      });
    }
    cursor = firstArg.nextIndex;
  }

  return { targets, malformed };
}

export function hasFormulaClozeTargets(source: string): boolean {
  return parseFormulaClozeTargets(source).targets.length > 0;
}

export function hasFormulaClozeMarkerTargets(source: string): boolean {
  return parseFormulaClozeTargets(source).targets.some(target => !!target.markerId);
}
