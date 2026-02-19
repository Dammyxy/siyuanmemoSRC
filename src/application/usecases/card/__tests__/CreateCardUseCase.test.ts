/**
 * CreateCardUseCase - 单元测试
 * 
 * @description
 * 测试 CreateCardUseCase 的业务逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateCardUseCase } from '../CreateCardUseCase';
import { CreateCardCommand } from '../../../commands/card/CreateCardCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { Card } from '@/core/xiuyuan/domain/Card';
import { ok, err } from '@/types/result';
import { EventBus } from '@/core/shared/domain/events/EventBus';

// Mock getBlockText
vi.mock('@/core/siyuan/block', () => ({
  getBlockText: vi.fn(() => Promise.resolve('Mock block content')),
}));

describe('CreateCardUseCase', () => {
  let useCase: CreateCardUseCase;
  let mockRepo: IXiuyuanRepository;
  let cardCreationService: CardCreationService;
  let mockEventBus: EventBus;

  beforeEach(() => {
    // 创建 mock repository
    mockRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findByBlockId: vi.fn(),
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
    } as any;

    // 创建用例
    useCase = new CreateCardUseCase(mockRepo, cardCreationService, mockEventBus);
  });

  describe('execute', () => {
    it('应该成功创建卡片', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-basic',
        faces: [
          {
            question: 'What is DDD?',
            answer: 'Domain-Driven Design'
          }
        ],
        priority: 5,
        meta: { source: 'test' }
      };

      // Mock repository save
      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const card = result.value;
        expect(card).toBeInstanceOf(Card);
        expect(card.getFaceIndex()).toBe(0);
        expect(mockRepo.save).toHaveBeenCalledTimes(1);
        
        // 验证保存的 Xiuyuan
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan).toBeInstanceOf(Xiuyuan);
        expect(savedXiuyuan.getBlockIDs()).toHaveLength(1);
        expect(savedXiuyuan.getBlockIDs()[0].getValue()).toBe('20210808180117-6v0mkxr');
        expect(savedXiuyuan.getTemplateID().getValue()).toBe('template-basic');
        expect(savedXiuyuan.getFaces()).toHaveLength(1);
        expect(savedXiuyuan.getPriority().getValue()).toBe(5);
        expect(savedXiuyuan.getCards()).toHaveLength(1);
      }
    });

    it('应该使用默认优先级', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-basic',
        faces: [
          {
            question: 'Question',
            answer: 'Answer'
          }
        ]
        // 不提供 priority
      };

      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getPriority().getValue()).toBe(5); // 默认优先级
      }
    });

    it('应该处理多个面', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-multi',
        faces: [
          {
            question: 'Question 1',
            answer: 'Answer 1'
          },
          {
            question: 'Question 2',
            answer: 'Answer 2'
          },
          {
            question: 'Question 3',
            answer: 'Answer 3'
          }
        ]
      };

      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        expect(savedXiuyuan.getFaces()).toHaveLength(3);
        // 只为第一个面创建卡片
        expect(savedXiuyuan.getCards()).toHaveLength(1);
        expect(savedXiuyuan.getCards()[0].getFaceIndex()).toBe(0);
      }
    });

    it('应该拒绝空的 blockId', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '',
        templateId: 'template-basic',
        faces: [
          {
            question: 'Question',
            answer: 'Answer'
          }
        ]
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('blockId or blockIds must be provided');
      }
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝空的 templateId', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: '',
        faces: [
          {
            question: 'Question',
            answer: 'Answer'
          }
        ]
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('templateId cannot be empty');
      }
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝空的 faces', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-basic',
        faces: []
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('faces must have at least one element');
      }
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝空的 question', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-basic',
        faces: [
          {
            question: '',
            answer: 'Answer'
          }
        ]
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('question cannot be empty');
      }
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝空的 answer', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-basic',
        faces: [
          {
            question: 'Question',
            answer: ''
          }
        ]
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('answer cannot be empty');
      }
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝负数优先级', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-basic',
        faces: [
          {
            question: 'Question',
            answer: 'Answer'
          }
        ],
        priority: -1
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('priority must be between 0 and 100');
      }
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该处理 repository 保存失败', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-basic',
        faces: [
          {
            question: 'Question',
            answer: 'Answer'
          }
        ]
      };

      const saveError = new Error('Database connection failed');
      vi.mocked(mockRepo.save).mockResolvedValue(err(saveError));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(saveError);
      }
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('应该保留元数据', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-basic',
        faces: [
          {
            question: 'Question',
            answer: 'Answer'
          }
        ],
        meta: {
          source: 'import',
          tags: ['important', 'review'],
          customField: 'value'
        }
      };

      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        const meta = savedXiuyuan.getMeta();
        expect(meta.source).toBe('import');
        expect(meta.tags).toEqual(['important', 'review']);
        expect(meta.customField).toBe('value');
      }
    });

    it('应该处理带有 blockId 的 face', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20210808180117-6v0mkxr',
        templateId: 'template-basic',
        faces: [
          {
            question: 'Question',
            answer: 'Answer',
            questionBlockId: '20210808180117-abc1234',
            answerBlockId: '20210808180117-def5678'
          }
        ]
      };

      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
        const faces = savedXiuyuan.getFaces();
        expect(faces[0].questionBlockId).toBe('20210808180117-abc1234');
        expect(faces[0].answerBlockId).toBe('20210808180117-def5678');
      }
    });
  });
});
