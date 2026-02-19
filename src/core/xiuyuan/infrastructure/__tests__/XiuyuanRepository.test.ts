/**
 * XiuyuanRepository Integration Tests
 * 
 * @description
 * 集成测试 XiuyuanRepository 实现，验证：
 * - 数据持久化和查询
 * - 领域模型与持久化模型的转换
 * - 多数据源协调
 * - 错误处理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { XiuyuanRepository } from '../XiuyuanRepository';
import { XiuyuanStorage } from '../../storage';
import { Xiuyuan } from '../../domain/Xiuyuan';
import { XiuyuanId } from '../../domain/XiuyuanId';
import { BlockId } from '../../domain/BlockId';
import { TemplateId } from '../../domain/TemplateId';
import { CardFace } from '../../domain/CardFace';
import { Priority } from '../../domain/Priority';

// Mock Plugin
const mockPlugin = {
  setBlockAttrs: vi.fn().mockResolvedValue(undefined),
  addRiffCards: vi.fn().mockResolvedValue(undefined),
  removeRiffCards: vi.fn().mockResolvedValue(undefined),
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(null),
} as any;

describe('XiuyuanRepository', () => {
  let storage: XiuyuanStorage;
  let repository: XiuyuanRepository;

  beforeEach(async () => {
    // 重置 mocks
    vi.clearAllMocks();
    
    // 创建新的 storage 和 repository
    storage = new XiuyuanStorage(mockPlugin);
    await storage.load();
    repository = new XiuyuanRepository(storage, mockPlugin);
  });

  describe('save', () => {
    it('should save a Xiuyuan to storage', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      expect(blockIdResult.ok).toBe(true);
      expect(templateIdResult.ok).toBe(true);
      expect(faceResult.ok).toBe(true);
      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      // Act
      const result = await repository.save(xiuyuanResult.value);

      // Assert
      expect(result.ok).toBe(true);
      
      // 验证数据已保存到 storage
      const saved = storage.getXiuyuan(xiuyuanResult.value.getId().getValue());
      expect(saved).toBeDefined();
      expect(saved?.blockIDs).toContain('20210808180117-6v0mkxr');
      expect(saved?.templateID).toBe('basic');
    });

    it('should write block attributes when saving', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      if (!xiuyuanResult.ok) return;

      // Act
      await repository.save(xiuyuanResult.value);

      // Assert
      expect(mockPlugin.setBlockAttrs).toHaveBeenCalledWith(
        '20210808180117-6v0mkxr',
        expect.objectContaining({
          'custom-xiuyuan-id': xiuyuanResult.value.getId().getValue(),
          'custom-xiuyuan-template': 'basic'
        })
      );
    });

    it('should handle save errors gracefully', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      if (!xiuyuanResult.ok) return;

      // Mock save failure
      mockPlugin.saveData.mockRejectedValueOnce(new Error('Save failed'));

      // Act
      const result = await repository.save(xiuyuanResult.value);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Save failed');
      }
    });
  });

  describe('findById', () => {
    it('should find a Xiuyuan by ID', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      if (!xiuyuanResult.ok) return;

      await repository.save(xiuyuanResult.value);

      // Act
      const result = await repository.findById(xiuyuanResult.value.getId());

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).not.toBeNull();
      expect(result.value?.getId().equals(xiuyuanResult.value.getId())).toBe(true);
      expect(result.value?.getBlockIDs()).toHaveLength(1);
      expect(result.value?.getBlockIDs()[0].getValue()).toBe('20210808180117-6v0mkxr');
    });

    it('should return null when Xiuyuan not found', async () => {
      // Arrange
      const idResult = XiuyuanId.create('non-existent-id');
      if (!idResult.ok) return;

      // Act
      const result = await repository.findById(idResult.value);

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });

  describe('findByBlockId', () => {
    it('should find Xiuyuans by block ID', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      if (!xiuyuanResult.ok) return;

      await repository.save(xiuyuanResult.value);

      // Act
      const result = await repository.findByBlockId(blockIdResult.value);

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].getId().equals(xiuyuanResult.value.getId())).toBe(true);
    });

    it('should return empty array when no Xiuyuans found', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      if (!blockIdResult.ok) return;

      // Act
      const result = await repository.findByBlockId(blockIdResult.value);

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(0);
    });
  });

  describe('findAll', () => {
    it('should find all Xiuyuans', async () => {
      // Arrange
      const blockId1Result = BlockId.create('20210808180117-6v0mkxr');
      const blockId2Result = BlockId.create('20210808180117-7w1nlys');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockId1Result.ok || !blockId2Result.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuan1Result = Xiuyuan.create({
        blockIDs: [blockId1Result.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });

      const xiuyuan2Result = Xiuyuan.create({
        blockIDs: [blockId2Result.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });

      if (!xiuyuan1Result.ok || !xiuyuan2Result.ok) return;

      await repository.save(xiuyuan1Result.value);
      await repository.save(xiuyuan2Result.value);

      // Act
      const result = await repository.findAll();

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('should delete a Xiuyuan', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      if (!xiuyuanResult.ok) return;

      await repository.save(xiuyuanResult.value);

      // Act
      const deleteResult = await repository.delete(xiuyuanResult.value);

      // Assert
      expect(deleteResult.ok).toBe(true);

      // 验证已从 storage 删除
      const saved = storage.getXiuyuan(xiuyuanResult.value.getId().getValue());
      expect(saved).toBeUndefined();

      // 验证 findById 返回 null
      const findResult = await repository.findById(xiuyuanResult.value.getId());
      expect(findResult.ok).toBe(true);
      if (!findResult.ok) return;
      expect(findResult.value).toBeNull();
    });

    it('should clear block attributes when deleting', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      if (!xiuyuanResult.ok) return;

      await repository.save(xiuyuanResult.value);
      vi.clearAllMocks(); // 清除之前的调用

      // Act
      await repository.delete(xiuyuanResult.value);

      // Assert
      expect(mockPlugin.setBlockAttrs).toHaveBeenCalledWith(
        '20210808180117-6v0mkxr',
        expect.objectContaining({
          'custom-xiuyuan-id': '',
          'custom-xiuyuan-template': ''
        })
      );
    });

    it('should return error when deleting non-existent Xiuyuan', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      if (!xiuyuanResult.ok) return;

      // Act (不保存，直接删除)
      const result = await repository.delete(xiuyuanResult.value);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });
  });

  describe('saveMany', () => {
    it('should save multiple Xiuyuans', async () => {
      // Arrange
      const blockId1Result = BlockId.create('20210808180117-6v0mkxr');
      const blockId2Result = BlockId.create('20210808180117-7w1nlys');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockId1Result.ok || !blockId2Result.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuan1Result = Xiuyuan.create({
        blockIDs: [blockId1Result.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });

      const xiuyuan2Result = Xiuyuan.create({
        blockIDs: [blockId2Result.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });

      if (!xiuyuan1Result.ok || !xiuyuan2Result.ok) return;

      // Act
      const result = await repository.saveMany([xiuyuan1Result.value, xiuyuan2Result.value]);

      // Assert
      expect(result.ok).toBe(true);

      const findAllResult = await repository.findAll();
      expect(findAllResult.ok).toBe(true);
      if (!findAllResult.ok) return;
      expect(findAllResult.value).toHaveLength(2);
    });
  });

  describe('deleteMany', () => {
    it('should delete multiple Xiuyuans', async () => {
      // Arrange
      const blockId1Result = BlockId.create('20210808180117-6v0mkxr');
      const blockId2Result = BlockId.create('20210808180117-7w1nlys');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockId1Result.ok || !blockId2Result.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuan1Result = Xiuyuan.create({
        blockIDs: [blockId1Result.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });

      const xiuyuan2Result = Xiuyuan.create({
        blockIDs: [blockId2Result.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });

      if (!xiuyuan1Result.ok || !xiuyuan2Result.ok) return;

      await repository.saveMany([xiuyuan1Result.value, xiuyuan2Result.value]);

      // Act
      const deleteResult = await repository.deleteMany([xiuyuan1Result.value, xiuyuan2Result.value]);

      // Assert
      expect(deleteResult.ok).toBe(true);

      const findAllResult = await repository.findAll();
      expect(findAllResult.ok).toBe(true);
      if (!findAllResult.ok) return;
      expect(findAllResult.value).toHaveLength(0);
    });
  });

  describe('data conversion', () => {
    it('should correctly convert domain model to persistence model and back', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design',
        questionBlockId: '20210808180117-6v0mkxr',
        answerBlockId: '20210808180117-7w1nlys'
      });
      const priorityResult = Priority.create(5);

      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok || !priorityResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value],
        priority: priorityResult.value,
        meta: { custom: 'data' }
      });
      if (!xiuyuanResult.ok) return;

      // Act
      const saveResult = await repository.save(xiuyuanResult.value);
      expect(saveResult.ok).toBe(true);
      
      const result = await repository.findById(xiuyuanResult.value.getId());

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).not.toBeNull();
      
      const restored = result.value!;
      expect(restored.getId().equals(xiuyuanResult.value.getId())).toBe(true);
      expect(restored.getBlockIDs()).toHaveLength(1);
      expect(restored.getBlockIDs()[0].getValue()).toBe('20210808180117-6v0mkxr');
      expect(restored.getTemplateID().getValue()).toBe('basic');
      expect(restored.getFaces()).toHaveLength(1);
      expect(restored.getFaces()[0].question).toBe('What is DDD?');
      expect(restored.getFaces()[0].answer).toBe('Domain-Driven Design');
      expect(restored.getPriority().getValue()).toBe(5);
      expect(restored.getMeta().custom).toBe('data');
    });

    it('should preserve cards when converting', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });

      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      if (!xiuyuanResult.ok) return;

      // 创建卡片
      const cardResult = xiuyuanResult.value.createCard(0);
      expect(cardResult.ok).toBe(true);

      // Act
      await repository.save(xiuyuanResult.value);
      const result = await repository.findById(xiuyuanResult.value.getId());

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).not.toBeNull();
      
      const restored = result.value!;
      expect(restored.getCards()).toHaveLength(1);
      expect(restored.getCards()[0].getFaceIndex()).toBe(0);
    });
  });
});
