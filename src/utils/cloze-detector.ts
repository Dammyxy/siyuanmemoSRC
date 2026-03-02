/**
 * Cloze detection helpers shared by card creation flows.
 */

export interface ClozeInfo {
  text: string;
  start: number;
  end: number;
  type: 'brace' | 'equal' | 'mark' | 'latex';
}

export class ClozeDetector {
  static extractClozes(content: string): ClozeInfo[] {
    const clozes: ClozeInfo[] = [];

    let match: RegExpExecArray | null;

    const braceRegex = /\{\{([^}]*)\}\}/g;
    while ((match = braceRegex.exec(content)) !== null) {
      clozes.push({
        text: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
        type: 'brace',
      });
    }

    const equalRegex = /==([^=]*)==/g;
    while ((match = equalRegex.exec(content)) !== null) {
      clozes.push({
        text: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
        type: 'equal',
      });
    }

    const markRegex = /<span data-type="mark">(.+?)<\/span>/g;
    while ((match = markRegex.exec(content)) !== null) {
      clozes.push({
        text: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
        type: 'mark',
      });
    }

    this.extractLatexClozes(content, clozes);

    return this.resolveOverlappingClozes(clozes);
  }

  private static extractLatexClozes(content: string, output: ClozeInfo[]): void {
    const commandRegex = /\\+cloze/g;
    let cursor = 0;

    while (cursor < content.length) {
      commandRegex.lastIndex = cursor;
      const match = commandRegex.exec(content);
      if (!match) {
        break;
      }

      const start = match.index;
      const commandEnd = start + match[0].length;
      const firstArg = this.parseBracedArgument(content, commandEnd);
      if (!firstArg) {
        cursor = commandEnd;
        continue;
      }

      const firstArgText = firstArg.content.trim();
      const isNumberedLatexCloze = /^c\d+$/i.test(firstArgText);
      const secondArg = this.parseBracedArgument(content, firstArg.nextIndex);
      const hasSecondArgForNumberedCloze = isNumberedLatexCloze && !!secondArg;
      const targetArg = hasSecondArgForNumberedCloze && secondArg ? secondArg : firstArg;
      const end = hasSecondArgForNumberedCloze && secondArg ? secondArg.nextIndex : firstArg.nextIndex;
      const text = targetArg.content.trim();

      if (text.length > 0) {
        output.push({
          text,
          start,
          end,
          type: 'latex',
        });
      }

      cursor = end;
    }
  }

  private static parseBracedArgument(
    source: string,
    fromIndex: number
  ): { content: string; nextIndex: number } | null {
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

  private static resolveOverlappingClozes(clozes: ClozeInfo[]): ClozeInfo[] {
    if (clozes.length <= 1) {
      return clozes;
    }

    const sorted = [...clozes].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.end !== b.end) return b.end - a.end;
      return this.clozeTypePriority(b.type) - this.clozeTypePriority(a.type);
    });

    const resolved: ClozeInfo[] = [];

    for (const candidate of sorted) {
      const last = resolved[resolved.length - 1];
      if (!last) {
        resolved.push(candidate);
        continue;
      }

      if (!this.isOverlapping(last, candidate)) {
        resolved.push(candidate);
        continue;
      }

      const preferred = this.pickPreferredCloze(last, candidate);
      if (preferred !== last) {
        resolved[resolved.length - 1] = preferred;
      }
    }

    return resolved.sort((a, b) => a.start - b.start);
  }

  private static pickPreferredCloze(current: ClozeInfo, candidate: ClozeInfo): ClozeInfo {
    const currentPriority = this.clozeTypePriority(current.type);
    const candidatePriority = this.clozeTypePriority(candidate.type);

    if (candidatePriority > currentPriority) {
      return candidate;
    }
    if (candidatePriority < currentPriority) {
      return current;
    }

    const currentLength = current.end - current.start;
    const candidateLength = candidate.end - candidate.start;
    if (candidateLength > currentLength) {
      return candidate;
    }
    if (candidateLength < currentLength) {
      return current;
    }

    return candidate.start < current.start ? candidate : current;
  }

  private static clozeTypePriority(type: ClozeInfo['type']): number {
    if (type === 'latex') {
      return 3;
    }
    return 1;
  }

  private static isOverlapping(a: ClozeInfo, b: ClozeInfo): boolean {
    return a.start < b.end && b.start < a.end;
  }

  static hasClozes(content: string): boolean {
    return this.extractClozes(content).length > 0;
  }

  static getClozeCount(content: string): number {
    return this.extractClozes(content).length;
  }
}
