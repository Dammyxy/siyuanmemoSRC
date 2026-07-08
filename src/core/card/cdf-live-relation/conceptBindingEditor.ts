import {
  parseCardSourceGrammar,
} from './sourceGrammar';
import type {
  CdfConceptBlockId,
  CdfConceptTarget,
  CdfRelationFamily,
  CdfRelationKind,
  CdfSourceBlockId,
} from './types';

export type CdfConceptBindingEditDiagnosticCode =
  | 'missing-source-block'
  | 'invalid-source-grammar'
  | 'missing-old-concept-reference'
  | 'stale-old-concept-reference'
  | 'ambiguous-concept-reference'
  | 'invalid-target-block'
  | 'descriptor-structure-repair-unavailable';

export interface CdfConceptBindingEditDiagnostic {
  code: CdfConceptBindingEditDiagnosticCode;
  sourceBlockId?: CdfSourceBlockId;
  expectedConceptBlockId?: CdfConceptBlockId;
  actualConceptBlockId?: CdfConceptBlockId;
  selectedConceptBlockId?: CdfConceptBlockId;
  relationFamily?: CdfRelationFamily;
  relationKind?: CdfRelationKind;
  detail?: string;
}

export type CdfConceptBindingEditPlanKind =
  | 'replace-existing-reference'
  | 'repair-stale-reference'
  | 'bind-empty-definition'
  | 'bind-empty-descriptor-structure'
  | 'unavailable';

export type CdfConceptBindingEditPlan =
  | {
    kind: Exclude<CdfConceptBindingEditPlanKind, 'unavailable'>;
    sourceBlockId: CdfSourceBlockId;
    source: string;
    rewrittenSource: string;
    selectedConceptBlockId: CdfConceptBlockId;
    expectedConceptBlockId?: CdfConceptBlockId;
    actualConceptBlockId?: CdfConceptBlockId;
    relationFamily?: CdfRelationFamily;
    relationKind?: CdfRelationKind;
    requiresConfirmation: boolean;
    diagnostics: CdfConceptBindingEditDiagnostic[];
  }
  | {
    kind: 'unavailable';
    sourceBlockId?: CdfSourceBlockId;
    source: string;
    selectedConceptBlockId?: CdfConceptBlockId;
    expectedConceptBlockId?: CdfConceptBlockId;
    relationFamily?: CdfRelationFamily;
    relationKind?: CdfRelationKind;
    requiresConfirmation: false;
    diagnostics: CdfConceptBindingEditDiagnostic[];
  };

export type CdfConceptBindingEditResult =
  | {
    ok: true;
    source: string;
  }
  | {
    ok: false;
    diagnostics: CdfConceptBindingEditDiagnostic[];
  };

export interface CdfConceptBindingEditInput {
  sourceBlockId?: string;
  source?: string | null;
  selectedConceptBlockId: string;
  expectedConceptBlockId?: string | null;
  relationFamily?: CdfRelationFamily;
  relationKind?: CdfRelationKind;
  target?: CdfConceptTarget | string | null;
}

interface BlockReferenceOccurrence {
  blockId: string;
  index: number;
  end: number;
  alias: string;
  raw: string;
}

const SIYUAN_BLOCK_ID_RE = /^\d{14}-[a-z0-9]{7}$/i;
const BLOCK_REF_RE = /\(\((\d{14}-[a-z0-9]{7})(\s+[^\)]*)?\)\)/gi;
const TRAILING_BLOCK_ATTR_PATTERN = /\s*\{:[^{}]*\}\s*$/s;

function normalizeBlockId(value: string | null | undefined): string {
  const normalized = String(value || '').trim();
  return SIYUAN_BLOCK_ID_RE.test(normalized) ? normalized : '';
}

function splitTrailingBlockAttrs(source: string): { body: string; trailingAttrs: string } {
  const match = source.match(TRAILING_BLOCK_ATTR_PATTERN);
  if (!match || match.index === undefined) {
    return {
      body: source,
      trailingAttrs: '',
    };
  }

  return {
    body: source.slice(0, match.index),
    trailingAttrs: source.slice(match.index),
  };
}

function readTargetType(target: CdfConceptBindingEditInput['target'], selectedConceptBlockId: string): string | null {
  if (typeof target === 'string') {
    return target;
  }
  if (!target || target.id !== selectedConceptBlockId) {
    return null;
  }
  return target.type;
}

function extractBlockReferences(source: string): BlockReferenceOccurrence[] {
  return [...source.matchAll(BLOCK_REF_RE)].map(match => ({
    blockId: match[1],
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    alias: match[2] ?? '',
    raw: match[0],
  }));
}

function unavailable(input: {
  sourceBlockId?: string;
  source: string;
  selectedConceptBlockId?: string;
  expectedConceptBlockId?: string;
  relationFamily?: CdfRelationFamily;
  relationKind?: CdfRelationKind;
  diagnostics: CdfConceptBindingEditDiagnostic[];
}): CdfConceptBindingEditPlan {
  return {
    kind: 'unavailable',
    sourceBlockId: input.sourceBlockId,
    source: input.source,
    selectedConceptBlockId: input.selectedConceptBlockId,
    expectedConceptBlockId: input.expectedConceptBlockId,
    relationFamily: input.relationFamily,
    relationKind: input.relationKind,
    requiresConfirmation: false,
    diagnostics: input.diagnostics,
  };
}

function replaceOccurrence(input: {
  body: string;
  trailingAttrs: string;
  occurrence: BlockReferenceOccurrence;
  selectedConceptBlockId: string;
}): string {
  const nextRef = `((${input.selectedConceptBlockId}${input.occurrence.alias}))`;
  return [
    input.body.slice(0, input.occurrence.index),
    nextRef,
    input.body.slice(input.occurrence.end),
    input.trailingAttrs,
  ].join('');
}

function insertDefinitionBinding(input: {
  body: string;
  trailingAttrs: string;
  selectedConceptBlockId: string;
}): string {
  const leadingWhitespace = input.body.match(/^\s*/)?.[0] ?? '';
  const rest = input.body.slice(leadingWhitespace.length);
  return [
    leadingWhitespace,
    `((${input.selectedConceptBlockId}))`,
    rest ? ` ${rest}` : '',
    input.trailingAttrs,
  ].join('');
}

export function planCdfConceptBindingEdit(input: CdfConceptBindingEditInput): CdfConceptBindingEditPlan {
  const sourceBlockId = String(input.sourceBlockId || '').trim();
  const source = String(input.source ?? '');
  const selectedConceptBlockId = normalizeBlockId(input.selectedConceptBlockId);
  const expectedConceptBlockId = normalizeBlockId(input.expectedConceptBlockId ?? '');
  const relationFamily = input.relationFamily;
  const relationKind = input.relationKind;

  if (!sourceBlockId || source.length === 0) {
    return unavailable({
      sourceBlockId,
      source,
      selectedConceptBlockId,
      expectedConceptBlockId,
      relationFamily,
      relationKind,
      diagnostics: [{
        code: 'missing-source-block',
        sourceBlockId,
        selectedConceptBlockId,
        expectedConceptBlockId,
        relationFamily,
        relationKind,
      }],
    });
  }

  if (!selectedConceptBlockId || readTargetType(input.target, selectedConceptBlockId) !== 'd') {
    return unavailable({
      sourceBlockId,
      source,
      selectedConceptBlockId,
      expectedConceptBlockId,
      relationFamily,
      relationKind,
      diagnostics: [{
        code: 'invalid-target-block',
        sourceBlockId,
        selectedConceptBlockId: selectedConceptBlockId || input.selectedConceptBlockId,
        expectedConceptBlockId,
        relationFamily,
        relationKind,
      }],
    });
  }

  const { body, trailingAttrs } = splitTrailingBlockAttrs(source);
  const grammar = parseCardSourceGrammar(body);
  if (grammar.issues.length > 0) {
    return unavailable({
      sourceBlockId,
      source,
      selectedConceptBlockId,
      expectedConceptBlockId,
      relationFamily,
      relationKind,
      diagnostics: [{
        code: 'invalid-source-grammar',
        sourceBlockId,
        selectedConceptBlockId,
        expectedConceptBlockId,
        relationFamily,
        relationKind,
        detail: grammar.issues.map(issue => issue.detail || issue.code).join('; '),
      }],
    });
  }

  const refs = extractBlockReferences(body);
  if (refs.length > 1) {
    return unavailable({
      sourceBlockId,
      source,
      selectedConceptBlockId,
      expectedConceptBlockId,
      relationFamily,
      relationKind,
      diagnostics: [{
        code: 'ambiguous-concept-reference',
        sourceBlockId,
        selectedConceptBlockId,
        expectedConceptBlockId,
        relationFamily,
        relationKind,
        detail: refs.map(ref => ref.blockId).join(','),
      }],
    });
  }

  if (refs.length === 1) {
    const actualConceptBlockId = refs[0].blockId;
    if (expectedConceptBlockId && actualConceptBlockId !== expectedConceptBlockId) {
      const rewrittenSource = replaceOccurrence({
        body,
        trailingAttrs,
        occurrence: refs[0],
        selectedConceptBlockId,
      });
      return {
        kind: 'repair-stale-reference',
        sourceBlockId,
        source,
        rewrittenSource,
        selectedConceptBlockId,
        expectedConceptBlockId,
        actualConceptBlockId,
        relationFamily,
        relationKind,
        requiresConfirmation: true,
        diagnostics: [{
          code: 'stale-old-concept-reference',
          sourceBlockId,
          expectedConceptBlockId,
          actualConceptBlockId,
          selectedConceptBlockId,
          relationFamily,
          relationKind,
        }],
      };
    }

    const rewrittenSource = replaceOccurrence({
      body,
      trailingAttrs,
      occurrence: refs[0],
      selectedConceptBlockId,
    });
    return {
      kind: 'replace-existing-reference',
      sourceBlockId,
      source,
      rewrittenSource,
      selectedConceptBlockId,
      expectedConceptBlockId,
      actualConceptBlockId,
      relationFamily,
      relationKind,
      requiresConfirmation: false,
      diagnostics: [],
    };
  }

  if (relationFamily === 'definition' && grammar.primaryOperator?.family === 'definition') {
    return {
      kind: 'bind-empty-definition',
      sourceBlockId,
      source,
      rewrittenSource: insertDefinitionBinding({
        body,
        trailingAttrs,
        selectedConceptBlockId,
      }),
      selectedConceptBlockId,
      expectedConceptBlockId,
      relationFamily,
      relationKind,
      requiresConfirmation: false,
      diagnostics: [],
    };
  }

  if (relationFamily === 'descriptor') {
    return unavailable({
      sourceBlockId,
      source,
      selectedConceptBlockId,
      expectedConceptBlockId,
      relationFamily,
      relationKind,
      diagnostics: [{
        code: 'descriptor-structure-repair-unavailable',
        sourceBlockId,
        selectedConceptBlockId,
        expectedConceptBlockId,
        relationFamily,
        relationKind,
      }],
    });
  }

  return unavailable({
    sourceBlockId,
    source,
    selectedConceptBlockId,
    expectedConceptBlockId,
    relationFamily,
    relationKind,
    diagnostics: [{
      code: 'missing-old-concept-reference',
      sourceBlockId,
      selectedConceptBlockId,
      expectedConceptBlockId,
      relationFamily,
      relationKind,
    }],
  });
}

export function applyCdfConceptBindingEdit(plan: CdfConceptBindingEditPlan): CdfConceptBindingEditResult {
  if (plan.kind === 'unavailable') {
    return {
      ok: false,
      diagnostics: plan.diagnostics,
    };
  }
  return {
    ok: true,
    source: plan.rewrittenSource,
  };
}
