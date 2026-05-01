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
      },
      networkProxy: { execute },
      resolveSecret: (name) => (name === 'provider:apiKey' ? null : 'value'),
    });

    await expect(service.proxyNetwork({
      url: 'https://example.com',
      requiredSecretName: 'provider:apiKey',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: missing secret provider:apiKey');
  });
});
