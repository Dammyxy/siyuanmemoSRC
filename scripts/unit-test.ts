import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDocContent } from '../src/core/siyuan/api.ts';
import { getNotebookRiffDueCards, getRiffDueCards, getTreeRiffDueCards, reviewRiffCard } from '../src/core/siyuan/riff.ts';
import { QueueContext } from '../src/core/queue/QueueContext.ts';
import { ExtractionPracticeQueue } from '../src/core/queue/strategies/ExtractionPracticeQueue.ts';
import { DeliberatePracticeQueue } from '../src/core/queue/strategies/DeliberatePracticeQueue.ts';
import { NeuralWanderingQueue } from '../src/core/queue/strategies/NeuralWanderingQueue.ts';
import { FilterGroupQueue } from '../src/core/queue/strategies/FilterGroupQueue.ts';

type FetchCall = { url: string; options: any };
const calls: FetchCall[] = [];

globalThis.fetch = (async (url: string, options: any) => {
  calls.push({ url, options });
  return {
    json: async () => ({ code: 0, data: {} })
  } as any;
}) as any;

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function lastBody() {
  const last = calls[calls.length - 1];
  return JSON.parse(last.options.body);
}

await getRiffDueCards('deck', '', '', []);
assert(calls[0].url.endsWith('/api/riff/getRiffDueCards'), 'getRiffDueCards endpoint mismatch');
assert(!('reviewedCards' in lastBody()), 'getRiffDueCards should omit reviewedCards when empty');

await getRiffDueCards('deck', '', '', [{ id: 1 }]);
assert('reviewedCards' in lastBody(), 'getRiffDueCards should include reviewedCards');

await reviewRiffCard('deck', 'card', 3, [{ id: 2 }]);
assert(calls[calls.length - 1].url.endsWith('/api/riff/reviewRiffCard'), 'reviewRiffCard endpoint mismatch');
assert('reviewedCards' in lastBody(), 'reviewRiffCard should include reviewedCards');

await getTreeRiffDueCards('root', [{ id: 3 }]);
assert(calls[calls.length - 1].url.endsWith('/api/riff/getTreeRiffDueCards'), 'getTreeRiffDueCards endpoint mismatch');

await getNotebookRiffDueCards('notebook', [{ id: 4 }]);
assert(calls[calls.length - 1].url.endsWith('/api/riff/getNotebookRiffDueCards'), 'getNotebookRiffDueCards endpoint mismatch');

await getDocContent('doc', 100, 0);
assert(calls[calls.length - 1].url.endsWith('/api/filetree/getDoc'), 'getDocContent endpoint mismatch');

const reviewPanelPath = resolve('src/ui/review/ReviewPanel.vue');
const reviewPanelContent = readFileSync(reviewPanelPath, 'utf8');
assert(reviewPanelContent.includes('data-type="count"'), 'ReviewPanel should include count status bar');
assert(reviewPanelContent.includes('showCountBar'), 'ReviewPanel should gate count status bar by showCountBar');
assert(reviewPanelContent.includes('fsrs-drill-mode'), 'ReviewPanel should mark drill mode for layout control');
assert(reviewPanelContent.includes('getNextDrillCard'), 'ReviewPanel should support getNextDrillCard for neural mode');

type QueueItem = { cardID: string; blockID: string; deckID: string };

function createQueueItem(id: string): QueueItem {
  return { cardID: id, blockID: `b-${id}`, deckID: 'deck' };
}

const storageStub = (() => {
  const state: any[] = [];
  return {
    getPracticeQueue: () => state,
    addPracticeQueue: async (cards: any[]) => {
      const existing = new Set(state.map((c) => c.cardID));
      let added = 0;
      for (const c of cards) {
        if (!c?.cardID || existing.has(c.cardID)) continue;
        existing.add(c.cardID);
        state.push(c);
        added += 1;
      }
      return added;
    },
    setPracticeQueue: async (queue: any[]) => {
      state.length = 0;
      state.push(...queue);
    },
    clearPracticeQueue: async () => {
      state.length = 0;
    },
    readPluginFile: async (_fileName: string) => null,
    writePluginFile: async (_fileName: string, _content: string) => {},
  };
})();

const extractionQueue = new ExtractionPracticeQueue(storageStub as any);
assert(extractionQueue.isEmpty(), 'ExtractionPracticeQueue should be empty initially');
await extractionQueue.addItem(createQueueItem('c1') as any);
await extractionQueue.addItem(createQueueItem('c1') as any);
assert(extractionQueue.size() === 1, 'ExtractionPracticeQueue should dedupe by cardID');
assert(extractionQueue.getNextItem()?.cardID === 'c1', 'ExtractionPracticeQueue should peek first item');
const removed = await extractionQueue.removeItem(createQueueItem('c1') as any);
assert(removed, 'ExtractionPracticeQueue should remove existing item');
assert(extractionQueue.isEmpty(), 'ExtractionPracticeQueue should be empty after remove');

function createMemoryAdapter() {
  let snap: any = null;
  return {
    load: async () => snap,
    save: async (s: any) => { snap = s; },
    clear: async () => { snap = null; },
  };
}

const deliberateQueue = new DeliberatePracticeQueue(createMemoryAdapter() as any);
await deliberateQueue.init();
assert(deliberateQueue.isEmpty(), 'DeliberatePracticeQueue should be empty initially');
await deliberateQueue.addItem(createQueueItem('d1') as any);
await deliberateQueue.addItem(createQueueItem('d2') as any);
assert(deliberateQueue.size() === 2, 'DeliberatePracticeQueue should add items');
assert(deliberateQueue.getNextItem()?.cardID === 'd1', 'DeliberatePracticeQueue should peek first');
await deliberateQueue.removeItem(createQueueItem('d1') as any);
assert(deliberateQueue.getNextItem()?.cardID === 'd2', 'DeliberatePracticeQueue should remove by cardID');

const originalRandom = Math.random;
Math.random = () => 0;
const sqlStub = async (stmt: string) => {
  if (stmt.includes('ORDER BY random()')) {
    return [{ id: 's1' }];
  }
  if (stmt.includes('SELECT root_id FROM blocks')) {
    return [{ root_id: 'r1' }];
  }
  if (stmt.includes('FROM refs')) {
    return [{ id: 'x1' }];
  }
  if (stmt.includes("SELECT block_id FROM attributes") && stmt.includes('IN (')) {
    return [{ block_id: 'x1' }];
  }
  if (stmt.includes("SELECT value FROM attributes")) {
    if (stmt.includes("block_id = 'x1'")) return [{ value: 'cx1' }];
    if (stmt.includes("block_id = 's1'")) return [{ value: 'cs1' }];
    return [];
  }
  return [];
};
const neuralQueue = new NeuralWanderingQueue(
  createMemoryAdapter() as any,
  { sql: sqlStub, getContextCardBlocks: async () => ['cctx'] },
  {
    deckID: 'deck',
    historyLimit: 5,
    maxContext: 10,
    maxTags: 10,
    maxSiblings: 10,
    enableTags: false,
    enableSiblings: false,
    weights: { ref: 10, context: 5, tag: 3, sibling: 1 },
  },
);
await neuralQueue.init();
const first = await neuralQueue.getNextItem();
assert(first?.blockID === 'x1', 'NeuralWanderingQueue should walk to a neighbor');
assert(first?.cardID === 'cx1', 'NeuralWanderingQueue should resolve cardID for neighbor');
assert((first as any)?.meta?.neuralReason === 'ref', 'NeuralWanderingQueue should annotate reason');
Math.random = originalRandom;

Math.random = () => 0;
const sqlTagStub = async (stmt: string) => {
  if (stmt.includes('ORDER BY random()')) return [{ id: 's1' }];
  if (stmt.includes('SELECT root_id FROM blocks')) return [{ root_id: 'r1' }];
  if (stmt.includes('FROM refs')) return [];
  if (stmt.includes('FROM spans') && stmt.includes("type = 'tag'") && stmt.includes("block_id = 's1'")) return [{ content: 't1' }];
  if (stmt.includes('FROM spans') && stmt.includes('content IN') && stmt.includes("block_id != 's1'")) return [{ id: 'tb1' }];
  if (stmt.includes("SELECT block_id FROM attributes") && stmt.includes('IN (')) return [{ block_id: 'tb1' }];
  if (stmt.includes("SELECT value FROM attributes") && stmt.includes("block_id = 'tb1'")) return [{ value: 'ctb1' }];
  return [];
};
const neuralTagQueue = new NeuralWanderingQueue(
  createMemoryAdapter() as any,
  { sql: sqlTagStub, getContextCardBlocks: async () => [] },
  {
    deckID: 'deck',
    historyLimit: 5,
    maxContext: 0,
    maxTags: 10,
    maxSiblings: 0,
    enableTags: true,
    enableSiblings: false,
    weights: { ref: 0, context: 0, tag: 1, sibling: 0 },
  },
);
await neuralTagQueue.init();
const tagFirst = await neuralTagQueue.getNextItem();
assert(tagFirst?.blockID === 'tb1', 'NeuralWanderingQueue should pick tag neighbor when enabled');
assert((tagFirst as any)?.meta?.neuralReason === 'tag', 'NeuralWanderingQueue should annotate tag reason');
Math.random = originalRandom;

const filterGroupQueue = new FilterGroupQueue([{ id: 'g1', weight: 2 }, { id: 'g2', weight: 1 }], createMemoryAdapter() as any);
await filterGroupQueue.init();
await filterGroupQueue.addItem({ ...createQueueItem('f1'), meta: { groupId: 'g1' } } as any);
await filterGroupQueue.addItem({ ...createQueueItem('f2'), meta: { groupId: 'g2' } } as any);
assert(filterGroupQueue.size() === 2, 'FilterGroupQueue should count across groups');
assert(filterGroupQueue.getNextItem() !== null, 'FilterGroupQueue should return an item when not empty');
await filterGroupQueue.removeItem(createQueueItem('f1') as any);
assert(filterGroupQueue.size() === 1, 'FilterGroupQueue should remove item across groups');

const ctx = new QueueContext<QueueItem>({ initial: 'deliberate' });
ctx.register('deliberate', deliberateQueue as any);
ctx.register('extraction', extractionQueue as any);
ctx.setStrategy('deliberate');
await Promise.all([
  ctx.addItem(createQueueItem('cc1')),
  ctx.addItem(createQueueItem('cc2')),
  ctx.addItem(createQueueItem('cc3')),
]);
const state = await ctx.getState();
assert(state.size >= 3, 'QueueContext should be safe under concurrent add');
