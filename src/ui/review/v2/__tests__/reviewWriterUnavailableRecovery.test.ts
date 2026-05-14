import { describe, expect, it } from 'vitest';
import {
  resolveReviewWriterUnavailableRecovery,
} from '../reviewWriterUnavailableRecovery';

describe('resolveReviewWriterUnavailableRecovery', () => {
  it('maps writer relay unavailable errors to writer recovery notice', () => {
    const notice = resolveReviewWriterUnavailableRecovery({
      reason: 'grade',
      error: new Error('BACKEND_UNAVAILABLE: writer relay unavailable for review.feedback'),
      t: (_key, fallback) => fallback,
    });

    expect(notice.kind).toBe('writer-relay-unavailable');
    expect(notice.title).toBe('写入窗口不可用');
    expect(notice.retryLabel).toBe('重试当前操作');
    expect(notice.reopenLabel).toBe('刷新复习面');
  });

  it('maps no active writer errors to writer recovery guidance', () => {
    const notice = resolveReviewWriterUnavailableRecovery({
      reason: 'skip',
      error: new Error('BACKEND_UNAVAILABLE: writer lease held by another instance'),
      t: (_key, fallback) => fallback,
    });

    expect(notice.kind).toBe('writer-unavailable');
    expect(notice.message).toContain('打开或聚焦一个可写窗口');
  });

  it('maps backend worker errors separately from writer relay errors', () => {
    const notice = resolveReviewWriterUnavailableRecovery({
      reason: 'custom',
      error: new Error('BACKEND_UNAVAILABLE: review not ready'),
      t: (_key, fallback) => fallback,
    });

    expect(notice.kind).toBe('backend-unavailable');
    expect(notice.title).toBe('后端暂不可用');
  });

  it('keeps unrelated errors on the generic path', () => {
    const notice = resolveReviewWriterUnavailableRecovery({
      reason: 'grade',
      error: new Error('scheduler failed'),
      t: (_key, fallback) => fallback,
    });

    expect(notice.kind).toBe('generic-error');
  });
});
