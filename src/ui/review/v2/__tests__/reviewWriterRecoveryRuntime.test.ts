import { describe, expect, it, vi } from 'vitest';
import {
  createReviewWriterRecoveryRuntime,
  type ReviewWriterRecoveryAction,
} from '../reviewWriterRecoveryRuntime';
import type { ReviewWriterUnavailableRecoveryNotice } from '../reviewWriterUnavailableRecovery';

const t = (_key: string, fallback: string) => fallback;

function createRuntime(initialAction: ReviewWriterRecoveryAction | null = null) {
  let notice: ReviewWriterUnavailableRecoveryNotice | null = null;
  let action = initialAction;
  const deps = {
    t,
    getAction: vi.fn(() => action),
    setAction: vi.fn((next: ReviewWriterRecoveryAction | null) => {
      action = next;
    }),
    setNotice: vi.fn((next: ReviewWriterUnavailableRecoveryNotice | null) => {
      notice = next;
    }),
    notifyReviewMessage: vi.fn(),
    grade: vi.fn(async (_rating: number) => undefined),
    skip: vi.fn(async () => undefined),
    executeCommand: vi.fn(async (_commandId: string) => undefined),
    reload: vi.fn(async () => undefined),
  };

  return {
    deps,
    runtime: createReviewWriterRecoveryRuntime(deps),
    get notice() {
      return notice;
    },
    get action() {
      return action;
    },
  };
}

describe('reviewWriterRecoveryRuntime', () => {
  it('stores writer recovery notice and retry action for writer/backend unavailable errors', () => {
    const subject = createRuntime();

    const handled = subject.runtime.showActionError({
      reason: 'grade',
      error: new Error('BACKEND_UNAVAILABLE: writer relay timeout'),
      item: null,
      message: 'failed',
      action: { type: 'grade', rating: 3 },
    });

    expect(handled).toBe(true);
    expect(subject.deps.setNotice).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'writer-relay-unavailable',
      title: '写入窗口不可用',
    }));
    expect(subject.deps.setAction).toHaveBeenCalledWith({ type: 'grade', rating: 3 });
    expect(subject.deps.notifyReviewMessage).toHaveBeenCalledWith(
      '写入窗口不可用: 当前复习动作没有到达写入窗口。请打开或聚焦一个可写窗口后重试。',
      5000,
      'warning',
    );
    expect(subject.notice?.kind).toBe('writer-relay-unavailable');
    expect(subject.action).toEqual({ type: 'grade', rating: 3 });
  });

  it('leaves generic errors for the caller', () => {
    const { runtime, deps } = createRuntime();

    expect(runtime.showActionError({
      reason: 'skip',
      error: new Error('scheduler failed'),
      item: null,
      message: 'failed',
      action: { type: 'skip' },
    })).toBe(false);

    expect(deps.setNotice).not.toHaveBeenCalled();
    expect(deps.setAction).not.toHaveBeenCalled();
    expect(deps.notifyReviewMessage).not.toHaveBeenCalled();
  });

  it('retries grade, skip, and custom command actions without local fallback', async () => {
    const grade = createRuntime({ type: 'grade', rating: 2 });
    await grade.runtime.retry();
    expect(grade.deps.setNotice).toHaveBeenCalledWith(null);
    expect(grade.deps.grade).toHaveBeenCalledWith(2);
    expect(grade.deps.skip).not.toHaveBeenCalled();

    const skip = createRuntime({ type: 'skip' });
    await skip.runtime.retry();
    expect(skip.deps.skip).toHaveBeenCalledTimes(1);

    const custom = createRuntime({ type: 'custom', commandId: 'reveal-related' });
    await custom.runtime.retry();
    expect(custom.deps.executeCommand).toHaveBeenCalledWith('reveal-related');
  });

  it('dismisses and reloads the recovery surface through explicit actions', async () => {
    const { runtime, deps } = createRuntime();

    runtime.dismiss();
    expect(deps.setNotice).toHaveBeenCalledWith(null);

    await runtime.reloadSurface();
    expect(deps.setNotice).toHaveBeenCalledWith(null);
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });
});
