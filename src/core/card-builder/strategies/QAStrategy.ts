import { createDefaultCard } from '@/types';
import type { FSRSCard } from '@/types';
import type { CardBuilderStrategy } from '../types';

export class QABuilderStrategy implements CardBuilderStrategy {
    strategyName = 'qa';
    // 匹配 "问题 :: 答案" 或 "问题 ? 答案"
    private regex = /(.+?)(::|\?)(.+)/;

    match(_blockId: string, content: string): boolean {
        return this.regex.test(content);
    }

    async build(blockId: string, content: string): Promise<FSRSCard> {
        const match = content.match(this.regex);
        const card = createDefaultCard(blockId);

        if (match) {
            const question = match[1].trim();
            const answer = match[3].trim();

            card.meta = {
                ...card.meta,
                cardType: 'qa',
                question,
                answer
            };
        }

        return card;
    }
}
