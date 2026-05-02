import { describe, expect, it } from 'vitest';
import { KERNEL_RELAY_METHODS } from '../kernel-rpc';

describe('kernel relay contract', () => {
  it('declares every backend mutation relay method used by ApplicationContext', () => {
    expect(KERNEL_RELAY_METHODS).toEqual(expect.arrayContaining([
      'review.feedback',
      'browser.sourceExistence.applySweepHost',
      'browser.sourceExistence.update',
      'browser.sourceExistence.applySweep',
      'kernel.transaction.ingest',
      'kernel.transaction.dequeue',
      'kernel.transaction.requeue',
      'autocard.decision.resolve',
      'autocard.execute',
      'private.command.execute',
    ]));
  });
});
