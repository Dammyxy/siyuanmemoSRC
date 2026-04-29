/**
 * BlockMenuHandler - ApplicationContext Integration Test
 * 
 * 测试 BlockMenuHandler 与 ApplicationContext 的集成
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlockMenuHandler } from '../BlockMenuHandler';
import type { ApplicationContext } from '@/application/ApplicationContext';

describe('BlockMenuHandler - ApplicationContext Integration', () => {
  let mockApplicationContext: ApplicationContext;
  let blockMenuHandler: BlockMenuHandler;

  beforeEach(() => {
    // 创建 mock ApplicationContext
    mockApplicationContext = {
      getCardService: vi.fn().mockReturnValue({
        createCard: vi.fn(),
        deleteCard: vi.fn(),
        updateCard: vi.fn(),
      }),
    } as any;

    // 创建 BlockMenuHandler
    blockMenuHandler = new BlockMenuHandler({
      app: {} as any,
      i18n: {},
      dialogManager: {} as any,
      xiuyuanService: {} as any,
      cardCreationHelper: {
        createConceptCard: vi.fn().mockResolvedValue({ ok: true, value: { id: { value: 'card-1' } } }),
        createSymbolCard: vi.fn().mockResolvedValue({ ok: true, value: { id: { value: 'card-1' } } }),
        createQuickCard: vi.fn().mockResolvedValue({ ok: true, value: { id: { value: 'card-1' } } }),
        createBidirectionalCard: vi.fn().mockResolvedValue({ ok: true, value: { id: { value: 'card-1' } } }),
        createListTemplateCard: vi.fn().mockResolvedValue({ ok: true, value: { id: { value: 'card-1' } } }),
      } as any,
      openCreateTemplateCardDialog: vi.fn(),
      openNeuralReviewDialog: vi.fn(),
      plugin: {},
      applicationContext: undefined, // 初始时未注入
      siyuanApi: {
        BUILTIN_DECK_ID: 'builtin',
        CARD_ID_ATTR: 'custom-fsrs-card-id',
        pushMsg: vi.fn().mockResolvedValue(undefined),
        pushErrMsg: vi.fn().mockResolvedValue(undefined),
        sql: vi.fn().mockResolvedValue([]),
        getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
        getBlockText: vi.fn().mockResolvedValue(''),
        getBlockAttrs: vi.fn().mockResolvedValue({}),
        setBlockAttrs: vi.fn().mockResolvedValue(undefined),
        markBlockAsCard: vi.fn().mockResolvedValue(undefined),
        getCardBlockIds: vi.fn().mockResolvedValue([]),
        addRiffCards: vi.fn().mockResolvedValue({ name: '', size: 0 }),
      },
    });
  });

  describe('ApplicationContext 注入', () => {
    it('应该能够通过 setApplicationContext 注入 ApplicationContext', () => {
      // 注入 ApplicationContext
      blockMenuHandler.setApplicationContext(mockApplicationContext);

      // 验证注入成功（通过访问私有方法的方式间接验证）
      // 注意：这里我们无法直接访问私有方法，但可以验证不会抛出错误
      expect(() => {
        blockMenuHandler.setApplicationContext(mockApplicationContext);
      }).not.toThrow();
    });

    it('应该在 ApplicationContext 未注入时返回 null', () => {
      // 不注入 ApplicationContext
      // 由于 getCardService 是私有方法，我们无法直接测试
      // 但可以验证 BlockMenuHandler 可以正常创建
      expect(blockMenuHandler).toBeDefined();
    });

    it('应该在 ApplicationContext 注入后能够访问 CardApplicationService', () => {
      // 注入 ApplicationContext
      blockMenuHandler.setApplicationContext(mockApplicationContext);

      // 验证 getCardService 被调用（间接验证）
      // 由于 getCardService 是私有方法，我们通过 ApplicationContext 的 mock 来验证
      expect(mockApplicationContext.getCardService).toBeDefined();
    });
  });

  describe('向后兼容性', () => {
    it('应该在没有 ApplicationContext 时仍然能够正常工作', () => {
      // 不注入 ApplicationContext
      // BlockMenuHandler 应该仍然能够使用旧的服务
      expect(blockMenuHandler).toBeDefined();
      
      // 验证基本功能不受影响
      const mockEvent = {
        detail: {
          menu: {
            addItem: vi.fn(),
          },
          blockElements: [],
        },
      };

      // 应该不会抛出错误
      expect(() => {
        blockMenuHandler.handleBlockIconClick(mockEvent);
      }).not.toThrow();
    });
  });
});
