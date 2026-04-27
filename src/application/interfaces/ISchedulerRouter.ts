import type { FSRSCard, Rating } from '@/types';
import type {
  ReviewCommitResult,
  SchedulingDecision,
  SrsV2SchedulingContext,
} from '@/core/scheduler/srs-v2';

/**
 * 应用层看到的调度器门面。
 *
 * SRS v2 之后，Router 不再承载队列语义；它只负责把卡片交给
 * SRS v2 内核生成 preview/decision，并在显式 commit 时写入正式排期。
 */
export interface ISchedulerRouter {
  preview(card: FSRSCard, options?: SrsV2SchedulingContext): Map<Rating, FSRSCard>;
  answer?(card: FSRSCard, rating: Rating, options?: SrsV2SchedulingContext): SchedulingDecision;
  commit?(decision: SchedulingDecision): Promise<ReviewCommitResult>;
  route?(card: FSRSCard, rating: Rating, options?: SrsV2SchedulingContext): Promise<FSRSCard>;
  getScheduler(type: string): unknown;
  getAllSchedulers(): Map<string, unknown>;
  hasScheduler?(type: string): boolean;
}
