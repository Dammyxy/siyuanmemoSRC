import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCardRepository } from '../QuickCardRepository';
import type { SiyuanBlockAdapter } from '../SiyuanBlockAdapter';
import type { SiyuanBlock } from '../../domain/types';
import type { ICardStorage } from '@/application/interfaces/ICardStorage';

type MockAdapter = {
  getBlock: ReturnType<typeof vi.fn>;
  renderQuickFaceHtml: ReturnType<typeof vi.fn>;
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
      renderQuickFaceHtml: vi.fn((input: string) => input),
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
    mockAdapter.renderQuickFaceHtml.mockReturnValue('');

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).not.toBeNull();
    expect(card?.metadata.symbol).toBe('\\cloze');
    expect(card?.getFace('front').html).toContain('$$');
    expect(card?.getFace('front').html).toContain('\\boxed{\\text{[...]}}');
    expect(card?.getFace('back').html).toContain('{\\color{#166534}mc^2}');
    expect(mockAdapter.renderQuickFaceHtml).not.toHaveBeenCalled();
  });

  it('does not treat superblock triple braces as quick cloze card', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('{{{row 超级块测试1\n3333}}}')
    );

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).toBeNull();
  });

  it('renders bidirectional single-block quick cards in forward direction through the safe face renderer', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('北京<>首都')
    );
    mockAdapter.renderQuickFaceHtml.mockImplementation((input: string) => `rendered:${input}`);

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).not.toBeNull();
    expect(card?.metadata.symbol).toBe('<>');
    expect(card?.getFace('front').html).toBe('rendered:北京');
    expect(card?.getFace('back').html).toBe('rendered:北京<br/><br/>首都');
    expect(mockAdapter.renderQuickFaceHtml).toHaveBeenNthCalledWith(1, '北京');
    expect(mockAdapter.renderQuickFaceHtml).toHaveBeenNthCalledWith(2, '北京<br/><br/>首都');
  });

  it('renders bidirectional single-block quick cards in reverse direction through the safe face renderer', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('北京<>首都')
    );
    vi.mocked(mockCardStorage.getCard).mockResolvedValue({
      meta: {
        typeMarker: 'reverse',
      },
    } as Awaited<ReturnType<ICardStorage['getCard']>>);
    mockAdapter.renderQuickFaceHtml.mockImplementation((input: string) => `rendered:${input}`);

    const card = await repository.loadCard('20260301120000-quick01', 'card-reverse');

    expect(card).not.toBeNull();
    expect(card?.metadata.typeMarker).toBe('reverse');
    expect(card?.getFace('front').html).toBe('rendered:首都');
    expect(card?.getFace('back').html).toBe('rendered:首都<br/><br/>北京');
    expect(mockAdapter.renderQuickFaceHtml).toHaveBeenNthCalledWith(1, '首都');
    expect(mockAdapter.renderQuickFaceHtml).toHaveBeenNthCalledWith(2, '首都<br/><br/>北京');
  });

  it.each([
    ['>>', '问题>>答案', '问题', '问题<br/><br/>答案'],
    ['<<', '答案<<问题', '问题', '问题<br/><br/>答案'],
    ['{{}}', '核心是{{领域模型}}', '核心是[...]', '核心是<mark>领域模型</mark>'],
  ])('keeps visible quick faces for %s cards through the shared safe renderer', async (_symbol, content, expectedFront, expectedBack) => {
    mockAdapter.getBlock.mockResolvedValue(createBlock(content));
    mockAdapter.renderQuickFaceHtml.mockImplementation((input: string) => `rendered:${input}`);

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).not.toBeNull();
    expect(card?.getFace('front').html).toBe(`rendered:${expectedFront}`);
    expect(card?.getFace('back').html).toBe(`rendered:${expectedBack}`);
    expect(mockAdapter.renderQuickFaceHtml).toHaveBeenCalledTimes(2);
  });

  it('falls back to source face text when the safe renderer unexpectedly returns empty output', async () => {
    mockAdapter.getBlock.mockResolvedValue(
      createBlock('北京<>首都')
    );
    mockAdapter.renderQuickFaceHtml
      .mockReturnValueOnce('')
      .mockReturnValueOnce('');

    const card = await repository.loadCard('20260301120000-quick01');

    expect(card).not.toBeNull();
    expect(card?.getFace('front').html).toBe('北京');
    expect(card?.getFace('back').html).toBe('北京<br/><br/>首都');
  });
});
