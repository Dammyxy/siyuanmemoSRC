/**
 * SM-15 Scheduler Adapter
 *
 * 将 SM-15 算法适配到 SchedulerEngineAdapter 接口
 * 实现标准化的调度器接口，使 SM-15 可以与 FSRS v5、SM-2 等算法互换使用
 */

import type { FSRSCard, FSRSParameters, Rating } from '@/types';
import type { SchedulerEngineAdapter } from '../types';
import { SM15, SM15Item, createDefaultSM15 } from './sm15';
import type { SM15Data, SM15ItemData } from './sm15';

/**
 * 评分映射
 *
 * FSRS Rating (4 级) → SM-15 Grade (5 级，跳过 0)
 */
const RATING_TO_GRADE: Record<Rating, number> = {
    1: 1,  // Again → 完全忘记
    2: 3,  // Hard → 有点难
    3: 4,  // Good → 正常记住
    4: 5,  // Easy → 很简单
};

/**
 * SM-15 调度器适配器
 *
 * 实现 SchedulerEngineAdapter 接口
 * 将 SM-15 算法包装为标准调度器
 */
export class SM15Scheduler implements SchedulerEngineAdapter {
    private sm15: SM15;

    constructor(params: FSRSParameters) {
        // 映射 FSRS 参数到 SM-15 配置
        const requestedFI = Math.round(params.requestRetention * 100); // 0.7-0.99 → 70-99

        // 基础间隔：1 天（单位：毫秒）
        const intervalBase = 1 * 24 * 60 * 60 * 1000;

        this.sm15 = new SM15(requestedFI, intervalBase);
    }

    /**
     * 更新参数
     *
     * @param params FSRS 参数
     */
    updateParams(params: FSRSParameters): void {
        const requestedFI = Math.round(params.requestRetention * 100);
        this.sm15.requestedFI = requestedFI;
    }

    /**
     * 预览所有评分选项
     *
     * @param card 卡片
     * @param now 当前时间（可选）
     * @returns 评分 → 更新后卡片的映射
     */
    preview(card: FSRSCard, now?: Date): Map<Rating, FSRSCard> {
        const previews = new Map<Rating, FSRSCard>();

        for (const rating of [1, 2, 3, 4] as Rating[]) {
            // 创建临时 SM15Item
            const item = this._cardToItem(card);
            const grade = RATING_TO_GRADE[rating];

            // 模拟复习（不修改原始卡片）
            const tempItem = new SM15Item(this.sm15, item.value);
            Object.assign(tempItem, {
                repetition: item.repetition,
                lapse: item.lapse,
                of: item.of,
                optimumInterval: item.optimumInterval,
                dueDate: new Date(item.dueDate),
                previousDate: item.previousDate ? new Date(item.previousDate) : null,
                _afs: [...item._afs],
            });

            // 执行模拟
            this.sm15.answer(grade, tempItem, now);

            // 转换回 FSRSCard
            const updatedCard = this._itemToCard(tempItem, card);
            previews.set(rating, updatedCard);
        }

        return previews;
    }

    /**
     * 复习卡片
     *
     * @param card 卡片
     * @param rating 评分 (1-4)
     * @param now 当前时间（可选）
     * @returns 更新后的卡片
     */
    review(card: FSRSCard, rating: Rating, now?: Date): FSRSCard {
        const updatedCard = { ...card };

        // 转换为 SM15Item 实例
        const item = this._cardToItemInstance(card);
        const grade = RATING_TO_GRADE[rating];

        // 执行复习
        this.sm15.answer(grade, item, now || new Date());

        // 转换回 FSRSCard
        Object.assign(updatedCard, this._itemToCardData(item));

        return updatedCard;
    }

    /**
     * 获取可提取性
     *
     * @param card 卡片
     * @param now 当前时间（可选）
     * @returns 可提取性 (0-100)
     */
    getRetrievability(card: FSRSCard, now?: Date): number {
        const item = this._cardToItemInstance(card);
        const uf = item.uf(now || new Date());

        // 使用遗忘曲线计算保持率
        const curve = this.sm15.forgettingCurves.curves[item.repetition][item.afIndex()];
        const retention = curve.retention(uf);

        return retention;
    }

    /**
     * FSRSCard → SM15Item 转换（返回数据）
     */
    private _cardToItem(card: FSRSCard): SM15ItemData {
        return {
            value: card.id,
            repetition: card.reps > 0 ? card.reps - 1 : -1, // FSRS reps 从 0 开始，SM-15 从 -1 开始
            lapse: card.lapses,
            of: card.schedulerMeta?.sm15?.of || 1,
            optimumInterval: card.schedulerMeta?.sm15?.optimumInterval || this.sm15.intervalBase,
            dueDate: new Date(card.due),
            previousDate: card.lastReview > 0 ? new Date(card.lastReview) : null,
            _afs: card.schedulerMeta?.sm15?.afs || [],
        };
    }

    /**
     * FSRSCard → SM15Item 转换（返回实例）
     */
    private _cardToItemInstance(card: FSRSCard): SM15Item {
        // 创建 SM15Item 实例
        const item = new SM15Item(this.sm15, card.id);

        // 从卡片数据恢复状态
        const data = this._cardToItem(card);
        Object.assign(item, {
            repetition: data.repetition,
            lapse: data.lapse,
            of: data.of,
            optimumInterval: data.optimumInterval,
            dueDate: data.dueDate,
            previousDate: data.previousDate,
            _afs: [...data._afs],
        });

        return item;
    }

    /**
     * SM15Item → FSRSCard 数据转换
     */
    private _itemToCardData(item: SM15ItemData): Partial<FSRSCard> {
        return {
            due: item.dueDate.getTime(),
            reps: item.repetition > -1 ? item.repetition + 1 : 0, // SM-15 → FSRS
            lapses: item.lapse,
            lastReview: item.previousDate?.getTime() || 0,
            scheduledDays: Math.round(item.optimumInterval / (24 * 60 * 60 * 1000)), // 毫秒 → 天

            // SM-15 特定数据
            schedulerMeta: {
                sm15: {
                    of: item.of,
                    optimumInterval: item.optimumInterval,
                    afs: item._afs,
                },
            },
        };
    }

    /**
     * SM15Item → FSRSCard 转换（保留原卡片引用）
     */
    private _itemToCard(item: SM15Item, originalCard: FSRSCard): FSRSCard {
        const updatedCard = { ...originalCard };
        Object.assign(updatedCard, this._itemToCardData(item));
        return updatedCard;
    }
}
