import { describe, expect, it, vi } from 'vitest';
import type { CreationDecision } from '@/core/card/post-creation/contracts';
import { ok } from '@/types/result';
import { AutoCardPlannerExecutionRuntime } from '../AutoCardPlannerExecutionRuntime';

function createDecision(overrides: Partial<CreationDecision> = {}): CreationDecision {
  return {
    id: 'BasicDirectionRule',
    family: 'basic',
    templateId: 'builtin-quick-card',
    cardType: 'item',
    mode: 'single',
    executorKind: 'quick-basic',
    priority: 50,
    direction: 'forward',
    ...overrides,
  };
}

function createRuntime(overrides: Partial<ConstructorParameters<typeof AutoCardPlannerExecutionRuntime>[0]> = {}) {
  const cards: unknown[] = [];
  const deps: ConstructorParameters<typeof AutoCardPlannerExecutionRuntime>[0] = {
    getBlockAttrs: vi.fn(async () => ({})),
    getLocalCardsByBlockId: vi.fn(() => cards),
    createBasicCard: vi.fn(async () => {
      cards.push({ id: 'card-1' });
    }),
    createClozeCard: vi.fn(async () => undefined),
    createConceptCard: vi.fn(async () => undefined),
    createDescriptorCard: vi.fn(async () => undefined),
    createListTemplateCards: vi.fn(async () => undefined),
    createCdfMultilineCards: vi.fn(async () => ok({
      createdDefinition: 0,
      createdDescriptor: 0,
      skipped: 0,
      failed: 0,
    })),
    resolveListChildrenBySubtype: vi.fn(async () => ({
      parentParagraphId: 'paragraph-1',
      parentKramdown: 'Question >>>',
      orderedChildren: [],
      unorderedChildren: [],
      source: 'direct',
    })),
    ...overrides,
  };
  return { runtime: new AutoCardPlannerExecutionRuntime(deps), deps, cards };
}

describe('AutoCardPlannerExecutionRuntime', () => {
  it('orchestrates quick-basic execution and reports created only after local card appears', async () => {
    const { runtime, deps } = createRuntime();

    const executed = await runtime.execute({
      blockId: 'block-1',
      content: 'Alpha >> Beta',
      decision: createDecision({ cardType: 'topic' }),
      source: 'symbol-listener',
    });

    expect(executed).toBe(true);
    expect(deps.createBasicCard).toHaveBeenCalledWith({
      blockId: 'block-1',
      direction: 'forward',
      content: 'Alpha >> Beta',
      cardType: 'topic',
      actualSymbol: undefined,
      source: 'symbol-listener',
      decision: expect.objectContaining({ id: 'BasicDirectionRule' }),
    });
  });

  it('normalizes unchanged local card state to not executed', async () => {
    const { runtime } = createRuntime({
      createBasicCard: vi.fn(async () => undefined),
    });

    await expect(runtime.execute({
      blockId: 'block-2',
      content: 'Alpha >> Beta',
      decision: createDecision(),
      source: 'symbol-listener',
    })).resolves.toBe(false);
  });

  it('surfaces side-effect callback failure without retrying another executor', async () => {
    const failure = new Error('basic callback failed');
    const createClozeCard = vi.fn(async () => undefined);
    const { runtime, deps } = createRuntime({
      createBasicCard: vi.fn(async () => {
        throw failure;
      }),
      createClozeCard,
    });

    await expect(runtime.execute({
      blockId: 'block-3',
      content: 'Alpha >> Beta',
      decision: createDecision(),
      source: 'symbol-listener',
    })).rejects.toThrow('basic callback failed');

    expect(deps.createBasicCard).toHaveBeenCalledTimes(1);
    expect(createClozeCard).not.toHaveBeenCalled();
  });
});
