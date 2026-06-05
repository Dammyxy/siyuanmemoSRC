import { evaluateCdfContentStatus } from './contentStatus';
import { createCdfLiveRelationKey } from './relationKey';
import {
  parseCardSourceGrammar,
  splitGroupedDescriptorLeafSource,
  splitSourceByOperator,
  type CardSourceOperatorToken,
} from './sourceGrammar';
import type {
  CdfConceptBinding,
  CdfConceptTarget,
  CdfContentShape,
  CdfLiveBlockNode,
  CdfLiveDeriveOptions,
  CdfLiveDeriveResult,
  CdfLiveRelationCandidate,
  CdfLiveRelationContentFields,
  CdfLiveRelationIssue,
  CdfRelationKind,
  CdfSourceIssue,
} from './types';

interface ConceptResolution {
  bindings: CdfConceptBinding[];
  issues: CdfLiveRelationIssue[];
}

interface ScanContext {
  descriptorConcepts: ConceptResolution | null;
  definitionConcepts: ConceptResolution | null;
  breadcrumbs: string[];
  definitionGroup: boolean;
  descriptorGroup: boolean;
  suppressDirectBoundaries: boolean;
}

interface MutableDeriveState {
  relations: CdfLiveRelationCandidate[];
  issues: CdfSourceIssue[];
}

interface RefOccurrence {
  id: string;
  order: number;
}

const BLOCK_REF_RE = /\(\((\d{14}-[a-z0-9]{7})(?:\s+[^\)]*)?\)\)/gi;
const TRAILING_BLOCK_ATTR_PATTERN = /\s*\{:[^{}]*\}\s*$/s;

function normalizeText(value: string | null | undefined): string {
  return String(value || '').replace(TRAILING_BLOCK_ATTR_PATTERN, '').trim();
}

function readNodeMarkdown(node: CdfLiveBlockNode): string {
  return normalizeText(node.markdown || node.content || '');
}

function isLeaf(node: CdfLiveBlockNode): boolean {
  return !node.children || node.children.length === 0;
}

function extractRefs(source: string): RefOccurrence[] {
  return [...String(source || '').matchAll(BLOCK_REF_RE)].map((match, index) => ({
    id: match[1],
    order: index,
  }));
}

function normalizeTarget(
  refId: string,
  options: CdfLiveDeriveOptions,
): CdfConceptTarget | null | undefined {
  if (!options.conceptTargets) {
    return { id: refId, type: 'd' };
  }
  const target = options.conceptTargets[refId];
  if (target === undefined || target === null) {
    return target as null | undefined;
  }
  if (typeof target === 'string') {
    return { id: refId, type: target };
  }
  return target;
}

function resolveConceptBindings(
  sourceBlockId: string,
  source: string,
  options: CdfLiveDeriveOptions,
): ConceptResolution {
  const refs = extractRefs(source);
  const issues: CdfLiveRelationIssue[] = [];
  const seen = new Set<string>();
  const duplicateIds = new Set<string>();
  const uniqueRefs: RefOccurrence[] = [];

  for (const ref of refs) {
    if (seen.has(ref.id)) {
      duplicateIds.add(ref.id);
      continue;
    }
    seen.add(ref.id);
    uniqueRefs.push(ref);
  }

  if (duplicateIds.size > 0) {
    issues.push({
      code: 'duplicate-ref',
      severity: 'warning',
      sourceBlockId,
      detail: Array.from(duplicateIds).sort().join(','),
    });
  }

  const validBindings: CdfConceptBinding[] = [];
  const nonDocIds: string[] = [];
  const missingTargetIds: string[] = [];

  for (const ref of uniqueRefs) {
    const target = normalizeTarget(ref.id, options);
    if (!target) {
      missingTargetIds.push(ref.id);
      continue;
    }
    if (target.type !== 'd') {
      nonDocIds.push(ref.id);
      continue;
    }
    validBindings.push({
      conceptBlockId: ref.id,
      displayText: target.title,
      order: ref.order,
    });
  }

  if (missingTargetIds.length > 0) {
    issues.push({
      code: 'missing-concept-target',
      severity: 'blocking',
      sourceBlockId,
      detail: missingTargetIds.join(','),
    });
  }

  if (nonDocIds.length > 0) {
    issues.push({
      code: validBindings.length > 0 ? 'non-doc-ref-warning' : 'invalid-concept-ref',
      severity: validBindings.length > 0 ? 'warning' : 'blocking',
      sourceBlockId,
      detail: nonDocIds.join(','),
    });
  }

  if (refs.length === 0) {
    issues.push({
      code: 'missing-concept-ref',
      severity: 'blocking',
      sourceBlockId,
    });
  }

  return {
    bindings: validBindings.sort((left, right) => left.order - right.order),
    issues,
  };
}

function hasValidBinding(resolution: ConceptResolution | null): resolution is ConceptResolution {
  return !!resolution && resolution.bindings.length > 0;
}

function addSourceIssues(
  state: MutableDeriveState,
  sourceBlockId: string,
  issues: CdfLiveRelationIssue[],
): void {
  for (const issue of issues) {
    state.issues.push({
      sourceBlockId,
      issue,
    });
  }
}

function labelForGroup(source: string, operator: CardSourceOperatorToken): string {
  const label = `${source.slice(0, operator.index)} ${source.slice(operator.end)}`;
  return normalizeText(label);
}

function isRelationOperator(operator: CardSourceOperatorToken | null): operator is CardSourceOperatorToken {
  return !!operator && operator.role === 'relation';
}

function isDefinitionOperator(operator: CardSourceOperatorToken | null): operator is CardSourceOperatorToken {
  return isRelationOperator(operator) && operator.family === 'definition';
}

function isDescriptorOperator(operator: CardSourceOperatorToken | null): operator is CardSourceOperatorToken {
  return isRelationOperator(operator) && operator.family === 'descriptor';
}

function isDefinitionGroup(operator: CardSourceOperatorToken | null): operator is CardSourceOperatorToken {
  return !!operator && operator.role === 'group' && operator.family === 'definition';
}

function isDescriptorGroup(operator: CardSourceOperatorToken | null): operator is CardSourceOperatorToken {
  return !!operator && operator.role === 'group' && operator.family === 'descriptor';
}

function createCandidate(input: {
  sourceBlockId: string;
  concept: CdfConceptBinding;
  relationKind: CdfRelationKind;
  issues: CdfLiveRelationIssue[];
  markdown: string;
  breadcrumbs: string[];
  shape: CdfContentShape;
  content: CdfLiveRelationContentFields;
}): CdfLiveRelationCandidate {
  const relationKey = createCdfLiveRelationKey(
    input.sourceBlockId,
    input.concept.conceptBlockId,
    input.relationKind,
  );
  const family = input.relationKind.startsWith('definition') ? 'definition' : 'descriptor';
  const fieldMappingSnapshot = family === 'definition'
    ? { concept: input.concept.conceptBlockId, definition: input.sourceBlockId }
    : { concept: input.concept.conceptBlockId, descriptor: input.sourceBlockId };

  return {
    sourceBlockId: input.sourceBlockId,
    conceptBlockId: input.concept.conceptBlockId,
    relationKind: input.relationKind,
    relationKey,
    relationStatus: 'active-live',
    contentStatus: evaluateCdfContentStatus({
      shape: input.shape,
      content: input.content,
    }),
    issues: input.issues,
    sourceSnapshot: {
      sourceBlockId: input.sourceBlockId,
      markdown: input.markdown,
      breadcrumb: input.breadcrumbs,
    },
    conceptSnapshot: {
      conceptBlockId: input.concept.conceptBlockId,
      displayText: input.concept.displayText,
      order: input.concept.order,
    },
    contentShape: input.shape,
    content: input.content,
    fieldMappingSnapshot,
  };
}

function addCandidatesForConcepts(input: {
  state: MutableDeriveState;
  node: CdfLiveBlockNode;
  concepts: ConceptResolution | null;
  relationKinds: CdfRelationKind[];
  issues: CdfLiveRelationIssue[];
  shape: CdfContentShape;
  content: CdfLiveRelationContentFields;
  breadcrumbs: string[];
  missingConceptCode?: CdfLiveRelationIssue['code'];
}): void {
  const sourceBlockId = input.node.id;
  const conceptIssues = input.concepts?.issues ?? [];
  const allIssues = [...input.issues, ...conceptIssues];

  if (!hasValidBinding(input.concepts)) {
    const missingIssue: CdfLiveRelationIssue = {
      code: input.missingConceptCode ?? 'missing-concept-ref',
      severity: 'blocking',
      sourceBlockId,
    };
    addSourceIssues(input.state, sourceBlockId, [...allIssues, missingIssue]);
    return;
  }

  for (const concept of input.concepts.bindings) {
    for (const relationKind of input.relationKinds) {
      input.state.relations.push(createCandidate({
        sourceBlockId,
        concept,
        relationKind,
        issues: allIssues,
        markdown: readNodeMarkdown(input.node),
        breadcrumbs: input.breadcrumbs,
        shape: input.shape,
        content: input.content,
      }));
    }
  }
}

function scanDefinitionRelation(
  node: CdfLiveBlockNode,
  operator: CardSourceOperatorToken,
  context: ScanContext,
  options: CdfLiveDeriveOptions,
  state: MutableDeriveState,
  grammarIssues: CdfLiveRelationIssue[],
): void {
  const source = readNodeMarkdown(node);
  const split = splitSourceByOperator(source, operator);
  const ownConcepts = resolveConceptBindings(node.id, source, options);
  const concepts = hasValidBinding(ownConcepts) ? ownConcepts : context.definitionConcepts;
  const inheritedIssues = hasValidBinding(ownConcepts) ? ownConcepts.issues : [...ownConcepts.issues, ...(context.definitionConcepts?.issues ?? [])];

  addCandidatesForConcepts({
    state,
    node,
    concepts,
    relationKinds: operator.relationKinds,
    issues: [...grammarIssues, ...inheritedIssues],
    shape: 'definition',
    content: { definition: split.right },
    breadcrumbs: context.breadcrumbs,
  });
}

function scanDescriptorRelation(
  node: CdfLiveBlockNode,
  operator: CardSourceOperatorToken,
  context: ScanContext,
  state: MutableDeriveState,
  grammarIssues: CdfLiveRelationIssue[],
): void {
  const source = readNodeMarkdown(node);
  const split = splitSourceByOperator(source, operator);
  addCandidatesForConcepts({
    state,
    node,
    concepts: context.descriptorConcepts,
    relationKinds: operator.relationKinds,
    issues: grammarIssues,
    shape: 'descriptor-explicit',
    content: {
      cue: split.left,
      answer: split.right,
    },
    breadcrumbs: context.breadcrumbs,
  });
}

function scanDefinitionGroupPlainChild(
  node: CdfLiveBlockNode,
  context: ScanContext,
  state: MutableDeriveState,
): void {
  addCandidatesForConcepts({
    state,
    node,
    concepts: context.definitionConcepts,
    relationKinds: ['definition-forward'],
    issues: [],
    shape: 'definition',
    content: { definition: readNodeMarkdown(node) },
    breadcrumbs: context.breadcrumbs,
  });
}

function scanDescriptorGroupLeaf(
  node: CdfLiveBlockNode,
  context: ScanContext,
  state: MutableDeriveState,
): void {
  const parsed = splitGroupedDescriptorLeafSource(readNodeMarkdown(node));
  addCandidatesForConcepts({
    state,
    node,
    concepts: context.descriptorConcepts,
    relationKinds: ['descriptor-forward'],
    issues: [],
    shape: parsed.shape,
    content: parsed.content,
    breadcrumbs: context.breadcrumbs,
  });
}

function childHasBoundaryRefs(
  child: CdfLiveBlockNode,
  options: CdfLiveDeriveOptions,
): ConceptResolution | null {
  const source = readNodeMarkdown(child);
  const refs = extractRefs(source);
  if (refs.length === 0) {
    return null;
  }
  return resolveConceptBindings(child.id, source, options);
}

function scanChildren(
  children: CdfLiveBlockNode[] | undefined,
  context: ScanContext,
  options: CdfLiveDeriveOptions,
  state: MutableDeriveState,
): void {
  if (!children || children.length === 0) {
    return;
  }

  let currentDescriptorConcepts = context.descriptorConcepts;
  for (const child of children) {
    if (!context.suppressDirectBoundaries && !context.definitionGroup && !context.descriptorGroup) {
      const boundaryConcepts = childHasBoundaryRefs(child, options);
      if (boundaryConcepts) {
        currentDescriptorConcepts = boundaryConcepts;
        addSourceIssues(state, child.id, boundaryConcepts.issues);
        scanChildren(child.children, {
          ...context,
          descriptorConcepts: boundaryConcepts,
          suppressDirectBoundaries: true,
        }, options, state);
        continue;
      }
    }

    scanNode(child, {
      ...context,
      descriptorConcepts: currentDescriptorConcepts,
    }, options, state);
  }
}

function scanNode(
  node: CdfLiveBlockNode,
  context: ScanContext,
  options: CdfLiveDeriveOptions,
  state: MutableDeriveState,
): void {
  const source = readNodeMarkdown(node);
  const grammar = parseCardSourceGrammar(source);
  const operator = grammar.primaryOperator;
  const grammarIssues = grammar.issues.map((issue) => ({ ...issue, sourceBlockId: node.id }));

  if (isDefinitionGroup(operator)) {
    const ownConcepts = resolveConceptBindings(node.id, source, options);
    const concepts = hasValidBinding(ownConcepts) ? ownConcepts : context.definitionConcepts;
    const label = labelForGroup(source, operator);
    addSourceIssues(state, node.id, [...grammarIssues, ...ownConcepts.issues]);
    scanChildren(node.children, {
      ...context,
      definitionConcepts: concepts,
      breadcrumbs: label ? [...context.breadcrumbs, label] : context.breadcrumbs,
      definitionGroup: true,
    }, options, state);
    return;
  }

  if (isDescriptorGroup(operator)) {
    const label = labelForGroup(source, operator);
    addSourceIssues(state, node.id, grammarIssues);
    scanChildren(node.children, {
      ...context,
      breadcrumbs: label ? [...context.breadcrumbs, label] : context.breadcrumbs,
      descriptorGroup: true,
    }, options, state);
    return;
  }

  if (isDefinitionOperator(operator)) {
    scanDefinitionRelation(node, operator, context, options, state, grammarIssues);
  } else if (isDescriptorOperator(operator)) {
    scanDescriptorRelation(node, operator, context, state, grammarIssues);
  } else if (context.definitionGroup && source.length > 0) {
    scanDefinitionGroupPlainChild(node, context, state);
  } else if (context.descriptorGroup && isLeaf(node) && source.length > 0) {
    scanDescriptorGroupLeaf(node, context, state);
  } else {
    addSourceIssues(state, node.id, grammarIssues);
  }

  scanChildren(node.children, context, options, state);
}

export function deriveCdfLiveRelations(
  input: CdfLiveBlockNode | CdfLiveBlockNode[],
  options: CdfLiveDeriveOptions = {},
): CdfLiveDeriveResult {
  const roots = Array.isArray(input) ? input : [input];
  const state: MutableDeriveState = {
    relations: [],
    issues: [],
  };
  const context: ScanContext = {
    descriptorConcepts: null,
    definitionConcepts: null,
    breadcrumbs: [],
    definitionGroup: false,
    descriptorGroup: false,
    suppressDirectBoundaries: false,
  };

  for (const root of roots) {
    scanNode(root, context, options, state);
  }

  return state;
}
