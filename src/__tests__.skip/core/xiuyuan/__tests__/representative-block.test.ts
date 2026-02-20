/**
 * Representative Block Selection Tests
 * 
 * @description
 * 测试代表块选择逻辑，验证不同模版类型的代表块选择规则。
 * 
 * **测试覆盖**：
 * - builtin-list-item: 选择父列表项（第一个块）
 * - builtin-concept-descriptor: 选择描述符块
 * - builtin-bidirectional: 选择第一个块
 * - 其他模版: 默认选择第一个块
 * 
 * **验证需求**: 3.1.2 - 代表块选择规则
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { XiuyuanStorage } from '../storage';
import { XiuyuanService } from '../service';
import type { ICardTemplate } from '../types';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';

// ============ Mock Setup ============

/**
 * 创建 Mock StorageManager
 */
function createMockStorageManager(): StorageManager {
  const cards = new Map<string, FSRSCard>();
  
  return {
    getCard: (id: string) => cards.get(id),
    setCard: (card: FSRSCard) => cards.set(card.id, card),
    removeCard: (id: string) => cards.delete(id),
    saveCards: async () => {},
    getAllCards: () => Array.from(cards.values()),
  } as any;
}

/**
 * 创建列表模版
 */
function createListTemplate(): ICardTemplate {
  return {
    id: 'builtin-list-item',
    name: '列表项',
    description: '列表项卡片',
    fields: [
      { name: 'question', description: '问题' },
      { name: 'answer', description: '答案' }
    ],
    cardRules: [
      {
        typeMarker: 'list-item',
        frontFields: ['question'],
        backFields: ['answer']
      }
    ]
  };
}

/**
 * 创建概念-描述符模版
 */
function createConceptDescriptorTemplate(): ICardTemplate {
  return {
    id: 'builtin-concept-descriptor',
    name: '概念-描述符',
    description: '概念描述卡片',
    fields: [
      { name: 'concept', description: '概念' },
      { name: 'descriptor', description: '描述符' }
    ],
    cardRules: [
      {
        typeMarker: 'concept-descriptor',
        frontFields: ['concept'],
        backFields: ['descriptor']
      }
    ]
  };
}

/**
 * 创建双向卡片模版
 */
function createBidirectionalTemplate(): ICardTemplate {
  return {
    id: 'builtin-bidirectional',
    name: '双向卡片',
    description: '双向问答卡片',
    fields: [
      { name: 'front', description: '正面' },
      { name: 'back', description: '反面' }
    ],
    cardRules: [
      {
        typeMarker: 'forward',
        frontFields: ['front'],
        backFields: ['back']
      },
      {
        typeMarker: 'backward',
        frontFields: ['back'],
        backFields: ['front']
      }
    ]
  };
}

// ============ Tests ============

describe('代表块选择逻辑', () => {
  let storage: XiuyuanStorage;
  let storageManager: StorageManager;
  let service: XiuyuanService;

  beforeEach(() => {
    storage = new XiuyuanStorage('test-plugin');
    storageManager = createMockStorageManager();
    service = new XiuyuanService(storage, storageManager);
  });

  describe('selectRepresentativeBlock', () => {
    it('应该为 builtin-list-item 选择第一个块（父列表项）', () => {
      // 使用类型断言访问私有方法进行测试
      const serviceAny = service as any;
      const blockIDs = ['parent-block', 'child1-block', 'child2-block'];
      const templateID = 'builtin-list-item';
      const fieldMapping = { question: 'parent-block', answer: 'child1-block' };

      const result = serviceAny.selectRepresentativeBlock(blockIDs, templateID, fieldMapping);

      expect(result).toBe('parent-block');
    });

    it('应该为 builtin-concept-descriptor 选择描述符块', () => {
      const serviceAny = service as any;
      const blockIDs = ['concept-block', 'descriptor-block'];
      const templateID = 'builtin-concept-descriptor';
      const fieldMapping = { concept: 'concept-block', descriptor: 'descriptor-block' };

      const result = serviceAny.selectRepresentativeBlock(blockIDs, templateID, fieldMapping);

      expect(result).toBe('descriptor-block');
    });

    it('应该为 builtin-concept-descriptor 在没有 descriptor 字段时选择第一个块', () => {
      const serviceAny = service as any;
      const blockIDs = ['concept-block', 'other-block'];
      const templateID = 'builtin-concept-descriptor';
      const fieldMapping = { concept: 'concept-block' };

      const result = serviceAny.selectRepresentativeBlock(blockIDs, templateID, fieldMapping);

      expect(result).toBe('concept-block');
    });

    it('应该为 builtin-bidirectional 选择第一个块', () => {
      const serviceAny = service as any;
      const blockIDs = ['front-block', 'back-block'];
      const templateID = 'builtin-bidirectional';
      const fieldMapping = { front: 'front-block', back: 'back-block' };

      const result = serviceAny.selectRepresentativeBlock(blockIDs, templateID, fieldMapping);

      expect(result).toBe('front-block');
    });

    it('应该为其他模版选择第一个块', () => {
      const serviceAny = service as any;
      const blockIDs = ['block1', 'block2', 'block3'];
      const templateID = 'custom-template';
      const fieldMapping = { field1: 'block1', field2: 'block2' };

      const result = serviceAny.selectRepresentativeBlock(blockIDs, templateID, fieldMapping);

      expect(result).toBe('block1');
    });

    it('应该在 blockIDs 为空时抛出错误', () => {
      const serviceAny = service as any;
      const blockIDs: string[] = [];
      const templateID = 'builtin-list-item';
      const fieldMapping = {};

      expect(() => {
        serviceAny.selectRepresentativeBlock(blockIDs, templateID, fieldMapping);
      }).toThrow('blockIDs cannot be empty');
    });
  });
});
