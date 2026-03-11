import type {
  BrowserActionTarget,
  ICardDataSource,
  FetchRowsOptions,
  FetchRowsResult,
  SortModel,
} from '../types';
import type { BrowserCard } from '../../types';
import type { IBrowserQueryableDataSource } from '../types';
import type { IBrowserApplicationService, BrowserQueueId } from '@/application/interfaces/IBrowserApplicationService';
import type { QueueBrowserSnapshotQuery } from '@/application/queries/browser/queue-browser-query';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { BrowserQuerySession, toLiteRowFromBrowserCard } from '../session/BrowserQuerySession';

export type QueueSnapshotDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: string;
};

export type QueueSnapshotBrowserService = Pick<IBrowserApplicationService, 'getQueueQuerySnapshot' | 'getQueueRowsByIds'>;

export type QueueSnapshotDataSourceDeps = {
  browserService?: QueueSnapshotBrowserService | null;
};

export abstract class BaseQueueSnapshotDataSource<TPlugin = unknown>
implements ICardDataSource, IBrowserQueryableDataSource {
  abstract id: string;
  abstract label: string;

  protected readonly querySession: BrowserQuerySession;
  protected readonly manager: IUnifiedDataSourceManagerFacade;
  protected readonly options: QueueSnapshotDataSourceOptions;
  protected readonly plugin?: TPlugin;
  protected readonly browserService?: QueueSnapshotBrowserService | null;
  protected lastSortModel: SortModel[] = [];
  protected dataGeneration = 0;

  protected constructor(
    scope: string,
    manager: IUnifiedDataSourceManagerFacade,
    options?: QueueSnapshotDataSourceOptions,
    plugin?: TPlugin,
    deps: QueueSnapshotDataSourceDeps = {},
  ) {
    this.querySession = new BrowserQuerySession(scope);
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;
    this.browserService = deps.browserService ?? null;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    const sortModel = (params?.sortModel || []) as SortModel[];
    this.lastSortModel = [...sortModel];
    return this.querySession.fetchRows({
      ...this.buildSessionOptions(sortModel),
      startRow: params?.startRow,
      endRow: params?.endRow,
    });
  }

  getQueryFingerprint(): string {
    return this.buildQueryFingerprint(this.lastSortModel);
  }

  async getAllMatchedIds(): Promise<string[]> {
    return this.querySession.getAllMatchedIds(this.buildSessionOptions(this.lastSortModel));
  }

  async getRowsByIds(ids: string[]): Promise<BrowserCard[]> {
    return this.querySession.getRowsByIds(ids, this.buildSessionOptions(this.lastSortModel));
  }

  async getActionTargetsByIds(ids: string[]): Promise<BrowserActionTarget[]> {
    return this.querySession.getActionTargetsByIds(ids, this.buildSessionOptions(this.lastSortModel));
  }

  getId(): string {
    return this.id;
  }

  public invalidateQuerySession(): void {
    this.dataGeneration += 1;
    this.querySession.invalidate();
  }

  protected abstract getQueueBrowserId(): BrowserQueueId;

  protected abstract buildLegacyOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]>;

  protected buildQueryFingerprint(sortModel: SortModel[]): string {
    return JSON.stringify({
      dataSource: this.id,
      queueId: this.getQueueBrowserId(),
      options: this.options,
      sortModel,
      generation: this.dataGeneration,
    });
  }

  protected buildSessionOptions(sortModel: SortModel[]) {
    if (this.browserService?.getQueueQuerySnapshot && this.browserService?.getQueueRowsByIds) {
      return {
        queryFingerprint: this.buildQueryFingerprint(sortModel),
        buildLiteRows: async () => {
          const snapshot = await this.browserService!.getQueueQuerySnapshot(
            this.buildBrowserServiceQuery(sortModel),
          );
          return snapshot.rows;
        },
        hydrateRows: async (ids: string[]) => this.browserService!.getQueueRowsByIds(
          this.getQueueBrowserId(),
          ids,
        ),
      };
    }

    return {
      queryFingerprint: this.buildQueryFingerprint(sortModel),
      buildLiteRows: async () => {
        const rows = await this.buildLegacyOrderedRows(sortModel);
        return rows.map(toLiteRowFromBrowserCard);
      },
    };
  }

  private buildBrowserServiceQuery(sortModel: SortModel[]): QueueBrowserSnapshotQuery {
    return {
      queueId: this.getQueueBrowserId(),
      preset: this.options.preset,
      searchText: this.options.queryText,
      docId: this.options.docId,
      cardType: this.options.cardType,
      sortModel,
    };
  }
}
