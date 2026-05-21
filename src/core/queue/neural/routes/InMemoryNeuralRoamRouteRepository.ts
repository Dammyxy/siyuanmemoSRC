import {
  cloneRouteSnapshot,
  createDefaultRoute,
  DEFAULT_NEURAL_ROAM_ROUTE_ID,
  type NeuralRoamRouteState,
} from './NeuralRoamRoute';
import type { NeuralRoamRouteRepository } from './NeuralRoamRouteRepository';

export class InMemoryNeuralRoamRouteRepository implements NeuralRoamRouteRepository {
  private state: NeuralRoamRouteState | null;

  constructor(initialState?: NeuralRoamRouteState | null) {
    this.state = initialState ? this.cloneState(initialState) : null;
  }

  static withDefaultRoute(now = Date.now()): InMemoryNeuralRoamRouteRepository {
    return new InMemoryNeuralRoamRouteRepository({
      activeRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      engineMode: 'orbit',
      routes: [createDefaultRoute(now)],
    });
  }

  async loadState(): Promise<NeuralRoamRouteState | null> {
    return this.state ? this.cloneState(this.state) : null;
  }

  async saveState(state: NeuralRoamRouteState): Promise<void> {
    this.state = this.cloneState(state);
  }

  private cloneState(state: NeuralRoamRouteState): NeuralRoamRouteState {
    return {
      activeRouteId: state.activeRouteId,
      engineMode: state.engineMode,
      routes: state.routes.map(cloneRouteSnapshot),
    };
  }
}
