import type { BackendNeuralRoamAdvanceResult } from '../../../../packages/contracts/src/backend-rpc';

export type NeuralRoamAdvanceOutcome =
  | { kind: 'next' }
  | { kind: 'exhausted' }
  | { kind: 'item-unavailable'; reason: string | null }
  | { kind: 'unavailable'; reason: string; message: string };

export class NeuralRoamAdvanceOutcomePolicy {
  consume(result: BackendNeuralRoamAdvanceResult): NeuralRoamAdvanceOutcome {
    if (result.status === 'exhausted') {
      return { kind: 'exhausted' };
    }
    if (result.status === 'advanced' && result.nextItem) {
      return { kind: 'next' };
    }
    if (
      result.status === 'unavailable'
      || result.status === 'failed'
      || result.status === 'mismatch'
    ) {
      const reason = result.unavailableReason || result.status;
      if (reason === 'source-block-missing' || reason === 'current-item-missing') {
        return { kind: 'item-unavailable', reason };
      }
      return {
        kind: 'unavailable',
        reason,
        message: result.message || 'advance failed',
      };
    }
    return {
      kind: 'unavailable',
      reason: result.status || 'missing-next-item',
      message: result.message || 'advance failed',
    };
  }
}
