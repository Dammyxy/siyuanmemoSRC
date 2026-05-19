import type { IFileService } from '@/infrastructure/services/FileService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MobileReviewBackendDiagnosticsService');

export const MOBILE_REVIEW_BACKEND_DIAGNOSTICS_FILE = 'diagnostics/mobile-review-backend.json';
const MAX_ENTRIES = 80;

export interface MobileReviewBackendDiagnosticEntry {
  at: string;
  event: string;
  payload: Record<string, unknown>;
}

interface MobileReviewBackendDiagnosticStore {
  version: 1;
  updatedAt: string;
  entries: MobileReviewBackendDiagnosticEntry[];
}

export interface MobileReviewBackendDiagnosticSink {
  record(event: string, payload?: Record<string, unknown>): Promise<void>;
}

export class MobileReviewBackendDiagnosticsService implements MobileReviewBackendDiagnosticSink {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly fileService: Pick<IFileService, 'readJSON' | 'writeJSON'>) {}

  record(event: string, payload: Record<string, unknown> = {}): Promise<void> {
    const entry = {
      at: new Date().toISOString(),
      event: String(event || 'unknown'),
      payload: sanitizeRecord(payload),
    };
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(() => this.appendEntry(entry));
    return this.writeChain;
  }

  private async appendEntry(entry: MobileReviewBackendDiagnosticEntry): Promise<void> {
    try {
      const current = await this.fileService.readJSON<Partial<MobileReviewBackendDiagnosticStore>>(
        MOBILE_REVIEW_BACKEND_DIAGNOSTICS_FILE,
      );
      const entries = Array.isArray(current?.entries) ? current.entries : [];
      const next: MobileReviewBackendDiagnosticStore = {
        version: 1,
        updatedAt: entry.at,
        entries: [...entries, entry].slice(-MAX_ENTRIES),
      };
      await this.fileService.writeJSON(MOBILE_REVIEW_BACKEND_DIAGNOSTICS_FILE, next);
    } catch (error) {
      logger.warn('[MobileReviewBackendDiagnosticsService] failed to write diagnostics', {
        event: entry.event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function sanitizeRecord(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = sanitizeValue(value, 0);
  }
  return output;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (typeof value === 'string') {
    return value.length > 400 ? `${value.slice(0, 400)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: typeof value.stack === 'string' ? value.stack.slice(0, 1200) : null,
    };
  }
  if (Array.isArray(value)) {
    return depth >= 3 ? `[array:${value.length}]` : value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 3) {
      return '[object]';
    }
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
      result[key] = sanitizeValue(child, depth + 1);
    }
    return result;
  }
  return String(value);
}
