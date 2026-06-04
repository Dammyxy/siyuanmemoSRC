import type { CdfLiveRelationIssue, CdfRelationFamily, CdfRelationKind } from './types';

export type CardSourceOperatorCanonical =
  | '>>'
  | '<<'
  | '<>'
  | '>>>'
  | '::'
  | ':>'
  | ':<'
  | ':::'
  | ';;'
  | ';<'
  | ';<>'
  | ';;;';

export interface CardSourceOperatorToken {
  canonical: CardSourceOperatorCanonical;
  raw: string;
  index: number;
  end: number;
  family: 'item' | CdfRelationFamily;
  role: 'relation' | 'group';
  relationKinds: CdfRelationKind[];
}

export interface CardSourceGrammarParseResult {
  source: string;
  operators: CardSourceOperatorToken[];
  primaryOperator: CardSourceOperatorToken | null;
  issues: CdfLiveRelationIssue[];
}

const FW_COLON = '\uFF1A';
const FW_SEMICOLON = '\uFF1B';
const FW_LT = '\uFF1C';
const FW_GT = '\uFF1E';
const CJK_LT = '\u300A';
const CJK_GT = '\u300B';

type OperatorDefinition = {
  canonical: CardSourceOperatorCanonical;
  family: 'item' | CdfRelationFamily;
  role: 'relation' | 'group';
  relationKinds: CdfRelationKind[];
  aliases: string[];
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function combine(parts: string[][]): string[] {
  let result = [''];
  for (const part of parts) {
    const next: string[] = [];
    for (const prefix of result) {
      for (const value of part) {
        next.push(prefix + value);
      }
    }
    result = next;
  }
  return result;
}

const colon = [':', FW_COLON];
const semicolon = [';', FW_SEMICOLON];
const left = ['<', FW_LT, CJK_LT];
const right = ['>', FW_GT, CJK_GT];

const OPERATOR_DEFINITIONS: OperatorDefinition[] = [
  {
    canonical: '>>>',
    family: 'item',
    role: 'group',
    relationKinds: [],
    aliases: unique([...combine([right, right, right]), '>>>']),
  },
  {
    canonical: ':::',
    family: 'definition',
    role: 'group',
    relationKinds: [],
    aliases: unique([...combine([colon, colon, colon]), ':::']),
  },
  {
    canonical: ';;;',
    family: 'descriptor',
    role: 'group',
    relationKinds: [],
    aliases: unique([...combine([semicolon, semicolon, semicolon]), ';;;']),
  },
  {
    canonical: ';<>',
    family: 'descriptor',
    role: 'relation',
    relationKinds: ['descriptor-forward', 'descriptor-reverse'],
    aliases: unique([...combine([semicolon, left, right]), ';<>']),
  },
  {
    canonical: '>>',
    family: 'item',
    role: 'relation',
    relationKinds: [],
    aliases: unique([...combine([right, right]), '>>']),
  },
  {
    canonical: '<<',
    family: 'item',
    role: 'relation',
    relationKinds: [],
    aliases: unique([...combine([left, left]), '<<']),
  },
  {
    canonical: '<>',
    family: 'item',
    role: 'relation',
    relationKinds: [],
    aliases: unique([...combine([left, right]), '<>']),
  },
  {
    canonical: '::',
    family: 'definition',
    role: 'relation',
    relationKinds: ['definition-forward', 'definition-reverse'],
    aliases: unique([...combine([colon, colon]), '::']),
  },
  {
    canonical: ':>',
    family: 'definition',
    role: 'relation',
    relationKinds: ['definition-forward'],
    aliases: unique([...combine([colon, right]), ':>']),
  },
  {
    canonical: ':<',
    family: 'definition',
    role: 'relation',
    relationKinds: ['definition-reverse'],
    aliases: unique([...combine([colon, left]), ':<']),
  },
  {
    canonical: ';;',
    family: 'descriptor',
    role: 'relation',
    relationKinds: ['descriptor-forward'],
    aliases: unique([...combine([semicolon, semicolon]), ';;']),
  },
  {
    canonical: ';<',
    family: 'descriptor',
    role: 'relation',
    relationKinds: ['descriptor-reverse'],
    aliases: unique([...combine([semicolon, left]), ';<']),
  },
].map((definition) => ({
  ...definition,
  aliases: definition.aliases.sort((leftAlias, rightAlias) => rightAlias.length - leftAlias.length),
}));

const SORTED_OPERATOR_DEFINITIONS = [...OPERATOR_DEFINITIONS].sort((leftDef, rightDef) => {
  const leftLength = Math.max(...leftDef.aliases.map((alias) => alias.length));
  const rightLength = Math.max(...rightDef.aliases.map((alias) => alias.length));
  return rightLength - leftLength;
});

function markRange(mask: boolean[], start: number, end: number): void {
  for (let index = Math.max(0, start); index < Math.min(mask.length, end); index += 1) {
    mask[index] = true;
  }
}

function markRegexRanges(source: string, mask: boolean[], pattern: RegExp): void {
  for (const match of source.matchAll(pattern)) {
    markRange(mask, match.index ?? 0, (match.index ?? 0) + match[0].length);
  }
}

function buildIgnoredMask(source: string): boolean[] {
  const mask = new Array<boolean>(source.length).fill(false);
  markRegexRanges(source, mask, /(^|\n)(```|~~~)[\s\S]*?(?:\n\2|$)/g);
  markRegexRanges(source, mask, /`+[^`]*`+/g);
  markRegexRanges(source, mask, /\$\$[\s\S]*?\$\$/g);
  markRegexRanges(source, mask, /\\\[[\s\S]*?\\\]/g);
  markRegexRanges(source, mask, /\\\([\s\S]*?\\\)/g);
  markRegexRanges(source, mask, /\$[^$\n]+\$/g);
  return mask;
}

function rangeIsIgnored(mask: boolean[], start: number, end: number): boolean {
  for (let index = start; index < end; index += 1) {
    if (mask[index]) {
      return true;
    }
  }
  return false;
}

function matchOperatorAt(source: string, index: number, mask: boolean[]): CardSourceOperatorToken | null {
  for (const definition of SORTED_OPERATOR_DEFINITIONS) {
    for (const alias of definition.aliases) {
      const end = index + alias.length;
      if (source.startsWith(alias, index) && !rangeIsIgnored(mask, index, end)) {
        return {
          canonical: definition.canonical,
          raw: alias,
          index,
          end,
          family: definition.family,
          role: definition.role,
          relationKinds: definition.relationKinds,
        };
      }
    }
  }
  return null;
}

export function tokenizeCardSourceOperators(source: string): CardSourceOperatorToken[] {
  const normalizedSource = String(source || '');
  const mask = buildIgnoredMask(normalizedSource);
  const operators: CardSourceOperatorToken[] = [];

  for (let index = 0; index < normalizedSource.length; index += 1) {
    if (mask[index]) {
      continue;
    }
    const token = matchOperatorAt(normalizedSource, index, mask);
    if (!token) {
      continue;
    }
    operators.push(token);
    index = token.end - 1;
  }

  return operators;
}

export function parseCardSourceGrammar(source: string): CardSourceGrammarParseResult {
  const operators = tokenizeCardSourceOperators(source);
  const issues: CdfLiveRelationIssue[] = [];
  if (operators.length > 1) {
    issues.push({
      code: 'invalid-source-grammar',
      severity: 'blocking',
      detail: 'Source block contains more than one main Card Source Grammar operator.',
    });
  }

  return {
    source: String(source || ''),
    operators,
    primaryOperator: operators[0] ?? null,
    issues,
  };
}

export function splitSourceByOperator(source: string, token: CardSourceOperatorToken): { left: string; right: string } {
  return {
    left: source.slice(0, token.index).trim(),
    right: source.slice(token.end).trim(),
  };
}
