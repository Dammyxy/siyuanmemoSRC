import type { QueueItem } from '../queue/types.ts';
import type { SchedulerEngineAdapter } from '../scheduler/types';
import { CardStorage } from './CardStorage';
import type { FSRSCard } from '@/types';
import { Rating } from '@/types';

/**
 * 排序策略：使用调度器对队列排序
 *
 * 核心思路：
 * 1. 将所有 QueueItem 转换为 FSRSCard
 * 2. 使用调度器更新状态
 * 3. 按新的到期时间排序
 */
export class SchedulerSortingStrategy {
	constructor(
		private scheduler: SchedulerEngineAdapter
	) {}

	/**
	 * 对队列进行排序
	 *
	 * @param items 待排序的队列
	 * @returns 排序后的队列
	 */
	sort(items: QueueItem[]): QueueItem[] {
		// 为每个项构建 FSRSCard（用于排序）
		const cards = items.map(item =>
			CardStorage.toItemCard(item, {
				due: CardStorage.getDueTime(item),
			})
		);

		// 按到期时间排序
		cards.sort((a, b) => a.due - b.due);

		// 返回排序后的 QueueItem（保持引用）
		return cards.map(card =>
			items.find(item => String(item.cardID) === card.id)!
		);
	}

	/**
	 * 处理评分
	 *
	 * @param item 队列项
	 * @param rating 评分
	 */
	async review(item: QueueItem, rating: 1 | 2 | 3 | 4): Promise<void> {
		const card = CardStorage.toItemCard(item);

		// 调用调度器
		const updatedCard = this.scheduler.review(
			card,
			rating === 1 ? Rating.Again : rating === 2 ? Rating.Hard : rating === 3 ? Rating.Good : Rating.Easy,
			new Date()
		);

		// 更新 QueueItem
		CardStorage.updateItemFromCard(item, updatedCard);
	}
}
