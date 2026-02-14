/**
 * BlockMenuHandler 菜单项生成测试
 * 
 * 测试块菜单中复习入口的菜单项生成功能：
 * 1. 提取练习生成 2 个菜单项（到期、全部）
 * 2. 渐进学习生成 2 个菜单项（到期、全部）
 * 3. 刻意练习生成 1 个菜单项（全部）
 * 4. 菜单项之间有正确的分隔符
 * 5. 菜单项的图标和标签正确
 * 
 * @see .kiro/specs/block-menu-review-entries/requirements.md 需求 2.4
 * @see .kiro/specs/block-menu-review-entries/design.md 章节 7.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlockMenuHandler } from '../BlockMenuHandler';
import type { BlockMenuHandlerDeps } from '../BlockMenuHandler';
import type { FSRSCard } from '@/types/card';

// Mock 所有依赖
vi.mock('@/core/siyuan/api', () => ({
  pushMsg: vi.fn().mockResolvedValue(undefined),
  pushErrMsg: vi.fn().mockResolvedValue(undefined),
  sql: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/core/siyuan/block', () => ({
  markBlockAsCard: vi.fn().mockResolvedValue(undefined),
  unmarkBlockAsCard: vi.fn().mockResolvedValue(undefined),
  ATTR_CARD_ID: 'custom-fsrs-card-id',
  getCardBlockIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/utils/dialog', () => ({
  createVueDialog: vi.fn(),
}));

vi.mock('@/core/siyuan', () => ({
  riff: {
    BUILTIN_DECK_ID: 'builtin-deck',
  },
}));

describe('BlockMenuHandler - 菜单项生成', () => {
  let handler: BlockMenuHandler;
  let mockDeps: BlockMenuHandlerDeps;
  let mockMenu: any;
  
  beforeEach(() => {
    // 创建 mock 菜单对象
    mockMenu = {
      addItem: vi.fn(),
    };
    
    // 创建 mock 依赖
    mockDeps = {
      app: {} as any,
      i18n: {
        drillNoCards: '当前范围内没有可练习的闪卡',
        noDueCards: '当前范围内没有到期的闪卡',
        startNeuralReviewFromHere: '从此处开始神经漫游',
        neuralReviewFailed: '神经漫游启动失败',
        editSrsData: '编辑SRS数据',
        msg_no_flashcard: '未找到闪卡，请先将块制为闪卡',
        makeCardFromSelection: '选中制卡',
        msg_created: '已创建 {n} 张闪卡',
        msg_already_cards: '选中的块已经是闪卡',
        createTemplateCard: '创建模板卡片',
        msg_unmarked: '已取消 {n} 张闪卡',
        msg_no_removable: '未找到可取消的闪卡',
      },
      storage: {
        getCardByBlockId: vi.fn(),
        setCard: vi.fn(),
        removeCard: vi.fn(),
        saveCards: vi.fn().mockResolvedValue(undefined),
        getSettings: vi.fn().mockReturnValue({
          riffIntegration: {
            mode: 'basic',
          },
        }),
      } as any,
      reviewDialogManager: {
        openRetrievalPracticeWithFilter: vi.fn().mockResolvedValue(undefined),
        openIncrementalLearningWithFilter: vi.fn().mockResolvedValue(undefined),
        openFinalDrill: vi.fn().mockResolvedValue(undefined),
        openDrillWithCards: vi.fn(),
        deps: {
          plugin: {
            unifiedDataSourceManager: {
              getQueue: vi.fn().mockReturnValue({
                getCards: vi.fn().mockResolvedValue([]),
                clear: vi.fn().mockResolvedValue(undefined),
                addCard: vi.fn().mockResolvedValue(undefined),
              }),
            },
          },
        },
      } as any,
      xiuyuanService: {} as any,
      openCreateTemplateCardDialog: vi.fn().mockResolvedValue(undefined),
      openNeuralReviewDialog: vi.fn().mockResolvedValue(undefined),
      plugin: {
        hybridSyncService: null,
      },
    };
    
    // 创建 handler 实例
    handler = new BlockMenuHandler(mockDeps);
    
    // 重置 mocks
    vi.clearAllMocks();
  });
  
  describe('提取练习菜单项', () => {
    it('应该生成 2 个菜单项（到期、全部）', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const now = Date.now();
      const dueCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: now - 1000,
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(dueCard);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      expect(mockMenu.addItem).toHaveBeenCalledTimes(1);
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      expect(mainMenuItem.label).toBe('SiyuanMemo');
      expect(mainMenuItem.submenu).toBeDefined();
      
      const submenu = mainMenuItem.submenu;
      
      // 验证提取练习菜单项（前 2 个）
      expect(submenu[0].icon).toBe('iconRiffCard');
      expect(submenu[0].label).toContain('提取练习');
      expect(submenu[0].label).toContain('到期');
      
      expect(submenu[1].icon).toBe('iconRiffCard');
      expect(submenu[1].label).toContain('提取练习');
      expect(submenu[1].label).toContain('全部');
    });
    
    it('应该在菜单标签中显示正确的卡片数量', () => {
      // 准备测试数据
      const mockElement1 = document.createElement('div');
      mockElement1.setAttribute('data-node-id', 'block-1');
      
      const mockElement2 = document.createElement('div');
      mockElement2.setAttribute('data-node-id', 'block-2');
      
      const now = Date.now();
      const dueCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: now - 1000,
        skipped: false,
      } as FSRSCard;
      
      const notDueCard: FSRSCard = {
        id: 'card-2',
        blockId: 'block-2',
        type: 'item',
        due: now + 1000,
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId)
        .mockImplementation((blockId: string) => {
          if (blockId === 'block-1') return dueCard;
          if (blockId === 'block-2') return notDueCard;
          return null;
        });
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement1, mockElement2],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证卡片数量显示
      expect(submenu[0].label).toContain('(1/2)'); // 到期 1 张，总共 2 张
      expect(submenu[1].label).toContain('(2)');   // 全部 2 张
    });
    
    it('应该使用正确的图标（iconRiffCard）', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证图标
      expect(submenu[0].icon).toBe('iconRiffCard');
      expect(submenu[1].icon).toBe('iconRiffCard');
    });
  });
  
  describe('渐进学习菜单项', () => {
    it('应该生成 2 个菜单项（到期、全部）', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const now = Date.now();
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: now - 1000,
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证渐进学习菜单项（索引 3 和 4，因为前面有分隔符）
      expect(submenu[2]).toEqual({ type: 'separator' }); // 分隔符
      
      expect(submenu[3].icon).toBe('iconBook');
      expect(submenu[3].label).toContain('渐进学习');
      expect(submenu[3].label).toContain('到期');
      
      expect(submenu[4].icon).toBe('iconBook');
      expect(submenu[4].label).toContain('渐进学习');
      expect(submenu[4].label).toContain('全部');
    });
    
    it('应该使用正确的图标（iconBook）', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证图标
      expect(submenu[3].icon).toBe('iconBook');
      expect(submenu[4].icon).toBe('iconBook');
    });
  });
  
  describe('刻意练习菜单项', () => {
    it('应该生成 1 个菜单项（全部）', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证刻意练习菜单项（索引 6，因为前面有分隔符）
      expect(submenu[5]).toEqual({ type: 'separator' }); // 分隔符
      
      expect(submenu[6].icon).toBe('iconCards');
      expect(submenu[6].label).toContain('刻意练习');
      expect(submenu[6].label).toContain('(1)'); // 只显示总数
      expect(submenu[6].label).not.toContain('到期'); // 不显示"到期"
    });
    
    it('应该使用正确的图标（iconCards）', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证图标
      expect(submenu[6].icon).toBe('iconCards');
    });
    
    it('应该显示所有类型的卡片数量（Item + Topic）', () => {
      // 准备测试数据
      const mockElement1 = document.createElement('div');
      mockElement1.setAttribute('data-node-id', 'block-1');
      
      const mockElement2 = document.createElement('div');
      mockElement2.setAttribute('data-node-id', 'block-2');
      
      const itemCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      const topicCard: FSRSCard = {
        id: 'card-2',
        blockId: 'block-2',
        type: 'topic',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId)
        .mockImplementation((blockId: string) => {
          if (blockId === 'block-1') return itemCard;
          if (blockId === 'block-2') return topicCard;
          return null;
        });
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement1, mockElement2],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证刻意练习显示 2 张卡片（Item + Topic）
      expect(submenu[6].label).toContain('(2)');
    });
  });
  
  describe('分隔符位置', () => {
    it('应该在提取练习和渐进学习之间有分隔符', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证分隔符位置
      // 索引 0-1: 提取练习（到期、全部）
      // 索引 2: 分隔符
      expect(submenu[2]).toEqual({ type: 'separator' });
    });
    
    it('应该在渐进学习和刻意练习之间有分隔符', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证分隔符位置
      // 索引 0-1: 提取练习（到期、全部）
      // 索引 2: 分隔符
      // 索引 3-4: 渐进学习（到期、全部）
      // 索引 5: 分隔符
      expect(submenu[5]).toEqual({ type: 'separator' });
    });
    
    it('应该在刻意练习和神经漫游之间有分隔符', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证分隔符位置
      // 索引 0-1: 提取练习（到期、全部）
      // 索引 2: 分隔符
      // 索引 3-4: 渐进学习（到期、全部）
      // 索引 5: 分隔符
      // 索引 6: 刻意练习（全部）
      // 索引 7: 分隔符
      expect(submenu[7]).toEqual({ type: 'separator' });
    });
  });
  
  describe('卡片数量显示', () => {
    describe('到期数量计算', () => {
      it('应该正确计算到期卡片数量（due <= now）', () => {
        // 准备测试数据
        const mockElement1 = document.createElement('div');
        mockElement1.setAttribute('data-node-id', 'block-1');
        
        const mockElement2 = document.createElement('div');
        mockElement2.setAttribute('data-node-id', 'block-2');
        
        const mockElement3 = document.createElement('div');
        mockElement3.setAttribute('data-node-id', 'block-3');
        
        const now = Date.now();
        
        // 到期卡片
        const dueCard: FSRSCard = {
          id: 'card-1',
          blockId: 'block-1',
          type: 'item',
          due: now - 1000,
          skipped: false,
        } as FSRSCard;
        
        // 未到期卡片
        const notDueCard: FSRSCard = {
          id: 'card-2',
          blockId: 'block-2',
          type: 'item',
          due: now + 1000,
          skipped: false,
        } as FSRSCard;
        
        // 刚好到期的卡片
        const exactlyDueCard: FSRSCard = {
          id: 'card-3',
          blockId: 'block-3',
          type: 'item',
          due: now,
          skipped: false,
        } as FSRSCard;
        
        // 设置 mock
        vi.mocked(mockDeps.storage.getCardByBlockId)
          .mockImplementation((blockId: string) => {
            if (blockId === 'block-1') return dueCard;
            if (blockId === 'block-2') return notDueCard;
            if (blockId === 'block-3') return exactlyDueCard;
            return null;
          });
        
        // 触发菜单生成
        handler.handleBlockIconClick({
          detail: {
            menu: mockMenu,
            blockElements: [mockElement1, mockElement2, mockElement3],
          },
        });
        
        // 获取生成的子菜单
        const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
        const submenu = mainMenuItem.submenu;
        
        // 验证到期数量：2 张到期（card-1 和 card-3），总共 3 张
        expect(submenu[0].label).toContain('(2/3)');
      });
      
      it('应该排除 skipped 卡片', () => {
        // 准备测试数据
        const mockElement1 = document.createElement('div');
        mockElement1.setAttribute('data-node-id', 'block-1');
        
        const mockElement2 = document.createElement('div');
        mockElement2.setAttribute('data-node-id', 'block-2');
        
        const now = Date.now();
        
        // 到期但被跳过的卡片
        const skippedCard: FSRSCard = {
          id: 'card-1',
          blockId: 'block-1',
          type: 'item',
          due: now - 1000,
          skipped: true,
        } as FSRSCard;
        
        // 到期且未跳过的卡片
        const dueCard: FSRSCard = {
          id: 'card-2',
          blockId: 'block-2',
          type: 'item',
          due: now - 1000,
          skipped: false,
        } as FSRSCard;
        
        // 设置 mock
        vi.mocked(mockDeps.storage.getCardByBlockId)
          .mockImplementation((blockId: string) => {
            if (blockId === 'block-1') return skippedCard;
            if (blockId === 'block-2') return dueCard;
            return null;
          });
        
        // 触发菜单生成
        handler.handleBlockIconClick({
          detail: {
            menu: mockMenu,
            blockElements: [mockElement1, mockElement2],
          },
        });
        
        // 获取生成的子菜单
        const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
        const submenu = mainMenuItem.submenu;
        
        // 验证到期数量：只有 1 张到期（card-2），总共 2 张
        expect(submenu[0].label).toContain('(1/2)');
      });
      
      it('应该排除 skipUntil 未到期的卡片', () => {
        // 准备测试数据
        const mockElement1 = document.createElement('div');
        mockElement1.setAttribute('data-node-id', 'block-1');
        
        const mockElement2 = document.createElement('div');
        mockElement2.setAttribute('data-node-id', 'block-2');
        
        const now = Date.now();
        
        // 到期但 skipUntil 未到期的卡片
        const skipUntilCard: FSRSCard = {
          id: 'card-1',
          blockId: 'block-1',
          type: 'item',
          due: now - 1000,
          skipped: false,
          skipUntil: now + 1000,
        } as FSRSCard;
        
        // 到期且 skipUntil 已到期的卡片
        const dueCard: FSRSCard = {
          id: 'card-2',
          blockId: 'block-2',
          type: 'item',
          due: now - 1000,
          skipped: false,
          skipUntil: now - 1000,
        } as FSRSCard;
        
        // 设置 mock
        vi.mocked(mockDeps.storage.getCardByBlockId)
          .mockImplementation((blockId: string) => {
            if (blockId === 'block-1') return skipUntilCard;
            if (blockId === 'block-2') return dueCard;
            return null;
          });
        
        // 触发菜单生成
        handler.handleBlockIconClick({
          detail: {
            menu: mockMenu,
            blockElements: [mockElement1, mockElement2],
          },
        });
        
        // 获取生成的子菜单
        const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
        const submenu = mainMenuItem.submenu;
        
        // 验证到期数量：只有 1 张到期（card-2），总共 2 张
        expect(submenu[0].label).toContain('(1/2)');
      });
    });
    
    describe('总数量计算', () => {
      it('应该正确计算总卡片数量', () => {
        // 准备测试数据
        const mockElement1 = document.createElement('div');
        mockElement1.setAttribute('data-node-id', 'block-1');
        
        const mockElement2 = document.createElement('div');
        mockElement2.setAttribute('data-node-id', 'block-2');
        
        const mockElement3 = document.createElement('div');
        mockElement3.setAttribute('data-node-id', 'block-3');
        
        const now = Date.now();
        
        const card1: FSRSCard = {
          id: 'card-1',
          blockId: 'block-1',
          type: 'item',
          due: now - 1000,
          skipped: false,
        } as FSRSCard;
        
        const card2: FSRSCard = {
          id: 'card-2',
          blockId: 'block-2',
          type: 'item',
          due: now + 1000,
          skipped: false,
        } as FSRSCard;
        
        const card3: FSRSCard = {
          id: 'card-3',
          blockId: 'block-3',
          type: 'item',
          due: now + 2000,
          skipped: false,
        } as FSRSCard;
        
        // 设置 mock
        vi.mocked(mockDeps.storage.getCardByBlockId)
          .mockImplementation((blockId: string) => {
            if (blockId === 'block-1') return card1;
            if (blockId === 'block-2') return card2;
            if (blockId === 'block-3') return card3;
            return null;
          });
        
        // 触发菜单生成
        handler.handleBlockIconClick({
          detail: {
            menu: mockMenu,
            blockElements: [mockElement1, mockElement2, mockElement3],
          },
        });
        
        // 获取生成的子菜单
        const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
        const submenu = mainMenuItem.submenu;
        
        // 验证总数量：3 张
        expect(submenu[1].label).toContain('(3)');
      });
      
      it('应该包含 skipped 和 skipUntil 卡片在总数中', () => {
        // 准备测试数据
        const mockElement1 = document.createElement('div');
        mockElement1.setAttribute('data-node-id', 'block-1');
        
        const mockElement2 = document.createElement('div');
        mockElement2.setAttribute('data-node-id', 'block-2');
        
        const mockElement3 = document.createElement('div');
        mockElement3.setAttribute('data-node-id', 'block-3');
        
        const now = Date.now();
        
        // 跳过的卡片
        const skippedCard: FSRSCard = {
          id: 'card-1',
          blockId: 'block-1',
          type: 'item',
          due: now - 1000,
          skipped: true,
        } as FSRSCard;
        
        // skipUntil 未到期的卡片
        const skipUntilCard: FSRSCard = {
          id: 'card-2',
          blockId: 'block-2',
          type: 'item',
          due: now - 1000,
          skipped: false,
          skipUntil: now + 1000,
        } as FSRSCard;
        
        // 正常卡片
        const normalCard: FSRSCard = {
          id: 'card-3',
          blockId: 'block-3',
          type: 'item',
          due: now - 1000,
          skipped: false,
        } as FSRSCard;
        
        // 设置 mock
        vi.mocked(mockDeps.storage.getCardByBlockId)
          .mockImplementation((blockId: string) => {
            if (blockId === 'block-1') return skippedCard;
            if (blockId === 'block-2') return skipUntilCard;
            if (blockId === 'block-3') return normalCard;
            return null;
          });
        
        // 触发菜单生成
        handler.handleBlockIconClick({
          detail: {
            menu: mockMenu,
            blockElements: [mockElement1, mockElement2, mockElement3],
          },
        });
        
        // 获取生成的子菜单
        const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
        const submenu = mainMenuItem.submenu;
        
        // 验证总数量：3 张（包含所有卡片）
        // 验证到期数量：1 张（只有 normalCard）
        expect(submenu[0].label).toContain('(1/3)');
        expect(submenu[1].label).toContain('(3)');
      });
      
      it('应该正确处理不同卡片类型（Item vs Topic）', () => {
        // 准备测试数据
        const mockElement1 = document.createElement('div');
        mockElement1.setAttribute('data-node-id', 'block-1');
        
        const mockElement2 = document.createElement('div');
        mockElement2.setAttribute('data-node-id', 'block-2');
        
        const mockElement3 = document.createElement('div');
        mockElement3.setAttribute('data-node-id', 'block-3');
        
        const now = Date.now();
        
        // Item 卡片
        const itemCard1: FSRSCard = {
          id: 'card-1',
          blockId: 'block-1',
          type: 'item',
          due: now - 1000,
          skipped: false,
        } as FSRSCard;
        
        const itemCard2: FSRSCard = {
          id: 'card-2',
          blockId: 'block-2',
          type: 'item',
          due: now + 1000,
          skipped: false,
        } as FSRSCard;
        
        // Topic 卡片
        const topicCard: FSRSCard = {
          id: 'card-3',
          blockId: 'block-3',
          type: 'topic',
          due: now - 1000,
          skipped: false,
        } as FSRSCard;
        
        // 设置 mock
        vi.mocked(mockDeps.storage.getCardByBlockId)
          .mockImplementation((blockId: string) => {
            if (blockId === 'block-1') return itemCard1;
            if (blockId === 'block-2') return itemCard2;
            if (blockId === 'block-3') return topicCard;
            return null;
          });
        
        // 触发菜单生成
        handler.handleBlockIconClick({
          detail: {
            menu: mockMenu,
            blockElements: [mockElement1, mockElement2, mockElement3],
          },
        });
        
        // 获取生成的子菜单
        const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
        const submenu = mainMenuItem.submenu;
        
        // 提取练习：只显示 Item 卡片（2 张）
        expect(submenu[0].label).toContain('提取练习');
        expect(submenu[0].label).toContain('(1/2)'); // 1 张到期，总共 2 张 Item
        expect(submenu[1].label).toContain('(2)');
        
        // 渐进学习：显示所有卡片（3 张）
        expect(submenu[3].label).toContain('渐进学习');
        expect(submenu[3].label).toContain('(2/3)'); // 2 张到期，总共 3 张
        expect(submenu[4].label).toContain('(3)');
        
        // 刻意练习：显示所有卡片（3 张）
        expect(submenu[6].label).toContain('刻意练习');
        expect(submenu[6].label).toContain('(3)');
      });
    });
    
    describe('菜单标签格式', () => {
      it('应该使用正确的格式："提取练习 - 到期 (X/Y)"', () => {
        // 准备测试数据
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-node-id', 'block-1');
        
        const now = Date.now();
        const card: FSRSCard = {
          id: 'card-1',
          blockId: 'block-1',
          type: 'item',
          due: now - 1000,
          skipped: false,
        } as FSRSCard;
        
        // 设置 mock
        vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
        
        // 触发菜单生成
        handler.handleBlockIconClick({
          detail: {
            menu: mockMenu,
            blockElements: [mockElement],
          },
        });
        
        // 获取生成的子菜单
        const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
        const submenu = mainMenuItem.submenu;
        
        // 验证格式
        expect(submenu[0].label).toMatch(/提取练习.*到期.*\(1\/1\)/);
      });
      
      it('应该使用正确的格式："提取练习 - 全部 (Y)"', () => {
        // 准备测试数据
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-node-id', 'block-1');
        
        const card: FSRSCard = {
          id: 'card-1',
          blockId: 'block-1',
          type: 'item',
          due: Date.now(),
          skipped: false,
        } as FSRSCard;
        
        // 设置 mock
        vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
        
        // 触发菜单生成
        handler.handleBlockIconClick({
          detail: {
            menu: mockMenu,
            blockElements: [mockElement],
          },
        });
        
        // 获取生成的子菜单
        const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
        const submenu = mainMenuItem.submenu;
        
        // 验证格式
        expect(submenu[1].label).toMatch(/提取练习.*全部.*\(1\)/);
      });
      
      it('应该使用正确的格式："刻意练习 - 全部 (Y)"', () => {
        // 准备测试数据
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-node-id', 'block-1');
        
        const card: FSRSCard = {
          id: 'card-1',
          blockId: 'block-1',
          type: 'item',
          due: Date.now(),
          skipped: false,
        } as FSRSCard;
        
        // 设置 mock
        vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
        
        // 触发菜单生成
        handler.handleBlockIconClick({
          detail: {
            menu: mockMenu,
            blockElements: [mockElement],
          },
        });
        
        // 获取生成的子菜单
        const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
        const submenu = mainMenuItem.submenu;
        
        // 验证格式：刻意练习显示"全部"模式，不显示"到期"
        expect(submenu[6].label).toMatch(/刻意练习.*全部.*\(1\)/);
        expect(submenu[6].label).not.toContain('到期');
      });
    });
  });
  
  describe('菜单结构完整性', () => {
    it('应该生成完整的菜单结构', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      mockElement.setAttribute('custom-fsrs-card-id', 'card-1');
      
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        type: 'item',
        due: Date.now(),
        skipped: false,
      } as FSRSCard;
      
      // 设置 mock
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(card);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证菜单结构
      // 0-1: 提取练习（到期、全部）
      // 2: 分隔符
      // 3-4: 渐进学习（到期、全部）
      // 5: 分隔符
      // 6: 刻意练习（全部）
      // 7: 分隔符
      // 8: 神经漫游
      // 9: 分隔符
      // 10: 编辑SRS数据
      // 11: 取消闪卡
      
      expect(submenu.length).toBeGreaterThanOrEqual(12);
      
      // 验证复习入口
      expect(submenu[0].label).toContain('提取练习');
      expect(submenu[1].label).toContain('提取练习');
      expect(submenu[3].label).toContain('渐进学习');
      expect(submenu[4].label).toContain('渐进学习');
      expect(submenu[6].label).toContain('刻意练习');
      
      // 验证神经漫游
      expect(submenu[8].label).toContain('神经漫游');
      
      // 验证其他功能
      expect(submenu[10].label).toContain('编辑SRS数据');
    });
    
    it('应该在没有卡片时仍然生成菜单结构', () => {
      // 准备测试数据
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-node-id', 'block-1');
      
      // 设置 mock：没有卡片
      vi.mocked(mockDeps.storage.getCardByBlockId).mockReturnValue(null);
      
      // 触发菜单生成
      handler.handleBlockIconClick({
        detail: {
          menu: mockMenu,
          blockElements: [mockElement],
        },
      });
      
      // 获取生成的子菜单
      const mainMenuItem = mockMenu.addItem.mock.calls[0][0];
      const submenu = mainMenuItem.submenu;
      
      // 验证菜单结构仍然存在
      expect(submenu.length).toBeGreaterThan(0);
      
      // 验证复习入口仍然生成（但数量为 0）
      expect(submenu[0].label).toContain('提取练习');
      expect(submenu[0].label).toContain('(0/0)');
    });
  });
});
