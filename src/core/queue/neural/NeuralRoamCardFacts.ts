import type { NeuralRoamNodeType } from '@/core/queue/domain/ports';

export interface NeuralRoamCardFacts {
  resolveNodeType(blockId: string): Promise<NeuralRoamNodeType>;
  resolvePriority?(blockId: string): Promise<number | null>;
}

export function normalizeNeuralRoamPriority(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed > 1) {
    return Math.max(0, Math.min(1, parsed / 100));
  }
  return Math.max(0, Math.min(1, parsed));
}
