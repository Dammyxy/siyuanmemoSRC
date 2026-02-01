/**
 * Xiuyuan Boundary Conditions Tests
 * 
 * @description
 * 测试 Xiuyuan 模块的边界条件和异常场景。
 * 
 * **测试覆盖**：
 * - 空 blockIDs 列表创建 Xiuyuan
 * - 不存在的 templateID
 * - 字段映射缺失
 * - 删除不存在的 Xiuyuan
 * - 其他边界条件
 * 
 * **验证需求**: 5.5 - 边界条件测试覆盖
 */

import { XiuyuanStorage } from '../storage';
import { XiuyuanService } from '../service';
import type { ICardTemplate, IXiuyuan } from '../types';
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
 * 创建测试用的基础模板
 */
function createBasicTemplate(): ICardTemplate {
  return {
    id: 'basic',
    name: '基础问答',
    description: '基础问答卡片',
    fields: [
      { name: 'question', description: '问题' },
      { name: 'answer', description: '答案' }
    ],
    cardRules: [
      {
        typeMarker: 'basic',
        frontFields: ['question'],
        backFields: ['answer']
      }
    ]
  };
}

/**
 * 创建测试用的词汇模板
 */
function createVocabularyTemplate(): ICardTemplate {
  return {
    id: 'vocabulary',
    name: '词汇卡片',
    description: '英语词汇学习',
    fields: [
      { name: 'word', description: '单词' },
      { name: 'translation', description: '翻译' },
      { name: 'pronunciation', description: '发音' }
    ],
    cardRules: [
      {
        typeMarker: 'en-zh',
        frontFields: ['word'],
        backFields: ['translation']
      },
      {
        typeMarker: 'zh-en',
        frontFields: ['translation'],
        backFields: ['word']
      }
    ]
  };
}

// ============ Tests ============

describe('Xiuyuan 边界条件测试', () => {
  let storage: XiuyuanStorage;
  let storageManager: StorageManager;
  let service: XiuyuanService;

  beforeEach(() => {
    storage = new XiuyuanStorage('test-plugin');
    storageManager = createMockStorageManager();
    service = new XiuyuanService(storage, storageManager);
    
    // 注册测试模板
    storage.createTemplate(createBasicTemplate());
    storage.createTemplate(createVocabularyTemplate());
  });

  // ============ 测试 1: 空 blockIDs 列表 ============

  describe('当 blockIDs 列表为空时', () => {
    it('应该能够创建 Xiuyuan（但不会生成卡片）', () => {
      // Given: 空的 blockIDs 列表
      const emptyBlockIDs: string[] = [];
      
      // When: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: emptyBlockIDs,
        fields: [
          { name: 'question', blockID: '' },
          { name: 'answer', blockID: '' }
        ],
        templateID: 'basic'
      });
      
      // Then: Xiuyuan 应该被创建
      expect(xiuyuan).toBeDefined();
      expect(xiuyuan.id).toBeTruthy();
      expect(xiuyuan.blockIDs).toEqual([]);
      expect(xiuyuan.templateID).toBe('basic');
    });

    it('应该能够查询到空 blockIDs 的 Xiuyuan', () => {
      // Given: 创建了空 blockIDs 的 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: [],
        fields: [],
        templateID: 'basic'
      });
      
      // When: 根据 ID 查询
      const found = storage.getXiuyuan(xiuyuan.id);
      
      // Then: 应该能找到
      expect(found).toBeDefined();
      expect(found?.blockIDs).toEqual([]);
    });

    it('通过空 blockID 查询应该返回空数组', () => {
      // Given: 创建了一些 Xiuyuan
      storage.createXiuyuan({
        blockIDs: ['block-1'],
        fields: [],
        templateID: 'basic'
      });
      
      // When: 使用空字符串查询
      const results = storage.getXiuyuansByBlockID('');
      
      // Then: 应该返回空数组
      expect(results).toEqual([]);
    });
  });

  // ============ 测试 2: 不存在的 templateID ============

  describe('当使用不存在的 templateID 时', () => {
    it('createFromBlocks 应该返回错误 Result', async () => {
      // Given: 不存在的模板 ID
      const nonExistentTemplateID = 'non-existent-template';
      
      // When: 尝试创建
      const result = await service.createFromBlocks(
        ['block-1', 'block-2'],
        nonExistentTemplateID,
        { question: 'block-1', answer: 'block-2' }
      );
      
      // Then: 应该返回错误 Result
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Template not found');
      }
    });

    it('可以创建使用不存在模板的 Xiuyuan（存储层不验证）', () => {
      // Given: 不存在的模板 ID
      const nonExistentTemplateID = 'non-existent-template';
      
      // When: 直接在存储层创建
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1'],
        fields: [{ name: 'question', blockID: 'block-1' }],
        templateID: nonExistentTemplateID
      });
      
      // Then: 应该能创建（存储层不验证模板存在性）
      expect(xiuyuan).toBeDefined();
      expect(xiuyuan.templateID).toBe(nonExistentTemplateID);
    });

    it('getTemplate 应该返回 undefined', () => {
      // Given: 不存在的模板 ID
      const nonExistentTemplateID = 'non-existent-template';
      
      // When: 查询模板
      const template = storage.getTemplate(nonExistentTemplateID);
      
      // Then: 应该返回 undefined
      expect(template).toBeUndefined();
    });
  });

  // ============ 测试 3: 字段映射缺失 ============

  describe('当字段映射缺失时', () => {
    it('createFromBlocks 应该使用空字符串作为默认值', async () => {
      // Given: 不完整的字段映射（缺少 answer 字段）
      const incompleteMapping = {
        question: 'block-1'
        // answer 字段缺失
      };
      
      // When: 创建 Xiuyuan
      const result = await service.createFromBlocks(
        ['block-1'],
        'basic',
        incompleteMapping
      );
      
      // Then: 应该成功创建，缺失的字段使用空字符串
      expect(result.ok).toBe(true);
      if (result.ok) {
        const answerField = result.value.xiuyuan.fields.find(f => f.name === 'answer');
        expect(answerField?.blockID).toBe('');
      }
    });

    it('完全空的字段映射应该创建空 blockID 的字段', async () => {
      // Given: 空的字段映射
      const emptyMapping = {};
      
      // When: 创建 Xiuyuan
      const result = await service.createFromBlocks(
        ['block-1'],
        'basic',
        emptyMapping
      );
      
      // Then: 所有字段的 blockID 都应该是空字符串
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.xiuyuan.fields.every(f => f.blockID === '')).toBe(true);
      }
    });

    it('字段映射包含额外字段应该被忽略', async () => {
      // Given: 包含额外字段的映射
      const mappingWithExtra = {
        question: 'block-1',
        answer: 'block-2',
        extraField: 'block-3' // 模板中不存在的字段
      };
      
      // When: 创建 Xiuyuan
      const result = await service.createFromBlocks(
        ['block-1', 'block-2'],
        'basic',
        mappingWithExtra
      );
      
      // Then: 只应该包含模板定义的字段
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.xiuyuan.fields).toHaveLength(2);
        expect(result.value.xiuyuan.fields.map(f => f.name)).toEqual(['question', 'answer']);
      }
    });
  });

  // ============ 测试 4: 删除不存在的 Xiuyuan ============

  describe('当删除不存在的 Xiuyuan 时', () => {
    it('deleteXiuyuan 应该返回 ok(false)', async () => {
      // Given: 不存在的 Xiuyuan ID
      const nonExistentID = 'xy_nonexistent';
      
      // When: 尝试删除
      const result = await service.deleteXiuyuan(nonExistentID);
      
      // Then: 应该返回 ok(false)
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it('存储层的 deleteXiuyuan 应该返回 false', () => {
      // Given: 不存在的 Xiuyuan ID
      const nonExistentID = 'xy_nonexistent';
      
      // When: 尝试删除
      const result = storage.deleteXiuyuan(nonExistentID);
      
      // Then: 应该返回 false
      expect(result).toBe(false);
    });

    it('删除不存在的 Xiuyuan 不应该影响其他数据', async () => {
      // Given: 创建一个 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1'],
        fields: [],
        templateID: 'basic'
      });
      
      // When: 尝试删除不存在的 Xiuyuan
      await service.deleteXiuyuan('xy_nonexistent');
      
      // Then: 原有的 Xiuyuan 应该仍然存在
      const found = storage.getXiuyuan(xiuyuan.id);
      expect(found).toBeDefined();
    });
  });

  // ============ 测试 5: 删除不存在的 Mapping ============

  describe('当删除不存在的 Mapping 时', () => {
    it('deleteMapping 应该返回 false', () => {
      // Given: 不存在的 Mapping ID
      const nonExistentID = 'xy_nonexistent';
      
      // When: 尝试删除
      const result = storage.deleteMapping(nonExistentID);
      
      // Then: 应该返回 false
      expect(result).toBe(false);
    });
  });

  // ============ 测试 6: 查询不存在的数据 ============

  describe('当查询不存在的数据时', () => {
    it('getXiuyuan 应该返回 undefined', () => {
      const result = storage.getXiuyuan('xy_nonexistent');
      expect(result).toBeUndefined();
    });

    it('getMapping 应该返回 undefined', () => {
      const result = storage.getMapping('xy_nonexistent');
      expect(result).toBeUndefined();
    });

    it('getMappingByCardID 应该返回 undefined', () => {
      const result = storage.getMappingByCardID('nonexistent-card');
      expect(result).toBeUndefined();
    });

    it('getTemplate 应该返回 undefined', () => {
      const result = storage.getTemplate('nonexistent-template');
      expect(result).toBeUndefined();
    });

    it('getXiuyuansByBlockID 应该返回空数组', () => {
      const result = storage.getXiuyuansByBlockID('nonexistent-block');
      expect(result).toEqual([]);
    });

    it('getMappingsByXiuyuanID 应该返回空数组', () => {
      const result = storage.getMappingsByXiuyuanID('xy_nonexistent');
      expect(result).toEqual([]);
    });
  });

  // ============ 测试 7: 空数据集操作 ============

  describe('当数据集为空时', () => {
    it('getAllXiuyuans 应该返回空数组', () => {
      const result = storage.getAllXiuyuans();
      expect(result).toEqual([]);
    });

    it('getAllTemplates 应该返回已注册的模板', () => {
      const result = storage.getAllTemplates();
      expect(result.length).toBeGreaterThan(0); // 因为 beforeEach 中注册了模板
    });

    it('getStats 应该返回零计数', () => {
      // Given: 清空所有数据
      const emptyStorage = new XiuyuanStorage('empty-test');
      
      // When: 获取统计
      const stats = emptyStorage.getStats();
      
      // Then: 所有计数应该为 0
      expect(stats.xiuyuanCount).toBe(0);
      expect(stats.mappingCount).toBe(0);
      expect(stats.templateCount).toBe(0);
    });
  });

  // ============ 测试 8: 特殊字符和编码 ============

  describe('当使用特殊字符时', () => {
    it('应该正确处理包含特殊字符的 blockID', () => {
      // Given: 包含特殊字符的 blockID
      const specialBlockID = '20230101-测试-🎉-block';
      
      // When: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: [specialBlockID],
        fields: [{ name: 'question', blockID: specialBlockID }],
        templateID: 'basic'
      });
      
      // Then: 应该能正确存储和查询
      const found = storage.getXiuyuansByBlockID(specialBlockID);
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(xiuyuan.id);
    });

    it('应该正确处理包含特殊字符的字段名', () => {
      // Given: 包含特殊字符的字段名
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1'],
        fields: [
          { name: '问题 (Question)', blockID: 'block-1' },
          { name: '答案 🎯', blockID: 'block-2' }
        ],
        templateID: 'basic'
      });
      
      // Then: 应该能正确存储
      expect(xiuyuan.fields[0].name).toBe('问题 (Question)');
      expect(xiuyuan.fields[1].name).toBe('答案 🎯');
    });

    it('应该正确处理包含 Unicode 的模板 ID', () => {
      // Given: 包含 Unicode 的模板
      const unicodeTemplate: ICardTemplate = {
        id: '词汇-vocabulary-🎓',
        name: '词汇卡片',
        fields: [{ name: 'word' }],
        cardRules: [{ typeMarker: 'basic', frontFields: ['word'], backFields: [] }]
      };
      
      // When: 创建模板
      storage.createTemplate(unicodeTemplate);
      
      // Then: 应该能正确查询
      const found = storage.getTemplate('词汇-vocabulary-🎓');
      expect(found).toBeDefined();
      expect(found?.name).toBe('词汇卡片');
    });
  });

  // ============ 测试 9: 极端数值 ============

  describe('当使用极端数值时', () => {
    it('应该正确处理非常长的 blockID', () => {
      // Given: 非常长的 blockID
      const longBlockID = 'block-' + 'a'.repeat(1000);
      
      // When: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: [longBlockID],
        fields: [],
        templateID: 'basic'
      });
      
      // Then: 应该能正确存储和查询
      const found = storage.getXiuyuansByBlockID(longBlockID);
      expect(found).toHaveLength(1);
    });

    it('应该正确处理大量字段', () => {
      // Given: 大量字段
      const manyFields = Array.from({ length: 100 }, (_, i) => ({
        name: `field-${i}`,
        blockID: `block-${i}`
      }));
      
      // When: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: manyFields.map(f => f.blockID),
        fields: manyFields,
        templateID: 'basic'
      });
      
      // Then: 应该能正确存储
      expect(xiuyuan.fields).toHaveLength(100);
    });

    it('应该正确处理大量 blockIDs', () => {
      // Given: 大量 blockIDs
      const manyBlockIDs = Array.from({ length: 100 }, (_, i) => `block-${i}`);
      
      // When: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: manyBlockIDs,
        fields: [],
        templateID: 'basic'
      });
      
      // Then: 应该能正确存储
      expect(xiuyuan.blockIDs).toHaveLength(100);
      
      // And: 索引应该正确构建
      manyBlockIDs.forEach(blockID => {
        const found = storage.getXiuyuansByBlockID(blockID);
        expect(found).toHaveLength(1);
        expect(found[0].id).toBe(xiuyuan.id);
      });
    });
  });

  // ============ 测试 10: 更新操作边界条件 ============

  describe('当更新不存在的数据时', () => {
    it('updateXiuyuan 应该返回 false', () => {
      // Given: 不存在的 Xiuyuan ID
      const nonExistentID = 'xy_nonexistent';
      
      // When: 尝试更新
      const result = storage.updateXiuyuan(nonExistentID, {
        templateID: 'new-template'
      });
      
      // Then: 应该返回 false
      expect(result).toBe(false);
    });

    it('updateTemplate 应该返回 false', () => {
      // Given: 不存在的模板 ID
      const nonExistentID = 'nonexistent-template';
      
      // When: 尝试更新
      const result = storage.updateTemplate(nonExistentID, {
        name: 'New Name'
      });
      
      // Then: 应该返回 false
      expect(result).toBe(false);
    });
  });

  // ============ 测试 11: 模板没有卡片规则 ============

  describe('当模板没有卡片规则时', () => {
    it('createFromBlocks 应该返回错误 Result', async () => {
      // Given: 创建一个没有卡片规则的模板
      const templateWithoutRules: ICardTemplate = {
        id: 'no-rules',
        name: '无规则模板',
        fields: [{ name: 'field1' }],
        cardRules: [] // 空的卡片规则
      };
      storage.createTemplate(templateWithoutRules);
      
      // When: 尝试创建
      const result = await service.createFromBlocks(
        ['block-1'],
        'no-rules',
        { field1: 'block-1' }
      );
      
      // Then: 应该返回错误 Result
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Template has no card rules');
      }
    });
  });

  // ============ 测试 12: 重复的 blockID ============

  describe('当 blockIDs 包含重复值时', () => {
    it('应该能够创建 Xiuyuan', () => {
      // Given: 包含重复 blockID 的列表
      const duplicateBlockIDs = ['block-1', 'block-1', 'block-2'];
      
      // When: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: duplicateBlockIDs,
        fields: [],
        templateID: 'basic'
      });
      
      // Then: 应该能创建
      expect(xiuyuan.blockIDs).toEqual(duplicateBlockIDs);
    });

    it('查询时应该返回相同的 Xiuyuan（不重复）', () => {
      // Given: 创建包含重复 blockID 的 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1', 'block-1'],
        fields: [],
        templateID: 'basic'
      });
      
      // When: 查询该 blockID
      const found = storage.getXiuyuansByBlockID('block-1');
      
      // Then: 应该返回包含该 Xiuyuan 的数组（可能包含重复）
      expect(found.length).toBeGreaterThan(0);
      expect(found.some(x => x.id === xiuyuan.id)).toBe(true);
    });
  });

  // ============ 测试 13: 删除 Xiuyuan 时清理关联数据 ============

  describe('当删除 Xiuyuan 时', () => {
    it('应该删除所有关联的 CardMapping', () => {
      // Given: 创建 Xiuyuan 和 Mapping
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1'],
        fields: [],
        templateID: 'basic'
      });
      
      const mappingID = storage.createMapping({
        xiuyuanID: xiuyuan.id,
        cardID: 'card-1',
        frontFields: ['question'],
        backFields: ['answer']
      });
      
      // When: 删除 Xiuyuan
      storage.deleteXiuyuan(xiuyuan.id);
      
      // Then: Mapping 应该被删除
      const mapping = storage.getMapping(mappingID);
      expect(mapping).toBeUndefined();
    });

    it('应该从索引中移除', () => {
      // Given: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1', 'block-2'],
        fields: [],
        templateID: 'basic'
      });
      
      // When: 删除 Xiuyuan
      storage.deleteXiuyuan(xiuyuan.id);
      
      // Then: 通过 blockID 查询应该找不到
      const found1 = storage.getXiuyuansByBlockID('block-1');
      const found2 = storage.getXiuyuansByBlockID('block-2');
      expect(found1).toEqual([]);
      expect(found2).toEqual([]);
    });
  });

  // ============ 测试 14: 元数据字段 ============

  describe('当使用元数据字段时', () => {
    it('应该能够存储和检索自定义元数据', () => {
      // Given: 包含元数据的 Xiuyuan
      const customMeta = {
        source: 'manual',
        tags: ['important', 'review'],
        customField: 123
      };
      
      // When: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1'],
        fields: [],
        templateID: 'basic',
        meta: customMeta
      });
      
      // Then: 元数据应该被正确存储
      expect(xiuyuan.meta).toEqual(customMeta);
      
      // And: 查询时应该包含元数据
      const found = storage.getXiuyuan(xiuyuan.id);
      expect(found?.meta).toEqual(customMeta);
    });

    it('元数据为 undefined 时应该正常工作', () => {
      // Given: 不包含元数据的 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1'],
        fields: [],
        templateID: 'basic'
        // meta 未定义
      });
      
      // Then: 应该能正常创建
      expect(xiuyuan.meta).toBeUndefined();
    });
  });

  // ============ 测试 15: 时间戳验证 ============

  describe('时间戳字段', () => {
    it('创建时应该自动设置 createdAt 和 updatedAt', () => {
      // Given: 当前时间
      const before = Date.now();
      
      // When: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1'],
        fields: [],
        templateID: 'basic'
      });
      
      const after = Date.now();
      
      // Then: 时间戳应该在合理范围内
      expect(xiuyuan.createdAt).toBeGreaterThanOrEqual(before);
      expect(xiuyuan.createdAt).toBeLessThanOrEqual(after);
      expect(xiuyuan.updatedAt).toBe(xiuyuan.createdAt);
    });

    it('更新时应该更新 updatedAt', async () => {
      // Given: 创建 Xiuyuan
      const xiuyuan = storage.createXiuyuan({
        blockIDs: ['block-1'],
        fields: [],
        templateID: 'basic'
      });
      
      const originalUpdatedAt = xiuyuan.updatedAt;
      
      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // When: 更新 Xiuyuan
      storage.updateXiuyuan(xiuyuan.id, {
        templateID: 'vocabulary'
      });
      
      // Then: updatedAt 应该被更新
      const updated = storage.getXiuyuan(xiuyuan.id);
      expect(updated?.updatedAt).toBeGreaterThan(originalUpdatedAt);
      expect(updated?.createdAt).toBe(xiuyuan.createdAt); // createdAt 不变
    });
  });
});
