import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('backend worker entry source', () => {
  it('does not keep the stale review.feedback-only timing flag', () => {
    const source = readFileSync(resolve(process.cwd(), 'worker/bootstrap/backend-worker.entry.ts'), 'utf8');

    expect(source).not.toMatch(/\bisReviewFeedback\b/);
    expect(source).toContain('isReviewFeedbackTiming');
  });
});
