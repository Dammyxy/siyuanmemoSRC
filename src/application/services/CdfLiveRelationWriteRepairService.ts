import {
  deriveCdfLiveRelations,
  reconcileCdfLiveRelations,
  scopeCdfLiveBlockEditTree,
  writeCdfLiveRelationMetadata,
  type CdfLiveBlockNode,
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

export type CdfLiveRelationWriteRepairScope = 'source' | 'block-edit';

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

export interface CdfLiveRelationWriteRepairServiceDeps {
  manager: CdfLiveRelationWriteRepairManagerPort;
  cardCreator: CdfLiveRelationCardCreatorPort;
  sourceLoader?: CdfLiveRelationWriteRepairSourceLoader | null;
  now?: () => number;
  idFactory?: (relation: CdfLiveRelationCandidate) => string;
  xiuyuanIdFactory?: (relation: CdfLiveRelationCandidate) => string;
}

export interface CdfLiveRelationWriteRepairOptions {
  sourceBlockId?: string;
  changedBlockId?: string;
  reconciliationScope?: CdfLiveRelationWriteRepairScope;
  sourceTree?: CdfLiveBlockNode | CdfLiveBlockNode[] | null;
  existingCards?: FSRSCard[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
  private readonly now: () => number;
  private readonly idFactory: (relation: CdfLiveRelationCandidate) => string;
  private readonly xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => string;

  constructor(private readonly deps: CdfLiveRelationWriteRepairServiceDeps) {
    this.sourceLoader = deps.sourceLoader ?? null;
    this.now = deps.now ?? (() => Date.now());
    this.idFactory = deps.idFactory ?? ((relation) => createStableId('cdf_card', relation));
    this.xiuyuanIdFactory = deps.xiuyuanIdFactory ?? ((relation) => createStableId('cdf_xy', relation));
  }

  async reconcileWriteOrRepair(
    options: CdfLiveRelationWriteRepairOptions,
  ): Promise<CdfLiveRelationWriteRepairResult> {
    const sourceTree = await this.resolveSourceTree(options);
    if (sourceTree === undefined) {
      return this.result(false, [], [], [], 0, 'source-unavailable');
    }
    if (sourceTree === null) {
      return this.result(true, [], [], [], 0, 'source-missing');
    }

    const scopedSourceTree = this.resolveReconciliationScope(sourceTree, options);
    if (scopedSourceTree === null) {
      return this.result(true, [], [], [], 0, 'source-missing');
    }

    const deriveResult = deriveCdfLiveRelations(scopedSourceTree);
    const sourceBlockIds = this.resolveExistingCardScope(scopedSourceTree, deriveResult.relations, options.sourceBlockId);
    const existingCards = options.existingCards ?? (
      sourceBlockIds.length > 0
        ? (await this.deps.manager.getCards({ blockIds: sourceBlockIds })).filter(isCdfRelationCard)
        : []
    );
    const reconciliation = reconcileCdfLiveRelations({
      liveRelations: deriveResult.relations,
      existingCards,
      allowCreateMissing: true,
      legacyDeriveResults: existingCards
        .filter((card) => !readString((isRecord(card.meta) ? card.meta : {}).liveRelationKey))
        .map((card) => ({
          cardId: card.id,
          relation: findLegacyRelationForCard(card, deriveResult.relations),
        })),
    });

    const now = this.now();
    const createdCards: FSRSCard[] = [];
    const createdXiuyuans: IXiuyuan[] = [];
    const updatedCards: FSRSCard[] = [];

    for (const action of reconciliation.actions) {
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
      reconciliation.actions,
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

  private resolveReconciliationScope(
    sourceTree: CdfLiveBlockNode | CdfLiveBlockNode[],
    options: CdfLiveRelationWriteRepairOptions,
  ): CdfLiveBlockNode | CdfLiveBlockNode[] | null {
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
}
