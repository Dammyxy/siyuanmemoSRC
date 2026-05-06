import { describe, expect, it, vi } from 'vitest';
import { AIBackendSessionService } from '../AIBackendSessionService';

describe('AIBackendSessionService', () => {
  it('delegates session/job methods to backend client', async () => {
    const backendClient = {
      createAiSession: vi.fn(async () => ({ ok: true, session: { sessionId: 's1' } })),
      getAiSession: vi.fn(async () => ({ ok: true, session: { sessionId: 's1' } })),
      updateAiSession: vi.fn(async () => ({ ok: true, session: { sessionId: 's1', state: 'active' } })),
      cancelAiSession: vi.fn(async () => ({ ok: true, session: { sessionId: 's1', state: 'canceled' } })),
      startAiStream: vi.fn(async () => ({ ok: true, streamId: 'st1', sessionId: 's1', jobId: 'j1', state: 'started', diagnosticEventId: 'd1' })),
      cancelAiStream: vi.fn(async () => ({ ok: true, streamId: 'st1', sessionId: 's1', jobId: 'j1', state: 'canceled', diagnosticEventId: 'd2' })),
      getAiJob: vi.fn(async () => ({ ok: true, job: { jobId: 'j1' } })),
      cancelAiJob: vi.fn(async () => ({ ok: true, job: { jobId: 'j1', state: 'canceled' } })),
      executeAiPrompt: vi.fn(async () => ({ ok: true, sessionId: 's1', streamId: 'st1', jobId: 'j1', state: 'completed', diagnosticEventId: 'd3' })),
    };
    const service = new AIBackendSessionService({ backendClient });

    await expect(service.createSession({ sessionId: 's1', surfaceId: 'standalone-dialog' })).resolves.toMatchObject({ ok: true });
    await expect(service.getSession({ sessionId: 's1' })).resolves.toMatchObject({ ok: true });
    await expect(service.updateSession({ sessionId: 's1', state: 'active' })).resolves.toMatchObject({ ok: true });
    await expect(service.cancelSession({ sessionId: 's1' })).resolves.toMatchObject({ ok: true });
    await expect(service.startStream({ streamId: 'st1', sessionId: 's1', jobId: 'j1' })).resolves.toMatchObject({ state: 'started' });
    await expect(service.cancelStream({ streamId: 'st1', sessionId: 's1', jobId: 'j1' })).resolves.toMatchObject({ state: 'canceled' });
    await expect(service.getJob({ jobId: 'j1' })).resolves.toMatchObject({ ok: true });
    await expect(service.cancelJob({ jobId: 'j1' })).resolves.toMatchObject({ ok: true });
    await expect(service.executePrompt({
      sessionId: 's1',
      streamId: 'st1',
      jobId: 'j1',
      request: { url: 'https://example.com', method: 'POST' },
    })).resolves.toMatchObject({ ok: true });
  });

  it('rejects network proxy when adapter is unavailable', async () => {
    const service = new AIBackendSessionService({
      backendClient: {
        createAiSession: vi.fn(),
        getAiSession: vi.fn(),
        updateAiSession: vi.fn(),
        cancelAiSession: vi.fn(),
        startAiStream: vi.fn(),
        cancelAiStream: vi.fn(),
        getAiJob: vi.fn(),
        cancelAiJob: vi.fn(),
        executeAiPrompt: vi.fn(),
      },
      networkProxy: null,
    });

    await expect(service.proxyNetwork({
      url: 'https://example.com',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: ai network proxy unavailable');
  });

  it('requires secret and preserves redacted error message', async () => {
    const execute = vi.fn(async () => ({
      status: 200,
      headers: {},
      body: '{"token":"***REDACTED***"}',
    }));
    const service = new AIBackendSessionService({
      backendClient: {
        createAiSession: vi.fn(),
        getAiSession: vi.fn(),
        updateAiSession: vi.fn(),
        cancelAiSession: vi.fn(),
        startAiStream: vi.fn(),
        cancelAiStream: vi.fn(),
        getAiJob: vi.fn(),
        cancelAiJob: vi.fn(),
        executeAiPrompt: vi.fn(),
      },
      networkProxy: { execute },
      resolveSecret: (name) => (name === 'provider:apiKey' ? null : 'value'),
    });

    await expect(service.proxyNetwork({
      url: 'https://example.com',
      requiredSecretName: 'provider:apiKey',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: missing secret provider:apiKey');
  });

  it('surfaces network unavailable from backend proxy adapter', async () => {
    const service = new AIBackendSessionService({
      backendClient: {
        createAiSession: vi.fn(),
        getAiSession: vi.fn(),
        updateAiSession: vi.fn(),
        cancelAiSession: vi.fn(),
        startAiStream: vi.fn(),
        cancelAiStream: vi.fn(),
        getAiJob: vi.fn(),
        cancelAiJob: vi.fn(),
        executeAiPrompt: vi.fn(),
      },
      networkProxy: {
        execute: vi.fn(async () => {
          throw new Error('BACKEND_UNAVAILABLE: network unavailable');
        }),
      },
      resolveSecret: () => 'secret',
    });

    await expect(service.proxyNetwork({
      url: 'https://example.com',
      requiredSecretName: 'provider:apiKey',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: network unavailable');
  });

  it('subscribes to AI stream deltas through the network proxy boundary', () => {
    const close = vi.fn();
    const subscribeStream = vi.fn(() => ({ close }));
    const service = new AIBackendSessionService({
      backendClient: {
        createAiSession: vi.fn(),
        getAiSession: vi.fn(),
        updateAiSession: vi.fn(),
        cancelAiSession: vi.fn(),
        startAiStream: vi.fn(),
        cancelAiStream: vi.fn(),
        getAiJob: vi.fn(),
        cancelAiJob: vi.fn(),
        executeAiPrompt: vi.fn(),
      },
      networkProxy: {
        execute: vi.fn(),
        subscribeStream,
      },
    });
    const handlers = { onEvent: vi.fn() };

    const subscription = service.subscribeStream('stream-1', handlers);

    expect(subscribeStream).toHaveBeenCalledWith('stream-1', handlers);
    subscription.close();
    expect(close).toHaveBeenCalled();
  });

  it('surfaces backend unavailable when backend session client fails', async () => {
    const service = new AIBackendSessionService({
      backendClient: {
        createAiSession: vi.fn(async () => {
          throw new Error('BACKEND_UNAVAILABLE: ai session unavailable');
        }),
        getAiSession: vi.fn(),
        updateAiSession: vi.fn(),
        cancelAiSession: vi.fn(),
        startAiStream: vi.fn(),
        cancelAiStream: vi.fn(),
        getAiJob: vi.fn(),
        cancelAiJob: vi.fn(),
        executeAiPrompt: vi.fn(),
      },
    });

    await expect(service.createSession({
      sessionId: 'session-x',
      surfaceId: 'standalone-dialog',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: ai session unavailable');
  });

  it('propagates sidecar unavailable from backend prompt execution', async () => {
    const service = new AIBackendSessionService({
      backendClient: {
        createAiSession: vi.fn(),
        getAiSession: vi.fn(),
        updateAiSession: vi.fn(),
        cancelAiSession: vi.fn(),
        startAiStream: vi.fn(),
        cancelAiStream: vi.fn(),
        getAiJob: vi.fn(),
        cancelAiJob: vi.fn(),
        executeAiPrompt: vi.fn(async () => {
          throw new Error('KERNEL_SIDECAR_UNAVAILABLE: sidecar unavailable');
        }),
      },
      resolveSecret: () => 'secret',
    });

    await expect(service.executePrompt({
      sessionId: 's-sidecar',
      streamId: 'st-sidecar',
      jobId: 'j-sidecar',
      request: { url: 'https://example.com', method: 'POST' },
      requiredSecretName: 'provider:apiKey',
    })).rejects.toThrow('KERNEL_SIDECAR_UNAVAILABLE');
  });
});
