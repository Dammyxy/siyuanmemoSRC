import type {
  CdfContentShape,
  CdfLiveRelationContentFields,
  CdfLiveRelationIssue,
  CdfRelationFamily,
  CdfRelationKind,
} from './types';

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

export type CardSourceGrammarFieldFamily = 'item' | CdfRelationFamily;
export type CardSourceGrammarFieldRole = 'question' | 'answer' | 'definition' | 'cue';
export type CardSourceGrammarFieldFallbackReason =
  | 'invalid-source-grammar'
  | 'unsafe-field-identity';

export interface SafeCardSourceGrammarField {
  role: CardSourceGrammarFieldRole;
  value: string;
}

export type SafeCardSourceGrammarFieldExtraction =
  | {
    ok: true;
    family: CardSourceGrammarFieldFamily;
    operator: CardSourceOperatorToken | null;
    fields: SafeCardSourceGrammarField[];
    contentShape: CdfContentShape;
  }
  | {
    ok: false;
    reason: CardSourceGrammarFieldFallbackReason;
    issues: CdfLiveRelationIssue[];
  };

export type CardSourceGrammarDefinitionRewriteResult =
  | {
    ok: true;
    source: string;
  }
  | {
    ok: false;
    reason: CardSourceGrammarFieldFallbackReason;
    issues: CdfLiveRelationIssue[];
  };

export type CardSourceGrammarDescriptorRewriteResult =
  | {
    ok: true;
    source: string;
  }
  | {
    ok: false;
    reason: CardSourceGrammarFieldFallbackReason;
    issues: CdfLiveRelationIssue[];
  };

export type CardSourceGrammarItemRewriteResult =
  | {
    ok: true;
    source: string;
  }
  | {
    ok: false;
    reason: CardSourceGrammarFieldFallbackReason;
    issues: CdfLiveRelationIssue[];
  };

const FW_COLON = '\uFF1A';
const FW_SEMICOLON = '\uFF1B';
const FW_LT = '\uFF1C';
const FW_GT = '\uFF1E';
const CJK_LT = '\u300A';
const CJK_GT = '\u300B';
const TRAILING_BLOCK_ATTR_PATTERN = /\s*\{:[^{}]*\}\s*$/s;
const ARROW_SPLIT_RE = /^(.*?)\s*(?:->|→)\s*(.+)$/s;

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

function normalizeFieldSource(source: string): string {
  return String(source || '').replace(TRAILING_BLOCK_ATTR_PATTERN, '').trim();
}

function splitTrailingBlockAttrs(source: string): { body: string; trailingAttrs: string } {
  const normalizedSource = String(source || '');
  const match = normalizedSource.match(TRAILING_BLOCK_ATTR_PATTERN);
  if (!match || match.index === undefined) {
    return {
      body: normalizedSource,
      trailingAttrs: '',
    };
  }

  return {
    body: normalizedSource.slice(0, match.index),
    trailingAttrs: normalizedSource.slice(match.index),
  };
}

export function splitGroupedDescriptorLeafSource(source: string): {
  shape: Extract<CdfContentShape, 'descriptor-group-plain' | 'descriptor-group-arrow'>;
  content: CdfLiveRelationContentFields;
} {
  const normalizedSource = normalizeFieldSource(source);
  const arrow = normalizedSource.match(ARROW_SPLIT_RE);
  if (arrow) {
    return {
      shape: 'descriptor-group-arrow',
      content: {
        cue: normalizeFieldSource(arrow[1]),
        answer: normalizeFieldSource(arrow[2]),
      },
    };
  }

  return {
    shape: 'descriptor-group-plain',
    content: {
      cue: '',
      answer: normalizedSource,
    },
  };
}

export function extractSafeCardSourceGrammarFields(input: {
  source: string;
  family: CardSourceGrammarFieldFamily;
  descriptorGroupLeaf?: boolean;
}): SafeCardSourceGrammarFieldExtraction {
  const source = normalizeFieldSource(input.source);
  const grammar = parseCardSourceGrammar(source);
  if (grammar.issues.length > 0) {
    return {
      ok: false,
      reason: 'invalid-source-grammar',
      issues: grammar.issues,
    };
  }

  const operator = grammar.primaryOperator;
  if (!operator) {
    if (input.family === 'descriptor' && input.descriptorGroupLeaf) {
      const parsed = splitGroupedDescriptorLeafSource(source);
      const fields: SafeCardSourceGrammarField[] = parsed.shape === 'descriptor-group-arrow'
        ? [
          { role: 'cue', value: parsed.content.cue ?? '' },
          { role: 'answer', value: parsed.content.answer ?? '' },
        ]
        : [
          { role: 'answer', value: parsed.content.answer ?? '' },
        ];
      return {
        ok: true,
        family: 'descriptor',
        operator: null,
        fields,
        contentShape: parsed.shape,
      };
    }

    return {
      ok: false,
      reason: 'unsafe-field-identity',
      issues: [],
    };
  }

  if (operator.role !== 'relation' || operator.family !== input.family) {
    return {
      ok: false,
      reason: 'unsafe-field-identity',
      issues: [],
    };
  }

  const split = splitSourceByOperator(source, operator);
  if (operator.family === 'item') {
    const fields = operator.canonical === '<<'
      ? [
        { role: 'question' as const, value: split.right },
        { role: 'answer' as const, value: split.left },
      ]
      : [
        { role: 'question' as const, value: split.left },
        { role: 'answer' as const, value: split.right },
      ];
    return {
      ok: true,
      family: 'item',
      operator,
      fields,
      contentShape: 'item',
    };
  }

  if (operator.family === 'definition') {
    return {
      ok: true,
      family: 'definition',
      operator,
      fields: [
        { role: 'definition', value: split.right },
      ],
      contentShape: 'definition',
    };
  }

  return {
    ok: true,
    family: 'descriptor',
    operator,
    fields: [
      { role: 'cue', value: split.left },
      { role: 'answer', value: split.right },
    ],
    contentShape: 'descriptor-explicit',
  };
}

export function replaceDefinitionInCardSourceGrammar(input: {
  source: string;
  definition: string;
}): CardSourceGrammarDefinitionRewriteResult {
  const { body, trailingAttrs } = splitTrailingBlockAttrs(input.source);
  const grammar = parseCardSourceGrammar(body);
  if (grammar.issues.length > 0) {
    return {
      ok: false,
      reason: 'invalid-source-grammar',
      issues: grammar.issues,
    };
  }

  const operator = grammar.primaryOperator;
  if (!operator || operator.role !== 'relation' || operator.family !== 'definition') {
    return {
      ok: false,
      reason: 'unsafe-field-identity',
      issues: [],
    };
  }

  const afterOperator = body.slice(operator.end);
  const leadingWhitespace = afterOperator.match(/^\s*/)?.[0] ?? '';
  const contentAfterLeadingWhitespace = afterOperator.slice(leadingWhitespace.length);
  const trailingWhitespace = contentAfterLeadingWhitespace.match(/\s*$/)?.[0] ?? '';
  return {
    ok: true,
    source: [
      body.slice(0, operator.end),
      leadingWhitespace,
      String(input.definition ?? ''),
      trailingWhitespace,
      trailingAttrs,
    ].join(''),
  };
}

function replaceDescriptorExplicitSource(input: {
  body: string;
  trailingAttrs: string;
  operator: CardSourceOperatorToken;
  cue: string;
  answer: string;
}): string {
  const beforeOperator = input.body.slice(0, input.operator.index);
  const afterOperator = input.body.slice(input.operator.end);
  const cueLeadingWhitespace = beforeOperator.match(/^\s*/)?.[0] ?? '';
  const cueTrailingWhitespace = beforeOperator.match(/\s*$/)?.[0] ?? '';
  const answerLeadingWhitespace = afterOperator.match(/^\s*/)?.[0] ?? '';
  const answerTrailingWhitespace = afterOperator.match(/\s*$/)?.[0] ?? '';
  return [
    cueLeadingWhitespace,
    input.cue,
    cueTrailingWhitespace,
    input.operator.raw,
    answerLeadingWhitespace,
    input.answer,
    answerTrailingWhitespace,
    input.trailingAttrs,
  ].join('');
}

function replaceGroupedDescriptorLeafContent(input: {
  body: string;
  trailingAttrs: string;
  cue?: string;
  answer: string;
}): string {
  const arrow = input.body.match(/^(.*?)(\s*)(->|→)(\s*)(.*)$/s);
  if (arrow) {
    const left = arrow[1] ?? '';
    const cueLeadingWhitespace = left.match(/^\s*/)?.[0] ?? '';
    const answerTrailingWhitespace = (arrow[5] ?? '').match(/\s*$/)?.[0] ?? '';
    return [
      cueLeadingWhitespace,
      input.cue ?? '',
      arrow[2] ?? '',
      arrow[3] ?? '->',
      arrow[4] ?? '',
      input.answer,
      answerTrailingWhitespace,
      input.trailingAttrs,
    ].join('');
  }

  const leadingWhitespace = input.body.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = input.body.match(/\s*$/)?.[0] ?? '';
  return [
    leadingWhitespace,
    input.answer,
    trailingWhitespace,
    input.trailingAttrs,
  ].join('');
}

export function replaceDescriptorInCardSourceGrammar(input: {
  source: string;
  cue?: string;
  answer: string;
  descriptorGroupLeaf?: boolean;
}): CardSourceGrammarDescriptorRewriteResult {
  const { body, trailingAttrs } = splitTrailingBlockAttrs(input.source);
  const grammar = parseCardSourceGrammar(body);
  if (grammar.issues.length > 0) {
    return {
      ok: false,
      reason: 'invalid-source-grammar',
      issues: grammar.issues,
    };
  }

  const operator = grammar.primaryOperator;
  if (!operator) {
    if (!input.descriptorGroupLeaf) {
      return {
        ok: false,
        reason: 'unsafe-field-identity',
        issues: [],
      };
    }

    return {
      ok: true,
      source: replaceGroupedDescriptorLeafContent({
        body,
        trailingAttrs,
        cue: input.cue,
        answer: String(input.answer ?? ''),
      }),
    };
  }

  if (operator.role !== 'relation' || operator.family !== 'descriptor') {
    return {
      ok: false,
      reason: 'unsafe-field-identity',
      issues: [],
    };
  }

  return {
    ok: true,
    source: replaceDescriptorExplicitSource({
      body,
      trailingAttrs,
      operator,
      cue: String(input.cue ?? ''),
      answer: String(input.answer ?? ''),
    }),
  };
}

export function replaceItemInCardSourceGrammar(input: {
  source: string;
  question: string;
  answer: string;
}): CardSourceGrammarItemRewriteResult {
  const { body, trailingAttrs } = splitTrailingBlockAttrs(input.source);
  const grammar = parseCardSourceGrammar(body);
  if (grammar.issues.length > 0) {
    return {
      ok: false,
      reason: 'invalid-source-grammar',
      issues: grammar.issues,
    };
  }

  const operator = grammar.primaryOperator;
  if (!operator || operator.role !== 'relation' || operator.family !== 'item') {
    return {
      ok: false,
      reason: 'unsafe-field-identity',
      issues: [],
    };
  }

  const beforeOperator = body.slice(0, operator.index);
  const afterOperator = body.slice(operator.end);
  const leftLeadingWhitespace = beforeOperator.match(/^\s*/)?.[0] ?? '';
  const leftTrailingWhitespace = beforeOperator.match(/\s*$/)?.[0] ?? '';
  const rightLeadingWhitespace = afterOperator.match(/^\s*/)?.[0] ?? '';
  const rightTrailingWhitespace = afterOperator.match(/\s*$/)?.[0] ?? '';
  const leftValue = operator.canonical === '<<'
    ? String(input.answer ?? '')
    : String(input.question ?? '');
  const rightValue = operator.canonical === '<<'
    ? String(input.question ?? '')
    : String(input.answer ?? '');

  return {
    ok: true,
    source: [
      leftLeadingWhitespace,
      leftValue,
      leftTrailingWhitespace,
      operator.raw,
      rightLeadingWhitespace,
      rightValue,
      rightTrailingWhitespace,
      trailingAttrs,
    ].join(''),
  };
}
