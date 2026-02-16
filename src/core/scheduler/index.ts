import type { FSRSParameters, SchedulerEngine } from '@/types';
import type { SchedulerEngineAdapter } from './types';
import { TSFSRSScheduler } from './strategies/TSFSRSScheduler';
import { ImprovedTopicScheduler } from './strategies/ImprovedTopicScheduler';

export * from './types';
export * from './strategies/TSFSRSScheduler';
export * from './strategies/ImprovedTopicScheduler';
export * from './rescheduleService';
export * from './SchedulerRouter';

/**
 * 创建调度器工厂
 * 根据配置的引擎类型返回相应的调度器实例
 */
export function createScheduler(params: FSRSParameters, engine: SchedulerEngine = 'simple-fsrs'): SchedulerEngineAdapter {
    switch (engine) {
        case 'a-factor-v2':
            console.log('[SiyuanMemo][Scheduler] Using A-Factor-v2 (ImprovedTopicScheduler) Engine');
            return new ImprovedTopicScheduler(params);
        case 'sm2':
        case 'sm15':
            console.warn(`[SiyuanMemo][Scheduler] Engine "${engine}" is deprecated, falling back to FSRS-6`);
            return new TSFSRSScheduler(params);
        case 'simple-fsrs':
        default:
            console.log('[SiyuanMemo][Scheduler] Using FSRS-6 Engine (TSFSRSScheduler)');
            return new TSFSRSScheduler(params);
    }
}
