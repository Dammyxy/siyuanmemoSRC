/**
 * Riff Scheduler Adapter
 *
 * 将 Riff API 包装成 SchedulerEngineAdapter 接口
 */

import type { FSRSCard, FSRSParameters, Rating } from '@/types';
import type { SchedulerEngineAdapter } from '../types';
import * as riff from '@/core/siyuan/riff';

export class RiffSchedulerAdapter implements SchedulerEngineAdapter {
  constructor(private params: FSRSParameters) {}

  /**
   * 复习卡片
   */
  review(card: FSRSCard, rating: Rating): FSRSCard {
    // Riff API 是异步的，但接口要求同步
    // 这里返回一个乐观更新的卡片，实际更新在后台进行

    // 调用 Riff API（异步，不等待）
    this._reviewAsync(card, rating).catch(err => {
      console.error('[RiffSchedulerAdapter] Review failed:', err);
    });

    // 返回乐观更新的卡片
    return {
      ...card,
      lastReview: Date.now(),
      reps: card.reps + 1,
    };
  }

  /**
   * 异步复习（实际调用 Riff API）
   */
  private async _reviewAsync(card: FSRSCard, rating: Rating): Promise<void> {
    const deckID = card.deckID || riff.BUILTIN_DECK_ID;
    await riff.reviewRiffCard(deckID, card.id, rating);
  }

  /**
   * 预览所有评分选项
   */
  preview(card: FSRSCard): Map<Rating, FSRSCard> {
    const result = new Map<Rating, FSRSCard>();

    // Riff 不支持预览，返回简单的估算
    for (const rating of [1, 2, 3, 4] as Rating[]) {
      result.set(rating, {
        ...card,
        lastReview: Date.now(),
        reps: card.reps + 1,
      });
    }

    return result;
  }

  /**
   * 更新参数（Riff 不支持参数更新）
   */
  updateParams(params: FSRSParameters): void {
    this.params = params;
    // Riff 使用自己的算法，不需要更新参数
  }
}
