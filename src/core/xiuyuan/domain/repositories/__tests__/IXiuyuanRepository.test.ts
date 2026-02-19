/**
 * IXiuyuanRepository Interface Tests
 * 
 * @description
 * 测试 IXiuyuanRepository 接口的使用示例和契约。
 * 这些测试使用 Mock 实现来验证接口的正确性。
 */

import { describe, it, expect } from 'vitest';
import { IXiuyuanRepository } from '../IXiuyuanRepository';
import { Xiuyuan } from '../../Xiuyuan';
import { XiuyuanId } from '../../XiuyuanId';
import { BlockId } from '../../BlockId';
import { TemplateId } from '../../TemplateId';
import { CardFace } from '../../CardFace';
import { ok } from '../../../../../types/result';

// Mock 实现用于测试
class MockXiuyuanRepository implements IXiuyuanRepository {
  private storage = new Map<string, Xiuyuan>();

  async save(xiuyuan: Xiuyuan) {
    this.storage.set(xiuyuan.getId().getValue(), xiuyuan);
    return ok(undefined);
  }

  async findById(id: XiuyuanId) {
    const xiuyuan = this.storage.get(id.getValue());
    return ok(xiuyuan || null);
  }

  async findByBlockId(blockId: BlockId) {
    const xiuyuans = Array.from(this.storage.values()).filter(x =>
      x.getBlockIDs().some(b => b.equals(blockId))
    );
    return ok(xiuyuans);
  }

  async findAll() {
    return ok(Array.from(this.storage.values()));
  }

  async delete(xiuyuan: Xiuyuan) {
    this.storage.delete(xiuyuan.getId().getValue());
    return ok(undefined);
  }

  async saveMany(xiuyuans: Xiuyuan[]) {
    for (const xiuyuan of xiuyuans) {
      await this.save(xiuyuan);
    }
    return ok(undefined);
  }

  async deleteMany(xiuyuans: Xiuyuan[]) {
    for (const xiuyuan of xiuyuans) {
      await this.delete(xiuyuan);
    }
    return ok(undefined);
  }
}

describe('IXiuyuanRepository', () => {
  describe('save', () => {
    it('should save a Xiuyuan', async () => {
      const repo = new MockXiuyuanRepository();
      
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      expect(blockIdResult.ok).toBe(true);
      if (!blockIdResult.ok) return;

      const templateIdResult = TemplateId.create('basic');
      expect(templateIdResult.ok).toBe(true);
      if (!templateIdResult.ok) return;

      const faceResult = CardFace.create({
        question: 'What is DDD?',
        answer: 'Domain-Driven Design'
      });
      expect(faceResult.ok).toBe(true);
      if (!faceResult.ok) return;

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value]
      });
      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;

      const result = await repo.save(xiuyuanResult.value);
      expect(result.ok).toBe(true);
    });
  });

  describe('findById', () => {
    it('should find a Xiuyuan by ID', async () => {
      const repo = new MockXiuyuanRepository();
      
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

      await repo.save(xiuyuanResult.value);

      const result = await repo.findById(xiuyuanResult.value.getId());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).not.toBeNull();
      expect(result.value?.getId().equals(xiuyuanResult.value.getId())).toBe(true);
    });

    it('should return null when Xiuyuan not found', async () => {
      const repo = new MockXiuyuanRepository();
      
      const idResult = XiuyuanId.create('non-existent-id');
      if (!idResult.ok) return;

      const result = await repo.findById(idResult.value);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });

  describe('findByBlockId', () => {
    it('should find Xiuyuans by block ID', async () => {
      const repo = new MockXiuyuanRepository();
      
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

      await repo.save(xiuyuanResult.value);

      const result = await repo.findByBlockId(blockIdResult.value);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].getId().equals(xiuyuanResult.value.getId())).toBe(true);
    });

    it('should return empty array when no Xiuyuans found', async () => {
      const repo = new MockXiuyuanRepository();
      
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      if (!blockIdResult.ok) return;

      const result = await repo.findByBlockId(blockIdResult.value);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(0);
    });
  });

  describe('findAll', () => {
    it('should find all Xiuyuans', async () => {
      const repo = new MockXiuyuanRepository();
      
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

      await repo.save(xiuyuan1Result.value);
      await repo.save(xiuyuan2Result.value);

      const result = await repo.findAll();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('should delete a Xiuyuan', async () => {
      const repo = new MockXiuyuanRepository();
      
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

      await repo.save(xiuyuanResult.value);

      const deleteResult = await repo.delete(xiuyuanResult.value);
      expect(deleteResult.ok).toBe(true);

      const findResult = await repo.findById(xiuyuanResult.value.getId());
      expect(findResult.ok).toBe(true);
      if (!findResult.ok) return;
      expect(findResult.value).toBeNull();
    });
  });

  describe('saveMany', () => {
    it('should save multiple Xiuyuans', async () => {
      const repo = new MockXiuyuanRepository();
      
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

      const result = await repo.saveMany([xiuyuan1Result.value, xiuyuan2Result.value]);
      expect(result.ok).toBe(true);

      const findAllResult = await repo.findAll();
      expect(findAllResult.ok).toBe(true);
      if (!findAllResult.ok) return;
      expect(findAllResult.value).toHaveLength(2);
    });
  });

  describe('deleteMany', () => {
    it('should delete multiple Xiuyuans', async () => {
      const repo = new MockXiuyuanRepository();
      
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

      await repo.saveMany([xiuyuan1Result.value, xiuyuan2Result.value]);

      const deleteResult = await repo.deleteMany([xiuyuan1Result.value, xiuyuan2Result.value]);
      expect(deleteResult.ok).toBe(true);

      const findAllResult = await repo.findAll();
      expect(findAllResult.ok).toBe(true);
      if (!findAllResult.ok) return;
      expect(findAllResult.value).toHaveLength(0);
    });
  });
});
