import type { FSRSParameters, SchedulerEngine } from '@/types';
import type { SchedulerEngineAdapter } from './types';
import { TSFSRSScheduler } from './strategies/TSFSRSScheduler';
import { ImprovedTopicScheduler } from './strategies/ImprovedTopicScheduler';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SchedulerFactory');

export * from './types';
export * from './strategies/TSFSRSScheduler';
export * from './strategies/ImprovedTopicScheduler';
export * from './rescheduleService';
export * from './SchedulerRouter';
export * from './fsrsReviewStateRepair';
export * from './schedulerStateSnapshot';
export * from './learningCurveEvidence';
export * from './schedulerPolicy';
export * from './srs-v2';

/**
 * Create scheduler adapter by configured engine.
 */
export function createScheduler(params: FSRSParameters, engine: SchedulerEngine = 'simple-fsrs'): SchedulerEngineAdapter {
    switch (engine) {
        case 'a-factor-v2':
            logger.info('Using A-Factor-v2 (ImprovedTopicScheduler) Engine');
            return new ImprovedTopicScheduler(params);
        case 'simple-fsrs':
            logger.info('Using FSRS-6 Engine (TSFSRSScheduler)');
            return new TSFSRSScheduler(params);
        default:
            throw new Error(`Unsupported scheduler engine: ${engine}`);
    }
}
