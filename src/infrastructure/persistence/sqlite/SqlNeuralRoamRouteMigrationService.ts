import {
  migrateLegacyNeuralRoamStateToDefaultRoute,
  type NeuralRoamRouteRepository,
} from '@/core/queue/neural/routes';
import type { SqlQueueStateRepository } from './SqlQueueStateRepository';

export interface SqlNeuralRoamRouteMigrationResult {
  migrated: boolean;
  reason: 'migrated' | 'route-state-exists' | 'legacy-state-missing' | 'legacy-state-unrecognized';
}

export class SqlNeuralRoamRouteMigrationService {
  constructor(
    private readonly queueStateRepository: Pick<SqlQueueStateRepository, 'loadAll'>,
    private readonly routeRepository: NeuralRoamRouteRepository,
  ) {}

  async migrateIfNeeded(now = Date.now()): Promise<SqlNeuralRoamRouteMigrationResult> {
    const existingRouteState = await this.routeRepository.loadState();
    if (existingRouteState && existingRouteState.routes.length > 0) {
      return { migrated: false, reason: 'route-state-exists' };
    }

    const legacyState = this.queueStateRepository.loadAll().neuralRoamQueue;
    if (!legacyState) {
      return { migrated: false, reason: 'legacy-state-missing' };
    }

    const migratedState = migrateLegacyNeuralRoamStateToDefaultRoute(legacyState, now);
    if (!migratedState) {
      return { migrated: false, reason: 'legacy-state-unrecognized' };
    }

    await this.routeRepository.saveState(migratedState);
    return { migrated: true, reason: 'migrated' };
  }
}
