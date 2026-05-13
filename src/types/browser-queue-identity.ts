import { QueueType } from './unified-data-source';

export const CANONICAL_BROWSER_QUEUE_IDS = [
  'retrieval',
  'final-drill',
  'incremental-learning',
  'filter-group',
  'neural-roam',
] as const;

export type BrowserQueueId = typeof CANONICAL_BROWSER_QUEUE_IDS[number];

export type BrowserQueueIdentityInvalidReason =
  | 'empty'
  | 'unsupported-browser-queue';

export type BrowserQueueIdentityResult =
  | {
      ok: true;
      queueId: BrowserQueueId;
      queueType: QueueType;
      rawInput: string;
      aliasOf: string | null;
      isNeural: boolean;
      isRetrieval: boolean;
    }
  | {
      ok: false;
      rawInput: string;
      reason: BrowserQueueIdentityInvalidReason;
    };

type BrowserQueueAlias = BrowserQueueId | 'neural' | 'retrieval-practice';

const BROWSER_QUEUE_ALIAS_TO_ID: Record<BrowserQueueAlias, BrowserQueueId> = {
  retrieval: 'retrieval',
  'retrieval-practice': 'retrieval',
  'final-drill': 'final-drill',
  'incremental-learning': 'incremental-learning',
  'filter-group': 'filter-group',
  'neural-roam': 'neural-roam',
  neural: 'neural-roam',
};

const BROWSER_QUEUE_ID_TO_TYPE: Record<BrowserQueueId, QueueType> = {
  retrieval: QueueType.RetrievalPractice,
  'final-drill': QueueType.FinalDrill,
  'incremental-learning': QueueType.IncrementalLearning,
  'filter-group': QueueType.FilterGroup,
  'neural-roam': QueueType.NeuralRoam,
};

const QUEUE_TYPE_TO_BROWSER_ID: Partial<Record<QueueType, BrowserQueueId>> = {
  [QueueType.RetrievalPractice]: 'retrieval',
  [QueueType.FinalDrill]: 'final-drill',
  [QueueType.IncrementalLearning]: 'incremental-learning',
  [QueueType.FilterGroup]: 'filter-group',
  [QueueType.NeuralRoam]: 'neural-roam',
};

function normalizeRawQueueIdentity(input: string | null | undefined): string {
  return String(input || '').trim();
}

export function getCanonicalBrowserQueueIds(): BrowserQueueId[] {
  return [...CANONICAL_BROWSER_QUEUE_IDS];
}

export function resolveBrowserQueueIdentity(
  input: string | null | undefined,
): BrowserQueueIdentityResult {
  const rawInput = normalizeRawQueueIdentity(input);
  if (!rawInput) {
    return {
      ok: false,
      rawInput,
      reason: 'empty',
    };
  }

  const queueId = BROWSER_QUEUE_ALIAS_TO_ID[rawInput as BrowserQueueAlias];
  if (!queueId) {
    return {
      ok: false,
      rawInput,
      reason: 'unsupported-browser-queue',
    };
  }

  return {
    ok: true,
    queueId,
    queueType: BROWSER_QUEUE_ID_TO_TYPE[queueId],
    rawInput,
    aliasOf: rawInput === queueId ? null : rawInput,
    isNeural: queueId === 'neural-roam',
    isRetrieval: queueId === 'retrieval',
  };
}

export function normalizeBrowserQueueId(input: string | null | undefined): BrowserQueueId | null {
  const identity = resolveBrowserQueueIdentity(input);
  return identity.ok ? identity.queueId : null;
}

export function resolveQueueTypeForBrowserQueueId(input: string | null | undefined): QueueType | null {
  const identity = resolveBrowserQueueIdentity(input);
  return identity.ok ? identity.queueType : null;
}

export function resolveBrowserQueueIdForQueueType(queueType: QueueType | string | null | undefined): BrowserQueueId | null {
  const normalizedQueueType = normalizeRawQueueIdentity(queueType);
  return QUEUE_TYPE_TO_BROWSER_ID[normalizedQueueType as QueueType] ?? null;
}

export function isCanonicalBrowserQueueId(input: string | null | undefined): input is BrowserQueueId {
  const normalized = normalizeRawQueueIdentity(input);
  return CANONICAL_BROWSER_QUEUE_IDS.includes(normalized as BrowserQueueId);
}

export function isNeuralBrowserQueue(input: string | null | undefined): boolean {
  const identity = resolveBrowserQueueIdentity(input);
  return identity.ok && identity.isNeural;
}

export function isRetrievalBrowserQueue(input: string | null | undefined): boolean {
  const identity = resolveBrowserQueueIdentity(input);
  return identity.ok && identity.isRetrieval;
}
