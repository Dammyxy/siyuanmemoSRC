/**
 * QuickCardRepository 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuickCardRepository } from '../QuickCardRepository';
import { SiyuanBlockAdapter } from '../SiyuanBlockAdapter';
import type { SiyuanBlock } from '../../domain/types';

describe('QuickCardRepository', () => {
  let repository: QuickCardRepository;
  let mockAdapter: SiyuanBlockAdapter;

  beforeEach(() => {
    mockAdapter = {
      getBlock: vi.fn(),
    } as any;
    repository = new QuickCardRepository(mockAdapter);
  });

  describe('loadCard', () => {
    it('should load basic card with >> symbol', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '什么是 DDD？ >> 领域驱动设计',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card).not.toBeNull();
      expect(card?.type).toBe('basic');
      expect(card?.blockId).toBe('20230101120000-abcdefg');
      expect(card?.metadata.symbol).toBe('>>');
    });

    it('should load basic card with << symbol', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '领域驱动设计 << 什么是 DDD？',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card).not.toBeNull();
      expect(card?.type).toBe('basic');
      expect(card?.metadata.symbol).toBe('<<');
    });

    it('should load basic card with <> symbol', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: 'DDD <> Domain-Driven Design',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card).not.toBeNull();
      expect(card?.type).toBe('basic');
      expect(card?.metadata.symbol).toBe('<>');
    });

    it('should load concept card with :: symbol', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: 'DDD::领域驱动设计，一种软件开发方法论',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card).not.toBeNull();
      expect(card?.type).toBe('concept');
      expect(card?.metadata.symbol).toBe('::');
    });

    it('should load descriptor card with ;; symbol', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '优点;;易于维护和扩展',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card).not.toBeNull();
      expect(card?.type).toBe('descriptor');
      expect(card?.metadata.symbol).toBe(';;');
    });

    it('should load cloze card with {{}} symbol', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: 'DDD 的核心是{{领域模型}}和{{通用语言}}',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card).not.toBeNull();
      expect(card?.type).toBe('cloze');
      expect(card?.metadata.symbol).toBe('{{}}');
    });

    it('should load multiLine card with >>> symbol', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '>>> DDD 的四层架构\n- 表现层\n- 应用层\n- 领域层\n- 基础设施层',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card).not.toBeNull();
      expect(card?.type).toBe('multiLine');
      expect(card?.metadata.symbol).toBe('>>>');
    });

    it('should return null for non-quick-card block', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '这是一个普通的块内容',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card).toBeNull();
    });

    it('should return null when block not found', async () => {
      vi.mocked(mockAdapter.getBlock).mockResolvedValue(null);

      const card = await repository.loadCard('nonexistent-block-id');

      expect(card).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockAdapter.getBlock).mockRejectedValue(new Error('Network error'));

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card).toBeNull();
    });

    it('should detect card type with correct priority', async () => {
      // >>> has higher priority than >>
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '>>> 问题 >> 答案',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card?.type).toBe('multiLine');
      expect(card?.metadata.symbol).toBe('>>>');
    });

    it('should include parentBlockId in metadata', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '什么是 DDD？ >> 领域驱动设计',
        parentID: '20230101110000-parent',
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card?.metadata.parentBlockId).toBe('20230101110000-parent');
    });
  });

  describe('Xiuyuan template detection', () => {
    it('should not use Xiuyuan template when config is disabled', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '优点;;易于维护和扩展',
        parentID: '20230101110000-parent',
      };

      const mockParentBlock: SiyuanBlock = {
        id: '20230101110000-parent',
        content: 'DDD::领域驱动设计',
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock)
        .mockResolvedValueOnce(mockBlock)
        .mockResolvedValueOnce(mockParentBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      // Config is disabled by default, so isXiuyuanTemplate should be false
      expect(card?.metadata.isXiuyuanTemplate).toBe(false);
    });

    it('should not use Xiuyuan template when parent block does not exist', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '优点;;易于维护和扩展',
        parentID: undefined, // No parent
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card?.metadata.isXiuyuanTemplate).toBe(false);
    });

    it('should not use Xiuyuan template for non-descriptor cards', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '什么是 DDD？ >> 领域驱动设计',
        parentID: '20230101110000-parent',
      };

      vi.mocked(mockAdapter.getBlock).mockResolvedValue(mockBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      // isXiuyuanTemplate should not be set for basic cards
      expect(card?.metadata.isXiuyuanTemplate).toBeUndefined();
    });

    it('should not use Xiuyuan template when parent is not a concept card', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '优点;;易于维护和扩展',
        parentID: '20230101110000-parent',
      };

      const mockParentBlock: SiyuanBlock = {
        id: '20230101110000-parent',
        content: '这是一个普通块', // Not a concept card
        parentID: undefined,
      };

      vi.mocked(mockAdapter.getBlock)
        .mockResolvedValueOnce(mockBlock)
        .mockResolvedValueOnce(mockParentBlock);

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card?.metadata.isXiuyuanTemplate).toBe(false);
    });

    it('should not use Xiuyuan template when parent block cannot be loaded', async () => {
      const mockBlock: SiyuanBlock = {
        id: '20230101120000-abcdefg',
        content: '优点;;易于维护和扩展',
        parentID: '20230101110000-parent',
      };

      vi.mocked(mockAdapter.getBlock)
        .mockResolvedValueOnce(mockBlock)
        .mockResolvedValueOnce(null); // Parent block not found

      const card = await repository.loadCard('20230101120000-abcdefg');

      expect(card?.metadata.isXiuyuanTemplate).toBe(false);
    });
  });
});
