import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCardRepository } from '../QuickCardRepository';
import type { SiyuanBlockAdapter } from '../SiyuanBlockAdapter';
import type { SiyuanBlock } from '../../domain/types';
import type { ICardStorage } from '@/application/interfaces/ICardStorage';

type MockAdapter = {
  getBlock: ReturnType<typeof vi.fn>;
  kramdownToHtml: ReturnType<typeof vi.fn>;
};

function createBlock(content: string, blockId = '20260301120000-quick01'): SiyuanBlock {
  return {
    id: blockId,
    content,
    parentID: undefined,
  };
}

describe('QuickCardRepository', () => {
  let mockAdapter: MockAdapter;
  let mockCardStorage: ICardStorage;
  let repository: QuickCardRepository;

  beforeEach(() => {
    mockAdapter = {
      getBlock: vi.fn(),
      kramdownToHtml: vi.fn((input: string) => input),
    };

    mockCardStorage = {
      getCard: vi.fn(async () => null),
      setCard: vi.fn(async () => undefined),
      deleteCard: vi.fn(async () => undefined),
      getAllCards: vi.fn(async () => []),
    };

    repository = new QuickCardRepository(
      mockAdapter as unknown as SiyuanBlockAdapter,
      mockCardStorage
    );
  });

  it('detects basic quick cards without cardId', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('What is DDD? >> Domain-Driven Design')
    );

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).not.toBeNull();
    expect(card?.type).toBe('basic');
    expect(card?.metadata.symbol).toBe('>>');
    expect(card?.metadata.cardId).toBeUndefined();
  });

  it('detects brace cloze quick cards without cardId', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('The core is {{ubiquitous language}}')
    );

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).not.toBeNull();
    expect(card?.type).toBe('cloze');
    expect(card?.metadata.symbol).toBe('{{}}');
    expect(card?.metadata.cardId).toBeUndefined();
  });

  it('detects numbered latex cloze quick cards without cardId', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('$$ E = \\\\cloze{c1}{mc^2} $$')
    );

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).not.toBeNull();
    expect(card?.type).toBe('cloze');
    expect(card?.metadata.symbol).toBe('\\cloze');
    expect(card?.metadata.cardId).toBeUndefined();
    expect(card?.getFace('front').html).toContain('\\boxed{\\text{[...]}}');
    expect(card?.getFace('front').html).not.toContain('\\\\boxed');
    expect(card?.getFace('back').html).toContain('mc^2');
    expect(card?.getFace('back').html).not.toContain('\\mc^2');
  });

  it('keeps latex cloze renderable when source has no math delimiters', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('P(A|B)=\\\\cloze{c1}{P(B|A)}*P(A)/P(B)')
    );

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).not.toBeNull();
    expect(card?.metadata.symbol).toBe('\\cloze');
    expect(card?.getFace('front').html.startsWith('$$')).toBe(true);
    expect(card?.getFace('front').html.endsWith('$$')).toBe(true);
    expect(card?.getFace('back').html.startsWith('$$')).toBe(true);
    expect(card?.getFace('back').html.endsWith('$$')).toBe(true);
  });

  it('keeps FSRS meta enrichment when cardId exists', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('$$ E = \\\\cloze{c1}{mc^2} $$')
    );
    const fsrsCard = {
      meta: {
        typeMarker: 'concept',
        clozeIndex: 1,
        totalClozes: 3,
        direction: 'forward',
      },
    } as Awaited<ReturnType<ICardStorage['getCard']>>;
    vi.mocked(mockCardStorage.getCard).mockResolvedValue(fsrsCard);

    const card = await repository.loadCard('20260301120000-quick01', 'card-001');

    expect(card).not.toBeNull();
    expect(card?.metadata.cardId).toBe('card-001');
    expect(card?.metadata.typeMarker).toBe('concept');
    expect(card?.metadata.clozeIndex).toBe(1);
    expect(card?.metadata.totalClozes).toBe(3);
    expect(card?.metadata.direction).toBe('forward');
  });

  it('keeps raw latex cloze kramdown when converter output is empty', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('$$ E = \\\\cloze{c1}{mc^2} $$')
    );
    mockAdapter.kramdownToHtml.mockReturnValue('');

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).not.toBeNull();
    expect(card?.metadata.symbol).toBe('\\cloze');
    expect(card?.getFace('front').html).toContain('$$');
    expect(card?.getFace('front').html).toContain('\\boxed{\\text{[...]}}');
    expect(card?.getFace('back').html).toContain('{\\color{#166534}mc^2}');
    expect(mockAdapter.kramdownToHtml).not.toHaveBeenCalled();
  });

  it('does not treat superblock triple braces as quick cloze card', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('{{{row 超级块测试1\n3333}}}')
    );

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).toBeNull();
  });
});
