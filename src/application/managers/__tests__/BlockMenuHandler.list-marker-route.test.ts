import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockMenuHandler } from '../BlockMenuHandler';

const PARENT_I = '20260101000000-parent';
const PARENT_P = '20260101000001-parentp';
const CHILD_P = '20260101000002-childp';

function createFixture() {
  const dialogManager = {
    createCdfMultilineTemplateCards: vi.fn().mockResolvedValue(undefined),
  };

  const siyuanApi = {
    BUILTIN_DECK_ID: 'builtin-deck',
    CARD_ID_ATTR: 'custom-fsrs-card-id',
    sql: vi.fn().mockResolvedValue([]),
    getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    pushMsg: vi.fn().mockResolvedValue(undefined),
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  } as any;

  const handler = new BlockMenuHandler({
    app: {} as any,
    i18n: {},
    dialogManager: dialogManager as any,
    openCreateTemplateCardDialog: vi.fn(),
    openNeuralReviewDialog: vi.fn(),
    applicationContext: {} as any,
    cardCreationHelper: {} as any,
    siyuanApi,
  });

  return { handler, dialogManager, siyuanApi };
}

function installListMarkerSqlMock(
  siyuanApi: { sql: ReturnType<typeof vi.fn> },
  options: { selectedType: 'i' | 'p'; paragraphContent?: string }
) {
  const { selectedType, paragraphContent = '' } = options;
  vi.mocked(siyuanApi.sql).mockImplementation(async (stmt: string) => {
    if (stmt.includes(`WHERE id = '${PARENT_I}'`) && stmt.includes('SELECT id, type, parent_id')) {
      return [{ id: PARENT_I, type: 'i' }];
    }
    if (stmt.includes(`WHERE id = '${CHILD_P}'`) && stmt.includes('SELECT id, type, parent_id')) {
      return selectedType === 'p'
        ? [{ id: CHILD_P, type: 'p', parent_id: PARENT_I }]
        : [];
    }
    if (stmt.includes(`WHERE id = '${PARENT_I}'`) && stmt.includes('SELECT id, type') && !stmt.includes('parent_id')) {
      return [{ id: PARENT_I, type: 'i' }];
    }
    if (stmt.includes(`WHERE parent_id = '${PARENT_I}'`) && stmt.includes("AND type = 'p'")) {
      return [{ id: PARENT_P, content: paragraphContent }];
    }
    return [];
  });
}

describe('BlockMenuHandler createListCardsByMarker route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes ::: parent paragraph marker to concept multiline flow', async () => {
    const { handler, dialogManager, siyuanApi } = createFixture();
    installListMarkerSqlMock(siyuanApi, { selectedType: 'i' });
    vi.mocked(siyuanApi.getBlockKramdown).mockImplementation(async (blockId: string) => {
      if (blockId === PARENT_P) return { kramdown: 'concept:::' };
      if (blockId === PARENT_I) return { kramdown: 'concept:::' };
      return { kramdown: '' };
    });
    const createListTemplateCardsSpy = vi.spyOn(handler as any, 'createListTemplateCards').mockResolvedValue(undefined);

    await (handler as any).createListCardsByMarker([PARENT_I]);

    expect(dialogManager.createCdfMultilineTemplateCards).toHaveBeenCalledTimes(1);
    expect(dialogManager.createCdfMultilineTemplateCards).toHaveBeenCalledWith(
      [PARENT_I],
      'builtin-list-concept-multiline',
      { skipSymbolConfirmation: true }
    );
    expect(createListTemplateCardsSpy).not.toHaveBeenCalled();
  });

  it('routes ;;; marker when selected block is paragraph p by normalizing to parent i', async () => {
    const { handler, dialogManager, siyuanApi } = createFixture();
    installListMarkerSqlMock(siyuanApi, { selectedType: 'p' });
    vi.mocked(siyuanApi.getBlockKramdown).mockImplementation(async (blockId: string) => {
      if (blockId === PARENT_P) return { kramdown: '起源;;;' };
      if (blockId === PARENT_I) return { kramdown: '起源;;;' };
      return { kramdown: '' };
    });
    const createListTemplateCardsSpy = vi.spyOn(handler as any, 'createListTemplateCards').mockResolvedValue(undefined);

    await (handler as any).createListCardsByMarker([CHILD_P]);

    expect(dialogManager.createCdfMultilineTemplateCards).toHaveBeenCalledTimes(1);
    expect(dialogManager.createCdfMultilineTemplateCards).toHaveBeenCalledWith(
      [PARENT_I],
      'builtin-list-descriptor-multiline',
      { skipSymbolConfirmation: true }
    );
    expect(createListTemplateCardsSpy).not.toHaveBeenCalled();
  });

  it('detects marker from parent paragraph content when kramdown source has no marker', async () => {
    const { handler, dialogManager, siyuanApi } = createFixture();
    installListMarkerSqlMock(siyuanApi, { selectedType: 'i', paragraphContent: 'concept:::' });
    vi.mocked(siyuanApi.getBlockKramdown).mockResolvedValue({ kramdown: '' });
    const createListTemplateCardsSpy = vi.spyOn(handler as any, 'createListTemplateCards').mockResolvedValue(undefined);

    await (handler as any).createListCardsByMarker([PARENT_I]);

    expect(dialogManager.createCdfMultilineTemplateCards).toHaveBeenCalledTimes(1);
    expect(createListTemplateCardsSpy).not.toHaveBeenCalled();
  });

  it('falls back to default list flow when no marker exists', async () => {
    const { handler, dialogManager, siyuanApi } = createFixture();
    installListMarkerSqlMock(siyuanApi, { selectedType: 'i', paragraphContent: 'no marker' });
    vi.mocked(siyuanApi.getBlockKramdown).mockResolvedValue({ kramdown: 'no marker' });
    const createListTemplateCardsSpy = vi.spyOn(handler as any, 'createListTemplateCards').mockResolvedValue(undefined);

    await (handler as any).createListCardsByMarker([PARENT_I]);

    expect(dialogManager.createCdfMultilineTemplateCards).not.toHaveBeenCalled();
    expect(createListTemplateCardsSpy).toHaveBeenCalledTimes(1);
    expect(createListTemplateCardsSpy).toHaveBeenCalledWith([PARENT_I]);
  });
});
