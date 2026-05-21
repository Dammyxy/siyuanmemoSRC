import type { CardCreationHelper } from '@/application/helpers/CardCreationHelper';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import { CardType, type FSRSCard } from '@/types/card';
import { isErr } from '@/types/result';
import { QueueType, type IUnifiedDataSourceManagerFacade, type NeuralEngineMode } from '@/types/unified-data-source';
import type { StorageManager } from '@/core/storage';

type EntryActionFailureCode =
  | 'missing-block-id'
  | 'concept-create-failed'
  | 'concept-update-failed'
  | 'concept-card-unavailable'
  | 'queue-unavailable'
  | 'dialog-unavailable'
  | 'unexpected-error';

export type NeuralRoamEntryActionKind =
  | 'make-concept'
  | 'make-concept-and-add-to-queue'
  | 'make-concept-and-start-roam'
  | 'add-existing-concept-to-queue'
  | 'establish-station'
  | 'establish-station-and-start-roam'
  | 'temporary-current-block-roam'
  | 'temporary-concept-roam';

export type NeuralRoamEntryActionResult =
  | {
      ok: true;
      action: NeuralRoamEntryActionKind;
      blockId: string;
      conceptBlockId?: string;
      cardId?: string;
      queueChanged?: boolean;
      openedDialog?: boolean;
      engineModeBefore?: NeuralEngineMode | null;
    }
  | {
      ok: false;
      action: NeuralRoamEntryActionKind;
      code: EntryActionFailureCode;
      message: string;
      blockId?: string;
      error?: unknown;
    };

export interface NeuralRoamOpenOptions {
  focusBlockId?: string;
  seedBlockId?: string | null;
  sourceReviewCardId?: string | null;
  conceptBlockId?: string | null;
  previousEngineMode?: NeuralEngineMode | null;
  includeFocusAsFirst?: boolean;
  resetHistory?: boolean;
  startNewSession?: boolean;
  entrySessionKind?: 'temporary-current-block' | 'temporary-concept' | 'station-roam' | 'concept-card-roam' | 'direct-focus' | null;
}

export interface NeuralRoamEntryActionServiceDeps {
  storage: Pick<StorageManager, 'getCardByBlockId'>;
  cardCreationHelper: Pick<CardCreationHelper, 'createConceptCard'>;
  cardService: Pick<CardApplicationService, 'updateFSRSCard'>;
  dataSourceManager: Pick<IUnifiedDataSourceManagerFacade, 'getQueue'>;
  siyuanApi: Pick<ManagerSiyuanPort, 'BUILTIN_DECK_ID' | 'addRiffCards'>;
  openNeuralRoamDialog: (options?: NeuralRoamOpenOptions) => Promise<void>;
  waitForConceptVisible?: (blockId: string) => Promise<boolean>;
}

type NeuralRoamEntryQueue = {
  addCard?(card: FSRSCard | string, priority?: 'normal' | 'high'): Promise<void>;
  setSeedEntry?(nodeId: string, enabled?: boolean): Promise<void>;
  setAnchorEntry?(nodeId: string, enabled?: boolean): Promise<void>;
  getEngineMode?(): NeuralEngineMode;
  setEngineMode?(mode: NeuralEngineMode, options?: { carryCurrentNode?: boolean }): Promise<void>;
};

export class NeuralRoamEntryActionService {
  constructor(private readonly deps: NeuralRoamEntryActionServiceDeps) {}

  async makeConceptOnly(blockId: string): Promise<NeuralRoamEntryActionResult> {
    const normalizedBlockId = this.normalizeBlockId(blockId);
    if (!normalizedBlockId) {
      return this.fail('make-concept', 'missing-block-id', '缺少可用块 ID');
    }

    const concept = await this.ensureConceptCard(normalizedBlockId, 'normal');
    if (!concept.ok) {
      return concept;
    }
    return {
      ok: true,
      action: 'make-concept',
      blockId: normalizedBlockId,
      conceptBlockId: normalizedBlockId,
      cardId: concept.card?.id,
    };
  }

  async makeConceptAndAddToQueue(
    blockId: string,
    options: { priority?: 'normal' | 'high' } = {},
  ): Promise<NeuralRoamEntryActionResult> {
    const normalizedBlockId = this.normalizeBlockId(blockId);
    const priority = options.priority ?? 'normal';
    if (!normalizedBlockId) {
      return this.fail('make-concept-and-add-to-queue', 'missing-block-id', '缺少可用块 ID');
    }

    const concept = await this.ensureConceptCard(normalizedBlockId, priority);
    if (!concept.ok) {
      return concept;
    }

    const queue = this.getNeuralQueue();
    if (!queue?.addCard) {
      return this.fail('make-concept-and-add-to-queue', 'queue-unavailable', '神经漫游队列不可用', normalizedBlockId);
    }

    await queue.addCard(concept.card ?? normalizedBlockId, priority);
    return {
      ok: true,
      action: 'make-concept-and-add-to-queue',
      blockId: normalizedBlockId,
      conceptBlockId: normalizedBlockId,
      cardId: concept.card?.id,
      queueChanged: true,
    };
  }

  async makeConceptAndStartRoam(blockId: string): Promise<NeuralRoamEntryActionResult> {
    const normalizedBlockId = this.normalizeBlockId(blockId);
    if (!normalizedBlockId) {
      return this.fail('make-concept-and-start-roam', 'missing-block-id', '缺少可用块 ID');
    }

    const queued = await this.makeConceptAndAddToQueue(normalizedBlockId, { priority: 'high' });
    if (!queued.ok) {
      return { ...queued, action: 'make-concept-and-start-roam' };
    }

    const modeBefore = await this.forceOrbit();
    await this.deps.openNeuralRoamDialog({
      focusBlockId: normalizedBlockId,
      seedBlockId: normalizedBlockId,
      conceptBlockId: normalizedBlockId,
      includeFocusAsFirst: true,
      startNewSession: true,
      entrySessionKind: 'concept-card-roam',
    });

    return {
      ok: true,
      action: 'make-concept-and-start-roam',
      blockId: normalizedBlockId,
      conceptBlockId: normalizedBlockId,
      cardId: queued.cardId,
      queueChanged: true,
      openedDialog: true,
      engineModeBefore: modeBefore,
    };
  }

  async addExistingConceptToQueue(blockId: string): Promise<NeuralRoamEntryActionResult> {
    const normalizedBlockId = this.normalizeBlockId(blockId);
    if (!normalizedBlockId) {
      return this.fail('add-existing-concept-to-queue', 'missing-block-id', '缺少可用块 ID');
    }

    const card = this.deps.storage.getCardByBlockId(normalizedBlockId);
    if (!card || !this.isConceptCard(card)) {
      return this.fail('add-existing-concept-to-queue', 'concept-card-unavailable', '当前块不是概念卡', normalizedBlockId);
    }

    const queue = this.getNeuralQueue();
    if (!queue?.addCard) {
      return this.fail('add-existing-concept-to-queue', 'queue-unavailable', '神经漫游队列不可用', normalizedBlockId);
    }

    await queue.addCard(card, 'normal');
    return {
      ok: true,
      action: 'add-existing-concept-to-queue',
      blockId: normalizedBlockId,
      conceptBlockId: normalizedBlockId,
      cardId: card.id,
      queueChanged: true,
    };
  }

  async establishStation(blockId: string): Promise<NeuralRoamEntryActionResult> {
    const normalizedBlockId = this.normalizeBlockId(blockId);
    if (!normalizedBlockId) {
      return this.fail('establish-station', 'missing-block-id', '缺少可用块 ID');
    }

    const queue = this.getNeuralQueue();
    if (!queue?.setAnchorEntry) {
      return this.fail('establish-station', 'queue-unavailable', '神经漫游队列不可用', normalizedBlockId);
    }

    await queue.setAnchorEntry(normalizedBlockId, true);
    return {
      ok: true,
      action: 'establish-station',
      blockId: normalizedBlockId,
      queueChanged: true,
    };
  }

  async establishStationAndStartRoam(blockId: string): Promise<NeuralRoamEntryActionResult> {
    const station = await this.establishStation(blockId);
    if (!station.ok) {
      return { ...station, action: 'establish-station-and-start-roam' };
    }

    const modeBefore = await this.forceOrbit();
    await this.deps.openNeuralRoamDialog({
      focusBlockId: station.blockId,
      seedBlockId: station.blockId,
      includeFocusAsFirst: true,
      startNewSession: true,
      entrySessionKind: 'station-roam',
    });

    return {
      ...station,
      action: 'establish-station-and-start-roam',
      openedDialog: true,
      engineModeBefore: modeBefore,
    };
  }

  async startTemporaryCurrentBlockRoam(input: {
    blockId: string;
    sourceReviewCardId?: string | null;
  }): Promise<NeuralRoamEntryActionResult> {
    const normalizedBlockId = this.normalizeBlockId(input.blockId);
    if (!normalizedBlockId) {
      return this.fail('temporary-current-block-roam', 'missing-block-id', '缺少可用块 ID');
    }

    const modeBefore = await this.forceOrbit();
    await this.deps.openNeuralRoamDialog({
      focusBlockId: normalizedBlockId,
      seedBlockId: normalizedBlockId,
      sourceReviewCardId: String(input.sourceReviewCardId || '').trim() || null,
      previousEngineMode: modeBefore,
      includeFocusAsFirst: true,
      startNewSession: true,
      entrySessionKind: 'temporary-current-block',
    });

    return {
      ok: true,
      action: 'temporary-current-block-roam',
      blockId: normalizedBlockId,
      cardId: String(input.sourceReviewCardId || '').trim() || undefined,
      openedDialog: true,
      engineModeBefore: modeBefore,
    };
  }

  async startTemporaryConceptRoam(input: {
    conceptBlockId: string;
    conceptCardId?: string | null;
  }): Promise<NeuralRoamEntryActionResult> {
    const conceptBlockId = this.normalizeBlockId(input.conceptBlockId);
    if (!conceptBlockId) {
      return this.fail('temporary-concept-roam', 'missing-block-id', '缺少可用概念块 ID');
    }

    const modeBefore = await this.forceOrbit();
    await this.deps.openNeuralRoamDialog({
      focusBlockId: conceptBlockId,
      seedBlockId: conceptBlockId,
      conceptBlockId,
      previousEngineMode: modeBefore,
      includeFocusAsFirst: true,
      startNewSession: true,
      entrySessionKind: 'temporary-concept',
    });

    return {
      ok: true,
      action: 'temporary-concept-roam',
      blockId: conceptBlockId,
      conceptBlockId,
      cardId: String(input.conceptCardId || '').trim() || undefined,
      openedDialog: true,
      engineModeBefore: modeBefore,
    };
  }

  private async ensureConceptCard(
    blockId: string,
    priority: 'normal' | 'high',
  ): Promise<{ ok: true; card: FSRSCard | null } | Extract<NeuralRoamEntryActionResult, { ok: false }>> {
    const existingCard = this.deps.storage.getCardByBlockId(blockId);

    if (!existingCard) {
      const created = await this.deps.cardCreationHelper.createConceptCard(blockId, {
        priority: priority === 'high' ? 100 : 50,
        metadata: { source: 'manual' },
      });
      if (isErr(created)) {
        return this.fail('make-concept-and-add-to-queue', 'concept-create-failed', created.error.message, blockId, created.error);
      }
      await this.deps.siyuanApi.addRiffCards(this.deps.siyuanApi.BUILTIN_DECK_ID, [blockId]);
    } else if (!this.isConceptCard(existingCard)) {
      const updated = await this.deps.cardService.updateFSRSCard({
        cardId: existingCard.id,
        updates: { type: CardType.Concept },
      });
      if (isErr(updated)) {
        return this.fail('make-concept-and-add-to-queue', 'concept-update-failed', String(updated.error), blockId, updated.error);
      }
    }

    if (this.deps.waitForConceptVisible) {
      const visible = await this.deps.waitForConceptVisible(blockId);
      if (!visible) {
        return this.fail('make-concept-and-add-to-queue', 'concept-card-unavailable', '概念卡状态尚未可见', blockId);
      }
    }

    return { ok: true, card: this.deps.storage.getCardByBlockId(blockId) ?? null };
  }

  private async forceOrbit(): Promise<NeuralEngineMode | null> {
    const queue = this.getNeuralQueue();
    const modeBefore = queue?.getEngineMode?.() ?? null;
    if (queue?.setEngineMode && modeBefore !== 'orbit') {
      await queue.setEngineMode('orbit', { carryCurrentNode: true });
    }
    return modeBefore;
  }

  private getNeuralQueue(): NeuralRoamEntryQueue | null {
    return this.deps.dataSourceManager.getQueue(QueueType.NeuralRoam) as unknown as NeuralRoamEntryQueue | null;
  }

  private isConceptCard(card: FSRSCard): boolean {
    const metaMarker = (card.meta as { cardTypeMarker?: string } | undefined)?.cardTypeMarker;
    return card.type === CardType.Concept || card.cardTypeMarker === 'concept' || metaMarker === 'concept';
  }

  private normalizeBlockId(blockId: string): string {
    return String(blockId || '').trim();
  }

  private fail(
    action: NeuralRoamEntryActionKind,
    code: EntryActionFailureCode,
    message: string,
    blockId?: string,
    error?: unknown,
  ): NeuralRoamEntryActionResult {
    return { ok: false, action, code, message, blockId, error };
  }
}
