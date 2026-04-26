import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import type { BrowserCardStoragePort } from '@/core/storage/ports';
import type { FSRSCard } from '@/types';
import type {
  BrowserCard,
  GetBrowserCardsQuery,
  GetBrowserCardsQueryResult,
} from './GetBrowserCardsQuery';
import { BrowserDeckQueryKernel } from './shared/BrowserDeckQueryKernel';

export class GetBrowserCardsQueryHandler {
  private readonly browserDeckQueryKernel: BrowserDeckQueryKernel;

  constructor(
    storageManager: BrowserCardStoragePort,
    cardScheduleService: CardScheduleService,
    cardFilterService: CardFilterService,
    private readonly cardSortService: CardSortService,
    siyuanApi: QuerySiyuanPort,
  ) {
    void this.cardSortService;
    this.browserDeckQueryKernel = new BrowserDeckQueryKernel(
      storageManager,
      cardScheduleService,
      cardFilterService,
      siyuanApi,
    );
  }

  async execute(query: GetBrowserCardsQuery): Promise<GetBrowserCardsQueryResult> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const startIndex = (page - 1) * pageSize;

    const [stats, snapshot] = await Promise.all([
      this.browserDeckQueryKernel.getStats(),
      this.browserDeckQueryKernel.buildSnapshot({
        preset: query.preset,
        searchText: query.searchText,
        docId: query.docId,
        states: query.states,
        cardTypes: query.cardTypes,
        deckIds: query.deckIds,
        tags: query.tags,
        sortModel: [{
          colId: query.sortBy || 'due',
          sort: query.sortOrder || 'asc',
        }],
      }),
    ]);

    const pageIds = snapshot.rows
      .slice(startIndex, startIndex + pageSize)
      .map((row) => row.id);
    const browserCards = await this.browserDeckQueryKernel.getBrowserCardsByIds(pageIds);

    return {
      cards: browserCards,
      total: snapshot.total,
      page,
      pageSize,
      stats,
    };
  }

  private transformFSRSCard(card: FSRSCard, customAttrs: Record<string, string>): BrowserCard {
    return this.browserDeckQueryKernel.transformFSRSCard(card, customAttrs);
  }
}
