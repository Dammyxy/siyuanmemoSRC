/**
 * Cloze detection helpers shared by card creation flows.
 */

import { getTokenizedMarkSpanRegex, hasDataTypeToken } from '@/utils/markDataType';
import { parseFormulaClozeTargets } from '@/utils/formula-cloze-parser';

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

    const braceRegex = /(^|[^{}])\{\{(?!\{)([\s\S]*?)\}\}(?!\})/g;
    while ((match = braceRegex.exec(content)) !== null) {
      const prefix = match[1] ?? '';
      const clozeStart = match.index + prefix.length;
      const clozeLength = match[0].length - prefix.length;
      clozes.push({
        text: (match[2] ?? '').trim(),
        start: clozeStart,
        end: clozeStart + clozeLength,
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

    const markRegex = getTokenizedMarkSpanRegex();
    while ((match = markRegex.exec(content)) !== null) {
      if (!hasDataTypeToken(match[2], 'mark')) {
        continue;
      }
      clozes.push({
        text: (match[3] ?? '').trim(),
        start: match.index,
        end: match.index + match[0].length,
        type: 'mark',
      });
    }

    this.extractLatexClozes(content, clozes);

    return this.resolveOverlappingClozes(clozes);
  }

  private static extractLatexClozes(content: string, output: ClozeInfo[]): void {
    for (const target of parseFormulaClozeTargets(content).targets) {
      output.push({
        text: target.text,
        start: target.start,
        end: target.end,
        type: 'latex',
      });
    }
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
