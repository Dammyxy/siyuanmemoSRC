import { createDefaultCard } from '@/types';
import type { FSRSCard } from '@/types';
import type { CardBuilderStrategy } from '../types';

export class ClozeBuilderStrategy implements CardBuilderStrategy {
    strategyName = 'cloze';
    // 匹配 ==高亮== 或 **加粗** 作为挖空
    private regex = /==(.+?)==|\*\*(.+?)\*\*/;

    match(_blockId: string, content: string): boolean {
        return this.regex.test(content);
    }

    async build(blockId: string, content: string): Promise<FSRSCard> {
        const card = createDefaultCard(blockId);
        // 在元数据中标记为挖空卡
        card.meta = {
            ...card.meta,
            cardType: 'cloze',
            sourceContent: content
        };
        // 在这里，我们可以进一步处理 content 生成正反面
        // 但为了简化，目前 FSRS 插件主要依赖思源块作为“正面”，
        // 实际上思源的渲染机制会展示块内容。
        // 对于挖空卡，通常是在复习界面进行特殊渲染（点击显示答案），
        // 或者我们在这里生成特定的 Question/Answer 字段。

        // 简单起见，我们只标记类型，复习界面逻辑暂不在此深入
        return card;
    }
}
