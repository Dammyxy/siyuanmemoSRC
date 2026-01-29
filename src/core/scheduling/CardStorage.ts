import type { QueueItem } from '../queue/types.ts';
import type { FSRSCard } from '@/types';

/**
 * QueueItem 与 FSRSCard 之间的适配器
 *
 * 职责：
 * 1. QueueItem -> FSRSCard：从队列项构建完整的卡片数据
 * 2. FSRSCard -> QueueItem：将调度结果写回到队列项
 */
export class CardStorage {
	/**
	 * 从 QueueItem 构建 FSRSCard
	 *
	 * 从 QueueItem 的 nextDues 读取调度状态，
	 * 补充其他必需字段
	 */
	static toItemCard(item: QueueItem, base?: Partial<FSRSCard>): FSRSCard {
		const nextDues = (item as any).nextDues || {};
		const now = Date.now();

		// 从 nextDues 提取到期时间（以评分3为基准）
		const getDueTime = (rating: 1 | 2 | 3 | 4): number => {
			if (nextDues[rating]) {
				return new Date(nextDues[rating]).getTime();
			}
			// 新卡片或未设置
			return now;
		};

		return {
			id: String(item.cardID),
			blockId: String(item.blockID),
			due: getDueTime(3), // 默认使用 Good 的到期时间
			stability: (item as any).stability || 0,
			difficulty: (item as any).difficulty || 0,
			reps: (item as any).reps || 0,
			lapses: (item as any).lapses || 0,
			state: (item as any).state || 0, // 0=New, 1=Learning, 2=Review
			lastReview: (item as any).lastReview || now,
			elapsedDays: 0,
			scheduledDays: 0,
			priority: item.priority || 50,
			type: 'item' as const,
			tags: [],
			leechCount: 0,
			isLeech: false,
			skipped: false,
			createdAt: now,
			updatedAt: now,
			...base,
		};
	}

	/**
	 * 将调度结果写回到 QueueItem
	 *
	 * 核心逻辑：将 FSRSCard.due 写入 QueueItem.nextDues
	 */
	static updateItemFromCard(item: QueueItem, card: FSRSCard): void {
		// 更新 nextDues
		const nextDues: Record<1 | 2 | 3 | 4, string> = {
			'1': new Date(card.due).toISOString(),
			'2': new Date(card.due).toISOString(),
			'3': new Date(card.due).toISOString(),
			'4': new Date(card.due).toISOString(),
		};

		(item as any).nextDues = nextDues;

		// 更新其他元数据
		(item as any).stability = card.stability;
		(item as any).difficulty = card.difficulty;
		(item as any).reps = card.reps;
		(item as any).lapses = card.lapses;
		(item as any).state = card.state;
		(item as any).lastReview = card.lastReview;
		(item as any).elapsedDays = card.elapsedDays;
		(item as any).scheduledDays = card.scheduledDays;
		(item as any).updatedAt = card.updatedAt;
	}

	/**
	 * 获取卡片用于排序的到期时间
	 *
	 * 使用评分3（Good）的到期时间作为基准
	 */
	static getDueTime(item: QueueItem): number {
		const nextDues = (item as any).nextDues || {};
		if (nextDues[3]) {
			return new Date(nextDues[3]).getTime();
		}
		// 新卡片立即到期
		return Date.now();
	}
}
