import type { FSRSCard } from '@/types';

export interface CardBuilderStrategy {
    strategyName: string;
    /**
     * 检查策略是否适用于该块内容
     */
    match(blockId: string, content: string): boolean;
    /**
     * 构建闪卡数据
     */
    build(blockId: string, content: string): Promise<FSRSCard>;
}
