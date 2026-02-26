export type Priority = number;

export const DEFAULT_PRIORITY: Priority = 50;
export const HIGHEST_PRIORITY: Priority = 0;
export const LOWEST_PRIORITY: Priority = 100;
export const HIGH_PRIORITY_THRESHOLD: Priority = 10;

export function clampPriority(value: unknown, fallback: Priority = DEFAULT_PRIORITY): Priority {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(HIGHEST_PRIORITY, Math.min(LOWEST_PRIORITY, Math.round(n)));
}

export function priorityFactor(priority: Priority): number {
  const p = clampPriority(priority);
  const raw = 1 + (DEFAULT_PRIORITY - p) / DEFAULT_PRIORITY;
  return Math.max(0.1, raw);
}

export type ProtectionStats = {
  total: number;
  highPriority: number;
  coverage: number;
};

export function computeProtectionStats(priorities: Priority[], threshold: Priority = HIGH_PRIORITY_THRESHOLD): ProtectionStats {
  const ps = (priorities || []).map((x) => clampPriority(x));
  const total = ps.length;
  if (total === 0) return { total: 0, highPriority: 0, coverage: 0 };
  const highPriority = ps.filter((p) => p <= threshold).length;
  return { total, highPriority, coverage: highPriority / total };
}

