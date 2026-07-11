import type { HostBlockQueryPort } from '@/application/ports/HostBlockQueryPort';
import type { NativeRiffImportExclusionPort } from '@/application/ports/NativeRiffImportExclusionPort';
import type { NativeRiffImportSourceCard } from '@/application/ports/NativeRiffImportSourcePort';
import type {
  NativeRiffAdoptionCandidate,
  NativeRiffAdoptionReadPort,
  NativeRiffAdoptionWritePort,
} from '@/application/services/NativeRiffAdoptionModule';
import type {
  NativeRiffImportCreatePlan,
  NativeRiffImportLocalFace,
  NativeRiffImportLocalReadPort,
  NativeRiffImportSemanticResolution,
  NativeRiffImportWritePort,
} from '@/application/services/NativeRiffImportModule';
import {
  NATIVE_RIFF_IMPORT_RECEIPT_META_KEY,
  buildNativeRiffImportReceipt,
  readNativeRiffImportReceipt,
} from '@/core/card/semantics';
import { resolveRiffSymbolRenderRepair } from '@/core/card/render-contract';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import {
  buildLogicalCardKey,
  inferXiuyuanOwnership,
} from '@/core/storage/stability/logicalKeys';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { isErr } from '@/types/result';
import { ClozeDetector } from '@/utils/cloze-detector';

type NativeRiffStoragePort = Pick<
  UnifiedStorageManager,
  | 'createCardDTO'
  | 'getAllXiuYuans'
  | 'getCardDTO'
  | 'getCardDTOsByXiuyuanId'
  | 'getXiuYuan'
  | 'hasNativeRiffDeletionTombstone'
  | 'saveXiuyuanCardDelta'
  | 'updateCardDTO'
  | 'upsertXiuYuan'
>;

type StoredCardPair = Readonly<{
  dto: CardPersistenceDTO;
  xiuyuan: IXiuyuan;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPORTED_BINARY_SYMBOLS = [
  '>>>',
  '》》》',
  '>>',
  '》》',
  '<<',
  '《《',
  '<>',
  '《》',
  '::',
  '：：',
  ';;',
  '；；',
] as const;

export class NativeRiffLocalStorageAdapter
implements
NativeRiffImportLocalReadPort,
NativeRiffImportWritePort,
NativeRiffAdoptionReadPort,
NativeRiffAdoptionWritePort {
  constructor(
    private readonly storage: NativeRiffStoragePort,
    private readonly exclusions: Pick<NativeRiffImportExclusionPort, 'hasExclusion'>,
    private readonly blockQuery: HostBlockQueryPort,
    private readonly now: () => number = Date.now,
  ) {}

  async findByImportReceipt(input: {
    nativeCardId: string;
    deckId: string;
  }): Promise<NativeRiffImportLocalFace | null> {
    for (const pair of this.listStoredCardPairs()) {
      const receipt = readNativeRiffImportReceipt(pair.dto)
        ?? readNativeRiffImportReceipt(pair.xiuyuan);
      if (
        receipt?.nativeCardId === input.nativeCardId
        && receipt.deckId === input.deckId
      ) {
        return this.toLocalFace(pair);
      }
    }
    return null;
  }

  async findByLogicalKey(logicalKey: string): Promise<NativeRiffImportLocalFace | null> {
    for (const pair of this.listStoredCardPairs()) {
      if (buildLogicalCardKey(pair.dto, pair.xiuyuan) === logicalKey) {
        return this.toLocalFace(pair);
      }
    }
    return null;
  }

  async createImportedFaces(
    plans: readonly NativeRiffImportCreatePlan[],
  ): Promise<Readonly<{ createdCardIds: readonly string[] }>> {
    const createdCardIds: string[] = [];
    const grouped = groupPlansByBlock(plans);

    for (const blockPlans of grouped.values()) {
      const representative = blockPlans[0];
      if (!representative) {
        continue;
      }

      const now = this.now();
      const existingXiuyuan = this.storage.getAllXiuYuans()
        .find(candidate => candidate.blockIDs.includes(representative.blockId));
      const render = resolveImportedRenderMetadata(representative.sourceMarkdown);
      const xiuyuanId = existingXiuyuan?.id ?? `xy_${representative.blockId}`;
      const importReceipt = representative.importReceipt;
      const xiuyuan: IXiuyuan = {
        ...(existingXiuyuan ?? {
          id: xiuyuanId,
          blockIDs: [representative.blockId],
          fields: [{ name: 'content', blockID: representative.blockId }],
          createdAt: importReceipt.importedAt,
        }),
        id: xiuyuanId,
        blockIDs: Array.from(new Set([
          ...(existingXiuyuan?.blockIDs ?? []),
          representative.blockId,
        ])),
        fields: existingXiuyuan?.fields?.length
          ? existingXiuyuan.fields
          : [{ name: 'content', blockID: representative.blockId }],
        templateID: render.templateId,
        updatedAt: now,
        meta: {
          ...(existingXiuyuan?.meta ?? {}),
          ownership: 'local-owned',
          schedulerType: 'fsrs-v6',
          fieldMapping: { content: representative.blockId },
          cardType: 'item',
          source: render.source,
          ...render.metaPatch,
          [NATIVE_RIFF_IMPORT_RECEIPT_META_KEY]: importReceipt,
          faces: buildFaceMetadata(representative.sourceMarkdown, blockPlans),
        },
      };

      for (const plan of blockPlans) {
        const card = buildImportedCard(plan, xiuyuan, render, now);
        const result = await this.storage.createCardDTO(xiuyuan, card, {
          preferIncomingScheduling: true,
          schedulingWriteSource: 'riff-import',
        });
        if (isErr(result)) {
          throw result.error;
        }
        createdCardIds.push(card.id);
      }

      const saveResult = await this.storage.saveXiuyuanCardDelta({
        xiuyuanIds: [xiuyuan.id],
        cardIds: createdCardIds.filter(cardId => (
          this.storage.getCardDTO(cardId)?.xiuyuanID === xiuyuan.id
        )),
      });
      if (isErr(saveResult)) {
        throw saveResult.error;
      }
    }

    return { createdCardIds };
  }

  async listCandidates(): Promise<readonly NativeRiffAdoptionCandidate[]> {
    return this.listStoredCardPairs().map(({ dto, xiuyuan }) => {
      const receipt = readNativeRiffImportReceipt(dto)
        ?? readNativeRiffImportReceipt(xiuyuan)
        ?? buildNativeRiffImportReceipt({
          nativeCardId: readNativeCardId(dto, xiuyuan) || dto.id,
          deckId: readDeckId(dto, xiuyuan),
          importedAt: Math.min(dto.createdAt, xiuyuan.createdAt),
        });
      const meta = {
        ...(xiuyuan.meta ?? {}),
        ...(dto.meta ?? {}),
        [NATIVE_RIFF_IMPORT_RECEIPT_META_KEY]: receipt,
      };

      return {
        cardId: dto.id,
        xiuyuanId: xiuyuan.id,
        nativeCardId: receipt.nativeCardId,
        deckId: receipt.deckId,
        blockId: dto.blockId,
        cardType: String(dto.type),
        ownership: inferXiuyuanOwnership(xiuyuan),
        templateId: xiuyuan.templateID,
        scheduling: readScheduling(dto),
        reviewHistory: dto.rescheduleHistory ?? [],
        tags: [...(dto.tags ?? [])],
        priority: dto.priority,
        meta,
      };
    });
  }

  async readLiveSourceMarkdown(blockId: string): Promise<string | null> {
    const block = await this.blockQuery.getBlock(blockId);
    const markdown = String(block?.markdown ?? block?.content ?? '').trim();
    return markdown || null;
  }

  async hasDeletionTombstoneForAdoption(
    candidate: NativeRiffAdoptionCandidate,
  ): Promise<boolean> {
    return this.storage.hasNativeRiffDeletionTombstone({
      cardId: candidate.cardId,
      blockId: candidate.blockId,
      blockIds: [candidate.blockId],
      xiuyuanId: candidate.xiuyuanId,
      riffCardId: candidate.nativeCardId,
    });
  }

  async saveAdoptedRecords(
    records: readonly NativeRiffAdoptionCandidate[],
  ): Promise<Readonly<{ adopted: readonly NativeRiffAdoptionCandidate[] }>> {
    const adopted: NativeRiffAdoptionCandidate[] = [];
    const touchedXiuyuanIds = new Set<string>();
    const touchedCardIds = new Set<string>();

    for (const record of records) {
      const currentDto = this.storage.getCardDTO(record.cardId);
      const currentXiuyuan = this.storage.getXiuYuan(record.xiuyuanId);
      if (!currentDto || !currentXiuyuan) {
        continue;
      }

      const nextMeta: Record<string, unknown> = {
        ...record.meta,
        ownership: 'local-owned',
        templateID: record.templateId,
      };
      delete nextMeta.nativeRiffCompatibility;

      const nextXiuyuan: IXiuyuan = {
        ...currentXiuyuan,
        templateID: record.templateId,
        updatedAt: this.now(),
        meta: nextMeta,
      };
      const nextDto: CardPersistenceDTO = {
        ...currentDto,
        templateID: record.templateId,
        updatedAt: this.now(),
        meta: {
          ...(currentDto.meta ?? {}),
          ...nextMeta,
          xiuyuanID: currentXiuyuan.id,
        },
      };
      delete nextDto.meta?.nativeRiffCompatibility;

      this.storage.upsertXiuYuan(nextXiuyuan);
      const updateResult = await this.storage.updateCardDTO(nextDto);
      if (isErr(updateResult)) {
        throw updateResult.error;
      }

      touchedXiuyuanIds.add(nextXiuyuan.id);
      touchedCardIds.add(nextDto.id);
      adopted.push(record);
    }

    if (touchedCardIds.size > 0) {
      const saveResult = await this.storage.saveXiuyuanCardDelta({
        xiuyuanIds: [...touchedXiuyuanIds],
        cardIds: [...touchedCardIds],
      });
      if (isErr(saveResult)) {
        throw saveResult.error;
      }
    }

    return { adopted };
  }

  async hasDeletionTombstone(
    candidate: NativeRiffImportSourceCard | NativeRiffAdoptionCandidate,
  ): Promise<boolean> {
    if ('cardId' in candidate) {
      return this.hasDeletionTombstoneForAdoption(candidate);
    }
    return this.storage.hasNativeRiffDeletionTombstone({
      blockId: candidate.blockId,
      blockIds: [candidate.blockId],
      riffCardId: candidate.nativeCardId,
    });
  }

  async hasLegacyImportExclusion(
    candidate: NativeRiffImportSourceCard | NativeRiffAdoptionCandidate,
  ): Promise<boolean> {
    return this.exclusions.hasExclusion(candidate.blockId);
  }

  private listStoredCardPairs(): StoredCardPair[] {
    const pairs: StoredCardPair[] = [];
    for (const xiuyuan of this.storage.getAllXiuYuans()) {
      for (const dto of this.storage.getCardDTOsByXiuyuanId(xiuyuan.id)) {
        pairs.push({ dto, xiuyuan });
      }
    }
    return pairs;
  }

  private toLocalFace(pair: StoredCardPair): NativeRiffImportLocalFace {
    return {
      cardId: pair.dto.id,
      logicalKey: buildLogicalCardKey(pair.dto, pair.xiuyuan),
      ownership: inferXiuyuanOwnership(pair.xiuyuan),
      needsSemanticRepair: pair.dto.meta?.forceProtyleRender === true,
    };
  }
}

export async function resolveNativeRiffImportSemanticFaces(
  candidate: NativeRiffImportSourceCard,
): Promise<NativeRiffImportSemanticResolution> {
  const sourceMarkdown = String(candidate.sourceMarkdown || '').trim();
  if (!sourceMarkdown) {
    return {
      status: 'conflict',
      reason: 'native-riff-import-source-missing',
    };
  }

  const clozes = ClozeDetector.extractClozes(sourceMarkdown);
  const faceCount = clozes.length > 1 ? clozes.length : 1;
  return {
    status: 'resolved',
    faces: Array.from({ length: faceCount }, (_, faceIndex) => ({
      logicalKey: `block:${candidate.blockId}::face:${faceIndex}`,
      faceIndex,
      ...(faceCount > 1 ? { ruleIndex: faceIndex } : {}),
    })),
  };
}

function groupPlansByBlock(
  plans: readonly NativeRiffImportCreatePlan[],
): Map<string, NativeRiffImportCreatePlan[]> {
  const groups = new Map<string, NativeRiffImportCreatePlan[]>();
  for (const plan of plans) {
    const key = `${plan.deckId}\u0000${plan.nativeCardId}\u0000${plan.blockId}`;
    const group = groups.get(key) ?? [];
    group.push(plan);
    groups.set(key, group);
  }
  return groups;
}

function resolveImportedRenderMetadata(sourceMarkdown: string): {
  templateId: string;
  source: string;
  metaPatch: Record<string, unknown>;
} {
  const repair = resolveRiffSymbolRenderRepair({
    cardType: 'item',
    meta: {
      templateID: 'builtin-riff-sync',
      ownership: 'riff-managed',
      source: 'riff-sync',
    },
    sourceContent: sourceMarkdown,
  });
  if (repair.status !== 'repair-required') {
    return {
      templateId: 'builtin-quick-card',
      source: 'native-riff-import',
      metaPatch: {},
    };
  }

  return {
    templateId: repair.symbolType === '<>' || repair.symbolType === '《》'
      ? 'builtin-bidirectional-single'
      : 'builtin-quick-card',
    source: 'symbol',
    metaPatch: {
      ...(repair.repairPatch?.metaPatch ?? {}),
      renderProfile: 'quick-default',
    },
  };
}

function buildFaceMetadata(
  sourceMarkdown: string,
  plans: readonly NativeRiffImportCreatePlan[],
): Array<Record<string, unknown>> {
  const symbol = SUPPORTED_BINARY_SYMBOLS.find(candidate => sourceMarkdown.includes(candidate));
  const [question, answer] = symbol
    ? splitOnce(sourceMarkdown, symbol)
    : [sourceMarkdown, ''];

  return plans.map(plan => ({
    question,
    answer,
    questionBlockId: plan.blockId,
    answerBlockId: plan.blockId,
    faceIndex: plan.faceIndex,
    ...(plan.ruleIndex == null ? {} : { ruleIndex: plan.ruleIndex }),
  }));
}

function buildImportedCard(
  plan: NativeRiffImportCreatePlan,
  xiuyuan: IXiuyuan,
  render: ReturnType<typeof resolveImportedRenderMetadata>,
  now: number,
): CardPersistenceDTO {
  const seed = plan.scheduleSeed;
  const due = parseTimestamp(seed?.due) ?? now;
  const lastReview = parseTimestamp(seed?.lastReview) ?? 0;
  const rawCard: FSRSCard = {
    id: buildImportedCardId(plan),
    xiuyuanID: xiuyuan.id,
    blockId: plan.blockId,
    faceKey: {
      ruleId: 'native-riff-import',
      ...(plan.faceIndex > 0 ? { faceIndex: plan.faceIndex } : {}),
    },
    due,
    stability: seed?.stability ?? 0,
    difficulty: seed?.difficulty ?? 0,
    reps: seed?.reps ?? 0,
    lapses: seed?.lapses ?? 0,
    state: normalizeCardState(seed?.state),
    lastReview,
    elapsedDays: lastReview > 0 ? Math.max(0, Math.floor((now - lastReview) / DAY_MS)) : 0,
    scheduledDays: Math.max(0, Math.floor((due - (lastReview || now)) / DAY_MS)),
    learning_step: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: plan.importReceipt.importedAt,
    updatedAt: now,
    schedulerType: 'fsrs-v6',
    riffCardId: plan.nativeCardId,
    meta: {
      ownership: 'local-owned',
      xiuyuanID: xiuyuan.id,
      templateID: render.templateId,
      faceIndex: plan.faceIndex,
      ...(plan.ruleIndex == null ? {} : { ruleIndex: plan.ruleIndex }),
      source: render.source,
      ...render.metaPatch,
      [NATIVE_RIFF_IMPORT_RECEIPT_META_KEY]: plan.importReceipt,
    },
  };
  const card = canonicalizeSchedulingState(rawCard, {
    source: 'riff-import',
    mode: 'repair-external',
    now,
  }).card;

  return {
    ...card,
    templateID: render.templateId,
    frontBlockIDs: [plan.blockId],
    backBlockIDs: [plan.blockId],
    fieldMapping: { content: plan.blockId },
    xiuyuanPriority: 50,
  };
}

function buildImportedCardId(plan: NativeRiffImportCreatePlan): string {
  return plan.faceIndex === 0
    ? plan.blockId
    : `${plan.blockId}-f${plan.faceIndex}`;
}

function normalizeCardState(value: number | undefined): CardState {
  return value === CardState.Learning
    || value === CardState.Review
    || value === CardState.Relearning
    ? value
    : CardState.New;
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  if (index < 0) {
    return [value.trim(), ''];
  }
  return [
    value.slice(0, index).trim(),
    value.slice(index + separator.length).trim(),
  ];
}

function readNativeCardId(dto: CardPersistenceDTO, xiuyuan: IXiuyuan): string {
  return String(
    dto.riffCardId
      ?? dto.meta?.riffCardId
      ?? xiuyuan.meta?.riffCardId
      ?? '',
  ).trim();
}

function readDeckId(dto: CardPersistenceDTO, xiuyuan: IXiuyuan): string {
  return String(
    dto.meta?.riffDeckId
      ?? xiuyuan.meta?.riffDeckId
      ?? '20210808180117-czj9bvb',
  ).trim();
}

function readScheduling(dto: CardPersistenceDTO): Record<string, unknown> {
  return {
    due: dto.due,
    stability: dto.stability,
    difficulty: dto.difficulty,
    reps: dto.reps,
    lapses: dto.lapses,
    state: dto.state,
    lastReview: dto.lastReview,
    elapsedDays: dto.elapsedDays,
    scheduledDays: dto.scheduledDays,
    learning_step: dto.learning_step,
    schedulerType: dto.schedulerType,
  };
}
