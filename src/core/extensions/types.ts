export interface QueueStats {
  current: number;
  total: number;
  reviewed?: number;
  remaining?: number;
  label?: string;
  extra?: string;
}
