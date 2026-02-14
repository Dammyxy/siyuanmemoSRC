/**
 * BaseReviewQueue Learning Steps Tests
 * BaseReviewQueue学习步骤单元测试
 * 
 * 测试BaseReviewQueue中learning steps相关功能：
 * - convertStepToMs方法的各种输入
 * - 边界情况和错误处理
 * 
 * @see .kiro/specs/learning-steps-rating-fix/requirements.md
 * @see .kiro/specs/learning-steps-rating-fix/design.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseReviewQueue } from '../BaseReviewQueue';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { QueueType } from '../../types/unified-data-source';
import { FSRSCard, CardState } from '../../types/card';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        }
    };
})();

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true
});

/**
 * 测试用的具体队列实现
 * 因为BaseReviewQueue是抽象类，需要创建一个具体实现用于测试
 */
class TestReviewQueue extends BaseReviewQueue {
    public name = 'TestQueue';
    
    async getCards(): Promise<FSRSCard[]> {
        return [];
    }
    
    async addCard(card: FSRSCard | string): Promise<void> {
        // 测试实现
    }
    
    async removeCard(cardId: string): Promise<void> {
        // 测试实现
    }
    
    async handleReview(cardId: string, rating: number): Promise<void> {
        // 测试实现
    }
    
    isDynamic(): boolean {
        return true;
    }
    
    // 暴露protected方法用于测试
    public testConvertStepToMs(step: string): number {
        return this.convertStepToMs(step);
    }
    
    public testGetLearningStepsConfig() {
        return this.getLearningStepsConfig();
    }
    
    public testCalculateAgainInterval(card: FSRSCard): number {
        return this.calculateAgainInterval(card);
    }
    
    public testCalculateHardInterval(card: FSRSCard): number {
        return this.calculateHardInterval(card);
    }
    
    public testCalculateNextDueDateForLowRating(card: FSRSCard, rating: number): number {
        return this.calculateNextDueDateForLowRating(card, rating);
    }
}

describe('BaseReviewQueue - Learning Steps', () => {
    let manager: UnifiedDataSourceManager;
    let queue: TestReviewQueue;
    
    beforeEach(() => {
        localStorageMock.clear();
        
        // Reset manager instance
        UnifiedDataSourceManager.resetInstance();
        manager = UnifiedDataSourceManager.getInstance();
        
        queue = new TestReviewQueue(manager, QueueType.RetrievalPractice);
    });
    
    describe('convertStepToMs', () => {
        describe('分钟单位 (m)', () => {
            it('应该正确转换1分钟', () => {
                const result = queue.testConvertStepToMs('1m');
                expect(result).toBe(60 * 1000); // 60,000 毫秒
            });
            
            it('应该正确转换10分钟', () => {
                const result = queue.testConvertStepToMs('10m');
                expect(result).toBe(10 * 60 * 1000); // 600,000 毫秒
            });
            
            it('应该正确转换60分钟', () => {
                const result = queue.testConvertStepToMs('60m');
                expect(result).toBe(60 * 60 * 1000); // 3,600,000 毫秒
            });
        });
        
        describe('小时单位 (h)', () => {
            it('应该正确转换1小时', () => {
                const result = queue.testConvertStepToMs('1h');
                expect(result).toBe(60 * 60 * 1000); // 3,600,000 毫秒
            });
            
            it('应该正确转换2小时', () => {
                const result = queue.testConvertStepToMs('2h');
                expect(result).toBe(2 * 60 * 60 * 1000); // 7,200,000 毫秒
            });
            
            it('应该正确转换24小时', () => {
                const result = queue.testConvertStepToMs('24h');
                expect(result).toBe(24 * 60 * 60 * 1000); // 86,400,000 毫秒
            });
        });
        
        describe('天单位 (d)', () => {
            it('应该正确转换1天', () => {
                const result = queue.testConvertStepToMs('1d');
                expect(result).toBe(24 * 60 * 60 * 1000); // 86,400,000 毫秒
            });
            
            it('应该正确转换7天', () => {
                const result = queue.testConvertStepToMs('7d');
                expect(result).toBe(7 * 24 * 60 * 60 * 1000); // 604,800,000 毫秒
            });
        });
        
        describe('边界情况', () => {
            it('应该正确处理0分钟', () => {
                const result = queue.testConvertStepToMs('0m');
                expect(result).toBe(0);
            });
            
            it('应该正确处理0小时', () => {
                const result = queue.testConvertStepToMs('0h');
                expect(result).toBe(0);
            });
            
            it('应该正确处理0天', () => {
                const result = queue.testConvertStepToMs('0d');
                expect(result).toBe(0);
            });
            
            it('应该正确处理大数值', () => {
                const result = queue.testConvertStepToMs('1000m');
                expect(result).toBe(1000 * 60 * 1000);
            });
        });
        
        describe('错误处理', () => {
            it('应该拒绝空字符串', () => {
                expect(() => queue.testConvertStepToMs('')).toThrow('Invalid step format');
            });
            
            it('应该拒绝只有单位没有数值', () => {
                expect(() => queue.testConvertStepToMs('m')).toThrow('Invalid step format');
            });
            
            it('应该拒绝无效的单位', () => {
                expect(() => queue.testConvertStepToMs('10x')).toThrow('Invalid step unit');
            });
            
            it('应该拒绝无效的单位（大写）', () => {
                expect(() => queue.testConvertStepToMs('10M')).toThrow('Invalid step unit');
            });
            
            it('应该拒绝负数', () => {
                expect(() => queue.testConvertStepToMs('-1m')).toThrow('Invalid step value');
            });
            
            it('应该拒绝非数字值', () => {
                expect(() => queue.testConvertStepToMs('abcm')).toThrow('Invalid step value');
            });
            
            it('应该接受小数但只取整数部分', () => {
                // parseInt会自动截断小数部分
                const result = queue.testConvertStepToMs('1.5m');
                expect(result).toBe(60 * 1000); // 1分钟，不是1.5分钟
            });
            
            it('应该拒绝没有单位的纯数字', () => {
                expect(() => queue.testConvertStepToMs('10')).toThrow('Invalid step unit');
            });
            
            it('应该只识别最后一个字符作为单位', () => {
                // '10mh' 会被解析为 '10m' + 'h'，即10m作为数值，h作为单位
                // 这会导致parseInt('10m')返回10，然后单位是'h'
                const result = queue.testConvertStepToMs('10mh');
                expect(result).toBe(10 * 60 * 60 * 1000); // 10小时
            });
        });
        
        describe('实际使用场景', () => {
            it('应该正确转换Anki默认的learning steps', () => {
                // Anki默认: 1m, 10m
                expect(queue.testConvertStepToMs('1m')).toBe(60 * 1000);
                expect(queue.testConvertStepToMs('10m')).toBe(10 * 60 * 1000);
            });
            
            it('应该正确转换FSRS默认的learning steps', () => {
                // FSRS默认: 1m, 10m
                expect(queue.testConvertStepToMs('1m')).toBe(60 * 1000);
                expect(queue.testConvertStepToMs('10m')).toBe(10 * 60 * 1000);
            });
            
            it('应该正确转换常见的relearning steps', () => {
                // 常见relearning: 10m
                expect(queue.testConvertStepToMs('10m')).toBe(10 * 60 * 1000);
            });
            
            it('应该正确转换较长的learning steps', () => {
                // 较长的steps: 1h, 4h, 1d
                expect(queue.testConvertStepToMs('1h')).toBe(60 * 60 * 1000);
                expect(queue.testConvertStepToMs('4h')).toBe(4 * 60 * 60 * 1000);
                expect(queue.testConvertStepToMs('1d')).toBe(24 * 60 * 60 * 1000);
            });
        });
    });
    
    describe('getLearningStepsConfig', () => {
        it('应该返回默认配置', () => {
            const config = queue.testGetLearningStepsConfig();
            
            expect(config).toBeDefined();
            expect(config.learning_steps).toEqual(['1m', '10m']);
            expect(config.relearning_steps).toEqual(['10m']);
            expect(config.easy_bonus).toBe(1.3);
            expect(config.graduating_interval_good).toBe(1);
            expect(config.graduating_interval_easy).toBe(4);
        });
        
        it('应该返回有效的learning steps配置', () => {
            const config = queue.testGetLearningStepsConfig();
            
            // 验证learning_steps是数组且不为空
            expect(Array.isArray(config.learning_steps)).toBe(true);
            expect(config.learning_steps.length).toBeGreaterThan(0);
            
            // 验证每个step都是有效格式
            config.learning_steps.forEach(step => {
                expect(typeof step).toBe('string');
                expect(step).toMatch(/^\d+[mhd]$/);
            });
        });
        
        it('应该返回有效的relearning steps配置', () => {
            const config = queue.testGetLearningStepsConfig();
            
            // 验证relearning_steps是数组且不为空
            expect(Array.isArray(config.relearning_steps)).toBe(true);
            expect(config.relearning_steps.length).toBeGreaterThan(0);
            
            // 验证每个step都是有效格式
            config.relearning_steps.forEach(step => {
                expect(typeof step).toBe('string');
                expect(step).toMatch(/^\d+[mhd]$/);
            });
        });
        
        it('应该返回有效的easy_bonus配置', () => {
            const config = queue.testGetLearningStepsConfig();
            
            expect(typeof config.easy_bonus).toBe('number');
            expect(config.easy_bonus).toBeGreaterThan(1); // Easy应该比Good更长
            expect(config.easy_bonus).toBeLessThan(3); // 但不应该太夸张
        });
        
        it('应该返回有效的graduating interval配置', () => {
            const config = queue.testGetLearningStepsConfig();
            
            // Good毕业间隔应该是正数
            expect(typeof config.graduating_interval_good).toBe('number');
            expect(config.graduating_interval_good).toBeGreaterThan(0);
            
            // Easy毕业间隔应该是正数
            expect(typeof config.graduating_interval_easy).toBe('number');
            expect(config.graduating_interval_easy).toBeGreaterThan(0);
            
            // Easy毕业间隔应该大于等于Good毕业间隔
            expect(config.graduating_interval_easy).toBeGreaterThanOrEqual(config.graduating_interval_good);
        });
        
        it('配置应该与Anki/FSRS默认值一致', () => {
            const config = queue.testGetLearningStepsConfig();
            
            // Anki和FSRS的默认learning steps都是 1m, 10m
            expect(config.learning_steps).toEqual(['1m', '10m']);
            
            // Anki和FSRS的默认relearning steps都是 10m
            expect(config.relearning_steps).toEqual(['10m']);
            
            // Easy bonus通常是1.3
            expect(config.easy_bonus).toBe(1.3);
        });
        
        it('多次调用应该返回相同的配置', () => {
            const config1 = queue.testGetLearningStepsConfig();
            const config2 = queue.testGetLearningStepsConfig();
            
            expect(config1).toEqual(config2);
        });
    });
    
    describe('calculateAgainInterval', () => {
        describe('基本功能', () => {
            it('应该返回当前时间 + 第一个learning step', () => {
                // learning_steps = ['1m', '10m']
                const card: FSRSCard = {
                    id: 'test-card-1',
                    blockId: 'block-1',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const before = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                const after = Date.now();
                
                // 应该是当前时间 + 1分钟（60000毫秒）
                const expectedMin = before + 60 * 1000;
                const expectedMax = after + 60 * 1000;
                
                expect(result).toBeGreaterThanOrEqual(expectedMin);
                expect(result).toBeLessThanOrEqual(expectedMax);
            });
            
            it('应该使用learning_steps的第一个step', () => {
                // learning_steps = ['1m', '10m']
                // 应该使用'1m'，而不是'10m'
                const card: FSRSCard = {
                    id: 'test-card-2',
                    blockId: 'block-2',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                const delay = result - now;
                
                // 延迟应该接近1分钟（60000毫秒），而不是10分钟
                expect(delay).toBeGreaterThanOrEqual(59000); // 允许1秒误差
                expect(delay).toBeLessThanOrEqual(61000);
            });
        });
        
        describe('状态处理', () => {
            it('New状态应该使用learning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-3',
                    blockId: 'block-3',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                const delay = result - now;
                
                // learning_steps = ['1m', '10m']，应该使用1分钟
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
            
            it('Learning状态应该使用learning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-4',
                    blockId: 'block-4',
                    state: CardState.Learning,
                    learning_step: 1,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                const delay = result - now;
                
                // learning_steps = ['1m', '10m']，应该使用1分钟
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
            
            it('Review状态应该使用relearning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-5',
                    blockId: 'block-5',
                    state: CardState.Review,
                    due: Date.now(),
                    stability: 5,
                    difficulty: 5,
                    elapsedDays: 10,
                    scheduledDays: 10,
                    reps: 5,
                    lapses: 1,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                const delay = result - now;
                
                // relearning_steps = ['10m']，应该使用10分钟
                expect(delay).toBeGreaterThanOrEqual(599000); // 允许1秒误差
                expect(delay).toBeLessThanOrEqual(601000);
            });
            
            it('Relearning状态应该使用learning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-6',
                    blockId: 'block-6',
                    state: CardState.Relearning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 3,
                    difficulty: 6,
                    elapsedDays: 5,
                    scheduledDays: 5,
                    reps: 3,
                    lapses: 2,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                const delay = result - now;
                
                // 非Review状态使用learning_steps = ['1m', '10m']
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
        });
        
        describe('边界情况', () => {
            it('应该处理空steps数组（使用默认1分钟）', () => {
                // 创建一个返回空steps的测试队列
                class EmptyStepsQueue extends TestReviewQueue {
                    protected getLearningStepsConfig() {
                        return {
                            learning_steps: [],
                            relearning_steps: [],
                            easy_bonus: 1.3,
                            graduating_interval_good: 1,
                            graduating_interval_easy: 4,
                        };
                    }
                    
                    public testCalculateAgainInterval(card: FSRSCard): number {
                        return this.calculateAgainInterval(card);
                    }
                }
                
                const emptyQueue = new EmptyStepsQueue(manager, QueueType.RetrievalPractice);
                const card: FSRSCard = {
                    id: 'test-card-7',
                    blockId: 'block-7',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = emptyQueue.testCalculateAgainInterval(card);
                const delay = result - now;
                
                // 应该使用默认1分钟
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
            
            it('应该处理undefined state（使用learning_steps）', () => {
                const card: FSRSCard = {
                    id: 'test-card-8',
                    blockId: 'block-8',
                    // state未定义
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                const delay = result - now;
                
                // 应该使用learning_steps（默认行为）
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
            
            it('应该处理learning_step为undefined', () => {
                const card: FSRSCard = {
                    id: 'test-card-9',
                    blockId: 'block-9',
                    state: CardState.Learning,
                    // learning_step未定义
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                const delay = result - now;
                
                // 应该正常工作，使用第一个step
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
        });
        
        describe('实际使用场景', () => {
            it('评分Again后，卡片不应该立即出现', () => {
                const card: FSRSCard = {
                    id: 'test-card-10',
                    blockId: 'block-10',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                
                // 新的due时间应该在未来（不是now）
                expect(result).toBeGreaterThan(now);
                
                // 应该至少延迟1分钟
                expect(result - now).toBeGreaterThanOrEqual(59000);
            });
            
            it('Review卡片失败后应该使用relearning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-11',
                    blockId: 'block-11',
                    state: CardState.Review,
                    due: Date.now(),
                    stability: 10,
                    difficulty: 5,
                    elapsedDays: 20,
                    scheduledDays: 20,
                    reps: 10,
                    lapses: 1,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                const delay = result - now;
                
                // relearning_steps = ['10m']
                // 应该使用10分钟，而不是learning_steps的1分钟
                expect(delay).toBeGreaterThanOrEqual(599000);
                expect(delay).toBeLessThanOrEqual(601000);
            });
            
            it('多次调用应该返回递增的时间戳', () => {
                const card: FSRSCard = {
                    id: 'test-card-12',
                    blockId: 'block-12',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const result1 = queue.testCalculateAgainInterval(card);
                
                // 等待1毫秒
                const start = Date.now();
                while (Date.now() - start < 1) {
                    // busy wait
                }
                
                const result2 = queue.testCalculateAgainInterval(card);
                
                // 第二次调用应该返回更大的时间戳（因为now增加了）
                expect(result2).toBeGreaterThanOrEqual(result1);
            });
        });
        
        describe('与convertStepToMs的集成', () => {
            it('应该正确使用convertStepToMs转换step', () => {
                const card: FSRSCard = {
                    id: 'test-card-13',
                    blockId: 'block-13',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                };
                
                const now = Date.now();
                const result = queue.testCalculateAgainInterval(card);
                
                // 手动计算期望值
                const config = queue.testGetLearningStepsConfig();
                const firstStep = config.learning_steps[0];
                const expectedDelay = queue.testConvertStepToMs(firstStep);
                const expected = now + expectedDelay;
                
                // 允许1毫秒误差
                expect(Math.abs(result - expected)).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('calculateHardInterval', () => {
        describe('基本功能', () => {
            it('单个step时应该返回 first_step * 1.5', () => {
                // 创建一个只有单个step的测试队列
                class SingleStepQueue extends TestReviewQueue {
                    protected getLearningStepsConfig() {
                        return {
                            learning_steps: ['1m'],
                            relearning_steps: ['10m'],
                            easy_bonus: 1.3,
                            graduating_interval_good: 1,
                            graduating_interval_easy: 4,
                        };
                    }
                    
                    public testCalculateHardInterval(card: FSRSCard): number {
                        return this.calculateHardInterval(card);
                    }
                }
                
                const singleQueue = new SingleStepQueue(manager, QueueType.RetrievalPractice);
                const card: FSRSCard = {
                    id: 'test-card-hard-1',
                    blockId: 'block-hard-1',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = singleQueue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // 1分钟 * 1.5 = 90秒 = 90000毫秒
                expect(delay).toBeGreaterThanOrEqual(89000); // 允许1秒误差
                expect(delay).toBeLessThanOrEqual(91000);
            });
            
            it('多个steps时应该返回 (first_step + next_step) / 2', () => {
                // learning_steps = ['1m', '10m']
                // Hard = (1 + 10) / 2 = 5.5分钟 = 330秒 = 330000毫秒
                const card: FSRSCard = {
                    id: 'test-card-hard-2',
                    blockId: 'block-hard-2',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // (1 + 10) / 2 = 5.5分钟 = 330秒 = 330000毫秒
                expect(delay).toBeGreaterThanOrEqual(329000); // 允许1秒误差
                expect(delay).toBeLessThanOrEqual(331000);
            });
            
            it('Hard间隔应该大于Again间隔', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-3',
                    blockId: 'block-hard-3',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const againInterval = queue.testCalculateAgainInterval(card);
                const hardInterval = queue.testCalculateHardInterval(card);
                
                const againDelay = againInterval - now;
                const hardDelay = hardInterval - now;
                
                // Hard应该大于Again
                expect(hardDelay).toBeGreaterThan(againDelay);
            });
        });
        
        describe('状态处理', () => {
            it('New状态应该使用learning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-4',
                    blockId: 'block-hard-4',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // learning_steps = ['1m', '10m']
                // Hard = (1 + 10) / 2 = 5.5分钟
                expect(delay).toBeGreaterThanOrEqual(329000);
                expect(delay).toBeLessThanOrEqual(331000);
            });
            
            it('Learning状态应该使用learning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-5',
                    blockId: 'block-hard-5',
                    state: CardState.Learning,
                    learning_step: 1,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // learning_steps = ['1m', '10m']
                // Hard = (1 + 10) / 2 = 5.5分钟
                expect(delay).toBeGreaterThanOrEqual(329000);
                expect(delay).toBeLessThanOrEqual(331000);
            });
            
            it('Review状态应该使用relearning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-6',
                    blockId: 'block-hard-6',
                    state: CardState.Review,
                    due: Date.now(),
                    stability: 5,
                    difficulty: 5,
                    elapsedDays: 10,
                    scheduledDays: 10,
                    reps: 5,
                    lapses: 1,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // relearning_steps = ['10m']（单个step）
                // Hard = 10 * 1.5 = 15分钟 = 900秒 = 900000毫秒
                expect(delay).toBeGreaterThanOrEqual(899000);
                expect(delay).toBeLessThanOrEqual(901000);
            });
            
            it('Relearning状态应该使用relearning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-7',
                    blockId: 'block-hard-7',
                    state: CardState.Relearning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 3,
                    difficulty: 6,
                    elapsedDays: 5,
                    scheduledDays: 5,
                    reps: 3,
                    lapses: 2,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // relearning_steps = ['10m']（单个step）
                // Hard = 10 * 1.5 = 15分钟
                expect(delay).toBeGreaterThanOrEqual(899000);
                expect(delay).toBeLessThanOrEqual(901000);
            });
        });
        
        describe('边界情况', () => {
            it('应该处理空steps数组（使用默认1分钟）', () => {
                class EmptyStepsQueue extends TestReviewQueue {
                    protected getLearningStepsConfig() {
                        return {
                            learning_steps: [],
                            relearning_steps: [],
                            easy_bonus: 1.3,
                            graduating_interval_good: 1,
                            graduating_interval_easy: 4,
                        };
                    }
                    
                    public testCalculateHardInterval(card: FSRSCard): number {
                        return this.calculateHardInterval(card);
                    }
                }
                
                const emptyQueue = new EmptyStepsQueue(manager, QueueType.RetrievalPractice);
                const card: FSRSCard = {
                    id: 'test-card-hard-8',
                    blockId: 'block-hard-8',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = emptyQueue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // 应该使用默认1分钟
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
            
            it('应该处理undefined state（使用learning_steps）', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-9',
                    blockId: 'block-hard-9',
                    // state未定义
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                } as any;
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // 应该使用learning_steps（默认行为）
                // (1 + 10) / 2 = 5.5分钟
                expect(delay).toBeGreaterThanOrEqual(329000);
                expect(delay).toBeLessThanOrEqual(331000);
            });
            
            it('应该处理learning_step为undefined', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-10',
                    blockId: 'block-hard-10',
                    state: CardState.Learning,
                    // learning_step未定义
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // 应该正常工作，使用first_step和next_step
                // (1 + 10) / 2 = 5.5分钟
                expect(delay).toBeGreaterThanOrEqual(329000);
                expect(delay).toBeLessThanOrEqual(331000);
            });
            
            it('应该处理currentStep超出范围', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-11',
                    blockId: 'block-hard-11',
                    state: CardState.Learning,
                    learning_step: 999, // 超出范围
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // 应该使用最后一个step
                // learning_steps = ['1m', '10m']
                // nextStepIndex = Math.min(999 + 1, 1) = 1
                // (1 + 10) / 2 = 5.5分钟
                expect(delay).toBeGreaterThanOrEqual(329000);
                expect(delay).toBeLessThanOrEqual(331000);
            });
        });
        
        describe('实际使用场景', () => {
            it('评分Hard后，间隔应该介于Again和Good之间', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-12',
                    blockId: 'block-hard-12',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const againInterval = queue.testCalculateAgainInterval(card);
                const hardInterval = queue.testCalculateHardInterval(card);
                
                const againDelay = againInterval - now;
                const hardDelay = hardInterval - now;
                
                // Again = 1分钟 = 60000毫秒
                // Hard = 5.5分钟 = 330000毫秒
                // Good = 10分钟 = 600000毫秒（下一个step）
                
                expect(hardDelay).toBeGreaterThan(againDelay);
                expect(hardDelay).toBeLessThan(600000); // 小于Good
            });
            
            it('Review卡片失败后Hard应该使用relearning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-13',
                    blockId: 'block-hard-13',
                    state: CardState.Review,
                    due: Date.now(),
                    stability: 10,
                    difficulty: 5,
                    elapsedDays: 20,
                    scheduledDays: 20,
                    reps: 10,
                    lapses: 1,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                const delay = result - now;
                
                // relearning_steps = ['10m']（单个step）
                // Hard = 10 * 1.5 = 15分钟
                expect(delay).toBeGreaterThanOrEqual(899000);
                expect(delay).toBeLessThanOrEqual(901000);
            });
            
            it('多次调用应该返回递增的时间戳', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-14',
                    blockId: 'block-hard-14',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const result1 = queue.testCalculateHardInterval(card);
                
                // 等待1毫秒
                const start = Date.now();
                while (Date.now() - start < 1) {
                    // busy wait
                }
                
                const result2 = queue.testCalculateHardInterval(card);
                
                // 第二次调用应该返回更大的时间戳（因为now增加了）
                expect(result2).toBeGreaterThanOrEqual(result1);
            });
        });
        
        describe('与其他方法的集成', () => {
            it('应该正确使用convertStepToMs转换step', () => {
                const card: FSRSCard = {
                    id: 'test-card-hard-15',
                    blockId: 'block-hard-15',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateHardInterval(card);
                
                // 手动计算期望值
                const config = queue.testGetLearningStepsConfig();
                const firstStepMs = queue.testConvertStepToMs(config.learning_steps[0]);
                const nextStepMs = queue.testConvertStepToMs(config.learning_steps[1]);
                const expectedDelay = Math.round((firstStepMs + nextStepMs) / 2);
                const expected = now + expectedDelay;
                
                // 允许1毫秒误差
                expect(Math.abs(result - expected)).toBeLessThanOrEqual(1);
            });
            
            it('单个step时应该正确使用1.5倍数', () => {
                class SingleStepQueue extends TestReviewQueue {
                    protected getLearningStepsConfig() {
                        return {
                            learning_steps: ['2m'],
                            relearning_steps: ['10m'],
                            easy_bonus: 1.3,
                            graduating_interval_good: 1,
                            graduating_interval_easy: 4,
                        };
                    }
                    
                    public testCalculateHardInterval(card: FSRSCard): number {
                        return this.calculateHardInterval(card);
                    }
                    
                    public testConvertStepToMs(step: string): number {
                        return this.convertStepToMs(step);
                    }
                    
                    public testGetLearningStepsConfig() {
                        return this.getLearningStepsConfig();
                    }
                }
                
                const singleQueue = new SingleStepQueue(manager, QueueType.RetrievalPractice);
                const card: FSRSCard = {
                    id: 'test-card-hard-16',
                    blockId: 'block-hard-16',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = singleQueue.testCalculateHardInterval(card);
                
                // 手动计算期望值
                const config = singleQueue.testGetLearningStepsConfig();
                const firstStepMs = singleQueue.testConvertStepToMs(config.learning_steps[0]);
                const expectedDelay = Math.round(firstStepMs * 1.5);
                const expected = now + expectedDelay;
                
                // 允许1毫秒误差
                expect(Math.abs(result - expected)).toBeLessThanOrEqual(1);
            });
        });
    });
    
    describe('calculateNextDueDateForLowRating', () => {
        describe('基本功能', () => {
            it('rating 1应该调用calculateAgainInterval', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-1',
                    blockId: 'block-low-1',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateNextDueDateForLowRating(card, 1);
                const delay = result - now;
                
                // 应该使用第一个learning step（1分钟）
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
            
            it('rating 2应该调用calculateHardInterval', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-2',
                    blockId: 'block-low-2',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateNextDueDateForLowRating(card, 2);
                const delay = result - now;
                
                // 应该使用Hard间隔（5.5分钟）
                expect(delay).toBeGreaterThanOrEqual(329000);
                expect(delay).toBeLessThanOrEqual(331000);
            });
            
            it('rating 1和rating 2应该返回不同的间隔', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-3',
                    blockId: 'block-low-3',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const rating1Result = queue.testCalculateNextDueDateForLowRating(card, 1);
                const rating2Result = queue.testCalculateNextDueDateForLowRating(card, 2);
                
                const rating1Delay = rating1Result - now;
                const rating2Delay = rating2Result - now;
                
                // rating 2的间隔应该大于rating 1
                expect(rating2Delay).toBeGreaterThan(rating1Delay);
            });
        });
        
        describe('状态处理', () => {
            it('New状态 + rating 1应该使用learning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-4',
                    blockId: 'block-low-4',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateNextDueDateForLowRating(card, 1);
                const delay = result - now;
                
                // learning_steps = ['1m', '10m']，应该使用1分钟
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
            
            it('Review状态 + rating 1应该使用relearning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-5',
                    blockId: 'block-low-5',
                    state: CardState.Review,
                    due: Date.now(),
                    stability: 5,
                    difficulty: 5,
                    elapsedDays: 10,
                    scheduledDays: 10,
                    reps: 5,
                    lapses: 1,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateNextDueDateForLowRating(card, 1);
                const delay = result - now;
                
                // relearning_steps = ['10m']，应该使用10分钟
                expect(delay).toBeGreaterThanOrEqual(599000);
                expect(delay).toBeLessThanOrEqual(601000);
            });
            
            it('Learning状态 + rating 2应该使用learning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-6',
                    blockId: 'block-low-6',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateNextDueDateForLowRating(card, 2);
                const delay = result - now;
                
                // learning_steps = ['1m', '10m']
                // Hard = (1 + 10) / 2 = 5.5分钟
                expect(delay).toBeGreaterThanOrEqual(329000);
                expect(delay).toBeLessThanOrEqual(331000);
            });
            
            it('Relearning状态 + rating 2应该使用relearning_steps', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-7',
                    blockId: 'block-low-7',
                    state: CardState.Relearning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 3,
                    difficulty: 6,
                    elapsedDays: 5,
                    scheduledDays: 5,
                    reps: 3,
                    lapses: 2,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateNextDueDateForLowRating(card, 2);
                const delay = result - now;
                
                // relearning_steps = ['10m']（单个step）
                // Hard = 10 * 1.5 = 15分钟
                expect(delay).toBeGreaterThanOrEqual(899000);
                expect(delay).toBeLessThanOrEqual(901000);
            });
        });
        
        describe('实际使用场景', () => {
            it('评分1后卡片不应该立即出现', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-8',
                    blockId: 'block-low-8',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateNextDueDateForLowRating(card, 1);
                
                // 新的due时间应该在未来（不是now）
                expect(result).toBeGreaterThan(now);
                
                // 应该至少延迟1分钟
                expect(result - now).toBeGreaterThanOrEqual(59000);
            });
            
            it('评分2的间隔应该介于评分1和评分3之间', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-9',
                    blockId: 'block-low-9',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const rating1Result = queue.testCalculateNextDueDateForLowRating(card, 1);
                const rating2Result = queue.testCalculateNextDueDateForLowRating(card, 2);
                
                const rating1Delay = rating1Result - now;
                const rating2Delay = rating2Result - now;
                
                // rating 1 = 1分钟 = 60000毫秒
                // rating 2 = 5.5分钟 = 330000毫秒
                // rating 3 = 10分钟 = 600000毫秒（下一个step）
                
                expect(rating2Delay).toBeGreaterThan(rating1Delay);
                expect(rating2Delay).toBeLessThan(600000); // 小于Good
            });
            
            it('多次调用应该返回递增的时间戳', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-10',
                    blockId: 'block-low-10',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const result1 = queue.testCalculateNextDueDateForLowRating(card, 1);
                
                // 等待1毫秒
                const start = Date.now();
                while (Date.now() - start < 1) {
                    // busy wait
                }
                
                const result2 = queue.testCalculateNextDueDateForLowRating(card, 1);
                
                // 第二次调用应该返回更大的时间戳（因为now增加了）
                expect(result2).toBeGreaterThanOrEqual(result1);
            });
        });
        
        describe('与其他方法的集成', () => {
            it('rating 1应该返回与calculateAgainInterval相同的结果', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-11',
                    blockId: 'block-low-11',
                    state: CardState.New,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const lowRatingResult = queue.testCalculateNextDueDateForLowRating(card, 1);
                const againResult = queue.testCalculateAgainInterval(card);
                
                // 两个方法应该返回相同的结果（允许1毫秒误差）
                expect(Math.abs(lowRatingResult - againResult)).toBeLessThanOrEqual(1);
            });
            
            it('rating 2应该返回与calculateHardInterval相同的结果', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-12',
                    blockId: 'block-low-12',
                    state: CardState.Learning,
                    learning_step: 0,
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const lowRatingResult = queue.testCalculateNextDueDateForLowRating(card, 2);
                const hardResult = queue.testCalculateHardInterval(card);
                
                // 两个方法应该返回相同的结果（允许1毫秒误差）
                expect(Math.abs(lowRatingResult - hardResult)).toBeLessThanOrEqual(1);
            });
        });
        
        describe('边界情况', () => {
            it('应该处理undefined state', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-13',
                    blockId: 'block-low-13',
                    // state未定义
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                } as any;
                
                const now = Date.now();
                const result = queue.testCalculateNextDueDateForLowRating(card, 1);
                const delay = result - now;
                
                // 应该使用learning_steps（默认行为）
                expect(delay).toBeGreaterThanOrEqual(59000);
                expect(delay).toBeLessThanOrEqual(61000);
            });
            
            it('应该处理learning_step为undefined', () => {
                const card: FSRSCard = {
                    id: 'test-card-low-14',
                    blockId: 'block-low-14',
                    state: CardState.Learning,
                    // learning_step未定义
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    lastReview: Date.now(),
                    priority: 0,
                    type: 'normal' as any,
                    tags: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    source: 'siyuan' as any,
                };
                
                const now = Date.now();
                const result = queue.testCalculateNextDueDateForLowRating(card, 2);
                const delay = result - now;
                
                // 应该正常工作
                expect(delay).toBeGreaterThanOrEqual(329000);
                expect(delay).toBeLessThanOrEqual(331000);
            });
        });
    });
});
