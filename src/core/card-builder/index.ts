import type { FSRSCard } from '@/types';
import type { CardBuilderStrategy } from './types';
import { DefaultBuilderStrategy } from './strategies/DefaultStrategy';
import { ClozeBuilderStrategy } from './strategies/ClozeStrategy';
import { QABuilderStrategy } from './strategies/QAStrategy';

// Topic/Item 检测
export * from './detectCardType';

export class CardBuilderContext {
    private strategies: CardBuilderStrategy[];

    constructor() {
        // 优先级：Q&A > 挖空 > 默认
        this.strategies = [
            new QABuilderStrategy(),
            new ClozeBuilderStrategy(),
            new DefaultBuilderStrategy()
        ];
    }

    /**
     * 根据内容自动选择策略并构建卡片
     */
    async build(blockId: string, content: string): Promise<FSRSCard> {
        for (const strategy of this.strategies) {
            if (strategy.match(blockId, content)) {
                console.log(`[CardBuilder] Using strategy: ${strategy.strategyName} for block ${blockId}`);
                return await strategy.build(blockId, content);
            }
        }
        // Should not reach here as DefaultStrategy always matches
        return new DefaultBuilderStrategy().build(blockId, content);
    }

    /**
     * 检查是否有匹配的策略
     * @param excludeDefault 是否排除默认策略
     */
    matchStrategy(blockId: string, content: string, excludeDefault = true): CardBuilderStrategy | null {
        for (const strategy of this.strategies) {
            if (excludeDefault && strategy instanceof DefaultBuilderStrategy) {
                continue;
            }
            if (strategy.match(blockId, content)) {
                return strategy;
            }
        }
        return null;
    }

    public registerStrategy(strategy: CardBuilderStrategy, priority: 'high' | 'low' = 'low') {
        if (priority === 'high') {
            this.strategies.unshift(strategy);
        } else {
            // Insert before default
            const defaultIndex = this.strategies.findIndex(s => s instanceof DefaultBuilderStrategy);
            if (defaultIndex !== -1) {
                this.strategies.splice(defaultIndex, 0, strategy);
            } else {
                this.strategies.push(strategy);
            }
        }
    }
}
