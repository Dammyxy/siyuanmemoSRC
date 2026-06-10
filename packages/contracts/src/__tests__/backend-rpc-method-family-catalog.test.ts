import { describe, expect, it } from 'vitest';
import {
  BACKEND_RPC_FAMILIES,
  BACKEND_RPC_METHODS,
  BACKEND_RPC_METHOD_CONTRACT_BY_METHOD,
  BACKEND_RPC_METHOD_FAMILY_CATALOG,
} from '../backend-rpc';
import {
  BACKEND_BROWSER_RPC_METHODS,
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendBrowserDeckMatchedIdsResult,
  type BackendSourceExistenceByBlockIdsResult,
} from '../backend-rpc/browser';
import {
  BACKEND_CORE_RPC_METHODS,
  BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendPrivateDiagnosticsStatusResult,
  type BackendPrivateHealthResult,
} from '../backend-rpc/core';
import {
  BACKEND_QUEUE_PROJECTION_RPC_METHODS,
  BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD,
} from '../backend-rpc/queue-projection';

describe('backend RPC method-family contract catalog', () => {
  it('declares every backend RPC method exactly once without changing method strings', () => {
    expect(BACKEND_RPC_METHOD_FAMILY_CATALOG.map((entry) => entry.method)).toEqual(BACKEND_RPC_METHODS);
    expect(new Set(BACKEND_RPC_METHOD_FAMILY_CATALOG.map((entry) => entry.method)).size)
      .toBe(BACKEND_RPC_METHODS.length);
  });

  it('assigns every method to a declared family and client exposure', () => {
    const families = new Set<string>(BACKEND_RPC_FAMILIES);

    expect(BACKEND_RPC_METHOD_FAMILY_CATALOG.every((entry) => families.has(entry.family))).toBe(true);
    expect(BACKEND_RPC_METHOD_FAMILY_CATALOG.every((entry) => entry.clientExposure === 'facade')).toBe(true);
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['system.health']).toMatchObject({
      family: 'core',
      clientExposure: 'facade',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['browser.deck.page']).toMatchObject({
      family: 'browser',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['queue.projection.snapshot']).toMatchObject({
      family: 'queue-projection',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['review.feedback']).toMatchObject({
      family: 'review',
    });
  });

  it('exports low-risk core/system/db/diagnostics/private health contracts from the core family module', () => {
    expect(BACKEND_CORE_RPC_METHODS).toEqual([
      'system.health',
      'db.load',
      'db.persist',
      'diagnostics.status',
      'private.health',
      'private.diagnostics.status',
    ]);
    expect(BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['private.health']).toMatchObject({
      method: 'private.health',
      family: 'core',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['private.health']).toBe(
      BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['private.health'],
    );

    const health = {
      ok: true,
      runtime: 'srs-backend-worker',
      feature: 'private-api',
    } satisfies BackendPrivateHealthResult;
    const diagnostics = {
      ok: true,
      runtime: 'srs-backend-worker',
      status: {
        runtime: 'srs-backend-worker',
        initialized: true,
        dbFile: 'siyuanmemo.db',
      },
      auditEvents: 0,
    } satisfies BackendPrivateDiagnosticsStatusResult;

    expect(JSON.parse(JSON.stringify({ health, diagnostics }))).toMatchObject({
      health: { feature: 'private-api' },
      diagnostics: { auditEvents: 0 },
    });
  });

  it('exports Browser deck, source-existence, and aggregate contracts from the Browser family module', () => {
    expect(BACKEND_BROWSER_RPC_METHODS).toEqual([
      'browser.deck.page',
      'browser.deck.matchedIds',
      'browser.deck.rowsByIds',
      'browser.deck.documentCounts',
      'browser.stats',
      'browser.count',
      'browser.sourceExistence.refreshCandidates',
      'browser.sourceExistence.update',
      'browser.sourceExistence.byBlockIds',
      'browser.sourceExistence.summary',
      'browser.sourceExistence.applySweep',
      'browser.sourceExistence.applySweepHost',
      'browser.aggregate.snapshot',
      'browser.aggregate.page',
      'browser.aggregate.focus',
    ]);
    expect(BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.deck.page']).toMatchObject({
      method: 'browser.deck.page',
      family: 'browser',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['browser.aggregate.focus']).toBe(
      BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.aggregate.focus'],
    );

    const matched = { ids: ['card-a'] } satisfies BackendBrowserDeckMatchedIdsResult;
    const existence = {
      statusByBlockId: [{ blockId: 'block-a', exists: true }],
    } satisfies BackendSourceExistenceByBlockIdsResult;

    expect(JSON.parse(JSON.stringify({ matched, existence }))).toMatchObject({
      matched: { ids: ['card-a'] },
      existence: { statusByBlockId: [{ blockId: 'block-a', exists: true }] },
    });
  });

  it('exports Queue Projection and storage projection rebuild contracts from the Queue Projection family module', () => {
    expect(BACKEND_QUEUE_PROJECTION_RPC_METHODS).toEqual([
      'storage.projection.rebuild',
      'queue.projection.snapshot',
      'queue.projection.rowsByIds',
      'queue.projection.replace',
    ]);
    expect(BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD['storage.projection.rebuild']).toMatchObject({
      method: 'storage.projection.rebuild',
      family: 'queue-projection',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['queue.projection.snapshot']).toBe(
      BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD['queue.projection.snapshot'],
    );
  });
});
