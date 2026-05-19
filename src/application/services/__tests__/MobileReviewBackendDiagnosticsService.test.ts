import { describe, expect, it, vi } from 'vitest';
import {
  MOBILE_REVIEW_BACKEND_DIAGNOSTICS_FILE,
  MobileReviewBackendDiagnosticsService,
} from '../MobileReviewBackendDiagnosticsService';

describe('MobileReviewBackendDiagnosticsService', () => {
  it('appends bounded mobile review backend diagnostics to a plugin data file', async () => {
    let store: unknown = null;
    const service = new MobileReviewBackendDiagnosticsService({
      readJSON: vi.fn(async () => store),
      writeJSON: vi.fn(async (_fileName: string, data: unknown) => {
        store = data;
      }),
    });

    await service.record('review-feedback.ensure-writable-failed', {
      error: new Error('BACKEND_UNAVAILABLE: writer lease held by another instance'),
      longText: 'x'.repeat(500),
    });

    expect(store).toMatchObject({
      version: 1,
      entries: [{
        event: 'review-feedback.ensure-writable-failed',
        payload: {
          error: {
            message: 'BACKEND_UNAVAILABLE: writer lease held by another instance',
          },
          longText: `${'x'.repeat(400)}...`,
        },
      }],
    });
  });

  it('keeps only the newest entries', async () => {
    let store: unknown = null;
    const writeJSON = vi.fn(async (_fileName: string, data: unknown) => {
      store = data;
    });
    const service = new MobileReviewBackendDiagnosticsService({
      readJSON: vi.fn(async () => store),
      writeJSON,
    });

    for (let index = 0; index < 85; index += 1) {
      await service.record(`event-${index}`, { index });
    }

    expect(writeJSON).toHaveBeenLastCalledWith(
      MOBILE_REVIEW_BACKEND_DIAGNOSTICS_FILE,
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({ event: 'event-84' }),
        ]),
      }),
    );
    const entries = (store as { entries: Array<{ event: string }> }).entries;
    expect(entries).toHaveLength(80);
    expect(entries[0]?.event).toBe('event-5');
  });
});
