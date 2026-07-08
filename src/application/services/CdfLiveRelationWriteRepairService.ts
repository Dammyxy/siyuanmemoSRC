import {
  deriveCdfLiveRelations,
  parseCardSourceGrammar,
  reconcileCdfLiveRelations,
  scopeCdfLiveBlockEditTree,
  writeCdfLiveRelationMetadata,
  type CdfLiveBlockNode,
  type CdfLiveDeriveOptions,
  type CdfLiveRelationCandidate,
  type CdfReconciliationAction,
} from '@/core/card/cdf-live-relation';
import {
  isConceptDefinitionCard,
  isDescriptorSemanticCard,
} from '@/core/xiuyuan/cardMeta';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { CardMutationOptions } from '@/types/unified-data-source';

export interface CdfLiveRelationWriteRepairManagerPort {
  getCards(filter?: { blockIds?: string[] }): Promise<FSRSCard[]>;
  updateCard(card: FSRSCard, options?: CardMutationOptions): Promise<void>;
  onCardCreated?(card: FSRSCard): Promise<void>;
}

export interface CdfLiveRelationCardCreatorPort {
  createCards(cards: FSRSCard[], xiuyuans: IXiuyuan[], options?: CardMutationOptions): Promise<void>;
}

export type CdfLiveRelationWriteRepairScope = 'source' | 'block-edit' | 'single-source';

export interface CdfLiveRelationWriteRepairSourceLoadOptions {
  reconciliationScope?: CdfLiveRelationWriteRepairScope;
  changedBlockId?: string;
}

export interface CdfLiveRelationWriteRepairSourceLoader {
  loadSourceTree(
    sourceBlockId: string,
    options?: CdfLiveRelationWriteRepairSourceLoadOptions,
  ): Promise<CdfLiveBlockNode | CdfLiveBlockNode[] | null>;
}

export type CdfLiveRelationFullRepairScope =
  | { kind: 'workspace' }
  | { kind: 'document'; docId: string }
  | { kind: 'notebook'; notebookId: string }
  | {
      kind: 'browser';
      docId?: string | null;
      scopeDocIds?: string[] | null;
      notebookId?: string | null;
    };

export type CdfLiveRelationRepairCandidateReason =
  | 'operator'
  | 'group'
  | 'concept-boundary'
  | 'existing-card';

export interface CdfLiveRelationRepairCandidateSource {
  sourceBlockId: string;
  rootId?: string;
  notebookId?: string;
  candidateReasons: CdfLiveRelationRepairCandidateReason[];
}

export interface CdfLiveRelationRepairCandidateScanner {
  listCandidateSources(input: {
    scope: CdfLiveRelationFullRepairScope;
    existingSourceBlockIds: string[];
    limit?: number;
  }): Promise<CdfLiveRelationRepairCandidateSource[]>;
}

export interface CdfLiveRelationWriteRepairServiceDeps {
  manager: CdfLiveRelationWriteRepairManagerPort;
  cardCreator: CdfLiveRelationCardCreatorPort;
  sourceLoader?: CdfLiveRelationWriteRepairSourceLoader | null;
  candidateScanner?: CdfLiveRelationRepairCandidateScanner | null;
  now?: () => number;
  idFactory?: (relation: CdfLiveRelationCandidate) => string;
  xiuyuanIdFactory?: (relation: CdfLiveRelationCandidate) => string;
}

export interface CdfLiveRelationWriteRepairOptions {
  sourceBlockId?: string;
  changedBlockId?: string;
  reconciliationScope?: CdfLiveRelationWriteRepairScope;
  sourceTree?: CdfLiveBlockNode | CdfLiveBlockNode[] | null;
  draftMarkdownByBlockId?: Record<string, string>;
  existingCards?: FSRSCard[];
  allowCreateMissing?: boolean;
  persist?: boolean;
}

export interface CdfLiveRelationWriteRepairResult {
  attempted: boolean;
  actions: CdfReconciliationAction[];
  createdCards: FSRSCard[];
  updatedCards: FSRSCard[];
  derivedRelationCount: number;
  reason: 'reconciled' | 'unchanged' | 'source-unavailable' | 'source-missing';
}

export interface CdfLiveRelationFullRepairDryRunOptions {
  scope?: CdfLiveRelationFullRepairScope;
  limit?: number;
}

export interface CdfLiveRelationFullRepairSourcePreview {
  scanRootId: string;
  candidateSourceIds: string[];
  candidateReasons: CdfLiveRelationRepairCandidateReason[];
  result: CdfLiveRelationWriteRepairResult;
  persisted?: boolean;
  previewOnly?: boolean;
}

export interface CdfLiveRelationFullRepairDryRunSummary {
  candidateSourceCount: number;
  scannedRootCount: number;
  derivedRelationCount: number;
  actionCount: number;
  createCardCount: number;
  updatedCardCount: number;
  activeUpdateCount: number;
  orphanCount: number;
  duplicateCount: number;
  reactivatedCount: number;
  legacyMigratedCount: number;
  legacyUnavailableCount: number;
  contentIncompleteCount: number;
  deriveFailedNoCardCandidateCount: number;
  sourceMissingCount: number;
  sourceUnavailableCount: number;
  persistedMutationCount: number;
}

export interface CdfLiveRelationFullRepairDryRunResult {
  attempted: boolean;
  scope: CdfLiveRelationFullRepairScope;
  sourcePreviews: CdfLiveRelationFullRepairSourcePreview[];
  summary: CdfLiveRelationFullRepairDryRunSummary;
  reason: 'previewed' | 'no-candidates' | 'scanner-unavailable' | 'source-unavailable';
}

export interface CdfLiveRelationFullRepairExecuteOptions extends CdfLiveRelationFullRepairDryRunOptions {
  createNewCandidates?: boolean;
}

export interface CdfLiveRelationFullRepairExecuteResult {
  attempted: boolean;
  scope: CdfLiveRelationFullRepairScope;
  sourcePreviews: CdfLiveRelationFullRepairSourcePreview[];
  previewOnlySourcePreviews: CdfLiveRelationFullRepairSourcePreview[];
  summary: CdfLiveRelationFullRepairDryRunSummary;
  previewOnlySummary: CdfLiveRelationFullRepairDryRunSummary;
  createNewCandidates: boolean;
  reason: 'executed' | 'no-candidates' | 'scanner-unavailable' | 'source-unavailable';
}

export interface CdfLiveRelationSingleSourceRepairOptions {
  sourceBlockId: string;
  sourceTree?: CdfLiveBlockNode | CdfLiveBlockNode[] | null;
  draftMarkdownByBlockId?: Record<string, string>;
  categoryToggles?: Partial<CdfLiveRelationSingleSourceRepairCategoryToggles>;
}

export interface CdfLiveRelationSingleSourceRepairCategoryToggles {
  createMissing: boolean;
  pauseOrphan: boolean;
  pauseDuplicate: boolean;
  restoreActive: boolean;
}

export interface CdfLiveRelationSingleSourceRepairResult {
  attempted: boolean;
  sourceBlockId: string;
  persisted: boolean;
  categoryToggles: CdfLiveRelationSingleSourceRepairCategoryToggles;
  result: CdfLiveRelationWriteRepairResult;
  summary: CdfLiveRelationFullRepairDryRunSummary;
  reason: CdfLiveRelationWriteRepairResult['reason'];
}

interface CdfLiveRelationFullRepairScanContext {
  attempted: boolean;
  scope: CdfLiveRelationFullRepairScope;
  candidates: CdfLiveRelationRepairCandidateSource[];
  reason?: 'no-candidates' | 'scanner-unavailable' | 'source-unavailable';
}

interface CdfRelationRenderSpec {
  templateID: string;
  typeMarker: string;
  faceRuleId: string;
  cardType: CardType;
  cardTypeMarker: 'concept' | 'descriptor';
  frontBlockIDs: string[];
  backBlockIDs: string[];
  blockIDs: string[];
  fields: IXiuyuan['fields'];
}

type UnifiedStorageCreateResult = { ok: boolean; error?: Error } | void;

export interface CdfLiveRelationUnifiedStorageCreatePort {
  createCard(
    xiuyuan: IXiuyuan,
    card: FSRSCard,
    options?: CardMutationOptions,
  ): Promise<UnifiedStorageCreateResult> | UnifiedStorageCreateResult;
}

interface CdfLiveRelationCandidateBlockRow extends Record<string, unknown> {
  id?: string | null;
  root_id?: string | null;
  box?: string | null;
  type?: string | null;
  subtype?: string | null;
  markdown?: string | null;
  content?: string | null;
}

export interface CdfLiveRelationCandidateSqlPort {
  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(
    values
      .map((value) => readString(value))
      .filter(Boolean),
  ));
}

function escapeSql(value: string): string {
  return String(value || '').replace(/'/g, "''");
}

function toSqlInClause(values: string[]): string {
  return values.map((value) => `'${escapeSql(value)}'`).join(',');
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function metadataEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function collectNodeIds(input: CdfLiveBlockNode | CdfLiveBlockNode[]): string[] {
  const roots = Array.isArray(input) ? input : [input];
  const ids: string[] = [];
  const visit = (node: CdfLiveBlockNode) => {
    const id = readString(node.id);
    if (id) {
      ids.push(id);
    }
    for (const child of node.children || []) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return Array.from(new Set(ids));
}

function applyDraftMarkdownToSourceTree(
  input: CdfLiveBlockNode | CdfLiveBlockNode[],
  draftMarkdownByBlockId?: Record<string, string>,
): CdfLiveBlockNode | CdfLiveBlockNode[] {
  const draftEntries = Object.entries(draftMarkdownByBlockId || {})
    .map(([blockId, markdown]) => [readString(blockId), String(markdown ?? '')] as const)
    .filter(([blockId]) => Boolean(blockId));
  if (draftEntries.length === 0) {
    return input;
  }

  const drafts = new Map<string, string>(draftEntries);
  const applyNode = (node: CdfLiveBlockNode): CdfLiveBlockNode => {
    const draft = drafts.get(readString(node.id));
    const children = (node.children || []).map(applyNode);
    return {
      ...node,
      ...(draft !== undefined ? { markdown: draft, content: draft } : {}),
      ...(children.length > 0 ? { children } : { children: undefined }),
    };
  };

  if (Array.isArray(input)) {
    return input.map(applyNode);
  }
  return applyNode(input);
}

function cloneCdfLiveBlockTree(node: CdfLiveBlockNode): CdfLiveBlockNode {
  const children = (node.children || []).map(cloneCdfLiveBlockTree);
  return {
    ...node,
    ...(children.length > 0 ? { children } : { children: undefined }),
  };
}

function findCdfLiveBlockNode(
  input: CdfLiveBlockNode | CdfLiveBlockNode[],
  targetId: string,
): CdfLiveBlockNode | null {
  const normalizedTargetId = readString(targetId);
  if (!normalizedTargetId) {
    return null;
  }
  const roots = Array.isArray(input) ? input : [input];
  const visit = (node: CdfLiveBlockNode): CdfLiveBlockNode | null => {
    if (readString(node.id) === normalizedTargetId) {
      return node;
    }
    for (const child of node.children || []) {
      const found = visit(child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  for (const root of roots) {
    const found = visit(root);
    if (found) {
      return found;
    }
  }
  return null;
}

function readBlockNodeText(node: CdfLiveBlockNode): string {
  return readString(node.markdown) || readString(node.content);
}

function shouldScanCandidateNodeDirectly(candidate: CdfLiveRelationRepairCandidateSource, node: CdfLiveBlockNode): boolean {
  const operator = parseCardSourceGrammar(readBlockNodeText(node)).primaryOperator;
  if (operator?.family === 'definition') {
    return true;
  }
  return candidate.candidateReasons.length === 1 && candidate.candidateReasons[0] === 'existing-card';
}

function buildSingleSourceRepairSourceTree(
  sourceTree: CdfLiveBlockNode | CdfLiveBlockNode[],
  sourceBlockId: string,
): CdfLiveBlockNode | CdfLiveBlockNode[] | null {
  const sourceNode = findCdfLiveBlockNode(sourceTree, sourceBlockId);
  const operator = sourceNode
    ? parseCardSourceGrammar(readBlockNodeText(sourceNode)).primaryOperator
    : null;
  if (sourceNode && operator?.family === 'definition') {
    return cloneCdfLiveBlockTree(sourceNode);
  }
  return scopeCdfLiveBlockEditTree(sourceTree, sourceBlockId);
}

function flattenSourceTrees(
  trees: Array<CdfLiveBlockNode | CdfLiveBlockNode[] | null>,
): CdfLiveBlockNode[] {
  const flattened: CdfLiveBlockNode[] = [];
  for (const tree of trees) {
    if (!tree) {
      continue;
    }
    if (Array.isArray(tree)) {
      flattened.push(...tree);
    } else {
      flattened.push(tree);
    }
  }
  return flattened;
}

function createStableId(prefix: string, relation: CdfLiveRelationCandidate): string {
  const stableKey = relation.relationKey.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `${prefix}_${stableKey}`;
}

function isCdfRelationCard(card: FSRSCard): boolean {
  const meta = isRecord(card.meta) ? card.meta : {};
  return readString(meta.liveRelationKey).length > 0
    || readString(meta.relationAuthority) === 'live-backlink'
    || isConceptDefinitionCard(card)
    || isDescriptorSemanticCard(card);
}

function readFieldMapping(meta: Record<string, unknown>): Record<string, string> {
  if (!isRecord(meta.fieldMapping)) {
    return {};
  }

  const mapping: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta.fieldMapping)) {
    const normalized = readString(value);
    if (normalized) {
      mapping[key] = normalized;
    }
  }
  return mapping;
}

function readCardRuleId(card: FSRSCard, meta: Record<string, unknown>): string {
  return readString(card.faceKey?.ruleId)
    || readString(meta.ruleId)
    || readString(meta.cardRuleId)
    || readString(meta.typeMarker)
    || readString(meta.templateID);
}

function resolveExpectedRelationKind(card: FSRSCard, meta: Record<string, unknown>): CdfLiveRelationCandidate['relationKind'] | null {
  const existingKind = readString(meta.relationKind);
  if (
    existingKind === 'definition-forward'
    || existingKind === 'definition-reverse'
    || existingKind === 'descriptor-forward'
    || existingKind === 'descriptor-reverse'
  ) {
    return existingKind;
  }

  const ruleId = readCardRuleId(card, meta);
  if (ruleId.includes('concept-definition-reverse')) {
    return 'definition-reverse';
  }
  if (ruleId.includes('concept-definition-forward')) {
    return 'definition-forward';
  }
  if (ruleId.includes('concept-descriptor-reverse') || ruleId.includes('descriptor-reverse')) {
    return 'descriptor-reverse';
  }
  if (ruleId.includes('concept-descriptor-forward') || ruleId.includes('descriptor-forward')) {
    return 'descriptor-forward';
  }

  const templateId = readString(meta.templateID);
  const faceIndex = Number(meta.faceIndex);
  if (templateId === 'builtin-concept-definition' && Number.isFinite(faceIndex)) {
    return faceIndex === 1 ? 'definition-reverse' : 'definition-forward';
  }
  if (templateId === 'builtin-concept-descriptor-both' && Number.isFinite(faceIndex)) {
    return faceIndex === 1 ? 'descriptor-reverse' : 'descriptor-forward';
  }
  if (templateId === 'builtin-concept-definition-reverse') {
    return 'definition-reverse';
  }
  if (templateId === 'builtin-concept-definition-forward') {
    return 'definition-forward';
  }
  if (templateId === 'builtin-concept-descriptor-reverse') {
    return 'descriptor-reverse';
  }
  if (templateId === 'builtin-concept-descriptor') {
    return 'descriptor-forward';
  }

  return null;
}

function resolveSourceBlockId(card: FSRSCard, meta: Record<string, unknown>): string {
  const mapping = readFieldMapping(meta);
  return readString(meta.sourceBlockId)
    || readString(mapping.definition)
    || readString(mapping.descriptor)
    || readString(card.blockId);
}

function resolveLegacyConceptBlockId(meta: Record<string, unknown>): string {
  const mapping = readFieldMapping(meta);
  return readString(meta.conceptBlockId) || readString(mapping.concept);
}

function isDescriptorRelationKind(relationKind: string | null): boolean {
  return relationKind === 'descriptor-forward' || relationKind === 'descriptor-reverse';
}

function buildDescriptorConceptEvidenceFromCards(
  cards: FSRSCard[],
  excludeSourceBlockIds: Set<string> = new Set(),
): NonNullable<CdfLiveDeriveOptions['descriptorConceptEvidence']> {
  const evidence: NonNullable<CdfLiveDeriveOptions['descriptorConceptEvidence']> = {};
  for (const card of cards) {
    const meta = isRecord(card.meta) ? card.meta : {};
    const relationKind = resolveExpectedRelationKind(card, meta);
    if (!isDescriptorRelationKind(relationKind)) {
      continue;
    }
    const sourceBlockId = resolveSourceBlockId(card, meta);
    const conceptBlockId = resolveLegacyConceptBlockId(meta);
    if (!sourceBlockId || !conceptBlockId || excludeSourceBlockIds.has(sourceBlockId)) {
      continue;
    }
    const existing = evidence[sourceBlockId];
    const next = { conceptBlockId, evidenceKind: 'list-backlink' as const };
    evidence[sourceBlockId] = Array.isArray(existing)
      ? [...existing, next]
      : existing
        ? [existing, next]
        : [next];
  }
  return evidence;
}

function readCdfRelationCardSourceBlockId(card: FSRSCard): string {
  const meta = isRecord(card.meta) ? card.meta : {};
  return resolveSourceBlockId(card, meta);
}

function readCandidateRowText(row: CdfLiveRelationCandidateBlockRow): string {
  return readString(row.markdown) || readString(row.content);
}

function readCandidateRowId(row: CdfLiveRelationCandidateBlockRow): string {
  return readString(row.id);
}

function hasBlockRef(source: string): boolean {
  return /\(\([^)]+?\)\)/.test(source);
}

function isCandidateBoundaryRow(row: CdfLiveRelationCandidateBlockRow, source: string): boolean {
  const type = readString(row.type);
  const subtype = readString(row.subtype);
  return hasBlockRef(source) && (type === 'i' || subtype === 'u' || subtype === 'o');
}

function resolveCandidateReasons(
  row: CdfLiveRelationCandidateBlockRow,
  existingSourceBlockIds: Set<string>,
): CdfLiveRelationRepairCandidateReason[] {
  const reasons: CdfLiveRelationRepairCandidateReason[] = [];
  const sourceBlockId = readCandidateRowId(row);
  const source = readCandidateRowText(row);
  const grammar = parseCardSourceGrammar(source);
  const operator = grammar.primaryOperator;

  if (operator?.family === 'definition' || operator?.family === 'descriptor') {
    if (operator.role === 'group') {
      reasons.push('group');
    } else if (operator.family === 'descriptor' || hasBlockRef(source)) {
      reasons.push('operator');
    }
  } else if (isCandidateBoundaryRow(row, source)) {
    reasons.push('concept-boundary');
  }

  if (existingSourceBlockIds.has(sourceBlockId)) {
    reasons.push('existing-card');
  }

  return Array.from(new Set(reasons));
}

function normalizeFullRepairScope(
  scope?: CdfLiveRelationFullRepairScope | null,
): CdfLiveRelationFullRepairScope {
  if (!scope) {
    return { kind: 'workspace' };
  }
  if (scope.kind === 'document') {
    const docId = readString(scope.docId);
    return docId ? { kind: 'document', docId } : { kind: 'workspace' };
  }
  if (scope.kind === 'notebook') {
    const notebookId = readString(scope.notebookId);
    return notebookId ? { kind: 'notebook', notebookId } : { kind: 'workspace' };
  }
  if (scope.kind === 'browser') {
    return {
      kind: 'browser',
      docId: readString(scope.docId) || null,
      scopeDocIds: uniqueStrings(scope.scopeDocIds || []),
      notebookId: readString(scope.notebookId) || null,
    };
  }
  return { kind: 'workspace' };
}

function buildFullRepairEmptySummary(): CdfLiveRelationFullRepairDryRunSummary {
  return {
    candidateSourceCount: 0,
    scannedRootCount: 0,
    derivedRelationCount: 0,
    actionCount: 0,
    createCardCount: 0,
    updatedCardCount: 0,
    activeUpdateCount: 0,
    orphanCount: 0,
    duplicateCount: 0,
    reactivatedCount: 0,
    legacyMigratedCount: 0,
    legacyUnavailableCount: 0,
    contentIncompleteCount: 0,
    deriveFailedNoCardCandidateCount: 0,
    sourceMissingCount: 0,
    sourceUnavailableCount: 0,
    persistedMutationCount: 0,
  };
}

function readMetaStatus(card: FSRSCard, key: string): string {
  return readString(isRecord(card.meta) ? card.meta[key] : undefined);
}

function mergeFullRepairSummary(
  summary: CdfLiveRelationFullRepairDryRunSummary,
  sourcePreview: CdfLiveRelationFullRepairSourcePreview,
): void {
  const { result } = sourcePreview;
  summary.scannedRootCount += 1;
  summary.derivedRelationCount += result.derivedRelationCount;
  summary.actionCount += result.actions.length;
  summary.createCardCount += result.createdCards.length;
  summary.updatedCardCount += result.updatedCards.length;
  summary.sourceMissingCount += result.reason === 'source-missing' ? 1 : 0;
  summary.sourceUnavailableCount += result.reason === 'source-unavailable' ? 1 : 0;

  for (const action of result.actions) {
    if (action.kind !== 'update-card-meta') {
      continue;
    }
    if (action.reason === 'active-live') summary.activeUpdateCount += 1;
    if (action.reason === 'orphaned') summary.orphanCount += 1;
    if (action.reason === 'duplicate') summary.duplicateCount += 1;
    if (action.reason === 'reactivated') summary.reactivatedCount += 1;
    if (action.reason === 'legacy-migrated') summary.legacyMigratedCount += 1;
    if (action.reason === 'legacy-unavailable') summary.legacyUnavailableCount += 1;
  }

  for (const card of [...result.createdCards, ...result.updatedCards]) {
    if (readMetaStatus(card, 'liveContentStatus') === 'content-incomplete') {
      summary.contentIncompleteCount += 1;
    }
  }

  if (
    sourcePreview.candidateSourceIds.length > 0
    && result.derivedRelationCount === 0
    && result.actions.length === 0
    && result.createdCards.length === 0
    && result.updatedCards.length === 0
  ) {
    summary.deriveFailedNoCardCandidateCount += sourcePreview.candidateSourceIds.length;
  }

  if (sourcePreview.persisted === true) {
    summary.persistedMutationCount += result.createdCards.length + result.updatedCards.length;
  }
}

function hasExistingCardCandidateReason(candidate: CdfLiveRelationRepairCandidateSource): boolean {
  return candidate.candidateReasons.includes('existing-card');
}

function isDeriveFailedNoCardSourcePreview(sourcePreview: CdfLiveRelationFullRepairSourcePreview): boolean {
  const { result } = sourcePreview;
  return sourcePreview.candidateSourceIds.length > 0
    && result.derivedRelationCount === 0
    && result.actions.length === 0
    && result.createdCards.length === 0
    && result.updatedCards.length === 0;
}

function countPreviewCandidateSources(sourcePreviews: CdfLiveRelationFullRepairSourcePreview[]): number {
  return sourcePreviews.reduce((count, sourcePreview) => count + sourcePreview.candidateSourceIds.length, 0);
}

function normalizeSingleSourceRepairCategoryToggles(
  toggles?: Partial<CdfLiveRelationSingleSourceRepairCategoryToggles> | null,
): CdfLiveRelationSingleSourceRepairCategoryToggles {
  return {
    createMissing: toggles?.createMissing !== false,
    pauseOrphan: toggles?.pauseOrphan !== false,
    pauseDuplicate: toggles?.pauseDuplicate !== false,
    restoreActive: toggles?.restoreActive !== false,
  };
}

function shouldApplySingleSourceRepairAction(
  action: CdfReconciliationAction,
  toggles: CdfLiveRelationSingleSourceRepairCategoryToggles,
): boolean {
  if (action.kind === 'create-card') {
    return toggles.createMissing;
  }
  if (action.reason === 'orphaned') {
    return toggles.pauseOrphan;
  }
  if (action.reason === 'duplicate' || action.status === 'duplicate-live-relation') {
    return toggles.pauseDuplicate;
  }
  if (action.reason === 'reactivated') {
    return toggles.restoreActive;
  }
  if (action.reason === 'active-live') {
    return true;
  }
  if (action.reason === 'legacy-migrated') {
    return toggles.restoreActive;
  }
  return true;
}

function findLegacyRelationForCard(
  card: FSRSCard,
  relations: CdfLiveRelationCandidate[],
): CdfLiveRelationCandidate | null {
  const meta = isRecord(card.meta) ? card.meta : {};
  if (readString(meta.liveRelationKey)) {
    return null;
  }

  const sourceBlockId = resolveSourceBlockId(card, meta);
  const conceptBlockId = resolveLegacyConceptBlockId(meta);
  const relationKind = resolveExpectedRelationKind(card, meta);
  if (!sourceBlockId || !relationKind) {
    return null;
  }

  const sourceAndKindMatches = relations.filter((relation) => (
    relation.sourceBlockId === sourceBlockId
    && relation.relationKind === relationKind
  ));
  if (conceptBlockId) {
    return sourceAndKindMatches.find((relation) => relation.conceptBlockId === conceptBlockId) ?? null;
  }
  return sourceAndKindMatches.length === 1 ? sourceAndKindMatches[0] : null;
}

function buildRelationMetadata(
  relation: CdfLiveRelationCandidate,
  renderSpec: CdfRelationRenderSpec,
  xiuyuanId: string,
  cardId?: string,
): Record<string, unknown> {
  return writeCdfLiveRelationMetadata({
    xiuyuanID: xiuyuanId,
    templateID: renderSpec.templateID,
    faceIndex: 0,
    frontBlockIDs: renderSpec.frontBlockIDs,
    backBlockIDs: renderSpec.backBlockIDs,
    typeMarker: renderSpec.typeMarker,
    cardTypeMarker: renderSpec.cardTypeMarker,
    source: 'cdf-live-relation',
    ...(cardId ? { cardIds: [cardId] } : {}),
  }, {
    liveRelationKey: relation.relationKey,
    sourceBlockId: relation.sourceBlockId,
    conceptBlockId: relation.conceptBlockId,
    relationKind: relation.relationKind,
    liveRelationStatus: 'active-live',
    liveContentStatus: relation.contentStatus,
    liveRelationIssues: relation.issues,
    sourceSnapshot: {
      sourceBlockId: relation.sourceSnapshot.sourceBlockId,
      markdown: relation.sourceSnapshot.markdown,
      breadcrumb: relation.sourceSnapshot.breadcrumb,
    },
    conceptSnapshot: {
      conceptBlockId: relation.conceptSnapshot.conceptBlockId,
      displayText: relation.conceptSnapshot.displayText,
      order: relation.conceptSnapshot.order,
    },
    fieldMapping: relation.fieldMappingSnapshot,
    descriptorConceptBindingEvidenceKind: relation.descriptorConceptBindingEvidenceKind,
  });
}

function resolveRenderSpec(relation: CdfLiveRelationCandidate): CdfRelationRenderSpec {
  if (relation.relationKind === 'definition-forward') {
    return {
      templateID: 'builtin-concept-definition-forward',
      typeMarker: 'concept-definition-forward',
      faceRuleId: 'concept-definition-forward',
      cardType: CardType.Concept,
      cardTypeMarker: 'concept',
      frontBlockIDs: [relation.conceptBlockId],
      backBlockIDs: [relation.sourceBlockId],
      blockIDs: [relation.conceptBlockId, relation.sourceBlockId],
      fields: [
        { name: 'concept', blockID: relation.conceptBlockId },
        { name: 'definition', blockID: relation.sourceBlockId },
      ],
    };
  }

  if (relation.relationKind === 'definition-reverse') {
    return {
      templateID: 'builtin-concept-definition-reverse',
      typeMarker: 'concept-definition-reverse',
      faceRuleId: 'concept-definition-reverse',
      cardType: CardType.Concept,
      cardTypeMarker: 'concept',
      frontBlockIDs: [relation.sourceBlockId],
      backBlockIDs: [relation.conceptBlockId],
      blockIDs: [relation.conceptBlockId, relation.sourceBlockId],
      fields: [
        { name: 'concept', blockID: relation.conceptBlockId },
        { name: 'definition', blockID: relation.sourceBlockId },
      ],
    };
  }

  const descriptorSpec = {
    cardType: CardType.Descriptor,
    cardTypeMarker: 'descriptor' as const,
    frontBlockIDs: [relation.conceptBlockId, relation.sourceBlockId],
    backBlockIDs: [relation.conceptBlockId, relation.sourceBlockId],
    blockIDs: [relation.conceptBlockId, relation.sourceBlockId],
    fields: [
      { name: 'concept', blockID: relation.conceptBlockId },
      { name: 'descriptor', blockID: relation.sourceBlockId },
    ],
  };

  if (relation.relationKind === 'descriptor-reverse') {
    return {
      ...descriptorSpec,
      templateID: 'builtin-concept-descriptor-reverse',
      typeMarker: 'concept-descriptor-reverse',
      faceRuleId: 'descriptor-reverse',
    };
  }

  return {
    ...descriptorSpec,
    templateID: 'builtin-concept-descriptor',
    typeMarker: 'concept-descriptor-forward',
    faceRuleId: 'descriptor-forward',
  };
}

function buildNewCard(params: {
  relation: CdfLiveRelationCandidate;
  cardId: string;
  xiuyuanId: string;
  now: number;
}): FSRSCard {
  const spec = resolveRenderSpec(params.relation);
  return {
    id: params.cardId,
    xiuyuanID: params.xiuyuanId,
    blockId: params.relation.sourceBlockId,
    faceKey: { ruleId: spec.faceRuleId, faceIndex: 0 },
    due: params.now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learning_step: 0,
    priority: 50,
    type: spec.cardType,
    tags: [],
    cardTypeMarker: spec.cardTypeMarker,
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: params.now,
    updatedAt: params.now,
    schedulerType: 'fsrs-v6',
    meta: buildRelationMetadata(params.relation, spec, params.xiuyuanId, params.cardId),
  };
}

function buildNewXiuyuan(params: {
  relation: CdfLiveRelationCandidate;
  cardId: string;
  xiuyuanId: string;
  now: number;
}): IXiuyuan {
  const spec = resolveRenderSpec(params.relation);
  return {
    id: params.xiuyuanId,
    blockIDs: spec.blockIDs,
    fields: spec.fields,
    templateID: spec.templateID,
    createdAt: params.now,
    updatedAt: params.now,
    meta: buildRelationMetadata(params.relation, spec, params.xiuyuanId, params.cardId),
  };
}

function createConceptAssetIds(conceptBlockId: string): { cardId: string; xiuyuanId: string } {
  const stableBlockId = conceptBlockId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const xiuyuanId = `xy_${stableBlockId}`;
  return {
    cardId: `card_${xiuyuanId}_0`,
    xiuyuanId,
  };
}

function buildConceptSimpleMetadata(params: {
  conceptBlockId: string;
  cardId: string;
  xiuyuanId: string;
}): Record<string, unknown> {
  return {
    xiuyuanID: params.xiuyuanId,
    templateID: 'builtin-concept-simple',
    faceIndex: 0,
    frontBlockIDs: [params.conceptBlockId],
    backBlockIDs: [params.conceptBlockId],
    typeMarker: 'C',
    cardTypeMarker: 'concept',
    source: 'cdf-live-relation-concept-asset',
    cardIds: [params.cardId],
    fieldMapping: {
      concept: params.conceptBlockId,
    },
  };
}

function buildConceptSimpleCard(params: {
  conceptBlockId: string;
  cardId: string;
  xiuyuanId: string;
  now: number;
}): FSRSCard {
  return {
    id: params.cardId,
    xiuyuanID: params.xiuyuanId,
    blockId: params.conceptBlockId,
    faceKey: { ruleId: 'C', faceIndex: 0 },
    due: params.now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learning_step: 0,
    priority: 50,
    type: CardType.Concept,
    tags: [],
    cardTypeMarker: 'concept',
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: params.now,
    updatedAt: params.now,
    schedulerType: 'fsrs-v6',
    meta: buildConceptSimpleMetadata(params),
  };
}

function buildConceptSimpleXiuyuan(params: {
  conceptBlockId: string;
  cardId: string;
  xiuyuanId: string;
  now: number;
}): IXiuyuan {
  return {
    id: params.xiuyuanId,
    blockIDs: [params.conceptBlockId],
    fields: [{ name: 'concept', blockID: params.conceptBlockId }],
    templateID: 'builtin-concept-simple',
    createdAt: params.now,
    updatedAt: params.now,
    meta: buildConceptSimpleMetadata(params),
  };
}

function isConceptSimpleAssetForBlock(card: FSRSCard, conceptBlockId: string): boolean {
  if (card.blockId !== conceptBlockId) {
    return false;
  }

  const meta = isRecord(card.meta) ? card.meta : {};
  const fieldMapping = readFieldMapping(meta);
  const templateId = readString(meta.templateID);
  const typeMarker = readString(meta.typeMarker);
  const metaCardTypeMarker = readString(meta.cardTypeMarker);

  return templateId === 'builtin-concept-simple'
    || typeMarker === 'C'
    || card.cardTypeMarker === 'concept'
    || metaCardTypeMarker === 'concept'
    || (card.type === CardType.Concept && fieldMapping.concept === conceptBlockId);
}

export class CdfLiveRelationSqlCandidateSourceScanner implements CdfLiveRelationRepairCandidateScanner {
  constructor(private readonly source: CdfLiveRelationCandidateSqlPort) {}

  async listCandidateSources(input: {
    scope: CdfLiveRelationFullRepairScope;
    existingSourceBlockIds: string[];
    limit?: number;
  }): Promise<CdfLiveRelationRepairCandidateSource[]> {
    const existingSourceBlockIds = uniqueStrings(input.existingSourceBlockIds);
    const existingSourceSet = new Set(existingSourceBlockIds);
    const where = this.buildWhereClause(input.scope, existingSourceBlockIds);
    const limit = Number.isFinite(input.limit) && Number(input.limit) > 0
      ? `\n      LIMIT ${Math.floor(Number(input.limit))}`
      : '';

    const rows = await this.source.sql<CdfLiveRelationCandidateBlockRow>(`
      SELECT id, root_id, box, type, subtype, content, markdown
      FROM blocks
      WHERE ${where}
      ORDER BY root_id ASC, id ASC${limit}
    `);

    const candidates: CdfLiveRelationRepairCandidateSource[] = [];
    for (const row of rows) {
      const sourceBlockId = readCandidateRowId(row);
      if (!sourceBlockId) {
        continue;
      }
      const candidateReasons = resolveCandidateReasons(row, existingSourceSet);
      if (candidateReasons.length === 0) {
        continue;
      }
      candidates.push({
        sourceBlockId,
        rootId: readString(row.root_id) || sourceBlockId,
        notebookId: readString(row.box) || undefined,
        candidateReasons,
      });
    }

    return candidates;
  }

  private buildWhereClause(
    scope: CdfLiveRelationFullRepairScope,
    existingSourceBlockIds: string[],
  ): string {
    const clauses: string[] = [];
    const scopeClause = this.buildScopeClause(scope);
    if (scopeClause) {
      clauses.push(scopeClause);
    }

    const candidateParts = [
      "markdown LIKE '%::%'",
      "markdown LIKE '%：%'",
      "markdown LIKE '%;;%'",
      "markdown LIKE '%；%'",
      "markdown LIKE '%((%'",
      "content LIKE '%::%'",
      "content LIKE '%：%'",
      "content LIKE '%;;%'",
      "content LIKE '%；%'",
      "content LIKE '%((%'",
    ];
    if (existingSourceBlockIds.length > 0) {
      candidateParts.push(`id IN (${toSqlInClause(existingSourceBlockIds)})`);
    }
    clauses.push(`(${candidateParts.join(' OR ')})`);

    return clauses.join(' AND ');
  }

  private buildScopeClause(scope: CdfLiveRelationFullRepairScope): string {
    if (scope.kind === 'workspace') {
      return '';
    }
    if (scope.kind === 'document') {
      const docId = readString(scope.docId);
      return docId ? `(root_id = '${escapeSql(docId)}' OR id = '${escapeSql(docId)}')` : '';
    }
    if (scope.kind === 'notebook') {
      const notebookId = readString(scope.notebookId);
      return notebookId ? `box = '${escapeSql(notebookId)}'` : '';
    }

    const clauses: string[] = [];
    const docIds = uniqueStrings([scope.docId || undefined, ...(scope.scopeDocIds || [])]);
    if (docIds.length > 0) {
      clauses.push(`(root_id IN (${toSqlInClause(docIds)}) OR id IN (${toSqlInClause(docIds)}))`);
    }
    const notebookId = readString(scope.notebookId);
    if (notebookId) {
      clauses.push(`box = '${escapeSql(notebookId)}'`);
    }
    return clauses.join(' AND ');
  }
}

export function createCdfLiveRelationCardCreatorFromUnifiedStorage(
  storage: CdfLiveRelationUnifiedStorageCreatePort | null | undefined,
): CdfLiveRelationCardCreatorPort {
  return {
    async createCards(cards, xiuyuans, options = {}) {
      if (!storage || typeof storage.createCard !== 'function') {
        throw new Error('CDF_LIVE_RELATION_CREATE_UNAVAILABLE: unified storage createCard port is unavailable');
      }
      if (cards.length !== xiuyuans.length) {
        throw new Error('CDF_LIVE_RELATION_CREATE_INVALID_INPUT: card and xiuyuan counts differ');
      }

      for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index];
        const xiuyuan = xiuyuans[index];
        const result = await storage.createCard(xiuyuan, card, options);
        if (isRecord(result) && result.ok === false) {
          throw result.error ?? new Error(`Failed to create CDF live relation card ${card.id}`);
        }
      }
    },
  };
}

export class CdfLiveRelationWriteRepairService {
  private readonly sourceLoader: CdfLiveRelationWriteRepairSourceLoader | null;
  private readonly candidateScanner: CdfLiveRelationRepairCandidateScanner | null;
  private readonly now: () => number;
  private readonly idFactory: (relation: CdfLiveRelationCandidate) => string;
  private readonly xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => string;

  constructor(private readonly deps: CdfLiveRelationWriteRepairServiceDeps) {
    this.sourceLoader = deps.sourceLoader ?? null;
    this.candidateScanner = deps.candidateScanner ?? null;
    this.now = deps.now ?? (() => Date.now());
    this.idFactory = deps.idFactory ?? ((relation) => createStableId('cdf_card', relation));
    this.xiuyuanIdFactory = deps.xiuyuanIdFactory ?? ((relation) => createStableId('cdf_xy', relation));
  }

  async previewFullRepairDryRun(
    options: CdfLiveRelationFullRepairDryRunOptions = {},
  ): Promise<CdfLiveRelationFullRepairDryRunResult> {
    const scan = await this.resolveFullRepairScanContext(options);
    if (scan.reason) {
      return this.fullRepairResult(scan.attempted, scan.scope, [], scan.reason);
    }

    const sourcePreviews = await this.reconcileFullRepairCandidateGroups(
      scan.candidates,
      {
        allowCreateMissing: true,
        candidateGrouping: 'scan-root',
        persist: false,
        previewOnly: true,
      },
    );

    const preview = this.fullRepairResult(true, scan.scope, sourcePreviews, 'previewed');
    preview.summary.candidateSourceCount = scan.candidates.length;
    return preview;
  }

  async executeFullRepair(
    options: CdfLiveRelationFullRepairExecuteOptions = {},
  ): Promise<CdfLiveRelationFullRepairExecuteResult> {
    const createNewCandidates = options.createNewCandidates === true;
    const scan = await this.resolveFullRepairScanContext(options);
    if (scan.reason) {
      return this.fullRepairExecuteResult(
        scan.attempted,
        scan.scope,
        [],
        [],
        createNewCandidates,
        scan.reason,
      );
    }

    if (!createNewCandidates) {
      const persistedCandidates = scan.candidates.filter(hasExistingCardCandidateReason);
      const previewOnlyCandidates = scan.candidates.filter((candidate) => !hasExistingCardCandidateReason(candidate));
      const sourcePreviews = await this.reconcileFullRepairCandidateGroups(
        persistedCandidates,
        {
          allowCreateMissing: false,
          candidateGrouping: 'single-candidate',
          persist: true,
          previewOnly: false,
        },
      );
      const previewOnlySourcePreviews = await this.reconcileFullRepairCandidateGroups(
        previewOnlyCandidates,
        {
          allowCreateMissing: true,
          candidateGrouping: 'single-candidate',
          persist: false,
          previewOnly: true,
        },
      );
      return this.fullRepairExecuteResult(
        true,
        scan.scope,
        sourcePreviews,
        previewOnlySourcePreviews,
        createNewCandidates,
        'executed',
      );
    }

    const executedSourcePreviews = await this.reconcileFullRepairCandidateGroups(
      scan.candidates,
      {
        allowCreateMissing: true,
        candidateGrouping: 'single-candidate',
        persist: true,
        previewOnly: false,
      },
    );
    const sourcePreviews = executedSourcePreviews
      .filter((sourcePreview) => !isDeriveFailedNoCardSourcePreview(sourcePreview));
    const previewOnlySourcePreviews = executedSourcePreviews
      .filter(isDeriveFailedNoCardSourcePreview)
      .map((sourcePreview) => ({
        ...sourcePreview,
        persisted: false,
        previewOnly: true,
      }));

    return this.fullRepairExecuteResult(
      true,
      scan.scope,
      sourcePreviews,
      previewOnlySourcePreviews,
      createNewCandidates,
      'executed',
    );
  }

  async previewSingleSourceRepairDryRun(
    options: CdfLiveRelationSingleSourceRepairOptions,
  ): Promise<CdfLiveRelationSingleSourceRepairResult> {
    return this.reconcileSingleSourceRepair(options, false);
  }

  async executeSingleSourceRepair(
    options: CdfLiveRelationSingleSourceRepairOptions,
  ): Promise<CdfLiveRelationSingleSourceRepairResult> {
    return this.reconcileSingleSourceRepair(options, true);
  }

  async reconcileWriteOrRepair(
    options: CdfLiveRelationWriteRepairOptions,
  ): Promise<CdfLiveRelationWriteRepairResult> {
    return this.reconcileWriteOrRepairInternal(options);
  }

  private async reconcileWriteOrRepairInternal(
    options: CdfLiveRelationWriteRepairOptions,
    actionFilter: (action: CdfReconciliationAction) => boolean = () => true,
  ): Promise<CdfLiveRelationWriteRepairResult> {
    const sourceTree = await this.resolveSourceTree(options);
    if (sourceTree === undefined) {
      return this.result(false, [], [], [], 0, 'source-unavailable');
    }
    if (sourceTree === null) {
      return this.result(true, [], [], [], 0, 'source-missing');
    }

    const draftSourceTree = applyDraftMarkdownToSourceTree(sourceTree, options.draftMarkdownByBlockId);
    const scopedSourceTree = this.resolveReconciliationScope(draftSourceTree, options);
    if (scopedSourceTree === null) {
      return this.result(true, [], [], [], 0, 'source-missing');
    }

    const initialSourceBlockIds = Array.from(new Set([
      ...collectNodeIds(scopedSourceTree),
      readString(options.sourceBlockId),
    ].filter(Boolean)));
    const existingCards = options.existingCards ?? (
      initialSourceBlockIds.length > 0
        ? (await this.deps.manager.getCards({ blockIds: initialSourceBlockIds })).filter(isCdfRelationCard)
        : []
    );
    const sourceDerivedResult = deriveCdfLiveRelations(scopedSourceTree);
    const sourceBoundDescriptorBlockIds = new Set(sourceDerivedResult.relations
      .filter((relation) => relation.relationKind.startsWith('descriptor'))
      .map((relation) => relation.sourceBlockId));
    const deriveResult = deriveCdfLiveRelations(scopedSourceTree, {
      descriptorConceptEvidence: buildDescriptorConceptEvidenceFromCards(existingCards, sourceBoundDescriptorBlockIds),
    });
    const reconciliation = reconcileCdfLiveRelations({
      liveRelations: deriveResult.relations,
      existingCards,
      allowCreateMissing: options.allowCreateMissing ?? true,
      legacyDeriveResults: existingCards
        .filter((card) => !readString((isRecord(card.meta) ? card.meta : {}).liveRelationKey))
        .map((card) => ({
          cardId: card.id,
          relation: findLegacyRelationForCard(card, deriveResult.relations),
        })),
    });
    const actions = reconciliation.actions.filter(actionFilter);

    const now = this.now();
    const createdCards: FSRSCard[] = [];
    const createdXiuyuans: IXiuyuan[] = [];
    const updatedCards: FSRSCard[] = [];

    for (const action of actions) {
      if (action.kind === 'create-card') {
        const cardId = this.idFactory(action.relation);
        const xiuyuanId = this.xiuyuanIdFactory(action.relation);
        createdCards.push(buildNewCard({ relation: action.relation, cardId, xiuyuanId, now }));
        createdXiuyuans.push(buildNewXiuyuan({ relation: action.relation, cardId, xiuyuanId, now }));
        continue;
      }

      const existing = existingCards.find((card) => card.id === action.cardId);
      if (!existing) {
        continue;
      }
      const nextCard: FSRSCard = {
        ...existing,
        meta: action.meta,
        updatedAt: now,
      };
      if (!metadataEqual(existing.meta, nextCard.meta)) {
        updatedCards.push(nextCard);
      }
    }

    if (options.persist !== false) {
      await this.persist(createdCards, createdXiuyuans, updatedCards);
    }

    return this.result(
      true,
      actions,
      createdCards,
      updatedCards,
      deriveResult.relations.length,
      createdCards.length > 0 || updatedCards.length > 0 ? 'reconciled' : 'unchanged',
    );
  }

  private async resolveSourceTree(
    options: CdfLiveRelationWriteRepairOptions,
  ): Promise<CdfLiveBlockNode | CdfLiveBlockNode[] | null | undefined> {
    if (options.sourceTree !== undefined) {
      return options.sourceTree;
    }

    const sourceBlockId = readString(options.sourceBlockId);
    if (!sourceBlockId || !this.sourceLoader) {
      return undefined;
    }
    return this.sourceLoader.loadSourceTree(sourceBlockId, {
      reconciliationScope: options.reconciliationScope,
      changedBlockId: options.changedBlockId,
    });
  }

  private async reconcileSingleSourceRepair(
    options: CdfLiveRelationSingleSourceRepairOptions,
    persist: boolean,
  ): Promise<CdfLiveRelationSingleSourceRepairResult> {
    const sourceBlockId = readString(options.sourceBlockId);
    const categoryToggles = normalizeSingleSourceRepairCategoryToggles(options.categoryToggles);
    const result = await this.reconcileWriteOrRepairInternal({
      sourceBlockId,
      changedBlockId: sourceBlockId,
      reconciliationScope: 'single-source',
      sourceTree: options.sourceTree,
      draftMarkdownByBlockId: options.draftMarkdownByBlockId,
      allowCreateMissing: true,
      persist,
    }, persist
      ? (action) => shouldApplySingleSourceRepairAction(action, categoryToggles)
      : undefined);
    return this.singleSourceRepairResult(sourceBlockId, result, persist, categoryToggles);
  }

  private async resolveFullRepairScanContext(
    options: CdfLiveRelationFullRepairDryRunOptions,
  ): Promise<CdfLiveRelationFullRepairScanContext> {
    const scope = normalizeFullRepairScope(options.scope);
    if (!this.candidateScanner) {
      return { attempted: false, scope, candidates: [], reason: 'scanner-unavailable' };
    }
    if (!this.sourceLoader) {
      return { attempted: false, scope, candidates: [], reason: 'source-unavailable' };
    }

    const existingCards = (await this.deps.manager.getCards()).filter(isCdfRelationCard);
    const existingSourceBlockIds = uniqueStrings(existingCards.map(readCdfRelationCardSourceBlockId));
    const candidates = await this.candidateScanner.listCandidateSources({
      scope,
      existingSourceBlockIds,
      limit: options.limit,
    });
    if (candidates.length === 0) {
      return { attempted: true, scope, candidates, reason: 'no-candidates' };
    }
    return { attempted: true, scope, candidates };
  }

  private async reconcileFullRepairCandidateGroups(
    candidates: CdfLiveRelationRepairCandidateSource[],
    options: {
      allowCreateMissing: boolean;
      candidateGrouping: 'scan-root' | 'single-candidate';
      persist: boolean;
      previewOnly: boolean;
    },
  ): Promise<CdfLiveRelationFullRepairSourcePreview[]> {
    if (!this.sourceLoader || candidates.length === 0) {
      return [];
    }

    const groups = options.candidateGrouping === 'scan-root'
      ? Array.from(this.groupCandidatesByScanRoot(candidates).entries())
      : candidates
        .map((candidate): [string, CdfLiveRelationRepairCandidateSource[]] => [
          readString(candidate.rootId) || readString(candidate.sourceBlockId),
          [candidate],
        ])
        .filter(([scanRootId]) => Boolean(scanRootId));

    const sourcePreviews: CdfLiveRelationFullRepairSourcePreview[] = [];
    for (const [scanRootId, group] of groups) {
      const sourceTree = await this.sourceLoader.loadSourceTree(scanRootId, {
        reconciliationScope: 'source',
        changedBlockId: undefined,
      });
      const previewSourceTree = sourceTree
        ? this.buildFullRepairPreviewSourceTree(sourceTree, group)
        : sourceTree;
      const result = await this.reconcileWriteOrRepair({
        sourceBlockId: scanRootId,
        sourceTree: previewSourceTree,
        allowCreateMissing: options.allowCreateMissing,
        persist: options.persist,
      });
      sourcePreviews.push({
        scanRootId,
        candidateSourceIds: uniqueStrings(group.map((candidate) => candidate.sourceBlockId)),
        candidateReasons: Array.from(new Set(group.flatMap((candidate) => candidate.candidateReasons))),
        result,
        persisted: options.persist && !options.previewOnly,
        previewOnly: options.previewOnly,
      });
    }

    return sourcePreviews;
  }

  private groupCandidatesByScanRoot(
    candidates: CdfLiveRelationRepairCandidateSource[],
  ): Map<string, CdfLiveRelationRepairCandidateSource[]> {
    const groups = new Map<string, CdfLiveRelationRepairCandidateSource[]>();
    for (const candidate of candidates) {
      const scanRootId = readString(candidate.rootId) || readString(candidate.sourceBlockId);
      if (!scanRootId) {
        continue;
      }
      const group = groups.get(scanRootId) || [];
      group.push(candidate);
      groups.set(scanRootId, group);
    }
    return groups;
  }

  private buildFullRepairPreviewSourceTree(
    sourceTree: CdfLiveBlockNode | CdfLiveBlockNode[],
    candidates: CdfLiveRelationRepairCandidateSource[],
  ): CdfLiveBlockNode | CdfLiveBlockNode[] | null {
    const scopedTrees = candidates.map((candidate) => {
      const candidateNode = findCdfLiveBlockNode(sourceTree, candidate.sourceBlockId);
      if (candidateNode && shouldScanCandidateNodeDirectly(candidate, candidateNode)) {
        return cloneCdfLiveBlockTree(candidateNode);
      }
      return scopeCdfLiveBlockEditTree(sourceTree, candidate.sourceBlockId);
    });
    const flattened = flattenSourceTrees(scopedTrees);
    if (flattened.length === 0) {
      return null;
    }
    return flattened.length === 1 ? flattened[0] : flattened;
  }

  private resolveReconciliationScope(
    sourceTree: CdfLiveBlockNode | CdfLiveBlockNode[],
    options: CdfLiveRelationWriteRepairOptions,
  ): CdfLiveBlockNode | CdfLiveBlockNode[] | null {
    if (options.reconciliationScope === 'single-source') {
      const sourceBlockId = readString(options.changedBlockId) || readString(options.sourceBlockId);
      return sourceBlockId ? buildSingleSourceRepairSourceTree(sourceTree, sourceBlockId) : sourceTree;
    }
    if (options.reconciliationScope !== 'block-edit') {
      return sourceTree;
    }
    const changedBlockId = readString(options.changedBlockId) || readString(options.sourceBlockId);
    if (!changedBlockId) {
      return sourceTree;
    }
    return scopeCdfLiveBlockEditTree(sourceTree, changedBlockId);
  }

  private resolveExistingCardScope(
    sourceTree: CdfLiveBlockNode | CdfLiveBlockNode[],
    relations: CdfLiveRelationCandidate[],
    sourceBlockId?: string,
  ): string[] {
    return Array.from(new Set([
      ...collectNodeIds(sourceTree),
      ...relations.map((relation) => relation.sourceBlockId),
      readString(sourceBlockId),
    ].filter(Boolean)));
  }

  private async persist(
    createdCards: FSRSCard[],
    createdXiuyuans: IXiuyuan[],
    updatedCards: FSRSCard[],
  ): Promise<void> {
    const mutationOptions: CardMutationOptions = { suppressDueIndexSort: true };
    const createdConceptAssetCards = await this.ensureConceptSimpleAssetsForNewRelations(createdCards, mutationOptions);
    if (createdCards.length > 0) {
      await this.deps.cardCreator.createCards(createdCards, createdXiuyuans, mutationOptions);
      if (typeof this.deps.manager.onCardCreated === 'function') {
        for (const card of [...createdConceptAssetCards, ...createdCards]) {
          await this.deps.manager.onCardCreated(card);
        }
      }
    }
    for (const card of updatedCards) {
      await this.deps.manager.updateCard(card, mutationOptions);
    }
  }

  private async ensureConceptSimpleAssetsForNewRelations(
    createdRelationCards: FSRSCard[],
    mutationOptions: CardMutationOptions,
  ): Promise<FSRSCard[]> {
    const conceptBlockIds = Array.from(new Set(
      createdRelationCards
        .map((card) => readString(isRecord(card.meta) ? card.meta.conceptBlockId : ''))
        .filter(Boolean),
    ));
    if (conceptBlockIds.length === 0) {
      return [];
    }

    const existingConceptCards = await this.deps.manager.getCards({ blockIds: conceptBlockIds });
    const missingConceptBlockIds = conceptBlockIds.filter((conceptBlockId) => (
      !existingConceptCards.some((card) => isConceptSimpleAssetForBlock(card, conceptBlockId))
    ));
    if (missingConceptBlockIds.length === 0) {
      return [];
    }

    const now = this.now();
    const conceptCards: FSRSCard[] = [];
    const conceptXiuyuans: IXiuyuan[] = [];
    for (const conceptBlockId of missingConceptBlockIds) {
      const ids = createConceptAssetIds(conceptBlockId);
      conceptCards.push(buildConceptSimpleCard({ conceptBlockId, ...ids, now }));
      conceptXiuyuans.push(buildConceptSimpleXiuyuan({ conceptBlockId, ...ids, now }));
    }

    await this.deps.cardCreator.createCards(conceptCards, conceptXiuyuans, mutationOptions);
    return conceptCards;
  }

  private result(
    attempted: boolean,
    actions: CdfReconciliationAction[],
    createdCards: FSRSCard[],
    updatedCards: FSRSCard[],
    derivedRelationCount: number,
    reason: CdfLiveRelationWriteRepairResult['reason'],
  ): CdfLiveRelationWriteRepairResult {
    return {
      attempted,
      actions,
      createdCards,
      updatedCards,
      derivedRelationCount,
      reason,
    };
  }

  private singleSourceRepairResult(
    sourceBlockId: string,
    result: CdfLiveRelationWriteRepairResult,
    persisted: boolean,
    categoryToggles: CdfLiveRelationSingleSourceRepairCategoryToggles,
  ): CdfLiveRelationSingleSourceRepairResult {
    const summary = buildFullRepairEmptySummary();
    mergeFullRepairSummary(summary, {
      scanRootId: sourceBlockId,
      candidateSourceIds: sourceBlockId ? [sourceBlockId] : [],
      candidateReasons: ['existing-card'],
      result,
      persisted,
      previewOnly: !persisted,
    });
    summary.candidateSourceCount = sourceBlockId ? 1 : 0;
    return {
      attempted: result.attempted,
      sourceBlockId,
      persisted,
      categoryToggles,
      result,
      summary,
      reason: result.reason,
    };
  }

  private fullRepairResult(
    attempted: boolean,
    scope: CdfLiveRelationFullRepairScope,
    sourcePreviews: CdfLiveRelationFullRepairSourcePreview[],
    reason: CdfLiveRelationFullRepairDryRunResult['reason'],
  ): CdfLiveRelationFullRepairDryRunResult {
    const summary = buildFullRepairEmptySummary();
    for (const sourcePreview of sourcePreviews) {
      mergeFullRepairSummary(summary, sourcePreview);
    }
    return {
      attempted,
      scope,
      sourcePreviews,
      summary,
      reason,
    };
  }

  private fullRepairExecuteResult(
    attempted: boolean,
    scope: CdfLiveRelationFullRepairScope,
    sourcePreviews: CdfLiveRelationFullRepairSourcePreview[],
    previewOnlySourcePreviews: CdfLiveRelationFullRepairSourcePreview[],
    createNewCandidates: boolean,
    reason: CdfLiveRelationFullRepairExecuteResult['reason'],
  ): CdfLiveRelationFullRepairExecuteResult {
    const summary = buildFullRepairEmptySummary();
    for (const sourcePreview of sourcePreviews) {
      mergeFullRepairSummary(summary, sourcePreview);
    }
    summary.candidateSourceCount = countPreviewCandidateSources(sourcePreviews);

    const previewOnlySummary = buildFullRepairEmptySummary();
    for (const sourcePreview of previewOnlySourcePreviews) {
      mergeFullRepairSummary(previewOnlySummary, sourcePreview);
    }
    previewOnlySummary.candidateSourceCount = countPreviewCandidateSources(previewOnlySourcePreviews);

    return {
      attempted,
      scope,
      sourcePreviews,
      previewOnlySourcePreviews,
      summary,
      previewOnlySummary,
      createNewCandidates,
      reason,
    };
  }
}
