import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { PerformanceMonitor } from '@/utils/performance';
import { 
  loadCards, 
  loadQueueCards, 
  loadQueueCardsSimple,
  invalidateCardCache, 
  getCacheStats, 
  subscribeCacheUpdate 
} from '../browserService';
import { BrowserCard } from '../types';
import type { ICardDataSource } from '../datasource/types';
import { 
  createQueueDataSource,
  createBlockIdsDataSource,
  createDeckDataSource,
  createQueryDataSource,
  createFocusDataSource,
  type DataSourceOptionsWithDoc
} from '../utils/dataSourceFactory';
import { extractBlockIds } from '../utils/helpers';
import { extractSqlStatement } from '../utils/cardFilters';

export interface CardDataOptions {
  plugin?: any;
  currentDocId?: string;
}

export function useCardData(props: CardDataOptions) {
  // State
  const loading = ref(false);
  const rows = ref<BrowserCard[]>([]);
  const allRows = ref<BrowserCard[]>([]);  // 所有卡片的完整数据（不受筛选影响，用于【全部】区统计）
  const currentDataSource = ref<ICardDataSource | null>(null);
  const currentPreset = ref('all');
  const currentCardType = ref<CardTypeFilter>('all');  // 卡片类型筛选
  const activeQueueId = ref<string | null>(null);
  const activeDocId = ref<string | null>(null);
  const queueCounts = ref<Record<string, number>>({});

  // 四重筛选：聚焦标记（控制文档列表是否聚焦）
  const shouldFocusDocList = ref(false);

  // 四重筛选：用于计算聚焦文档的卡片（不包含文档筛选）
  const rowsForFocus = ref<BrowserCard[]>([]);

  // 筛选后的卡片
  const scopedRows = computed(() => {
    if (activeDocId.value === '__lost__') return rows.value.filter((c) => !String((c as any)?.rootId || ''));
    return rows.value;
  });

  // 四重筛选：计算聚焦的文档 ID 列表（基于 rowsForFocus，不包含文档筛选）
  const focusedDocIds = computed(() => {
    // 如果没有标记聚焦，返回 null（显示所有文档）
    if (!shouldFocusDocList.value) {
      return null;
    }

    // 提取 rowsForFocus 中所有的文档 ID（仅应用队列/搜索/preset 筛选，不包含文档筛选）
    const docs = new Set<string>();
    for (const card of rowsForFocus.value) {
      if (card.rootId) {
        docs.add(card.rootId);
      }
    }
    return docs.size > 0 ? Array.from(docs) : null;
  });

  // 全局统计（【全部】区使用）- 基于所有卡片，不受筛选影响
  const globalStats = computed(() => {
    const allCards = allRows.value || [];
    return {
      total: allCards.length,
      lost: allCards.filter(c => !String((c as any)?.rootId || '')).length,
    };
  });

  // 加载数据 - 使用 browserService (riff API)
  async function loadData(forceRefresh = false) {
    loading.value = true;
    try {
      const sqlStmt = extractSqlStatement(searchQuery.value);
      if (sqlStmt != null) {
        const ok = await ensureSqlModeConfirmed();
        if (!ok) return;
        // SQL 模式独立运行，清除其他筛选状态（但不使用）
        activeQueueId.value = null;
        activeDocId.value = null;
        shouldFocusDocList.value = false;  // SQL 模式不聚焦
        currentDataSource.value = createQueryDataSource(sqlStmt);
      } else {
        // 筛选选项
        const options: DataSourceOptionsWithDoc = {
          docId: activeDocId.value,
          preset: currentPreset.value,
          queryText: searchQuery.value,
          cardType: currentCardType.value as 'all' | 'topic-only' | 'item-only',
        };

        // 创建数据源
        if (activeQueueId.value && ['final-drill', 'retrieval', 'filter-group', 'incremental-learning'].includes(activeQueueId.value)) {
          // 队列模式（五重筛选）
          currentDataSource.value = createQueueDataSource(activeQueueId.value, props.plugin, options);
        } else if (activeQueueId.value) {
          // 神经漫游队列（BlockIds）
          const q = getQueueById(activeQueueId.value);
          const items = q?.getAllItems?.() || [];
          const ids = extractBlockIds(items);
          currentDataSource.value = createBlockIdsDataSource(activeQueueId.value, ids, props.plugin);
        } else {
          // 全部卡片模式（五重筛选）
          currentDataSource.value = createDeckDataSource(props.plugin, options, props.currentDocId);
        }
      }

      if (!currentDataSource.value) {
        rows.value = [];
        rowsForFocus.value = [];
        return;
      }

      // 执行数据加载
      await executeFetchRows(forceRefresh);

      await refreshQueueCounts();
    } catch (err) {
      console.error('[SiYuanMemo][CardBrowser] Load data error:', err);
      rows.value = [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * 执行实际的行数据获取
   */
  async function executeFetchRows(forceRefresh = false) {
    if (!currentDataSource.value) return;

    // 四重筛选：获取显示数据（可能包含文档筛选）
    const { rows: fetchedRows } = await PerformanceMonitor.measure('fetchRows', () => 
      currentDataSource.value!.fetchRows({ sortModel: [], filterModel: {} })
    );
    rows.value = fetchedRows;

    // 更新全量统计数据
    // 优化：全部卡片模式且无任何筛选条件时，fetchedRows 已是完整全量，直接复用，避免重复 IO
    const isFullUnfilteredMode = !activeQueueId.value
      && !activeDocId.value
      && currentPreset.value === 'all'
      && !searchQuery.value
      && currentCardType.value === 'all';

    if (isFullUnfilteredMode) {
      allRows.value = fetchedRows;
    } else {
      allRows.value = await PerformanceMonitor.measure('loadAllCards', () =>
        loadCards('all', undefined, '', forceRefresh, 'all', props.plugin)
      );
    }

    // 四重筛选：如果开启了聚焦，额外获取不包含文档筛选的数据
    if (shouldFocusDocList.value) {
      const focusOptions = {
        preset: currentPreset.value,
        queryText: searchQuery.value,
        cardType: currentCardType.value as 'all' | 'topic-only' | 'item-only',
      };

      const dataSourceForFocus = createFocusDataSource(
        activeQueueId.value,
        props.plugin,
        focusOptions,
        () => getQueueById(activeQueueId.value)?.getAllItems?.() || []
      );

      if (dataSourceForFocus) {
        const { rows: focusRows } = await PerformanceMonitor.measure('fetchRowsFocus', () => 
          dataSourceForFocus!.fetchRows({ sortModel: [], filterModel: {} })
        );
        rowsForFocus.value = focusRows;
      }
    } else {
      rowsForFocus.value = fetchedRows;
    }
  }

  // 加载队列的所有卡片（不含筛选）
  async function loadQueueAllCards(queueId: string): Promise<BrowserCard[]> {
    const queue = getQueueById(queueId);
    if (!queue) return [];

    const items = queue?.getAllItems?.() || [];
    console.log('[SiYuanMemo][SRSBrowser] loadQueueAllCards:', {
      queueId,
      itemsCount: items.length,
      items: items.map((it: any) => ({
        cardID: it.cardID,
        blockID: it.blockID,
        deckID: it.deckID,
      })),
    });

    const blockIds = extractBlockIds(items);
    console.log('[SiYuanMemo][SRSBrowser] Extracted blockIds:', blockIds);

    const cards = await loadQueueCardsSimple(blockIds);
    console.log('[SiYuanMemo][SRSBrowser] Loaded cards:', cards.length);
    return cards;
  }

  async function refreshQueueCounts() {
    const retrieval = (props.plugin as any)?.retrievalQueue?.size?.() ?? ((props.plugin as any)?.retrievalQueue?.getAllItems?.()?.length ?? 0);
    const finalDrill = (props.plugin as any)?.finalDrillQueue?.size?.() ?? ((props.plugin as any)?.finalDrillQueue?.getAllItems?.()?.length ?? 0);
    const neural = props.plugin?.neuralQueue?.size?.() ?? (props.plugin?.neuralQueue?.getAllItems?.()?.length ?? 0);
    const filterGroup = props.plugin?.filterGroupQueue?.size?.() ?? (props.plugin?.filterGroupQueue?.getAllItems?.()?.length ?? 0);
    const incremental = (props.plugin as any)?.incrementalQueue?.getAllItems?.()?.length ?? 0;
    queueCounts.value = {
      retrieval: Number(retrieval) || 0,
      'final-drill': Number(finalDrill) || 0,
      'neural-roam': Number(neural) || 0,
      'filter-group': Number(filterGroup) || 0,
      'incremental-learning': Number(incremental) || 0,
    };
  }

  // SQL 确认相关
  const hasConfirmedSqlMode = ref(false);
  async function ensureSqlModeConfirmed(): Promise<boolean> {
    if (hasConfirmedSqlMode.value) return true;
    const ok = await confirmDialog({
      title: t('sqlModeTitle', 'SQL 查询模式'),
      content: t('sqlModeWarning', 'SQL 查询为高级功能，拥有读取所有块信息的权限。请仅执行你信任的 SQL。是否继续？'),
      confirmText: t('confirm', '确认'),
      cancelText: t('cancel', '取消'),
    });
    if (ok) hasConfirmedSqlMode.value = true;
    return ok;
  }

  // 辅助函数（需要从外部传入或创建）
  function getQueueById(id: string) {
    if (id === 'retrieval') return (props.plugin as any)?.retrievalQueue;
    if (id === 'final-drill') return (props.plugin as any)?.finalDrillQueue;
    if (id === 'neural-roam') return props.plugin?.neuralQueue;
    if (id === 'filter-group') return props.plugin?.filterGroupQueue;
    if (id === 'incremental-learning') return (props.plugin as any)?.incrementalQueue;
    return null;
  }

  // 需要从外部传入的函数
  const searchQuery = ref('');
  const confirmDialog = (opts: any) => Promise.resolve(true); // placeholder
  const t = (key: string, fallback: string) => fallback; // placeholder

  // 返回状态和方法
  return {
    loading,
    rows,
    allRows,
    currentDataSource,
    currentPreset,
    currentCardType,
    activeQueueId,
    activeDocId,
    queueCounts,
    shouldFocusDocList,
    rowsForFocus,
    scopedRows,
    focusedDocIds,
    globalStats,
    loadData,
    executeFetchRows,
    loadQueueAllCards,
    refreshQueueCounts,
    invalidateCardCache,
    getCacheStats,
  };
}