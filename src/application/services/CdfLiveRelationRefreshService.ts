import {
  deriveCdfLiveRelations,
  reconcileCdfLiveRelations,
  scopeCdfLiveBlockEditTree,
  type CdfLiveBlockNode,
  type CdfLiveRelationCandidate,
  type CdfRelationKind,
  type CdfReconciliationAction,
  type CdfCurrentReviewDuplicateOutcome,
} from '@/core/card/cdf-live-relation';
import {
  isConceptDefinitionCard,
  isDescriptorSemanticCard,
} from '@/core/xiuyuan/cardMeta';
import type { FSRSCard } from '@/types/card';
import type {
  CardMutationOptions,
  IUnifiedDataSourceManagerFacade,
} from '@/types/unified-data-source';

export type CdfLiveRelationRefreshSurface = 'review-open' | 'browser-open';

export interface CdfLiveRelationSqlPort {
  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
}

export interface CdfLiveRelationSqlSourceLoadOptions {
  reconciliationScope?: 'source' | 'block-edit';
  changedBlockId?: string;
}

export interface CdfLiveRelationRefreshSourceLoader {
  loadSourceTree(sourceBlockId: string, card: FSRSCard): Promise<CdfLiveBlockNode | CdfLiveBlockNode[] | null>;
}

export interface CdfLiveRelationRefreshServiceDeps {
  manager: Pick<IUnifiedDataSourceManagerFacade, 'getCard' | 'getCards' | 'updateCard'>;
  source?: CdfLiveRelationSqlPort | null;
  sourceLoader?: CdfLiveRelationRefreshSourceLoader | null;
  now?: () => number;
}

export interface CdfLiveRelationRefreshOptions {
  surface?: CdfLiveRelationRefreshSurface;
  sourceTree?: CdfLiveBlockNode | CdfLiveBlockNode[] | null;
  persist?: boolean;
}

export interface CdfLiveRelationRefreshResult {
  attempted: boolean;
  card: FSRSCard | null;
  updatedCard: FSRSCard | null;
  actions: CdfReconciliationAction[];
  derivedRelationCount: number;
  currentReviewDuplicateOutcome: CdfCurrentReviewDuplicateOutcome | null;
  reason:
    | 'refreshed'
    | 'unchanged'
    | 'non-cdf-card'
    | 'card-not-found'
    | 'source-unavailable'
    | 'source-missing';
}

interface CdfLiveRelationBlockRow extends Record<string, unknown> {
  id?: string | null;
  parent_id?: string | null;
  root_id?: string | null;
  type?: string | null;
  subtype?: string | null;
  content?: string | null;
  markdown?: string | null;
  sort?: string | number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readMeta(card: FSRSCard): Record<string, unknown> {
  return isRecord(card.meta) ? card.meta : {};
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
  const faceRuleId = readString(card.faceKey?.ruleId);
  return faceRuleId
    || readString(meta.ruleId)
    || readString(meta.cardRuleId)
    || readString(meta.typeMarker)
    || readString(meta.templateID);
}

function resolveExpectedRelationKind(card: FSRSCard, meta: Record<string, unknown>): CdfRelationKind | null {
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

function isCdfRelationCard(card: FSRSCard, meta: Record<string, unknown>): boolean {
  return readString(meta.liveRelationKey).length > 0
    || readString(meta.relationAuthority) === 'live-backlink'
    || isConceptDefinitionCard(card)
    || isDescriptorSemanticCard(card);
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

function findLegacyRelationForCard(
  card: FSRSCard,
  relations: CdfLiveRelationCandidate[],
): CdfLiveRelationCandidate | null {
  const meta = readMeta(card);
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

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function rowId(row: CdfLiveRelationBlockRow): string {
  return readString(row.id);
}

function rowParentId(row: CdfLiveRelationBlockRow): string {
  return readString(row.parent_id);
}

function rowSortValue(row: CdfLiveRelationBlockRow): string {
  return String(row.sort ?? '');
}

function rowMarkdown(row: CdfLiveRelationBlockRow): string {
  return readString(row.markdown) || readString(row.content);
}

function compareRows(left: CdfLiveRelationBlockRow, right: CdfLiveRelationBlockRow): number {
  const sortCompare = rowSortValue(left).localeCompare(rowSortValue(right));
  if (sortCompare !== 0) {
    return sortCompare;
  }
  return rowId(left).localeCompare(rowId(right));
}

function createNode(row: CdfLiveRelationBlockRow, children: CdfLiveBlockNode[]): CdfLiveBlockNode {
  return {
    id: rowId(row),
    type: readString(row.type) || undefined,
    subtype: readString(row.subtype) || undefined,
    markdown: rowMarkdown(row),
    content: readString(row.content) || undefined,
    children,
  };
}

function buildBlockTree(rows: CdfLiveRelationBlockRow[], preferredRootId: string): CdfLiveBlockNode | null {
  const normalizedRows = rows.filter((row) => rowId(row));
  if (normalizedRows.length === 0) {
    return null;
  }

  const byId = new Map(normalizedRows.map((row) => [rowId(row), row]));
  const childrenByParentId = new Map<string, CdfLiveRelationBlockRow[]>();
  for (const row of normalizedRows) {
    const parentId = rowParentId(row);
    if (!parentId || !byId.has(parentId)) {
      continue;
    }
    const children = childrenByParentId.get(parentId) || [];
    children.push(row);
    childrenByParentId.set(parentId, children);
  }

  const materialize = (row: CdfLiveRelationBlockRow): CdfLiveBlockNode => {
    const children = [...(childrenByParentId.get(rowId(row)) || [])]
      .sort(compareRows)
      .map(materialize);
    return createNode(row, children);
  };

  const root = byId.get(preferredRootId)
    || normalizedRows.find((row) => rowId(row) === readString(row.root_id))
    || normalizedRows.find((row) => !rowParentId(row) || !byId.has(rowParentId(row)))
    || normalizedRows[0];
  return materialize(root);
}

function uniqueCardsById(cards: FSRSCard[]): FSRSCard[] {
  const byId = new Map<string, FSRSCard>();
  for (const card of cards) {
    const cardId = readString(card.id);
    if (cardId) {
      byId.set(cardId, card);
    }
  }
  return Array.from(byId.values());
}

export class CdfLiveRelationSqlSourceLoader implements CdfLiveRelationRefreshSourceLoader {
  constructor(private readonly source: CdfLiveRelationSqlPort) {}

  async loadSourceTree(
    sourceBlockId: string,
    cardOrOptions?: FSRSCard | CdfLiveRelationSqlSourceLoadOptions,
  ): Promise<CdfLiveBlockNode | null> {
    const normalizedSourceBlockId = readString(sourceBlockId);
    if (!normalizedSourceBlockId) {
      return null;
    }

    const sourceRows = await this.source.sql<CdfLiveRelationBlockRow>(`
      SELECT id, parent_id, root_id, type, subtype, content, markdown, sort
      FROM blocks
      WHERE id = '${escapeSql(normalizedSourceBlockId)}'
      LIMIT 1
    `);
    const sourceRow = sourceRows[0];
    if (!sourceRow || !rowId(sourceRow)) {
      return null;
    }

    const rootId = readString(sourceRow.root_id) || rowId(sourceRow);
    const rows = await this.source.sql<CdfLiveRelationBlockRow>(`
      SELECT id, parent_id, root_id, type, subtype, content, markdown, sort
      FROM blocks
      WHERE root_id = '${escapeSql(rootId)}' OR id = '${escapeSql(rootId)}'
      ORDER BY parent_id ASC, sort ASC, id ASC
    `);
    const sourceTree = buildBlockTree(rows.length > 0 ? rows : [sourceRow], rootId);
    if (!sourceTree) {
      return null;
    }

    const options = isRecord(cardOrOptions) && readString(cardOrOptions.reconciliationScope)
      ? cardOrOptions as unknown as CdfLiveRelationSqlSourceLoadOptions
      : null;
    if (options?.reconciliationScope !== 'block-edit') {
      return sourceTree;
    }

    const changedBlockId = readString(options.changedBlockId) || normalizedSourceBlockId;
    const scopedTree = scopeCdfLiveBlockEditTree(sourceTree, changedBlockId);
    return Array.isArray(scopedTree) ? scopedTree[0] ?? null : scopedTree;
  }
}

export class CdfLiveRelationRefreshService {
  private readonly sourceLoader: CdfLiveRelationRefreshSourceLoader | null;
  private readonly now: () => number;

  constructor(private readonly deps: CdfLiveRelationRefreshServiceDeps) {
    this.sourceLoader = deps.sourceLoader ?? (deps.source ? new CdfLiveRelationSqlSourceLoader(deps.source) : null);
    this.now = deps.now ?? (() => Date.now());
  }

  async refreshCurrentCardOnOpen(
    cardOrId: FSRSCard | string | null | undefined,
    options: CdfLiveRelationRefreshOptions = {},
  ): Promise<CdfLiveRelationRefreshResult> {
    const card = await this.resolveCard(cardOrId);
    if (!card) {
      return this.result(false, null, null, [], 0, null, 'card-not-found');
    }

    const meta = readMeta(card);
    if (!isCdfRelationCard(card, meta)) {
      return this.result(false, card, null, [], 0, null, 'non-cdf-card');
    }

    const sourceBlockId = resolveSourceBlockId(card, meta);
    if (!sourceBlockId) {
      return this.result(true, card, null, [], 0, null, 'source-unavailable');
    }

    const sourceTree = options.sourceTree === undefined
      ? await this.sourceLoader?.loadSourceTree(sourceBlockId, card)
      : options.sourceTree;
    if (!sourceTree) {
      return this.result(true, card, null, [], 0, null, 'source-missing');
    }

    const deriveResult = deriveCdfLiveRelations(sourceTree);
    const existingCards = await this.loadExistingCardsForRefresh(card, sourceBlockId);
    const reconciliation = reconcileCdfLiveRelations({
      liveRelations: deriveResult.relations,
      existingCards,
      allowCreateMissing: false,
      currentCardId: options.surface === 'review-open' ? card.id : undefined,
      legacyDeriveResults: existingCards
        .filter((existingCard) => !readString(readMeta(existingCard).liveRelationKey))
        .map((existingCard) => ({
          cardId: existingCard.id,
          relation: findLegacyRelationForCard(existingCard, deriveResult.relations),
        })),
    });

    const existingById = new Map(existingCards.map((existingCard) => [existingCard.id, existingCard]));
    const updateActions = reconciliation.actions.filter((action): action is Extract<CdfReconciliationAction, { kind: 'update-card-meta' }> => (
      action.kind === 'update-card-meta'
    ));
    if (updateActions.length === 0) {
      return this.result(true, card, null, reconciliation.actions, deriveResult.relations.length, reconciliation.currentReviewDuplicateOutcome, 'unchanged');
    }

    const now = this.now();
    const updatedCards = updateActions
      .map((action) => {
        const existingCard = existingById.get(action.cardId);
        if (!existingCard) {
          return null;
        }
        return {
          ...existingCard,
          meta: action.meta,
          updatedAt: now,
        } satisfies FSRSCard;
      })
      .filter((updatedCard): updatedCard is FSRSCard => Boolean(updatedCard));
    const changedCards = updatedCards.filter((updatedCard) => {
      const previous = existingById.get(updatedCard.id);
      return previous ? !metadataEqual(previous.meta, updatedCard.meta) : false;
    });
    const updatedCard = updatedCards.find((candidate) => candidate.id === card.id) ?? null;
    if (changedCards.length === 0) {
      return this.result(true, card, updatedCard, reconciliation.actions, deriveResult.relations.length, reconciliation.currentReviewDuplicateOutcome, 'unchanged');
    }

    if (options.persist !== false) {
      const mutationOptions: CardMutationOptions = {
        suppressDueIndexSort: true,
        queueImpact: {
          kind: 'metadata-only',
          reason: 'cdf-live-relation-refresh',
        },
      };
      for (const changedCard of changedCards) {
        await this.deps.manager.updateCard(changedCard, mutationOptions);
      }
    }

    return this.result(true, card, updatedCard, reconciliation.actions, deriveResult.relations.length, reconciliation.currentReviewDuplicateOutcome, 'refreshed');
  }

  private async loadExistingCardsForRefresh(card: FSRSCard, sourceBlockId: string): Promise<FSRSCard[]> {
    const sourceCards = await this.deps.manager.getCards({ blockIds: [sourceBlockId] });
    return uniqueCardsById([
      ...sourceCards.filter((candidate) => isCdfRelationCard(candidate, readMeta(candidate))),
      card,
    ]);
  }

  private async resolveCard(cardOrId: FSRSCard | string | null | undefined): Promise<FSRSCard | null> {
    if (!cardOrId) {
      return null;
    }
    if (typeof cardOrId !== 'string') {
      return cardOrId;
    }
    const cardId = cardOrId.trim();
    if (!cardId) {
      return null;
    }
    try {
      return await this.deps.manager.getCard(cardId, { silent: true });
    } catch {
      return null;
    }
  }

  private result(
    attempted: boolean,
    card: FSRSCard | null,
    updatedCard: FSRSCard | null,
    actions: CdfReconciliationAction[],
    derivedRelationCount: number,
    currentReviewDuplicateOutcome: CdfCurrentReviewDuplicateOutcome | null,
    reason: CdfLiveRelationRefreshResult['reason'],
  ): CdfLiveRelationRefreshResult {
    return {
      attempted,
      card,
      updatedCard,
      actions,
      derivedRelationCount,
      currentReviewDuplicateOutcome,
      reason,
    };
  }
}
