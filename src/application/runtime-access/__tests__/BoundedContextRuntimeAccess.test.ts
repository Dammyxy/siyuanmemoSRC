import { describe, expect, it, vi } from 'vitest';

import {
  BrowserQueueRuntimeAccess,
  IntegrationRuntimeAccess,
  ProgressiveRuntimeAccess,
  ReviewRuntimeAccess,
} from '../BoundedContextRuntimeAccess';

describe('bounded-context runtime access', () => {
  it('exposes explicit Review and Browser members without generic lookup', () => {
    const reviewService = {};
    const browserService = {};
    const review = new ReviewRuntimeAccess({
      reviewService: () => reviewService as never,
      backendClient: () => null,
    });
    const browser = new BrowserQueueRuntimeAccess({
      browserService: () => browserService as never,
      backendClient: () => null,
    });

    expect(review.reviewService).toBe(reviewService);
    expect(browser.browserService).toBe(browserService);
    expect('get' in review).toBe(false);
    expect('get' in browser).toBe(false);
    expect(() => review.requireBackendClient()).toThrow(
      'REVIEW_RUNTIME_UNAVAILABLE: SRS backend client is unavailable',
    );
    expect(() => browser.requireBackendClient()).toThrow(
      'BROWSER_QUEUE_RUNTIME_UNAVAILABLE: SRS backend client is unavailable',
    );
  });

  it('keeps Progressive and integration execution explicit', async () => {
    const executeProgressiveCommand = vi.fn(async () => ({ status: 'ok' }));
    const executeAgentTool = vi.fn(async () => ({ status: 'ok' }));
    const progressive = new ProgressiveRuntimeAccess({
      executeProgressiveCommand,
    });
    const integration = new IntegrationRuntimeAccess({
      executeAgentTool,
    });

    await expect(progressive.executeProgressiveCommand({ id: 'progressive-1' } as never))
      .resolves.toEqual({ status: 'ok' });
    await expect(integration.executeAgentTool({ tool: 'memo_query' }))
      .resolves.toEqual({ status: 'ok' });
  });

  it('enforces bind-before-use and bind-once startup composition', async () => {
    const progressive = new ProgressiveRuntimeAccess<{ id: string }, { status: string }>();
    const integration = new IntegrationRuntimeAccess();

    expect(() => progressive.executeProgressiveCommand({ id: 'before-bind' })).toThrow(
      'RUNTIME_ACCESS_UNAVAILABLE: progressive-runtime.execute callback is not bound',
    );
    expect(() => integration.storage).toThrow(
      'RUNTIME_ACCESS_UNAVAILABLE: integration-runtime.services callback is not bound',
    );

    progressive.bindExecuteProgressiveCommand(async ({ id }) => ({ status: id }));
    const storage = {};
    integration.bindRuntime({ storage } as never);

    await expect(progressive.executeProgressiveCommand({ id: 'ready' }))
      .resolves.toEqual({ status: 'ready' });
    expect(integration.storage).toBe(storage);
    expect(() => progressive.bindExecuteProgressiveCommand(async () => ({ status: 'rebound' })))
      .toThrow(
        'RUNTIME_ACCESS_ALREADY_BOUND: progressive-runtime.execute callback is already bound',
      );
    expect(() => integration.bindRuntime({ storage: {} } as never)).toThrow(
      'RUNTIME_ACCESS_ALREADY_BOUND: integration-runtime.services callback is already bound',
    );
  });

  it('fails access after centralized disposal', () => {
    const review = new ReviewRuntimeAccess({
      reviewService: () => ({}) as never,
      backendClient: () => null,
    });

    review.dispose();

    expect(() => review.reviewService).toThrow(
      'RUNTIME_ACCESS_DISPOSED: ReviewRuntimeAccess is disposed',
    );
  });

  it('invalidates callback and service access on centralized disposal', () => {
    const progressive = new ProgressiveRuntimeAccess({
      executeProgressiveCommand: async () => ({ status: 'ok' }),
    });
    const integration = new IntegrationRuntimeAccess({
      executeAgentTool: async () => ({ status: 'ok' }),
    });
    integration.bindRuntime({ storage: {} } as never);

    progressive.dispose();
    integration.dispose();

    expect(() => progressive.executeProgressiveCommand({})).toThrow(
      'RUNTIME_ACCESS_DISPOSED: ProgressiveRuntimeAccess is disposed',
    );
    expect(() => integration.executeAgentTool({})).toThrow(
      'RUNTIME_ACCESS_DISPOSED: IntegrationRuntimeAccess is disposed',
    );
    expect(() => integration.storage).toThrow(
      'RUNTIME_ACCESS_DISPOSED: IntegrationRuntimeAccess is disposed',
    );
  });
});
