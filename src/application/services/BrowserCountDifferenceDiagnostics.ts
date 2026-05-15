export type BrowserCountDifferenceReason =
  | 'missing-plugin-index'
  | 'missing-source-block'
  | 'unsupported-card-shape'
  | 'sync-projection-not-complete'
  | 'unresolved-difference';

export interface NativeCountDifferenceCard {
  blockId?: string;
  cardId?: string;
  type?: string;
  [key: string]: unknown;
}

export interface BrowserCountDifferenceCard {
  id: string;
  blockId: string;
  cardType?: string;
  sourceExists?: boolean | null;
}

export interface BrowserCountDifferenceEvidence {
  native:
    | { status: 'available'; cards: NativeCountDifferenceCard[]; total?: number }
    | { status: 'unavailable'; reason: string };
  browser:
    | {
      status: 'available';
      cards: BrowserCountDifferenceCard[];
      pendingProjectionBlockIds?: string[];
      total?: number;
    }
    | { status: 'unavailable'; reason: string };
  sampleLimit?: number;
  unsupportedNativeBlockTypes?: string[];
}

export interface BrowserCountDifferenceGroup {
  reason: BrowserCountDifferenceReason;
  count: number;
  sampleIds: string[];
}

export interface BrowserCountDifferenceDiagnostic {
  status: 'matched' | 'difference' | 'unavailable';
  nativeTotal: number | null;
  browserManageableTotal: number | null;
  browserOperationalTotal: number | null;
  differenceTotal: number | null;
  groups: BrowserCountDifferenceGroup[];
  unavailable: Array<{ source: 'native' | 'browser'; reason: string }>;
}

const DEFAULT_SAMPLE_LIMIT = 5;

const REASON_ORDER: BrowserCountDifferenceReason[] = [
  'missing-plugin-index',
  'missing-source-block',
  'unsupported-card-shape',
  'sync-projection-not-complete',
  'unresolved-difference',
];

export function createBrowserCountDifferenceDiagnostic(
  evidence: BrowserCountDifferenceEvidence,
): BrowserCountDifferenceDiagnostic {
  const unavailable: Array<{ source: 'native' | 'browser'; reason: string }> = [];
  if (evidence.native.status === 'unavailable') {
    unavailable.push({ source: 'native', reason: evidence.native.reason });
  }
  if (evidence.browser.status === 'unavailable') {
    unavailable.push({ source: 'browser', reason: evidence.browser.reason });
  }

  if (unavailable.length > 0) {
    return {
      status: 'unavailable',
      nativeTotal: evidence.native.status === 'available' ? resolveTotal(evidence.native.total, evidence.native.cards.length) : null,
      browserManageableTotal: evidence.browser.status === 'available' ? resolveTotal(evidence.browser.total, evidence.browser.cards.length) : null,
      browserOperationalTotal: evidence.browser.status === 'available' ? resolveTotal(evidence.browser.total, evidence.browser.cards.length) : null,
      differenceTotal: null,
      groups: [],
      unavailable,
    };
  }

  const nativeTotal = resolveTotal(evidence.native.total, evidence.native.cards.length);
  const browserTotal = resolveTotal(evidence.browser.total, evidence.browser.cards.length);
  const sampleLimit = Math.max(0, evidence.sampleLimit ?? DEFAULT_SAMPLE_LIMIT);
  const browserByBlockId = new Map(
    evidence.browser.cards
      .map((card) => [normalizeId(card.blockId), card] as const)
      .filter(([blockId]) => Boolean(blockId)),
  );
  const pendingProjectionBlockIds = new Set((evidence.browser.pendingProjectionBlockIds || []).map(normalizeId).filter(Boolean));
  const unsupportedNativeBlockTypes = new Set((evidence.unsupportedNativeBlockTypes || []).map(normalizeId).filter(Boolean));
  const buckets = new Map<BrowserCountDifferenceReason, string[]>();

  for (const nativeCard of evidence.native.cards) {
    const blockId = normalizeId(nativeCard.blockId);
    if (!blockId) {
      addReasonSample(buckets, 'unresolved-difference', normalizeId(nativeCard.cardId), sampleLimit);
      continue;
    }

    const browserCard = browserByBlockId.get(blockId);
    if (!browserCard) {
      const nativeType = normalizeId(nativeCard.type);
      const reason: BrowserCountDifferenceReason = nativeType && unsupportedNativeBlockTypes.has(nativeType)
        ? 'unsupported-card-shape'
        : 'missing-plugin-index';
      addReasonSample(buckets, reason, blockId, sampleLimit);
      continue;
    }

    if (browserCard.sourceExists === false) {
      addReasonSample(buckets, 'missing-source-block', blockId, sampleLimit);
      continue;
    }

    if (browserCard.sourceExists === null || pendingProjectionBlockIds.has(blockId)) {
      addReasonSample(buckets, 'sync-projection-not-complete', blockId, sampleLimit);
    }
  }

  const groups = REASON_ORDER
    .map((reason) => {
      const sampleIds = buckets.get(reason) || [];
      return {
        reason,
        count: sampleIds.length,
        sampleIds,
      };
    })
    .filter((group) => group.count > 0);

  return {
    status: nativeTotal === browserTotal && groups.length === 0 ? 'matched' : 'difference',
    nativeTotal,
    browserManageableTotal: browserTotal,
    browserOperationalTotal: browserTotal,
    differenceTotal: Math.abs(nativeTotal - browserTotal),
    groups,
    unavailable: [],
  };
}

function resolveTotal(total: number | undefined, fallback: number): number {
  return Number.isFinite(total) ? Math.max(0, Number(total)) : fallback;
}

function normalizeId(value: unknown): string {
  return String(value || '').trim();
}

function addReasonSample(
  buckets: Map<BrowserCountDifferenceReason, string[]>,
  reason: BrowserCountDifferenceReason,
  sampleId: string,
  sampleLimit: number,
): void {
  if (!sampleId) {
    return;
  }
  const samples = buckets.get(reason) || [];
  if (samples.length >= sampleLimit || samples.includes(sampleId)) {
    buckets.set(reason, samples);
    return;
  }
  samples.push(sampleId);
  buckets.set(reason, samples);
}
