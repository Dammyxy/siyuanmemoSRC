import { createDefaultCard } from '@/types';
import type { FSRSCard } from '@/types';
import type { CardBuilderStrategy } from '../types';

export class DefaultBuilderStrategy implements CardBuilderStrategy {
    strategyName = 'default';

    match(_blockId: string, _content: string): boolean {
        return true; // 总是匹配作为后备
    }

    async build(blockId: string, _content: string): Promise<FSRSCard> {
        return createDefaultCard(blockId);
    }
}
