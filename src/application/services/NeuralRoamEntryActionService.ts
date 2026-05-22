import type { CardCreationHelper } from '@/application/helpers/CardCreationHelper';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import { CardType, type FSRSCard } from '@/types/card';
import { isErr } from '@/types/result';
import { QueueType, type IUnifiedDataSourceManagerFacade, type NeuralEngineMode } from '@/types/unified-data-source';
import type { StorageManager } from '@/core/storage';
import type {
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  closeTemporaryRouteWithPrompt,
  type NeuralRoamTemporaryRouteClosePrompt,
} from './NeuralRoamTemporaryRouteLifecycle';

type EntryActionFailureCode =
  | 'missing-block-id'
  | 'concept-create-failed'
  | 'concept-update-failed'
  | 'concept-card-unavailable'
  | 'queue-unavailable'
  | 'dialog-unavailable'
  | 'temporary-route-dirty'
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
  dataSourceManager: Pick<IUnifiedDataSourceManagerFacade, 'getQueue' | 'neuralRoamCommand'>;
  siyuanApi: Pick<ManagerSiyuanPort, 'BUILTIN_DECK_ID' | 'addRiffCards'>;
  openNeuralRoamDialog: (options?: NeuralRoamOpenOptions) => Promise<void>;
  waitForConceptVisible?: (blockId: string) => Promise<boolean>;
  resolveBlockTitle?: (blockId: string) => Promise<string | null>;
  promptTemporaryRouteClose?: NeuralRoamTemporaryRouteClosePrompt;
}

type NeuralRoamEntryQueue = {
  addCard?(card: FSRSCard | string, priority?: 'normal' | 'high'): Promise<void>;
  setSeedEntry?(nodeId: string, enabled?: boolean): Promise<void>;
  setAnchorEntry?(nodeId: string, enabled?: boolean): Promise<void>;
  getEngineMode?(): NeuralEngineMode;
  setEngineMode?(mode: NeuralEngineMode, options?: { carryCurrentNode?: boolean }): Promise<void>;
  listRoutes?(): Promise<Array<{ id: string; isActive?: boolean }>>;
  resolveTemporaryRouteCloseAction?(): Promise<
    | { kind: 'none' }
    | { kind: 'discard-clean'; routeId: string; previousRouteId: string | null }
    | { kind: 'prompt'; routeId: string; previousRouteId: string | null }
  >;
  replaceActiveTemporaryRoute?(input: {
    name?: string;
    seedBlockId: string;
  }): Promise<unknown>;
  createTemporaryRoute?(input: {
    name?: string;
    seedBlockId: string;
    previousRouteId?: string | null;
  }): Promise<unknown>;
  closeTemporaryRoute?(input: {
    action: 'save' | 'discard' | 'cancel';
    routeId?: string | null;
    name?: string | null;
  }): Promise<unknown>;
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

    const result = await this.runBackendCommand({
      type: 'set-anchor',
      nodeId: normalizedBlockId,
      enabled: true,
    });
    if (!result) {
      return this.fail('establish-station', 'queue-unavailable', '神经漫游队列不可用', normalizedBlockId);
    }
    await this.syncQueueFromBackendResult(result);
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
    seedBlockId?: string | null;
    conceptBlockId?: string | null;
    sourceReviewCardId?: string | null;
  }): Promise<NeuralRoamEntryActionResult> {
    const normalizedBlockId = this.normalizeBlockId(input.blockId);
    if (!normalizedBlockId) {
      return this.fail('temporary-current-block-roam', 'missing-block-id', '缺少可用块 ID');
    }

    const seedBlockId = this.normalizeBlockId(input.seedBlockId || '') || normalizedBlockId;
    const conceptBlockId = this.normalizeBlockId(input.conceptBlockId || '') || null;
    const modeBefore = await this.forceOrbit();
    const temporaryRoute = await this.createTemporaryRoute(seedBlockId, 'temporary-current-block-roam');
    if (!temporaryRoute.ok) {
      return temporaryRoute;
    }
    await this.deps.openNeuralRoamDialog({
      focusBlockId: normalizedBlockId,
      seedBlockId,
      sourceReviewCardId: String(input.sourceReviewCardId || '').trim() || null,
      conceptBlockId,
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
    const temporaryRoute = await this.createTemporaryRoute(conceptBlockId, 'temporary-concept-roam');
    if (!temporaryRoute.ok) {
      return temporaryRoute;
    }
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
    if (modeBefore !== 'orbit') {
      const result = await this.runBackendCommand({
        type: 'switch-engine-mode',
        mode: 'orbit',
        carryCurrentNode: true,
      });
      if (result) {
        await this.syncQueueFromBackendResult(result);
      }
    }
    return modeBefore;
  }

  private async createTemporaryRoute(
    seedBlockId: string,
    action: Extract<NeuralRoamEntryActionKind, 'temporary-current-block-roam' | 'temporary-concept-roam'>,
  ): Promise<{ ok: true } | Extract<NeuralRoamEntryActionResult, { ok: false }>> {
    const queue = this.getNeuralQueue();
    const name = await this.buildTemporaryRouteName(seedBlockId);
    const closeAction = await queue?.resolveTemporaryRouteCloseAction?.();
    if (closeAction?.kind === 'prompt') {
      if (!this.deps.promptTemporaryRouteClose) {
        return this.fail(action, 'temporary-route-dirty', '当前临时航线有改动，请先保存或丢弃', seedBlockId);
      }
      const closed = await closeTemporaryRouteWithPrompt({
        resolveTemporaryRouteCloseAction: async () => closeAction,
        closeTemporaryRoute: async (input) => {
          const result = await this.runBackendCommand({
            type: 'close-temporary-route',
            action: input.action,
            routeId: input.routeId ?? closeAction.routeId,
            name: input.name ?? null,
          });
          if (!result) {
            throw new Error('NEURAL_ROAM_ROUTE_UNAVAILABLE: temporary route close command is unavailable');
          }
          await this.syncQueueFromBackendResult(result);
          return null;
        },
      }, this.deps.promptTemporaryRouteClose);
      if (closed.status === 'cancelled') {
        return this.fail(action, 'temporary-route-dirty', '已取消临时航线替换', seedBlockId);
      }
    }
    if (closeAction?.kind === 'discard-clean') {
      const result = await this.runBackendCommand({
        type: 'replace-active-temporary-route',
        name,
        seedBlockId,
      });
      if (!result) {
        return this.fail(action, 'queue-unavailable', '神经漫游航线替换不可用', seedBlockId);
      }
      await this.syncQueueFromBackendResult(result);
      return { ok: true };
    }

    const result = await this.runBackendCommand({
      type: 'create-temporary-route',
      name,
      seedBlockId,
      previousRouteId: await this.resolveActiveRouteId(queue),
    });
    if (!result) {
      return this.fail(action, 'queue-unavailable', '神经漫游航线不可用', seedBlockId);
    }
    await this.syncQueueFromBackendResult(result);
    return { ok: true };
  }

  private async resolveActiveRouteId(queue: NeuralRoamEntryQueue): Promise<string | null> {
    const routes = await queue.listRoutes?.();
    const activeRoute = routes?.find((route) => route.isActive === true);
    return activeRoute?.id ?? null;
  }

  private async buildTemporaryRouteName(seedBlockId: string): Promise<string> {
    const title = await this.resolveRouteTitle(seedBlockId);
    return `临时：${title}`;
  }

  private async resolveRouteTitle(seedBlockId: string): Promise<string> {
    let fromResolver: string | null | undefined;
    try {
      fromResolver = await this.deps.resolveBlockTitle?.(seedBlockId);
    } catch {
      fromResolver = null;
    }
    const title = this.normalizeRouteTitle(fromResolver);
    return title || seedBlockId;
  }

  private normalizeRouteTitle(value: unknown): string {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  }

  private getNeuralQueue(): NeuralRoamEntryQueue | null {
    return this.deps.dataSourceManager.getQueue(QueueType.NeuralRoam) as unknown as NeuralRoamEntryQueue | null;
  }

  private async runBackendCommand(command: BackendNeuralRoamCommandRequest['command']): Promise<BackendNeuralRoamCommandResult | null> {
    const runner = this.deps.dataSourceManager.neuralRoamCommand;
    if (typeof runner !== 'function') {
      return null;
    }
    return runner({
      queueType: 'neural-roam',
      command,
    });
  }

  private async syncQueueFromBackendResult(result: BackendNeuralRoamCommandResult | null): Promise<void> {
    if (!result?.queueState) {
      return;
    }
    const queue = this.getNeuralQueue();
    if (queue && typeof (queue as { syncFromBackendState?: (state: Record<string, unknown>) => Promise<void> }).syncFromBackendState === 'function') {
      await (queue as { syncFromBackendState: (state: Record<string, unknown>) => Promise<void> }).syncFromBackendState(result.queueState);
    }
    queue?.setBackendViewState?.(result.viewState ?? null);
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
