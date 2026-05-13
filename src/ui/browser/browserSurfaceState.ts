import type { PresetFilter } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { CardFilter } from '@/types/unified-data-source';
import type {
  BrowserGlobalScope,
  BrowserOpenState,
  CardTypeFilter,
  NeuralSubview,
} from './types';
import {
  isNeuralQueueId,
  normalizeBrowserQueueId,
  resolveQueueCardTypeOnSwitch,
} from './utils/queueCardTypePolicy';

export { normalizeBrowserQueueId } from './utils/queueCardTypePolicy';

export interface CaptureBrowserOpenStateInput {
  queueId: string | null;
  globalScope: BrowserGlobalScope | null;
  scopeDocIds: string[] | null;
  docId: string | null;
  queryText: string;
  preset: PresetFilter;
  cardType: CardTypeFilter;
  filter: CardFilter | null;
  neuralSubview: NeuralSubview | null;
}

export interface ResolveInitialBrowserOpenStateInput {
  state: BrowserOpenState;
  currentQueueId: string | null;
  previousNonNeuralCardType: CardTypeFilter | null;
}

export interface BrowserOpenViewStateProjection {
  queueId: string | null;
  globalScope: BrowserGlobalScope;
  scopeDocIds: string[] | null;
  docId: string | null;
  preset: PresetFilter;
  cardType: CardTypeFilter;
  previousNonNeuralCardType: CardTypeFilter | null;
  queryText: string;
  filter: CardFilter | null;
  neuralSubview: NeuralSubview;
  shouldFocusDocList: boolean;
}

export interface ResolvedBrowserOpenState {
  projection: BrowserOpenViewStateProjection;
  normalizedLegacyMissingBlockScope: boolean;
  shouldApplyFilterGroupFilter: boolean;
  shouldClearNeuralSubviewData: boolean;
  shouldRefreshNeuralSubviewData: boolean;
}

function cloneBrowserCardFilter(filter: CardFilter | null): CardFilter | null {
  if (!filter) {
    return null;
  }

  try {
    const structuredCloneFn = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone;
    if (typeof structuredCloneFn === 'function') {
      return structuredCloneFn(filter);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(filter)) as CardFilter;
  } catch {
    return filter;
  }
}

export function normalizeBrowserStringArray(value: string[] | null | undefined): string[] | null {
  const normalized = Array.from(new Set(
    (value || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ));
  return normalized.length > 0 ? normalized : null;
}

export function normalizeBrowserNeuralSubview(
  value: NeuralSubview | null | undefined,
): NeuralSubview | null {
  if (
    value === 'concept-cards'
    || value === 'roam-history'
    || value === 'worldline-anchors'
  ) {
    return value;
  }
  return null;
}

export function captureBrowserOpenState(input: CaptureBrowserOpenStateInput): BrowserOpenState {
  const queueId = normalizeBrowserQueueId(input.queueId);
  return {
    queueId,
    globalScope: input.globalScope,
    scopeDocIds: input.scopeDocIds ? [...input.scopeDocIds] : null,
    docId: input.docId,
    queryText: input.queryText,
    preset: input.preset,
    cardType: input.cardType,
    filter: queueId === 'filter-group' ? cloneBrowserCardFilter(input.filter) : null,
    neuralSubview: isNeuralQueueId(queueId)
      ? normalizeBrowserNeuralSubview(input.neuralSubview)
      : null,
  };
}

export function resolveInitialBrowserOpenState(
  input: ResolveInitialBrowserOpenStateInput,
): ResolvedBrowserOpenState {
  const { state } = input;
  const rawNextDocId = String(state.docId || '').trim() || null;
  const isLegacyMissingBlockScope = rawNextDocId === '__lost__';
  const nextQueueId = isLegacyMissingBlockScope ? null : normalizeBrowserQueueId(state.queueId);
  const nextScopeDocIds = isLegacyMissingBlockScope
    ? null
    : normalizeBrowserStringArray(state.scopeDocIds);
  const nextDocId = isLegacyMissingBlockScope ? null : rawNextDocId;
  const nextGlobalScope: BrowserGlobalScope = !isLegacyMissingBlockScope && state.globalScope === '__dismissed__'
    ? '__dismissed__'
    : '__all__';
  const nextPreset = isLegacyMissingBlockScope
    ? 'all'
    : nextGlobalScope === '__dismissed__'
    ? 'suspended'
    : (state.preset || 'all') as PresetFilter;
  const nextCardType = (isLegacyMissingBlockScope ? 'all' : state.cardType || 'all') as CardTypeFilter;
  const nextQueryText = isLegacyMissingBlockScope ? '' : String(state.queryText || '');
  const nextFilter = nextQueueId === 'filter-group'
    ? cloneBrowserCardFilter(state.filter ?? null)
    : null;
  const nextNeuralSubview = nextQueueId === 'neural-roam'
    ? normalizeBrowserNeuralSubview(state.neuralSubview) || 'concept-cards'
    : 'concept-cards';

  const cardTypeTransition = resolveQueueCardTypeOnSwitch({
    fromQueueId: input.currentQueueId,
    toQueueId: nextQueueId,
    currentCardType: nextCardType,
    previousNonNeuralCardType: input.previousNonNeuralCardType,
  });

  return {
    projection: {
      queueId: nextQueueId,
      globalScope: nextGlobalScope,
      scopeDocIds: nextScopeDocIds,
      docId: nextDocId,
      preset: nextPreset,
      cardType: cardTypeTransition.nextCardType,
      previousNonNeuralCardType: cardTypeTransition.nextPreviousNonNeuralCardType,
      queryText: nextQueryText,
      filter: nextFilter,
      neuralSubview: nextNeuralSubview,
      shouldFocusDocList: Boolean(nextQueueId) && !nextDocId,
    },
    normalizedLegacyMissingBlockScope: isLegacyMissingBlockScope,
    shouldApplyFilterGroupFilter: nextQueueId === 'filter-group',
    shouldClearNeuralSubviewData: nextQueueId !== 'neural-roam',
    shouldRefreshNeuralSubviewData: nextQueueId === 'neural-roam' && nextNeuralSubview !== 'concept-cards',
  };
}
