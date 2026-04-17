/**
 * CreateCardUseCase - 自动模板选择测试
 * 
 * @description
 * 测试自动模板选择逻辑（Requirements 8.1-8.6）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateCardUseCase } from '../CreateCardUseCase';
import { CreateCardCommand } from '../../../commands/card/CreateCardCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { ok } from '@/types/result';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { CardCreationSiyuanPort } from '@/application/ports/CardCreationSiyuanPort';

describe('CreateCardUseCase - 自动模板选择', () => {
  let useCase: CreateCardUseCase;
  let mockRepo: IXiuyuanRepository;
  let cardCreationService: CardCreationService;
  let mockEventBus: EventBus;
  let mockSiyuanApi: CardCreationSiyuanPort;

  beforeEach(() => {
    // 创建 mock repository
    mockRepo = {
      save: vi.fn().mockResolvedValue(ok(undefined)),
      findById: vi.fn(),
      findByBlockId: vi.fn().mockResolvedValue(ok([])),
      findAll: vi.fn(),
      delete: vi.fn(),
      saveMany: vi.fn(),
      deleteMany: vi.fn()
    };

    // 创建真实的 CardCreationService
    cardCreationService = new CardCreationService();

    // 创建 mock EventBus
    mockEventBus = {
      publishAll: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as EventBus;

    mockSiyuanApi = {
      getBlockText: vi.fn().mockResolvedValue('普通内容'),
    };

    // 创建用例
    useCase = new CreateCardUseCase(mockRepo, cardCreationService, mockEventBus, {
      siyuanApi: mockSiyuanApi,
    });
  });

  describe('符号检测 (Requirement 8.1)', () => {
    it('单块 + <> 符号 → builtin-quick-card', async () => {
      // Mock getBlockText 返回包含 <> 的内容
      vi.mocked(mockSiyuanApi.getBlockText).mockResolvedValue('DDD <> 领域驱动设计');

      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        // faces 应该自动生成，不需要提供
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('builtin-quick-card');
      }
    });

    it('多块 + <> 符号 → builtin-quick-card', async () => {
      // Mock getBlockText 返回包含 <> 的内容
      vi.mocked(mockSiyuanApi.getBlockText).mockResolvedValue('DDD <> 领域驱动设计');

      const command: CreateCardCommand = {
        blockIds: ['20210808180117-6v0mkxr', '20210808180118-7w1nlys'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('builtin-quick-card');
      }
    });
  });

  describe('Concept 卡片 (Requirements 8.2, 8.3)', () => {
    beforeEach(() => {
      // Mock getBlockText 返回不包含 <> 的内容
      vi.mocked(mockSiyuanApi.getBlockText).mockResolvedValue('普通内容');
    });

    it('Concept + 2块 → builtin-concept-descriptor (Requirement 8.2)', async () => {
      const command: CreateCardCommand = {
        blockIds: ['20210808180117-6v0mkxr', '20210808180118-7w1nlys'],
        cardType: 'concept',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('builtin-concept-descriptor');
      }
    });

    it('Concept + 1块 → builtin-concept-simple (Requirement 8.3)', async () => {
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        cardType: 'concept',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('builtin-concept-simple');
      }
    });
  });

  describe('Item 卡片 (Requirements 8.4, 8.5)', () => {
    beforeEach(() => {
      // Mock getBlockText 返回不包含 <> 的内容
      vi.mocked(mockSiyuanApi.getBlockText).mockResolvedValue('普通内容');
    });

    it('Item + 1块 → builtin-quick-card (Requirement 8.4)', async () => {
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        cardType: 'item',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('builtin-quick-card');
      }
    });

    it('Item + 2块 → builtin-basic-qa (Requirement 8.5)', async () => {
      const command: CreateCardCommand = {
        blockIds: ['20210808180117-6v0mkxr', '20210808180118-7w1nlys'],
        cardType: 'item',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('builtin-basic-qa');
      }
    });

    it('默认类型（无 cardType）+ 1块 → builtin-quick-card', async () => {
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('builtin-quick-card');
      }
    });
  });

  describe('其他卡片类型', () => {
    beforeEach(() => {
      // Mock getBlockText 返回不包含 <> 的内容
      vi.mocked(mockSiyuanApi.getBlockText).mockResolvedValue('普通内容');
    });

    it('Descriptor → builtin-concept-descriptor', async () => {
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        cardType: 'descriptor',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('builtin-concept-descriptor');
      }
    });

    it('Topic → builtin-topic', async () => {
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        cardType: 'topic',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('builtin-topic');
      }
    });
  });

  describe('显式模板覆盖 (Requirement 8.6)', () => {
    it('显式指定 templateId 应该覆盖自动选择', async () => {
      // Mock getBlockText 返回包含 <> 的内容（通常会选择 builtin-symbol-qa）
      vi.mocked(mockSiyuanApi.getBlockText).mockResolvedValue('DDD <> 领域驱动设计');

      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'custom-template', // 显式指定模板
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        // 应该使用显式指定的模板，而不是自动选择的 builtin-symbol-qa
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('custom-template');
      }
    });
  });
});
