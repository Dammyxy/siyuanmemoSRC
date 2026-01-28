import type { FSRSParameters, SchedulerEngine } from '@/types';
import type { SchedulerEngineAdapter } from './types';
import { SimpleFSRSScheduler } from './strategies/FSRSV5';
import { SM2Scheduler } from './strategies/SM2';
import { TopicScheduler } from './TopicScheduler';

export * from './types';
export * from './strategies/FSRSV5';
export * from './strategies/SM2';
export * from './TopicScheduler';
export * from './rescheduleService';

/**
 * 创建调度器工厂
 * 根据配置的引擎类型返回相应的调度器实例
 */
export function createScheduler(params: FSRSParameters, engine: SchedulerEngine = 'simple-fsrs'): SchedulerEngineAdapter {
    switch (engine) {
        case 'sm2':
            console.log('[Scheduler] Using SM-2 Engine');
            return new SM2Scheduler(params);
        case 'simple-fsrs':
        default:
            console.log('[Scheduler] Using FSRS-5 Engine');
            return new SimpleFSRSScheduler(params);
    }
}
