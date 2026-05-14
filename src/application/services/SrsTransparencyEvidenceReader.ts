import type { ReviewLogV2 } from '@/types/review';

export interface SrsTransparencyEvidenceReadRequest {
  cardId: string;
  now: number;
}

export interface SrsTransparencyEvidenceReader {
  readRecentReviewLogs(request: SrsTransparencyEvidenceReadRequest): Promise<ReviewLogV2[]>;
}

export interface ReviewLogLearningCurveEvidenceReaderOptions {
  monthWindow?: number;
  maxRecords?: number;
}

type ReviewLogServiceLike = {
  getReviewLogsV2(year: number, month: number): Promise<ReviewLogV2[]>;
};

const DEFAULT_MONTH_WINDOW = 3;
const DEFAULT_MAX_RECORDS = 30;

export class ReviewLogLearningCurveEvidenceReader implements SrsTransparencyEvidenceReader {
  private readonly monthWindow: number;
  private readonly maxRecords: number;

  constructor(
    private readonly reviewLogService: ReviewLogServiceLike,
    options: ReviewLogLearningCurveEvidenceReaderOptions = {},
  ) {
    this.monthWindow = positiveInteger(options.monthWindow) ?? DEFAULT_MONTH_WINDOW;
    this.maxRecords = positiveInteger(options.maxRecords) ?? DEFAULT_MAX_RECORDS;
  }

  async readRecentReviewLogs(request: SrsTransparencyEvidenceReadRequest): Promise<ReviewLogV2[]> {
    const cardId = String(request.cardId || '').trim();
    if (!cardId) {
      return [];
    }

    const months = buildRecentMonths(request.now, this.monthWindow);
    const matches: ReviewLogV2[] = [];
    for (const { year, month } of months) {
      const logs = await this.reviewLogService.getReviewLogsV2(year, month);
      for (const log of logs) {
        if (String(log.cardId || '').trim() === cardId) {
          matches.push(log);
        }
      }
      if (matches.length >= this.maxRecords) {
        break;
      }
    }

    return matches
      .sort((a, b) => Number(b.reviewedAt || 0) - Number(a.reviewedAt || 0))
      .slice(0, this.maxRecords);
  }
}

function buildRecentMonths(now: number, monthWindow: number): Array<{ year: number; month: number }> {
  const date = Number.isFinite(now) ? new Date(now) : new Date();
  const months: Array<{ year: number; month: number }> = [];
  for (let offset = 0; offset < monthWindow; offset += 1) {
    const cursor = new Date(date.getFullYear(), date.getMonth() - offset, 1);
    months.push({
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1,
    });
  }
  return months;
}

function positiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}
