import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryEngine } from '../QueryEngine';
import { ConceptQueryEngine } from '../ConceptQueryEngine';
import { NeuralQueueStorage } from '../NeuralQueueStorage';
import { DEFAULT_NEURAL_QUEUE_CONFIG } from '../types';
import * as api from '../../../siyuan/api';

vi.mock('../../../siyuan/api', () => ({
  sql: vi.fn(),
}));

global.fetch = vi.fn();

describe('Neural dependency unavailable behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails closed when backlink API access fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    const engine = new QueryEngine(DEFAULT_NEURAL_QUEUE_CONFIG);

    await expect(engine.fetchBacklinks('concept-1'))
      .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
  });

  it('fails closed when random seed SQL access fails', async () => {
    vi.mocked(api.sql).mockRejectedValue(new Error('sql down'));
    const engine = new QueryEngine(DEFAULT_NEURAL_QUEUE_CONFIG);

    await expect(engine.fetchRandomCard())
      .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
  });

  it('fails closed when concept backlinks SQL access fails', async () => {
    vi.mocked(api.sql).mockRejectedValue(new Error('sql down'));
    const engine = new ConceptQueryEngine();

    await expect(engine.fetchBacklinks('concept-1'))
      .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
  });

  it('fails closed when concept block data SQL access fails', async () => {
    vi.mocked(api.sql).mockRejectedValue(new Error('sql down'));
    const engine = new ConceptQueryEngine();

    await expect(engine.fetchBlockData('block-1'))
      .rejects.toThrow('NEURAL_ROAM_QUERY_UNAVAILABLE');
  });

  it('fails closed when session state storage access fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('storage denied');
      }),
    });

    expect(() => NeuralQueueStorage.loadSessionState())
      .toThrow('NEURAL_QUEUE_STORAGE_UNAVAILABLE');
  });
});
