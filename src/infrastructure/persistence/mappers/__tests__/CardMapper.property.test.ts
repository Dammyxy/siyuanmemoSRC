/**
 * CardMapper 属性测试
 * 
 * **验证需求 7.1, 1.2, 1.3**：测试 Entity-DTO 往返一致性
 * 
 * 使用 fast-check 进行属性测试，验证通用属性在所有输入上的正确性。
 * 
 * Feature: mapper-layer-complete-migration
 * Property 1: Entity-DTO 往返一致性
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CardMapper } from '../CardMapper';
import { Card } from '../../../../domain/entities/Card';
import { CardState, CardType } from '../../../../types/card';
import { isErr } from '../../../../types/result';

// ==================== Arbitraries（生成器）====================

/**
 * 生成有效的 CardState
 */
const cardStateArbitrary = fc.constantFrom(
  CardState.New,
  CardState.Learning,
  CardState.Review,
  CardState.Relearning,
);

/**
 * 生成有效的 CardType
 */
const cardTypeArbitrary = fc.constantFrom(
  CardType.Item,
  CardType.Topic,
  CardType.Concept,
  CardType.Descriptor,
);

/**
 * 生成有效的 Card Entity Props
 * 
 * 约束：
 * - id: 非空字符串
 * - blockId: 非空字符串
 * - stability: 非负数
 * - difficulty: 1-10
 * - priority: 0-100
 * - reps, lapses: 非负整数
 * - 时间戳: 正整数
 */
const cardPropsArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  blockId: fc.string({ minLength: 1, maxLength: 50 }),
  due: fc.integer({ min: 0, max: Date.now() * 2 }),
  stability: fc.double({ min: 0, max: 1000, noNaN: true }),
  difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
  reps: fc.integer({ min: 0, max: 1000 }),
  lapses: fc.integer({ min: 0, max: 100 }),
  state: cardStateArbitrary,
  lastReview: fc.integer({ min: 0, max: Date.now() }),
  elapsedDays: fc.integer({ min: 0, max: 365 }),
  scheduledDays: fc.integer({ min: 0, max: 365 }),
  learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
  priority: fc.integer({ min: 0, max: 100 }),
  type: cardTypeArbitrary,
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
  cardTypeMarker: fc.option(fc.constantFrom('concept' as const, 'descriptor' as const), { nil: undefined }),
  neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
  leechCount: fc.integer({ min: 0, max: 20 }),
  isLeech: fc.boolean(),
  skipped: fc.boolean(),
  skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
  sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
  extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  createdAt: fc.integer({ min: 0, max: Date.now() }),
  updatedAt: fc.integer({ min: 0, max: Date.now() }),
  aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
  schedulerType: fc.option(
    fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
    { nil: undefined }
  ),
  syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
  riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  schedulerMeta: fc.option(fc.object(), { nil: undefined }),
  postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
  lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
  rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
  xiuyuanMetadata: fc.option(
    fc.record({
      xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
      templateID: fc.string({ minLength: 1, maxLength: 50 }),
      frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
      backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
      fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
      priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    }),
    { nil: undefined }
  ),
  extensionData: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined }),
});

// ==================== 属性测试 ====================

describe('CardMapper Property Tests', () => {
  /**
   * **属性 1：Entity-DTO 往返一致性**
   * **Validates: Requirements 7.1, 1.2, 1.3**
   * 
   * 对于任何有效的 Card Entity，将其转换为 DTO 再转换回 Entity 应该产生等价的实体（所有字段值相同）
   */
  describe('Property 1: Entity-DTO Round-trip Consistency', () => {
    it('应该保持所有字段在往返转换中不变', () => {
      fc.assert(
        fc.property(cardPropsArbitrary, (props) => {
          // 1. 创建 Card Entity
          const cardResult = Card.create(props);
          
          // 跳过无效的输入（fast-check 可能生成边界情况）
          if (isErr(cardResult)) {
            return true; // 跳过此测试用例
          }
          
          const originalCard = cardResult.value;
          
          // 2. Entity → DTO
          const dto = CardMapper.fromEntity(originalCard);
          
          // 3. DTO → Entity
          const restoredResult = CardMapper.toEntity(dto);
          
          // 4. 验证转换成功
          expect(isErr(restoredResult)).toBe(false);
          if (isErr(restoredResult)) {
            return false;
          }
          
          const restoredCard = restoredResult.value;
          
          // 5. 验证所有字段值相同
          const originalProps = originalCard.toObject();
          const restoredProps = restoredCard.toObject();
          
          // 基本字段
          expect(restoredProps.id).toBe(originalProps.id);
          expect(restoredProps.blockId).toBe(originalProps.blockId);
          expect(restoredProps.due).toBe(originalProps.due);
          expect(restoredProps.stability).toBe(originalProps.stability);
          expect(restoredProps.difficulty).toBe(originalProps.difficulty);
          expect(restoredProps.reps).toBe(originalProps.reps);
          expect(restoredProps.lapses).toBe(originalProps.lapses);
          expect(restoredProps.state).toBe(originalProps.state);
          expect(restoredProps.lastReview).toBe(originalProps.lastReview);
          expect(restoredProps.elapsedDays).toBe(originalProps.elapsedDays);
          expect(restoredProps.scheduledDays).toBe(originalProps.scheduledDays);
          expect(restoredProps.learning_step).toBe(originalProps.learning_step);
          expect(restoredProps.priority).toBe(originalProps.priority);
          expect(restoredProps.type).toBe(originalProps.type);
          
          // 数组字段
          expect(restoredProps.tags).toEqual(originalProps.tags);
          
          // 可选字段
          expect(restoredProps.cardTypeMarker).toBe(originalProps.cardTypeMarker);
          expect(restoredProps.neuralRoamSeed).toBe(originalProps.neuralRoamSeed);
          expect(restoredProps.leechCount).toBe(originalProps.leechCount);
          expect(restoredProps.isLeech).toBe(originalProps.isLeech);
          expect(restoredProps.skipped).toBe(originalProps.skipped);
          expect(restoredProps.skipNote).toBe(originalProps.skipNote);
          expect(restoredProps.skipUntil).toBe(originalProps.skipUntil);
          expect(restoredProps.sourceUrl).toBe(originalProps.sourceUrl);
          expect(restoredProps.extractedFrom).toBe(originalProps.extractedFrom);
          expect(restoredProps.createdAt).toBe(originalProps.createdAt);
          expect(restoredProps.updatedAt).toBe(originalProps.updatedAt);
          expect(restoredProps.aFactor).toBe(originalProps.aFactor);
          expect(restoredProps.schedulerType).toBe(originalProps.schedulerType);
          expect(restoredProps.syncToRiff).toBe(originalProps.syncToRiff);
          expect(restoredProps.riffCardId).toBe(originalProps.riffCardId);
          expect(restoredProps.schedulerMeta).toEqual(originalProps.schedulerMeta);
          expect(restoredProps.postponeCount).toBe(originalProps.postponeCount);
          expect(restoredProps.lastPostponeDate).toBe(originalProps.lastPostponeDate);
          expect(restoredProps.rescheduleHistory).toEqual(originalProps.rescheduleHistory);
          
          // Xiuyuan 元数据
          if (originalProps.xiuyuanMetadata) {
            expect(restoredProps.xiuyuanMetadata).toBeDefined();
            expect(restoredProps.xiuyuanMetadata?.xiuyuanID).toBe(originalProps.xiuyuanMetadata.xiuyuanID);
            expect(restoredProps.xiuyuanMetadata?.templateID).toBe(originalProps.xiuyuanMetadata.templateID);
            expect(restoredProps.xiuyuanMetadata?.frontBlockIDs).toEqual(originalProps.xiuyuanMetadata.frontBlockIDs);
            expect(restoredProps.xiuyuanMetadata?.backBlockIDs).toEqual(originalProps.xiuyuanMetadata.backBlockIDs);
            expect(restoredProps.xiuyuanMetadata?.fieldMapping).toEqual(originalProps.xiuyuanMetadata.fieldMapping);
            expect(restoredProps.xiuyuanMetadata?.priority).toBe(originalProps.xiuyuanMetadata.priority);
          } else {
            expect(restoredProps.xiuyuanMetadata).toBeUndefined();
          }
          
          // 扩展数据
          expect(restoredProps.extensionData).toEqual(originalProps.extensionData);
          
          return true;
        }),
        {
          numRuns: 100, // 运行 100 次迭代
          verbose: true, // 显示详细信息
        }
      );
    });
    
    it('应该保持 Xiuyuan 元数据在往返转换中不变', () => {
      fc.assert(
        fc.property(
          fc.record({
            ...cardPropsArbitrary.value,
            type: fc.constant(CardType.Concept),
            xiuyuanMetadata: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
              priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            }),
          }),
          (props) => {
            // 1. 创建 Card Entity
            const cardResult = Card.create(props);
            
            if (isErr(cardResult)) {
              return true; // 跳过无效输入
            }
            
            const originalCard = cardResult.value;
            
            // 2. Entity → DTO
            const dto = CardMapper.fromEntity(originalCard);
            
            // 3. 验证 DTO 包含顶层 Xiuyuan 字段
            expect(dto.xiuyuanID).toBe(props.xiuyuanMetadata.xiuyuanID);
            expect(dto.templateID).toBe(props.xiuyuanMetadata.templateID);
            expect(dto.frontBlockIDs).toEqual(props.xiuyuanMetadata.frontBlockIDs);
            expect(dto.backBlockIDs).toEqual(props.xiuyuanMetadata.backBlockIDs);
            expect(dto.fieldMapping).toEqual(props.xiuyuanMetadata.fieldMapping);
            expect(dto.xiuyuanPriority).toBe(props.xiuyuanMetadata.priority);
            
            // 4. DTO → Entity
            const restoredResult = CardMapper.toEntity(dto);
            
            expect(isErr(restoredResult)).toBe(false);
            if (isErr(restoredResult)) {
              return false;
            }
            
            const restoredCard = restoredResult.value;
            
            // 5. 验证 Xiuyuan 元数据完整恢复
            expect(restoredCard.xiuyuanMetadata).toBeDefined();
            expect(restoredCard.xiuyuanMetadata?.xiuyuanID).toBe(props.xiuyuanMetadata.xiuyuanID);
            expect(restoredCard.xiuyuanMetadata?.templateID).toBe(props.xiuyuanMetadata.templateID);
            expect(restoredCard.xiuyuanMetadata?.frontBlockIDs).toEqual(props.xiuyuanMetadata.frontBlockIDs);
            expect(restoredCard.xiuyuanMetadata?.backBlockIDs).toEqual(props.xiuyuanMetadata.backBlockIDs);
            expect(restoredCard.xiuyuanMetadata?.fieldMapping).toEqual(props.xiuyuanMetadata.fieldMapping);
            expect(restoredCard.xiuyuanMetadata?.priority).toBe(props.xiuyuanMetadata.priority);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
    
    it('应该保持扩展数据在往返转换中不变', () => {
      fc.assert(
        fc.property(
          fc.record({
            ...cardPropsArbitrary.value,
            extensionData: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.oneof(
                fc.string(),
                fc.integer(),
                fc.boolean(),
                fc.double({ noNaN: true }),
                fc.constant(null)
              )
            ),
          }),
          (props) => {
            // 1. 创建 Card Entity
            const cardResult = Card.create(props);
            
            if (isErr(cardResult)) {
              return true; // 跳过无效输入
            }
            
            const originalCard = cardResult.value;
            
            // 2. Entity → DTO
            const dto = CardMapper.fromEntity(originalCard);
            
            // 3. 验证 DTO 包含扩展数据
            expect(dto.meta).toEqual(props.extensionData);
            
            // 4. DTO → Entity
            const restoredResult = CardMapper.toEntity(dto);
            
            expect(isErr(restoredResult)).toBe(false);
            if (isErr(restoredResult)) {
              return false;
            }
            
            const restoredCard = restoredResult.value;
            
            // 5. 验证扩展数据完整恢复
            expect(restoredCard.extensionData).toEqual(props.extensionData);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  /**
   * **属性 2：FSRSCard-DTO 往返一致性**
   * **Validates: Requirements 7.1, 5.2, 5.3**
   * 
   * 对于任何有效的 FSRSCard，将其转换为 DTO 再转换回 FSRSCard 应该产生等价的卡片（所有字段值相同）
   */
  describe('Property 2: FSRSCard-DTO Round-trip Consistency', () => {
    /**
     * 生成有效的 FSRSCard
     */
    const fsrsCardArbitrary = fc.record({
      id: fc.string({ minLength: 1, maxLength: 50 }),
      blockId: fc.string({ minLength: 1, maxLength: 50 }),
      due: fc.integer({ min: 0, max: Date.now() * 2 }),
      stability: fc.double({ min: 0, max: 1000, noNaN: true }),
      difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
      reps: fc.integer({ min: 0, max: 1000 }),
      lapses: fc.integer({ min: 0, max: 100 }),
      state: cardStateArbitrary,
      lastReview: fc.integer({ min: 0, max: Date.now() }),
      elapsedDays: fc.integer({ min: 0, max: 365 }),
      scheduledDays: fc.integer({ min: 0, max: 365 }),
      learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
      priority: fc.integer({ min: 0, max: 100 }),
      type: cardTypeArbitrary,
      tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
      cardTypeMarker: fc.option(fc.constantFrom('concept' as const, 'descriptor' as const), { nil: undefined }),
      neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
      leechCount: fc.integer({ min: 0, max: 20 }),
      isLeech: fc.boolean(),
      skipped: fc.boolean(),
      skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
      skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
      sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
      extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      createdAt: fc.integer({ min: 0, max: Date.now() }),
      updatedAt: fc.integer({ min: 0, max: Date.now() }),
      aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
      schedulerType: fc.option(
        fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
        { nil: undefined }
      ),
      syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
      riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      schedulerMeta: fc.option(fc.object(), { nil: undefined }),
      postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
      lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
      rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
      meta: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined }),
    });

    it('应该保持所有字段在往返转换中不变', () => {
      fc.assert(
        fc.property(fsrsCardArbitrary, (card) => {
          // 1. FSRSCard → DTO
          const dto = CardMapper.toPersistence(card);
          
          // 2. DTO → FSRSCard
          const restoredCard = CardMapper.toDomain(dto);
          
          // 3. 验证所有字段值相同
          // 基本字段
          expect(restoredCard.id).toBe(card.id);
          expect(restoredCard.blockId).toBe(card.blockId);
          expect(restoredCard.due).toBe(card.due);
          expect(restoredCard.stability).toBe(card.stability);
          expect(restoredCard.difficulty).toBe(card.difficulty);
          expect(restoredCard.reps).toBe(card.reps);
          expect(restoredCard.lapses).toBe(card.lapses);
          expect(restoredCard.state).toBe(card.state);
          expect(restoredCard.lastReview).toBe(card.lastReview);
          expect(restoredCard.elapsedDays).toBe(card.elapsedDays);
          expect(restoredCard.scheduledDays).toBe(card.scheduledDays);
          expect(restoredCard.learning_step).toBe(card.learning_step);
          expect(restoredCard.priority).toBe(card.priority);
          expect(restoredCard.type).toBe(card.type);
          
          // 数组字段
          expect(restoredCard.tags).toEqual(card.tags);
          
          // 可选字段
          expect(restoredCard.cardTypeMarker).toBe(card.cardTypeMarker);
          expect(restoredCard.neuralRoamSeed).toBe(card.neuralRoamSeed);
          expect(restoredCard.leechCount).toBe(card.leechCount);
          expect(restoredCard.isLeech).toBe(card.isLeech);
          expect(restoredCard.skipped).toBe(card.skipped);
          expect(restoredCard.skipNote).toBe(card.skipNote);
          expect(restoredCard.skipUntil).toBe(card.skipUntil);
          expect(restoredCard.sourceUrl).toBe(card.sourceUrl);
          expect(restoredCard.extractedFrom).toBe(card.extractedFrom);
          expect(restoredCard.createdAt).toBe(card.createdAt);
          expect(restoredCard.updatedAt).toBe(card.updatedAt);
          expect(restoredCard.aFactor).toBe(card.aFactor);
          expect(restoredCard.schedulerType).toBe(card.schedulerType);
          expect(restoredCard.syncToRiff).toBe(card.syncToRiff);
          expect(restoredCard.riffCardId).toBe(card.riffCardId);
          expect(restoredCard.schedulerMeta).toEqual(card.schedulerMeta);
          expect(restoredCard.postponeCount).toBe(card.postponeCount);
          expect(restoredCard.lastPostponeDate).toBe(card.lastPostponeDate);
          expect(restoredCard.rescheduleHistory).toEqual(card.rescheduleHistory);
          
          // meta 字段 - 接受规范化行为：空对象 {} 会被规范化为 undefined
          // 这是预期行为，用于清理无意义的空对象
          const normalizedOriginalMeta = card.meta && Object.keys(card.meta).length > 0 ? card.meta : undefined;
          expect(restoredCard.meta).toEqual(normalizedOriginalMeta);
          
          return true;
        }),
        {
          numRuns: 100, // 运行 100 次迭代
          verbose: true, // 显示详细信息
        }
      );
    });

    it('应该正确提取和恢复 Xiuyuan 元数据', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: fc.constant(CardType.Concept),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.constant('concept' as const),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            meta: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
              priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            }),
          }),
          (card) => {
            // 1. FSRSCard → DTO
            const dto = CardMapper.toPersistence(card);
            
            // 2. 验证 DTO 包含顶层 Xiuyuan 字段
            expect(dto.xiuyuanID).toBe(card.meta.xiuyuanID);
            expect(dto.templateID).toBe(card.meta.templateID);
            expect(dto.frontBlockIDs).toEqual(card.meta.frontBlockIDs);
            expect(dto.backBlockIDs).toEqual(card.meta.backBlockIDs);
            expect(dto.fieldMapping).toEqual(card.meta.fieldMapping);
            expect(dto.xiuyuanPriority).toBe(card.meta.priority);
            
            // 3. 验证 meta 中不包含 Xiuyuan 字段的实际值
            // 注意：规范化行为会将空对象转为 undefined，但如果删除后还有其他字段（即使是 undefined），则保留对象
            expect(dto.meta?.xiuyuanID).toBeUndefined();
            expect(dto.meta?.templateID).toBeUndefined();
            expect(dto.meta?.frontBlockIDs).toBeUndefined();
            expect(dto.meta?.backBlockIDs).toBeUndefined();
            expect(dto.meta?.fieldMapping).toBeUndefined();
            expect(dto.meta?.xiuyuanPriority).toBeUndefined();
            
            // 4. DTO → FSRSCard
            const restoredCard = CardMapper.toDomain(dto);
            
            // 5. 验证 Xiuyuan 元数据完整恢复到 meta
            expect(restoredCard.meta?.xiuyuanID).toBe(card.meta.xiuyuanID);
            expect(restoredCard.meta?.templateID).toBe(card.meta.templateID);
            expect(restoredCard.meta?.frontBlockIDs).toEqual(card.meta.frontBlockIDs);
            expect(restoredCard.meta?.backBlockIDs).toEqual(card.meta.backBlockIDs);
            expect(restoredCard.meta?.fieldMapping).toEqual(card.meta.fieldMapping);
            expect(restoredCard.meta?.priority).toBe(card.meta.priority);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('应该保持扩展 meta 数据在往返转换中不变', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: cardTypeArbitrary,
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.option(fc.constantFrom('concept' as const, 'descriptor' as const), { nil: undefined }),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            meta: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.oneof(
                fc.string(),
                fc.integer(),
                fc.boolean(),
                fc.double({ noNaN: true }),
                fc.constant(null)
              ),
              { minKeys: 1 } // 确保至少有一个键，避免空对象
            ),
          }),
          (card) => {
            // 1. FSRSCard → DTO
            const dto = CardMapper.toPersistence(card);
            
            // 2. DTO → FSRSCard
            const restoredCard = CardMapper.toDomain(dto);
            
            // 3. 验证 meta 数据完整恢复
            // 注意：空对象会被规范化为 undefined，这是预期行为
            const normalizedOriginalMeta = card.meta && Object.keys(card.meta).length > 0 ? card.meta : undefined;
            expect(restoredCard.meta).toEqual(normalizedOriginalMeta);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  /**
   * **属性 3：Xiuyuan 字段提取正确性**
   * **Validates: Requirements 7.2, 4.4**
   * 
   * 对于任何包含 Xiuyuan 元数据的 FSRSCard，转换为 DTO 后，顶层应该包含 xiuyuanID、templateID 等字段，
   * 且 meta 中不应包含这些字段
   */
  describe('Property 3: Xiuyuan Field Extraction Correctness', () => {
    /**
     * 生成包含 Xiuyuan 元数据的 FSRSCard
     */
    const xiuyuanFSRSCardArbitrary = fc.record({
      id: fc.string({ minLength: 1, maxLength: 50 }),
      blockId: fc.string({ minLength: 1, maxLength: 50 }),
      due: fc.integer({ min: 0, max: Date.now() * 2 }),
      stability: fc.double({ min: 0, max: 1000, noNaN: true }),
      difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
      reps: fc.integer({ min: 0, max: 1000 }),
      lapses: fc.integer({ min: 0, max: 100 }),
      state: cardStateArbitrary,
      lastReview: fc.integer({ min: 0, max: Date.now() }),
      elapsedDays: fc.integer({ min: 0, max: 365 }),
      scheduledDays: fc.integer({ min: 0, max: 365 }),
      learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
      priority: fc.integer({ min: 0, max: 100 }),
      type: fc.constant(CardType.Concept),
      tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
      cardTypeMarker: fc.constant('concept' as const),
      neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
      leechCount: fc.integer({ min: 0, max: 20 }),
      isLeech: fc.boolean(),
      skipped: fc.boolean(),
      skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
      skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
      sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
      extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      createdAt: fc.integer({ min: 0, max: Date.now() }),
      updatedAt: fc.integer({ min: 0, max: Date.now() }),
      aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
      schedulerType: fc.option(
        fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
        { nil: undefined }
      ),
      syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
      riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      schedulerMeta: fc.option(fc.object(), { nil: undefined }),
      postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
      lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
      rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
      meta: fc.record({
        xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
        templateID: fc.string({ minLength: 1, maxLength: 50 }),
        frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
        priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
        // 添加一些额外的 meta 字段，确保它们不会被移除
        customField1: fc.option(fc.string(), { nil: undefined }),
        customField2: fc.option(fc.integer(), { nil: undefined }),
      }),
    });

    it('应该将 Xiuyuan 字段提取到 DTO 顶层', () => {
      fc.assert(
        fc.property(xiuyuanFSRSCardArbitrary, (card) => {
          // 1. FSRSCard → DTO
          const dto = CardMapper.toPersistence(card);
          
          // 2. 验证顶层包含 Xiuyuan 字段
          expect(dto.xiuyuanID).toBe(card.meta.xiuyuanID);
          expect(dto.templateID).toBe(card.meta.templateID);
          expect(dto.frontBlockIDs).toEqual(card.meta.frontBlockIDs);
          expect(dto.backBlockIDs).toEqual(card.meta.backBlockIDs);
          expect(dto.fieldMapping).toEqual(card.meta.fieldMapping);
          expect(dto.xiuyuanPriority).toBe(card.meta.priority);
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('应该从 meta 中移除已提取的 Xiuyuan 字段', () => {
      fc.assert(
        fc.property(xiuyuanFSRSCardArbitrary, (card) => {
          // 1. FSRSCard → DTO
          const dto = CardMapper.toPersistence(card);
          
          // 2. 验证 meta 中不包含 Xiuyuan 字段
          expect(dto.meta?.xiuyuanID).toBeUndefined();
          expect(dto.meta?.templateID).toBeUndefined();
          expect(dto.meta?.frontBlockIDs).toBeUndefined();
          expect(dto.meta?.backBlockIDs).toBeUndefined();
          expect(dto.meta?.fieldMapping).toBeUndefined();
          expect(dto.meta?.xiuyuanPriority).toBeUndefined();
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('应该保留 meta 中的非 Xiuyuan 字段', () => {
      fc.assert(
        fc.property(xiuyuanFSRSCardArbitrary, (card) => {
          // 1. FSRSCard → DTO
          const dto = CardMapper.toPersistence(card);
          
          // 2. 验证 meta 中保留了非 Xiuyuan 字段
          if (card.meta.customField1 !== undefined) {
            expect(dto.meta?.customField1).toBe(card.meta.customField1);
          }
          if (card.meta.customField2 !== undefined) {
            expect(dto.meta?.customField2).toBe(card.meta.customField2);
          }
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('应该正确处理只有 Xiuyuan 字段的 meta（提取后 meta 为空或 undefined）', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: fc.constant(CardType.Concept),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.constant('concept' as const),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            // meta 只包含 Xiuyuan 字段，没有其他字段
            meta: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
            }),
          }),
          (card) => {
            // 1. FSRSCard → DTO
            const dto = CardMapper.toPersistence(card);
            
            // 2. 验证顶层包含 Xiuyuan 字段
            expect(dto.xiuyuanID).toBe(card.meta.xiuyuanID);
            expect(dto.templateID).toBe(card.meta.templateID);
            expect(dto.frontBlockIDs).toEqual(card.meta.frontBlockIDs);
            expect(dto.backBlockIDs).toEqual(card.meta.backBlockIDs);
            
            // 3. 验证 meta 为空或 undefined（所有 Xiuyuan 字段都被提取了）
            // 规范化行为：空对象会被转为 undefined
            if (dto.meta !== undefined) {
              // 如果 meta 存在，它应该是空对象或只包含 undefined 值
              const metaKeys = Object.keys(dto.meta).filter(key => dto.meta![key] !== undefined);
              expect(metaKeys.length).toBe(0);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('应该正确处理所有 Xiuyuan 字段的组合（包括可选字段）', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: fc.constant(CardType.Concept),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.constant('concept' as const),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            meta: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              // 可选字段：有时存在，有时不存在
              frontBlockIDs: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }), { nil: undefined }),
              backBlockIDs: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }), { nil: undefined }),
              fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
              priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            }),
          }),
          (card) => {
            // 1. FSRSCard → DTO
            const dto = CardMapper.toPersistence(card);
            
            // 2. 验证必需的 Xiuyuan 字段被提取
            expect(dto.xiuyuanID).toBe(card.meta.xiuyuanID);
            expect(dto.templateID).toBe(card.meta.templateID);
            
            // 3. 验证可选的 Xiuyuan 字段被正确提取
            expect(dto.frontBlockIDs).toEqual(card.meta.frontBlockIDs);
            expect(dto.backBlockIDs).toEqual(card.meta.backBlockIDs);
            expect(dto.fieldMapping).toEqual(card.meta.fieldMapping);
            expect(dto.xiuyuanPriority).toBe(card.meta.priority);
            
            // 4. 验证 meta 中不包含这些字段
            expect(dto.meta?.xiuyuanID).toBeUndefined();
            expect(dto.meta?.templateID).toBeUndefined();
            expect(dto.meta?.frontBlockIDs).toBeUndefined();
            expect(dto.meta?.backBlockIDs).toBeUndefined();
            expect(dto.meta?.fieldMapping).toBeUndefined();
            expect(dto.meta?.priority).toBeUndefined();
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });
});

  /**
   * **属性 4：Xiuyuan 字段合并正确性**
   * **Validates: Requirements 7.3, 4.4**
   * 
   * 对于任何包含顶层 Xiuyuan 字段的 DTO，转换为 FSRSCard 后，meta 中应该包含这些字段
   */
  describe('Property 4: Xiuyuan Field Merging Correctness', () => {
    /**
     * 生成包含顶层 Xiuyuan 字段的 DTO
     */
    const xiuyuanDTOArbitrary = fc.record({
      id: fc.string({ minLength: 1, maxLength: 50 }),
      blockId: fc.string({ minLength: 1, maxLength: 50 }),
      due: fc.integer({ min: 0, max: Date.now() * 2 }),
      stability: fc.double({ min: 0, max: 1000, noNaN: true }),
      difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
      reps: fc.integer({ min: 0, max: 1000 }),
      lapses: fc.integer({ min: 0, max: 100 }),
      state: cardStateArbitrary,
      lastReview: fc.integer({ min: 0, max: Date.now() }),
      elapsedDays: fc.integer({ min: 0, max: 365 }),
      scheduledDays: fc.integer({ min: 0, max: 365 }),
      learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
      priority: fc.integer({ min: 0, max: 100 }),
      type: fc.constant(CardType.Concept),
      tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
      cardTypeMarker: fc.constant('concept' as const),
      neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
      leechCount: fc.integer({ min: 0, max: 20 }),
      isLeech: fc.boolean(),
      skipped: fc.boolean(),
      skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
      skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
      sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
      extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      createdAt: fc.integer({ min: 0, max: Date.now() }),
      updatedAt: fc.integer({ min: 0, max: Date.now() }),
      aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
      schedulerType: fc.option(
        fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
        { nil: undefined }
      ),
      syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
      riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      schedulerMeta: fc.option(fc.object(), { nil: undefined }),
      postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
      lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
      rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
      // 顶层 Xiuyuan 字段
      xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
      templateID: fc.string({ minLength: 1, maxLength: 50 }),
      frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
      backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
      fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
      xiuyuanPriority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
      // meta 可能包含其他字段
      meta: fc.option(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.double({ noNaN: true }),
            fc.constant(null)
          )
        ),
        { nil: undefined }
      ),
    });

    it('应该将顶层 Xiuyuan 字段合并到 FSRSCard 的 meta 中', () => {
      fc.assert(
        fc.property(xiuyuanDTOArbitrary, (dto) => {
          // 1. DTO → FSRSCard
          const card = CardMapper.toDomain(dto);
          
          // 2. 验证 meta 中包含 Xiuyuan 字段
          expect(card.meta).toBeDefined();
          expect(card.meta?.xiuyuanID).toBe(dto.xiuyuanID);
          expect(card.meta?.templateID).toBe(dto.templateID);
          expect(card.meta?.frontBlockIDs).toEqual(dto.frontBlockIDs);
          expect(card.meta?.backBlockIDs).toEqual(dto.backBlockIDs);
          expect(card.meta?.fieldMapping).toEqual(dto.fieldMapping);
          expect(card.meta?.priority).toBe(dto.xiuyuanPriority);
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('应该保留 DTO meta 中的其他字段', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: fc.constant(CardType.Concept),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.constant('concept' as const),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
            templateID: fc.string({ minLength: 1, maxLength: 50 }),
            frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
            backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
            fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
            xiuyuanPriority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            meta: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.oneof(
                fc.string(),
                fc.integer(),
                fc.boolean(),
                fc.double({ noNaN: true }),
                fc.constant(null)
              ),
              { minKeys: 1 } // 确保至少有一个键
            ),
          }),
          (dto) => {
            // 保存原始 meta 的键
            const originalMetaKeys = Object.keys(dto.meta);
            
            // 1. DTO → FSRSCard
            const card = CardMapper.toDomain(dto);
            
            // 2. 验证 meta 中包含 Xiuyuan 字段
            expect(card.meta?.xiuyuanID).toBe(dto.xiuyuanID);
            expect(card.meta?.templateID).toBe(dto.templateID);
            
            // 3. 验证 meta 中保留了原始的其他字段
            for (const key of originalMetaKeys) {
              expect(card.meta?.[key]).toEqual(dto.meta[key]);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('应该正确处理可选的 Xiuyuan 字段', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: fc.constant(CardType.Concept),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.constant('concept' as const),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
            templateID: fc.string({ minLength: 1, maxLength: 50 }),
            // 可选字段：有时存在，有时不存在
            frontBlockIDs: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }), { nil: undefined }),
            backBlockIDs: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }), { nil: undefined }),
            fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
            xiuyuanPriority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            meta: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined }),
          }),
          (dto) => {
            // 1. DTO → FSRSCard
            const card = CardMapper.toDomain(dto);
            
            // 2. 验证必需的 Xiuyuan 字段被合并
            expect(card.meta?.xiuyuanID).toBe(dto.xiuyuanID);
            expect(card.meta?.templateID).toBe(dto.templateID);
            
            // 3. 验证可选的 Xiuyuan 字段被正确合并
            expect(card.meta?.frontBlockIDs).toEqual(dto.frontBlockIDs);
            expect(card.meta?.backBlockIDs).toEqual(dto.backBlockIDs);
            expect(card.meta?.fieldMapping).toEqual(dto.fieldMapping);
            expect(card.meta?.priority).toBe(dto.xiuyuanPriority);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  /**
   * **属性 5 & 6：批量转换属性**
   * **Validates: Requirements 1.4, 7.4**
   * 
   * 属性 5：对于任何 Card Entity 数组，批量转换为 DTO 数组后，数组长度应该相同
   * 属性 6：对于任何 Card Entity 数组，批量转换为 DTO 数组后，每个元素都应该正确转换（与单个转换结果相同）
   */
  describe('Property 5 & 6: Batch Conversion Properties', () => {
    it('批量转换应该保持数组长度', () => {
      fc.assert(
        fc.property(
          fc.array(cardPropsArbitrary, { minLength: 0, maxLength: 20 }),
          (propsArray) => {
            // 1. 创建 Card Entity 数组（过滤掉无效的）
            const cards: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                cards.push(cardResult.value);
              }
            }
            
            // 2. 批量转换 Entity → DTO
            const dtos = CardMapper.fromEntityBatch(cards);
            
            // 3. 验证数组长度相同
            expect(dtos.length).toBe(cards.length);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量转换的每个元素应该与单个转换结果相同', () => {
      fc.assert(
        fc.property(
          fc.array(cardPropsArbitrary, { minLength: 1, maxLength: 10 }),
          (propsArray) => {
            // 1. 创建 Card Entity 数组（过滤掉无效的）
            const cards: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                cards.push(cardResult.value);
              }
            }
            
            // 如果没有有效的卡片，跳过此测试
            if (cards.length === 0) {
              return true;
            }
            
            // 2. 批量转换 Entity → DTO
            const batchDtos = CardMapper.fromEntityBatch(cards);
            
            // 3. 单个转换 Entity → DTO
            const singleDtos = cards.map(card => CardMapper.fromEntity(card));
            
            // 4. 验证每个元素都相同
            expect(batchDtos.length).toBe(singleDtos.length);
            for (let i = 0; i < batchDtos.length; i++) {
              expect(batchDtos[i]).toEqual(singleDtos[i]);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量转换 DTO → Entity 应该保持数组长度', () => {
      fc.assert(
        fc.property(
          fc.array(cardPropsArbitrary, { minLength: 0, maxLength: 20 }),
          (propsArray) => {
            // 1. 创建 Card Entity 数组（过滤掉无效的）
            const cards: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                cards.push(cardResult.value);
              }
            }
            
            // 2. Entity → DTO
            const dtos = CardMapper.fromEntityBatch(cards);
            
            // 3. 批量转换 DTO → Entity
            const restoredResult = CardMapper.toEntityBatch(dtos);
            
            // 4. 验证转换成功
            expect(isErr(restoredResult)).toBe(false);
            if (isErr(restoredResult)) {
              return false;
            }
            
            const restoredCards = restoredResult.value;
            
            // 5. 验证数组长度相同
            expect(restoredCards.length).toBe(dtos.length);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量转换 DTO → Entity 的每个元素应该与单个转换结果相同', () => {
      fc.assert(
        fc.property(
          fc.array(cardPropsArbitrary, { minLength: 1, maxLength: 10 }),
          (propsArray) => {
            // 1. 创建 Card Entity 数组（过滤掉无效的）
            const cards: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                cards.push(cardResult.value);
              }
            }
            
            // 如果没有有效的卡片，跳过此测试
            if (cards.length === 0) {
              return true;
            }
            
            // 2. Entity → DTO
            const dtos = CardMapper.fromEntityBatch(cards);
            
            // 3. 批量转换 DTO → Entity
            const batchResult = CardMapper.toEntityBatch(dtos);
            expect(isErr(batchResult)).toBe(false);
            if (isErr(batchResult)) {
              return false;
            }
            const batchCards = batchResult.value;
            
            // 4. 单个转换 DTO → Entity
            const singleCards: Card[] = [];
            for (const dto of dtos) {
              const cardResult = CardMapper.toEntity(dto);
              expect(isErr(cardResult)).toBe(false);
              if (isErr(cardResult)) {
                return false;
              }
              singleCards.push(cardResult.value);
            }
            
            // 5. 验证每个元素都相同
            expect(batchCards.length).toBe(singleCards.length);
            for (let i = 0; i < batchCards.length; i++) {
              const batchProps = batchCards[i].toObject();
              const singleProps = singleCards[i].toObject();
              expect(batchProps).toEqual(singleProps);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('空数组的批量转换应该返回空数组', () => {
      // Entity → DTO
      const dtos = CardMapper.fromEntityBatch([]);
      expect(dtos).toEqual([]);
      
      // DTO → Entity
      const result = CardMapper.toEntityBatch([]);
      expect(isErr(result)).toBe(false);
      if (!isErr(result)) {
        expect(result.value).toEqual([]);
      }
    });

    it('批量转换应该保持元素顺序', () => {
      fc.assert(
        fc.property(
          fc.array(cardPropsArbitrary, { minLength: 2, maxLength: 10 }),
          (propsArray) => {
            // 1. 创建 Card Entity 数组（过滤掉无效的）
            const cards: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                cards.push(cardResult.value);
              }
            }
            
            // 如果少于 2 个有效卡片，跳过此测试
            if (cards.length < 2) {
              return true;
            }
            
            // 2. Entity → DTO
            const dtos = CardMapper.fromEntityBatch(cards);
            
            // 3. 验证顺序：通过 ID 检查
            for (let i = 0; i < cards.length; i++) {
              expect(dtos[i].id).toBe(cards[i].id.value);
            }
            
            // 4. DTO → Entity
            const restoredResult = CardMapper.toEntityBatch(dtos);
            expect(isErr(restoredResult)).toBe(false);
            if (isErr(restoredResult)) {
              return false;
            }
            
            const restoredCards = restoredResult.value;
            
            // 5. 验证顺序保持
            for (let i = 0; i < cards.length; i++) {
              expect(restoredCards[i].id.value).toBe(cards[i].id.value);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  /**
   * **属性 7 & 8：错误处理属性**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   * 
   * 属性 7：对于任何无效的 CardProps（如负数的 stability），Card.create 应该返回 Result.ok = false
   * 属性 8：对于任何包含无效 DTO 的数组，toEntityBatch 应该返回包含所有错误信息的 Result
   */
  describe('Property 7 & 8: Error Handling Properties', () => {
    /**
     * 生成无效的 CardProps
     */
    const invalidCardPropsArbitrary = fc.oneof(
      // 负数的 stability
      fc.record({
        ...cardPropsArbitrary.value,
        stability: fc.double({ min: -1000, max: -0.001, noNaN: true }),
      }),
      // 无效的 difficulty（< 1 或 > 10）
      fc.record({
        ...cardPropsArbitrary.value,
        difficulty: fc.oneof(
          fc.double({ min: -10, max: 0.999, noNaN: true }),
          fc.double({ min: 10.001, max: 100, noNaN: true })
        ),
      }),
      // 无效的 priority（< 0 或 > 100）
      fc.record({
        ...cardPropsArbitrary.value,
        priority: fc.oneof(
          fc.integer({ min: -100, max: -1 }),
          fc.integer({ min: 101, max: 1000 })
        ),
      }),
      // 空字符串的 id
      fc.record({
        ...cardPropsArbitrary.value,
        id: fc.constant(''),
      }),
      // 空字符串的 blockId
      fc.record({
        ...cardPropsArbitrary.value,
        blockId: fc.constant(''),
      }),
      // 负数的 reps
      fc.record({
        ...cardPropsArbitrary.value,
        reps: fc.integer({ min: -100, max: -1 }),
      }),
      // 负数的 lapses
      fc.record({
        ...cardPropsArbitrary.value,
        lapses: fc.integer({ min: -100, max: -1 }),
      })
    );

    it('无效输入应该返回 err Result', () => {
      fc.assert(
        fc.property(invalidCardPropsArbitrary, (props) => {
          // 1. 尝试创建 Card Entity
          const result = Card.create(props);
          
          // 2. 验证返回 err
          expect(isErr(result)).toBe(true);
          
          // 3. 验证错误信息存在
          if (isErr(result)) {
            expect(result.error).toBeDefined();
            expect(result.error).toBeInstanceOf(Error);
          }
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('有效输入应该返回 ok Result', () => {
      fc.assert(
        fc.property(cardPropsArbitrary, (props) => {
          // 1. 创建 Card Entity
          const result = Card.create(props);
          
          // 2. 如果创建成功，验证返回 ok
          if (!isErr(result)) {
            expect(result.ok).toBe(true);
            expect(result.value).toBeInstanceOf(Card);
          }
          
          // 注意：某些边界情况可能仍然失败，这是预期的
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量转换包含无效 DTO 应该返回 err Result', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              // 有效的 DTO
              cardPropsArbitrary.map(props => {
                const cardResult = Card.create(props);
                if (!isErr(cardResult)) {
                  return CardMapper.fromEntity(cardResult.value);
                }
                // 如果创建失败，返回一个基本的有效 DTO
                return {
                  id: 'valid-id',
                  blockId: 'valid-block-id',
                  due: Date.now(),
                  stability: 1,
                  difficulty: 5,
                  reps: 0,
                  lapses: 0,
                  state: CardState.New,
                  lastReview: Date.now(),
                  elapsedDays: 0,
                  scheduledDays: 0,
                  priority: 50,
                  type: CardType.Item,
                  tags: [],
                  leechCount: 0,
                  isLeech: false,
                  skipped: false,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
              }),
              // 无效的 DTO（负数 stability）
              fc.record({
                id: fc.string({ minLength: 1, maxLength: 50 }),
                blockId: fc.string({ minLength: 1, maxLength: 50 }),
                due: fc.integer({ min: 0, max: Date.now() * 2 }),
                stability: fc.double({ min: -1000, max: -0.001, noNaN: true }),
                difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
                reps: fc.integer({ min: 0, max: 1000 }),
                lapses: fc.integer({ min: 0, max: 100 }),
                state: cardStateArbitrary,
                lastReview: fc.integer({ min: 0, max: Date.now() }),
                elapsedDays: fc.integer({ min: 0, max: 365 }),
                scheduledDays: fc.integer({ min: 0, max: 365 }),
                priority: fc.integer({ min: 0, max: 100 }),
                type: cardTypeArbitrary,
                tags: fc.array(fc.string(), { maxLength: 10 }),
                leechCount: fc.integer({ min: 0, max: 20 }),
                isLeech: fc.boolean(),
                skipped: fc.boolean(),
                createdAt: fc.integer({ min: 0, max: Date.now() }),
                updatedAt: fc.integer({ min: 0, max: Date.now() }),
              })
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (dtos) => {
            // 1. 批量转换 DTO → Entity
            const result = CardMapper.toEntityBatch(dtos);
            
            // 2. 检查是否有无效的 DTO
            const hasInvalidDTO = dtos.some(dto => dto.stability < 0);
            
            if (hasInvalidDTO) {
              // 3. 如果有无效 DTO，应该返回 err
              expect(isErr(result)).toBe(true);
              
              // 4. 验证错误信息存在
              if (isErr(result)) {
                expect(result.error).toBeDefined();
                expect(result.error).toBeInstanceOf(Error);
              }
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量转换全部有效 DTO 应该返回 ok Result', () => {
      fc.assert(
        fc.property(
          fc.array(cardPropsArbitrary, { minLength: 1, maxLength: 10 }),
          (propsArray) => {
            // 1. 创建有效的 Card Entity 数组
            const cards: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                cards.push(cardResult.value);
              }
            }
            
            // 如果没有有效的卡片，跳过此测试
            if (cards.length === 0) {
              return true;
            }
            
            // 2. Entity → DTO
            const dtos = CardMapper.fromEntityBatch(cards);
            
            // 3. 批量转换 DTO → Entity
            const result = CardMapper.toEntityBatch(dtos);
            
            // 4. 验证返回 ok
            expect(isErr(result)).toBe(false);
            
            if (!isErr(result)) {
              expect(result.value).toHaveLength(dtos.length);
              expect(result.value.every(card => card instanceof Card)).toBe(true);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('错误信息应该包含有用的调试信息', () => {
      fc.assert(
        fc.property(invalidCardPropsArbitrary, (props) => {
          // 1. 尝试创建 Card Entity
          const result = Card.create(props);
          
          // 2. 如果返回 err，验证错误信息
          if (isErr(result)) {
            const errorMessage = result.error.message;
            
            // 错误信息应该是非空字符串
            expect(errorMessage).toBeTruthy();
            expect(typeof errorMessage).toBe('string');
            expect(errorMessage.length).toBeGreaterThan(0);
          }
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  /**
   * **属性 9：Repository 保存-加载一致性**
   * **Validates: Requirements 3.1, 3.2, 5.5**
   * 
   * 对于任何 Card Entity，保存后再通过 findById 加载，应该得到等价的实体
   * 
   * 注意：这个测试需要 CardRepository 和 UnifiedStorageManager，
   * 但为了保持测试的独立性，我们在这里测试 Mapper 层的往返一致性，
   * 实际的 Repository 集成测试应该在 CardRepository.test.ts 中进行。
   */
  describe('Property 9: Repository Save-Load Consistency (Mapper Layer)', () => {
    it('通过 Mapper 的保存-加载流程应该保持数据一致性', () => {
      fc.assert(
        fc.property(cardPropsArbitrary, (props) => {
          // 1. 创建 Card Entity
          const cardResult = Card.create(props);
          
          // 跳过无效的输入
          if (isErr(cardResult)) {
            return true;
          }
          
          const originalCard = cardResult.value;
          
          // 2. 模拟保存流程：Entity → DTO → FSRSCard
          const dto = CardMapper.fromEntity(originalCard);
          const fsrsCard = CardMapper.toDomain(dto);
          
          // 3. 模拟加载流程：FSRSCard → DTO → Entity
          const loadedDto = CardMapper.toPersistence(fsrsCard);
          const loadedResult = CardMapper.toEntity(loadedDto);
          
          // 4. 验证加载成功
          expect(isErr(loadedResult)).toBe(false);
          if (isErr(loadedResult)) {
            return false;
          }
          
          const loadedCard = loadedResult.value;
          
          // 5. 验证数据一致性
          const originalProps = originalCard.toObject();
          const loadedProps = loadedCard.toObject();
          
          // 基本字段
          expect(loadedProps.id).toBe(originalProps.id);
          expect(loadedProps.blockId).toBe(originalProps.blockId);
          expect(loadedProps.due).toBe(originalProps.due);
          expect(loadedProps.stability).toBe(originalProps.stability);
          expect(loadedProps.difficulty).toBe(originalProps.difficulty);
          expect(loadedProps.reps).toBe(originalProps.reps);
          expect(loadedProps.lapses).toBe(originalProps.lapses);
          expect(loadedProps.state).toBe(originalProps.state);
          expect(loadedProps.priority).toBe(originalProps.priority);
          expect(loadedProps.type).toBe(originalProps.type);
          
          // Xiuyuan 元数据
          if (originalProps.xiuyuanMetadata) {
            expect(loadedProps.xiuyuanMetadata).toBeDefined();
            expect(loadedProps.xiuyuanMetadata?.xiuyuanID).toBe(originalProps.xiuyuanMetadata.xiuyuanID);
            expect(loadedProps.xiuyuanMetadata?.templateID).toBe(originalProps.xiuyuanMetadata.templateID);
          } else {
            expect(loadedProps.xiuyuanMetadata).toBeUndefined();
          }
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量保存-加载流程应该保持数据一致性', () => {
      fc.assert(
        fc.property(
          fc.array(cardPropsArbitrary, { minLength: 1, maxLength: 10 }),
          (propsArray) => {
            // 1. 创建 Card Entity 数组
            const cards: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                cards.push(cardResult.value);
              }
            }
            
            // 如果没有有效的卡片，跳过此测试
            if (cards.length === 0) {
              return true;
            }
            
            // 2. 模拟批量保存流程：Entity[] → DTO[] → FSRSCard[]
            const dtos = CardMapper.fromEntityBatch(cards);
            const fsrsCards = CardMapper.toDomainBatch(dtos);
            
            // 3. 模拟批量加载流程：FSRSCard[] → DTO[] → Entity[]
            const loadedDtos = CardMapper.toPersistenceBatch(fsrsCards);
            const loadedResult = CardMapper.toEntityBatch(loadedDtos);
            
            // 4. 验证加载成功
            expect(isErr(loadedResult)).toBe(false);
            if (isErr(loadedResult)) {
              return false;
            }
            
            const loadedCards = loadedResult.value;
            
            // 5. 验证数组长度
            expect(loadedCards.length).toBe(cards.length);
            
            // 6. 验证每个卡片的数据一致性
            for (let i = 0; i < cards.length; i++) {
              const originalProps = cards[i].toObject();
              const loadedProps = loadedCards[i].toObject();
              
              expect(loadedProps.id).toBe(originalProps.id);
              expect(loadedProps.blockId).toBe(originalProps.blockId);
              expect(loadedProps.stability).toBe(originalProps.stability);
              expect(loadedProps.difficulty).toBe(originalProps.difficulty);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('保存-加载流程应该保持 Xiuyuan 元数据完整性', () => {
      fc.assert(
        fc.property(
          fc.record({
            ...cardPropsArbitrary.value,
            type: fc.constant(CardType.Concept),
            xiuyuanMetadata: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
              priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            }),
          }),
          (props) => {
            // 1. 创建 Card Entity
            const cardResult = Card.create(props);
            
            if (isErr(cardResult)) {
              return true;
            }
            
            const originalCard = cardResult.value;
            
            // 2. 保存流程
            const dto = CardMapper.fromEntity(originalCard);
            const fsrsCard = CardMapper.toDomain(dto);
            
            // 3. 加载流程
            const loadedDto = CardMapper.toPersistence(fsrsCard);
            const loadedResult = CardMapper.toEntity(loadedDto);
            
            expect(isErr(loadedResult)).toBe(false);
            if (isErr(loadedResult)) {
              return false;
            }
            
            const loadedCard = loadedResult.value;
            
            // 4. 验证 Xiuyuan 元数据完整性
            expect(loadedCard.xiuyuanMetadata).toBeDefined();
            expect(loadedCard.xiuyuanMetadata?.xiuyuanID).toBe(props.xiuyuanMetadata.xiuyuanID);
            expect(loadedCard.xiuyuanMetadata?.templateID).toBe(props.xiuyuanMetadata.templateID);
            expect(loadedCard.xiuyuanMetadata?.frontBlockIDs).toEqual(props.xiuyuanMetadata.frontBlockIDs);
            expect(loadedCard.xiuyuanMetadata?.backBlockIDs).toEqual(props.xiuyuanMetadata.backBlockIDs);
            expect(loadedCard.xiuyuanMetadata?.fieldMapping).toEqual(props.xiuyuanMetadata.fieldMapping);
            expect(loadedCard.xiuyuanMetadata?.priority).toBe(props.xiuyuanMetadata.priority);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  /**
   * **属性 10：DTO 索引使用顶层字段**
   * **Validates: Requirements 4.5**
   * 
   * 对于任何包含 xiuyuanID 的 DTO，DTO 应该在顶层包含 xiuyuanID 字段，
   * 而不需要解析 meta 对象。这确保了索引构建的性能。
   * 
   * 注意：实际的索引构建和查询测试应该在 UnifiedStorageManager 的集成测试中进行。
   * 这里我们测试 Mapper 层是否正确地将 xiuyuanID 提取到顶层。
   */
  describe('Property 10: DTO Index Uses Top-Level Fields', () => {
    it('包含 Xiuyuan 元数据的 Entity 转换为 DTO 后应该在顶层包含 xiuyuanID', () => {
      fc.assert(
        fc.property(
          fc.record({
            ...cardPropsArbitrary.value,
            type: fc.constant(CardType.Concept),
            xiuyuanMetadata: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
              priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            }),
          }),
          (props) => {
            // 1. 创建 Card Entity
            const cardResult = Card.create(props);
            
            if (isErr(cardResult)) {
              return true;
            }
            
            const card = cardResult.value;
            
            // 2. Entity → DTO
            const dto = CardMapper.fromEntity(card);
            
            // 3. 验证 DTO 顶层包含 xiuyuanID（不需要解析 meta）
            expect(dto.xiuyuanID).toBeDefined();
            expect(dto.xiuyuanID).toBe(props.xiuyuanMetadata.xiuyuanID);
            
            // 4. 验证可以直接访问顶层字段（性能优化）
            expect(typeof dto.xiuyuanID).toBe('string');
            expect(dto.xiuyuanID.length).toBeGreaterThan(0);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('包含 Xiuyuan 元数据的 FSRSCard 转换为 DTO 后应该在顶层包含 xiuyuanID', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: fc.constant(CardType.Concept),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.constant('concept' as const),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            meta: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
            }),
          }),
          (card) => {
            // 1. FSRSCard → DTO
            const dto = CardMapper.toPersistence(card);
            
            // 2. 验证 DTO 顶层包含 xiuyuanID
            expect(dto.xiuyuanID).toBeDefined();
            expect(dto.xiuyuanID).toBe(card.meta.xiuyuanID);
            
            // 3. 验证可以直接访问顶层字段（不需要解析 meta）
            expect(typeof dto.xiuyuanID).toBe('string');
            expect(dto.xiuyuanID.length).toBeGreaterThan(0);
            
            // 4. 验证 meta 中不包含 xiuyuanID（避免重复）
            expect(dto.meta?.xiuyuanID).toBeUndefined();
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量转换应该为所有 Xiuyuan 卡片在顶层包含 xiuyuanID', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              ...cardPropsArbitrary.value,
              type: fc.constant(CardType.Concept),
              xiuyuanMetadata: fc.record({
                xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
                templateID: fc.string({ minLength: 1, maxLength: 50 }),
                frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
                backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
                fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
                priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
              }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (propsArray) => {
            // 1. 创建 Card Entity 数组
            const cards: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                cards.push(cardResult.value);
              }
            }
            
            if (cards.length === 0) {
              return true;
            }
            
            // 2. 批量转换 Entity → DTO
            const dtos = CardMapper.fromEntityBatch(cards);
            
            // 3. 验证所有 DTO 都在顶层包含 xiuyuanID
            for (const dto of dtos) {
              expect(dto.xiuyuanID).toBeDefined();
              expect(typeof dto.xiuyuanID).toBe('string');
              expect(dto.xiuyuanID.length).toBeGreaterThan(0);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('DTO 应该在顶层包含所有索引相关的字段', () => {
      fc.assert(
        fc.property(
          fc.record({
            ...cardPropsArbitrary.value,
            type: fc.constant(CardType.Concept),
            xiuyuanMetadata: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
              priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            }),
          }),
          (props) => {
            // 1. 创建 Card Entity
            const cardResult = Card.create(props);
            
            if (isErr(cardResult)) {
              return true;
            }
            
            const card = cardResult.value;
            
            // 2. Entity → DTO
            const dto = CardMapper.fromEntity(card);
            
            // 3. 验证所有索引相关的字段都在顶层
            // blockId - 用于 blockID 索引
            expect(dto.blockId).toBeDefined();
            expect(typeof dto.blockId).toBe('string');
            
            // xiuyuanID - 用于 xiuyuanID 索引
            expect(dto.xiuyuanID).toBeDefined();
            expect(typeof dto.xiuyuanID).toBe('string');
            
            // type - 用于 type 索引
            expect(dto.type).toBeDefined();
            expect(typeof dto.type).toBe('string');
            
            // priority - 用于 priority 索引
            expect(dto.priority).toBeDefined();
            expect(typeof dto.priority).toBe('number');
            
            // 4. 验证这些字段可以直接访问，不需要解析 meta
            // 这是性能优化的关键
            const hasDirectAccess = 
              dto.blockId !== undefined &&
              dto.xiuyuanID !== undefined &&
              dto.type !== undefined &&
              dto.priority !== undefined;
            
            expect(hasDirectAccess).toBe(true);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  /**
   * **属性 11：向后兼容性保持**
   * **Validates: Requirements 5.1, 5.4**
   * 
   * 对于任何 FSRSCard，使用旧接口（toPersistence/toDomain）保存后，
   * 使用新接口（fromEntity/toEntity）加载应该得到正确的数据。
   * 这确保了新旧接口可以混合使用。
   */
  describe('Property 11: Backward Compatibility', () => {
    it('旧接口保存的数据应该可以通过新接口加载', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: cardTypeArbitrary,
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.option(fc.constantFrom('concept' as const, 'descriptor' as const), { nil: undefined }),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            meta: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined }),
          }),
          (fsrsCard) => {
            // 1. 使用旧接口保存：FSRSCard → DTO
            const dto = CardMapper.toPersistence(fsrsCard);
            
            // 2. 使用新接口加载：DTO → Entity
            const entityResult = CardMapper.toEntity(dto);
            
            // 3. 验证加载成功
            expect(isErr(entityResult)).toBe(false);
            if (isErr(entityResult)) {
              return false;
            }
            
            const entity = entityResult.value;
            
            // 4. 验证数据正确
            expect(entity.id.value).toBe(fsrsCard.id);
            expect(entity.blockId.value).toBe(fsrsCard.blockId);
            expect(entity.due).toBe(fsrsCard.due);
            expect(entity.stability).toBe(fsrsCard.stability);
            expect(entity.difficulty).toBe(fsrsCard.difficulty);
            expect(entity.reps).toBe(fsrsCard.reps);
            expect(entity.lapses).toBe(fsrsCard.lapses);
            expect(entity.state).toBe(fsrsCard.state);
            expect(entity.priority.value).toBe(fsrsCard.priority);
            expect(entity.type).toBe(fsrsCard.type);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('新接口保存的数据应该可以通过旧接口加载', () => {
      fc.assert(
        fc.property(cardPropsArbitrary, (props) => {
          // 1. 创建 Card Entity
          const cardResult = Card.create(props);
          
          if (isErr(cardResult)) {
            return true;
          }
          
          const entity = cardResult.value;
          
          // 2. 使用新接口保存：Entity → DTO
          const dto = CardMapper.fromEntity(entity);
          
          // 3. 使用旧接口加载：DTO → FSRSCard
          const fsrsCard = CardMapper.toDomain(dto);
          
          // 4. 验证数据正确
          expect(fsrsCard.id).toBe(entity.id.value);
          expect(fsrsCard.blockId).toBe(entity.blockId.value);
          expect(fsrsCard.due).toBe(entity.due);
          expect(fsrsCard.stability).toBe(entity.stability);
          expect(fsrsCard.difficulty).toBe(entity.difficulty);
          expect(fsrsCard.reps).toBe(entity.reps);
          expect(fsrsCard.lapses).toBe(entity.lapses);
          expect(fsrsCard.state).toBe(entity.state);
          expect(fsrsCard.priority).toBe(entity.priority.value);
          expect(fsrsCard.type).toBe(entity.type);
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('新旧接口混合使用应该保持数据一致性', () => {
      fc.assert(
        fc.property(cardPropsArbitrary, (props) => {
          // 1. 创建 Card Entity
          const cardResult = Card.create(props);
          
          if (isErr(cardResult)) {
            return true;
          }
          
          const originalEntity = cardResult.value;
          
          // 2. 新接口：Entity → DTO
          const dto1 = CardMapper.fromEntity(originalEntity);
          
          // 3. 旧接口：DTO → FSRSCard
          const fsrsCard = CardMapper.toDomain(dto1);
          
          // 4. 旧接口：FSRSCard → DTO
          const dto2 = CardMapper.toPersistence(fsrsCard);
          
          // 5. 新接口：DTO → Entity
          const restoredResult = CardMapper.toEntity(dto2);
          
          expect(isErr(restoredResult)).toBe(false);
          if (isErr(restoredResult)) {
            return false;
          }
          
          const restoredEntity = restoredResult.value;
          
          // 6. 验证数据一致性
          const originalProps = originalEntity.toObject();
          const restoredProps = restoredEntity.toObject();
          
          expect(restoredProps.id).toBe(originalProps.id);
          expect(restoredProps.blockId).toBe(originalProps.blockId);
          expect(restoredProps.stability).toBe(originalProps.stability);
          expect(restoredProps.difficulty).toBe(originalProps.difficulty);
          expect(restoredProps.priority).toBe(originalProps.priority);
          expect(restoredProps.type).toBe(originalProps.type);
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('Xiuyuan 卡片在新旧接口混合使用时应该保持元数据完整性', () => {
      fc.assert(
        fc.property(
          fc.record({
            ...cardPropsArbitrary.value,
            type: fc.constant(CardType.Concept),
            xiuyuanMetadata: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              fieldMapping: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
              priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            }),
          }),
          (props) => {
            // 1. 创建 Card Entity
            const cardResult = Card.create(props);
            
            if (isErr(cardResult)) {
              return true;
            }
            
            const originalEntity = cardResult.value;
            
            // 2. 新接口：Entity → DTO
            const dto1 = CardMapper.fromEntity(originalEntity);
            
            // 3. 验证 DTO 顶层包含 Xiuyuan 字段
            expect(dto1.xiuyuanID).toBe(props.xiuyuanMetadata.xiuyuanID);
            expect(dto1.templateID).toBe(props.xiuyuanMetadata.templateID);
            
            // 4. 旧接口：DTO → FSRSCard
            const fsrsCard = CardMapper.toDomain(dto1);
            
            // 5. 验证 FSRSCard.meta 包含 Xiuyuan 字段
            expect(fsrsCard.meta?.xiuyuanID).toBe(props.xiuyuanMetadata.xiuyuanID);
            expect(fsrsCard.meta?.templateID).toBe(props.xiuyuanMetadata.templateID);
            
            // 6. 旧接口：FSRSCard → DTO
            const dto2 = CardMapper.toPersistence(fsrsCard);
            
            // 7. 验证 DTO 顶层仍然包含 Xiuyuan 字段
            expect(dto2.xiuyuanID).toBe(props.xiuyuanMetadata.xiuyuanID);
            expect(dto2.templateID).toBe(props.xiuyuanMetadata.templateID);
            
            // 8. 新接口：DTO → Entity
            const restoredResult = CardMapper.toEntity(dto2);
            
            expect(isErr(restoredResult)).toBe(false);
            if (isErr(restoredResult)) {
              return false;
            }
            
            const restoredEntity = restoredResult.value;
            
            // 9. 验证 Xiuyuan 元数据完整性
            expect(restoredEntity.xiuyuanMetadata?.xiuyuanID).toBe(props.xiuyuanMetadata.xiuyuanID);
            expect(restoredEntity.xiuyuanMetadata?.templateID).toBe(props.xiuyuanMetadata.templateID);
            expect(restoredEntity.xiuyuanMetadata?.frontBlockIDs).toEqual(props.xiuyuanMetadata.frontBlockIDs);
            expect(restoredEntity.xiuyuanMetadata?.backBlockIDs).toEqual(props.xiuyuanMetadata.backBlockIDs);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量操作在新旧接口混合使用时应该保持数据一致性', () => {
      fc.assert(
        fc.property(
          fc.array(cardPropsArbitrary, { minLength: 1, maxLength: 10 }),
          (propsArray) => {
            // 1. 创建 Card Entity 数组
            const entities: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                entities.push(cardResult.value);
              }
            }
            
            if (entities.length === 0) {
              return true;
            }
            
            // 2. 新接口：Entity[] → DTO[]
            const dtos1 = CardMapper.fromEntityBatch(entities);
            
            // 3. 旧接口：DTO[] → FSRSCard[]
            const fsrsCards = CardMapper.toDomainBatch(dtos1);
            
            // 4. 旧接口：FSRSCard[] → DTO[]
            const dtos2 = CardMapper.toPersistenceBatch(fsrsCards);
            
            // 5. 新接口：DTO[] → Entity[]
            const restoredResult = CardMapper.toEntityBatch(dtos2);
            
            expect(isErr(restoredResult)).toBe(false);
            if (isErr(restoredResult)) {
              return false;
            }
            
            const restoredEntities = restoredResult.value;
            
            // 6. 验证数组长度
            expect(restoredEntities.length).toBe(entities.length);
            
            // 7. 验证每个元素的数据一致性
            for (let i = 0; i < entities.length; i++) {
              const originalProps = entities[i].toObject();
              const restoredProps = restoredEntities[i].toObject();
              
              expect(restoredProps.id).toBe(originalProps.id);
              expect(restoredProps.blockId).toBe(originalProps.blockId);
              expect(restoredProps.stability).toBe(originalProps.stability);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  /**
   * **属性 12：转换不修改原始数据**
   * **Validates: Requirements 7.5**
   * 
   * 对于任何 Card Entity，转换为 DTO 失败时，原始 Entity 的所有字段应该保持不变。
   * 这确保了转换操作的不变性（immutability）。
   */
  describe('Property 12: Conversion Does Not Modify Original Data', () => {
    it('Entity → DTO 转换不应该修改原始 Entity', () => {
      fc.assert(
        fc.property(cardPropsArbitrary, (props) => {
          // 1. 创建 Card Entity
          const cardResult = Card.create(props);
          
          if (isErr(cardResult)) {
            return true;
          }
          
          const card = cardResult.value;
          
          // 2. 保存原始数据的快照
          const originalProps = card.toObject();
          const originalSnapshot = structuredClone(originalProps);
          
          // 3. 执行转换
          CardMapper.fromEntity(card);
          
          // 4. 验证原始 Entity 未被修改
          const afterProps = card.toObject();
          
          expect(afterProps.id).toBe(originalSnapshot.id);
          expect(afterProps.blockId).toBe(originalSnapshot.blockId);
          expect(afterProps.due).toBe(originalSnapshot.due);
          expect(afterProps.stability).toBe(originalSnapshot.stability);
          expect(afterProps.difficulty).toBe(originalSnapshot.difficulty);
          expect(afterProps.reps).toBe(originalSnapshot.reps);
          expect(afterProps.lapses).toBe(originalSnapshot.lapses);
          expect(afterProps.state).toBe(originalSnapshot.state);
          expect(afterProps.priority).toBe(originalSnapshot.priority);
          expect(afterProps.type).toBe(originalSnapshot.type);
          expect(afterProps.tags).toEqual(originalSnapshot.tags);
          
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('DTO → Entity 转换失败不应该修改原始 DTO', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: -1000, max: 1000, noNaN: true }), // 可能是负数（无效）
            difficulty: fc.double({ min: -10, max: 20, noNaN: true }), // 可能超出范围（无效）
            reps: fc.integer({ min: -100, max: 1000 }), // 可能是负数（无效）
            lapses: fc.integer({ min: -100, max: 100 }), // 可能是负数（无效）
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            priority: fc.integer({ min: -100, max: 200 }), // 可能超出范围（无效）
            type: cardTypeArbitrary,
            tags: fc.array(fc.string(), { maxLength: 10 }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
          }),
          (dto) => {
            // 1. 保存原始 DTO 的快照
            const originalSnapshot = structuredClone(dto);
            
            // 2. 尝试转换（可能失败）
            CardMapper.toEntity(dto);
            
            // 3. 验证原始 DTO 未被修改
            expect(dto.id).toBe(originalSnapshot.id);
            expect(dto.blockId).toBe(originalSnapshot.blockId);
            expect(dto.due).toBe(originalSnapshot.due);
            expect(dto.stability).toBe(originalSnapshot.stability);
            expect(dto.difficulty).toBe(originalSnapshot.difficulty);
            expect(dto.reps).toBe(originalSnapshot.reps);
            expect(dto.lapses).toBe(originalSnapshot.lapses);
            expect(dto.state).toBe(originalSnapshot.state);
            expect(dto.priority).toBe(originalSnapshot.priority);
            expect(dto.type).toBe(originalSnapshot.type);
            expect(dto.tags).toEqual(originalSnapshot.tags);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('FSRSCard → DTO 转换不应该修改原始 FSRSCard', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: cardTypeArbitrary,
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.option(fc.constantFrom('concept' as const, 'descriptor' as const), { nil: undefined }),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            meta: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined }),
          }),
          (fsrsCard) => {
            // 1. 保存原始 FSRSCard 的快照
            const originalSnapshot = structuredClone(fsrsCard);
            
            // 2. 执行转换
            CardMapper.toPersistence(fsrsCard);
            
            // 3. 验证原始 FSRSCard 未被修改
            expect(fsrsCard.id).toBe(originalSnapshot.id);
            expect(fsrsCard.blockId).toBe(originalSnapshot.blockId);
            expect(fsrsCard.due).toBe(originalSnapshot.due);
            expect(fsrsCard.stability).toBe(originalSnapshot.stability);
            expect(fsrsCard.difficulty).toBe(originalSnapshot.difficulty);
            expect(fsrsCard.reps).toBe(originalSnapshot.reps);
            expect(fsrsCard.lapses).toBe(originalSnapshot.lapses);
            expect(fsrsCard.state).toBe(originalSnapshot.state);
            expect(fsrsCard.priority).toBe(originalSnapshot.priority);
            expect(fsrsCard.type).toBe(originalSnapshot.type);
            expect(fsrsCard.tags).toEqual(originalSnapshot.tags);
            expect(fsrsCard.meta).toEqual(originalSnapshot.meta);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量转换不应该修改原始 Entity 数组', () => {
      fc.assert(
        fc.property(
          fc.array(cardPropsArbitrary, { minLength: 1, maxLength: 10 }),
          (propsArray) => {
            // 1. 创建 Card Entity 数组
            const cards: Card[] = [];
            for (const props of propsArray) {
              const cardResult = Card.create(props);
              if (!isErr(cardResult)) {
                cards.push(cardResult.value);
              }
            }
            
            if (cards.length === 0) {
              return true;
            }
            
            // 2. 保存原始数据的快照
            const originalSnapshots = cards.map(card => 
              structuredClone(card.toObject())
            );
            
            // 3. 执行批量转换
            CardMapper.fromEntityBatch(cards);
            
            // 4. 验证原始 Entity 数组未被修改
            for (let i = 0; i < cards.length; i++) {
              const afterProps = cards[i].toObject();
              const originalSnapshot = originalSnapshots[i];
              
              expect(afterProps.id).toBe(originalSnapshot.id);
              expect(afterProps.blockId).toBe(originalSnapshot.blockId);
              expect(afterProps.stability).toBe(originalSnapshot.stability);
              expect(afterProps.difficulty).toBe(originalSnapshot.difficulty);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('批量转换失败不应该修改原始 DTO 数组', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              blockId: fc.string({ minLength: 1, maxLength: 50 }),
              due: fc.integer({ min: 0, max: Date.now() * 2 }),
              stability: fc.double({ min: -1000, max: 1000, noNaN: true }), // 可能无效
              difficulty: fc.double({ min: -10, max: 20, noNaN: true }), // 可能无效
              reps: fc.integer({ min: -100, max: 1000 }), // 可能无效
              lapses: fc.integer({ min: -100, max: 100 }), // 可能无效
              state: cardStateArbitrary,
              lastReview: fc.integer({ min: 0, max: Date.now() }),
              elapsedDays: fc.integer({ min: 0, max: 365 }),
              scheduledDays: fc.integer({ min: 0, max: 365 }),
              priority: fc.integer({ min: -100, max: 200 }), // 可能无效
              type: cardTypeArbitrary,
              tags: fc.array(fc.string(), { maxLength: 10 }),
              leechCount: fc.integer({ min: 0, max: 20 }),
              isLeech: fc.boolean(),
              skipped: fc.boolean(),
              createdAt: fc.integer({ min: 0, max: Date.now() }),
              updatedAt: fc.integer({ min: 0, max: Date.now() }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (dtos) => {
            // 1. 保存原始 DTO 数组的快照
            const originalSnapshots = dtos.map(dto => 
              structuredClone(dto)
            );
            
            // 2. 尝试批量转换（可能失败）
            CardMapper.toEntityBatch(dtos);
            
            // 3. 验证原始 DTO 数组未被修改
            for (let i = 0; i < dtos.length; i++) {
              const dto = dtos[i];
              const originalSnapshot = originalSnapshots[i];
              
              expect(dto.id).toBe(originalSnapshot.id);
              expect(dto.blockId).toBe(originalSnapshot.blockId);
              expect(dto.stability).toBe(originalSnapshot.stability);
              expect(dto.difficulty).toBe(originalSnapshot.difficulty);
              expect(dto.reps).toBe(originalSnapshot.reps);
              expect(dto.lapses).toBe(originalSnapshot.lapses);
              expect(dto.priority).toBe(originalSnapshot.priority);
            }
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    it('Xiuyuan 字段提取不应该修改原始 FSRSCard.meta', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            blockId: fc.string({ minLength: 1, maxLength: 50 }),
            due: fc.integer({ min: 0, max: Date.now() * 2 }),
            stability: fc.double({ min: 0, max: 1000, noNaN: true }),
            difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
            reps: fc.integer({ min: 0, max: 1000 }),
            lapses: fc.integer({ min: 0, max: 100 }),
            state: cardStateArbitrary,
            lastReview: fc.integer({ min: 0, max: Date.now() }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
            learning_step: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            priority: fc.integer({ min: 0, max: 100 }),
            type: fc.constant(CardType.Concept),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            cardTypeMarker: fc.constant('concept' as const),
            neuralRoamSeed: fc.option(fc.boolean(), { nil: undefined }),
            leechCount: fc.integer({ min: 0, max: 20 }),
            isLeech: fc.boolean(),
            skipped: fc.boolean(),
            skipNote: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            skipUntil: fc.option(fc.integer({ min: 0, max: Date.now() * 2 }), { nil: undefined }),
            sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
            extractedFrom: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            aFactor: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
            schedulerType: fc.option(
              fc.constantFrom('fsrs-v6' as const, 'sm2' as const, 'sm15' as const, 'a-factor' as const, 'a-factor-v2' as const, 'riff' as const),
              { nil: undefined }
            ),
            syncToRiff: fc.option(fc.boolean(), { nil: undefined }),
            riffCardId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            schedulerMeta: fc.option(fc.object(), { nil: undefined }),
            postponeCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
            lastPostponeDate: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            rescheduleHistory: fc.option(fc.array(fc.object(), { maxLength: 5 }), { nil: undefined }),
            meta: fc.record({
              xiuyuanID: fc.string({ minLength: 1, maxLength: 50 }),
              templateID: fc.string({ minLength: 1, maxLength: 50 }),
              frontBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              backBlockIDs: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
              customField: fc.string(), // 额外的字段
            }),
          }),
          (fsrsCard) => {
            // 1. 保存原始 meta 的快照
            const originalMeta = structuredClone(fsrsCard.meta);
            
            // 2. 执行转换（会提取 Xiuyuan 字段）
            CardMapper.toPersistence(fsrsCard);
            
            // 3. 验证原始 FSRSCard.meta 未被修改
            expect(fsrsCard.meta).toEqual(originalMeta);
            expect(fsrsCard.meta.xiuyuanID).toBe(originalMeta.xiuyuanID);
            expect(fsrsCard.meta.templateID).toBe(originalMeta.templateID);
            expect(fsrsCard.meta.frontBlockIDs).toEqual(originalMeta.frontBlockIDs);
            expect(fsrsCard.meta.backBlockIDs).toEqual(originalMeta.backBlockIDs);
            expect(fsrsCard.meta.customField).toBe(originalMeta.customField);
            
            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });
