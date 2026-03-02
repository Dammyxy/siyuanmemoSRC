import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVueDialog } from '@/utils/dialog';
import { DialogManager } from '../DialogManager';
import type { ICardTemplate, TemplateCategory } from '@/core/xiuyuan/types';

vi.mock('@/utils/dialog', () => ({
  createVueDialog: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('@/ui/settings', () => ({
  SettingsPanel: {},
}));

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/mobile/MobileReviewLauncher.vue', () => ({
  default: {},
}));

vi.mock('@/ui/xiuyuan', () => ({
  TemplateSelectDialog: {},
}));

vi.mock('@/application/factories/createUnifiedReviewDialog', () => ({
  createUnifiedReviewDialog: vi.fn(),
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

function createTemplate(id: string, name: string, category: TemplateCategory = 'basic'): ICardTemplate {
  return {
    id,
    name,
    category,
    fields: [{ name: 'field' }],
    cardRules: [
      {
        typeMarker: 'qa',
        frontFields: ['field'],
        backFields: ['field'],
      },
    ],
  };
}

function createDialogManager(templates: ICardTemplate[]) {
  const siyuanApi = {
    BUILTIN_DECK_ID: 'builtin-deck',
    pushMsg: vi.fn().mockResolvedValue(undefined),
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  };

  const xiuyuanAppService = {
    getAllTemplates: vi.fn().mockResolvedValue(templates),
    getTemplate: vi.fn(),
  };

  const context = {
    getXiuyuanApplicationService: vi.fn().mockResolvedValue(xiuyuanAppService),
    getI18n: vi.fn().mockReturnValue({}),
  } as any;

  const dialogManager = new DialogManager(context, {} as any, { siyuanApi: siyuanApi as any });
  return { dialogManager, siyuanApi };
}

describe('DialogManager quick template filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes builtin-concept-simple from quick card dialog template list', async () => {
    const { dialogManager } = createDialogManager([
      createTemplate('builtin-concept-simple', '概念卡（简单）', 'concept'),
      createTemplate('builtin-basic-qa', '基础问答', 'basic'),
    ]);

    await dialogManager.openCreateTemplateCardDialog(['block-1']);

    expect(createVueDialog).toHaveBeenCalledTimes(1);
    const dialogConfig = vi.mocked(createVueDialog).mock.calls[0]?.[0] as { props?: { templates?: ICardTemplate[] } };
    const templateIds = (dialogConfig.props?.templates || []).map(template => template.id);
    expect(templateIds).toEqual(['builtin-basic-qa']);
    expect(templateIds).not.toContain('builtin-concept-simple');
  });

  it('shows unavailable message when only hidden internal templates remain', async () => {
    const { dialogManager, siyuanApi } = createDialogManager([
      createTemplate('builtin-concept-simple', '概念卡（简单）', 'concept'),
    ]);

    await dialogManager.openCreateTemplateCardDialog(['block-1']);

    expect(createVueDialog).not.toHaveBeenCalled();
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('暂无可用模板，请先创建模板');
  });
});
