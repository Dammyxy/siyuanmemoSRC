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
  BACKEND_GRAPH_RPC_METHODS,
  BACKEND_GRAPH_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendGraphRpcMethod,
} from '../backend-rpc/graph';
import {
  BACKEND_HOTSPOT_RPC_METHODS,
  BACKEND_HOTSPOT_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendHotspotRpcMethod,
} from '../backend-rpc/hotspot';
import {
  BACKEND_KERNEL_TRANSACTION_RPC_METHODS,
  BACKEND_KERNEL_TRANSACTION_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendKernelTransactionRpcMethod,
} from '../backend-rpc/kernel-transaction';
import {
  BACKEND_NEURAL_ROAM_RPC_METHODS,
  BACKEND_NEURAL_ROAM_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendNeuralRoamRpcMethod,
} from '../backend-rpc/neural-roam';
import {
  BACKEND_P6_OWNERSHIP_RPC_METHODS,
  BACKEND_P6_OWNERSHIP_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendP6OwnershipRpcMethod,
} from '../backend-rpc/p6-ownership';
import {
  BACKEND_PRIVATE_API_RPC_METHODS,
  BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendPrivateApiRpcMethod,
  type PrivateApiAuditQueryResult,
  type PrivateApiCardsReadRequest,
} from '../backend-rpc/private-api';
import {
  BACKEND_PROGRESSIVE_RPC_METHODS,
  BACKEND_PROGRESSIVE_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendProgressiveRpcMethod,
} from '../backend-rpc/progressive';
import {
  BACKEND_QUEUE_PROJECTION_RPC_METHODS,
  BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD,
} from '../backend-rpc/queue-projection';
import {
  BACKEND_REVIEW_RPC_METHODS,
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendReviewRpcMethod,
} from '../backend-rpc/review';
import {
  BACKEND_SEMANTIC_RPC_METHODS,
  BACKEND_SEMANTIC_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendSemanticRpcMethod,
} from '../backend-rpc/semantic';
import {
  BACKEND_SYNC_RPC_METHODS,
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendSyncRpcMethod,
} from '../backend-rpc/sync';
import {
  BACKEND_TOPIC_DERIVED_RPC_METHODS,
  BACKEND_TOPIC_DERIVED_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendTopicDerivedRpcMethod,
} from '../backend-rpc/topic-derived';
import {
  BACKEND_XIUYUAN_RPC_METHODS,
  BACKEND_XIUYUAN_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendXiuyuanRpcMethod,
} from '../backend-rpc/xiuyuan';

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

  it('exports Review feedback/truth/riff/source-refresh contracts from the Review family module', () => {
    expect(BACKEND_REVIEW_RPC_METHODS).toEqual([
      'review.feedback',
      'review.session.start',
      'review.session.current',
      'review.session.feedback',
      'review.session.skip',
      'review.session.undo',
      'review.truth.flush',
      'review.truth.backfill',
      'review.truth.maintenanceStatus',
      'review.riffFeedback.execute',
      'review.sourceRefresh.execute',
    ] satisfies BackendReviewRpcMethod[]);
    expect(BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.feedback']).toMatchObject({
      method: 'review.feedback',
      family: 'review',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['review.truth.flush']).toBe(
      BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.truth.flush'],
    );
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['review.truth.maintenanceStatus']).toBe(
      BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.truth.maintenanceStatus'],
    );
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['review.sourceRefresh.execute']).toBe(
      BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.sourceRefresh.execute'],
    );
  });

  it('exports sync conflict and domain-sync contracts from the Sync family module', () => {
    expect(BACKEND_SYNC_RPC_METHODS).toEqual([
      'sync.conflict.merge',
      'sync.reviewDivergence.audit',
      'sync.conflict.summarize',
      'sync.conflict.reload',
      'domainSync.status',
      'domainSync.repair.preview',
      'domainSync.repair.apply',
      'domainSync.conflictSources.cleanupCandidates',
      'domainSync.conflictSources.cleanup',
    ] satisfies BackendSyncRpcMethod[]);
    expect(BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['sync.conflict.merge']).toMatchObject({
      method: 'sync.conflict.merge',
      family: 'sync',
    });
    expect(BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['domainSync.status']).toMatchObject({
      method: 'domainSync.status',
      family: 'domain-sync',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['domainSync.conflictSources.cleanup']).toBe(
      BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['domainSync.conflictSources.cleanup'],
    );
  });

  it('exports NeuralRoam advance, view-state, and command contracts from the NeuralRoam family module', () => {
    expect(BACKEND_NEURAL_ROAM_RPC_METHODS).toEqual([
      'neural-roam.advance',
      'neural-roam.viewState',
      'neural-roam.command',
    ] satisfies BackendNeuralRoamRpcMethod[]);
    expect(BACKEND_NEURAL_ROAM_RPC_METHOD_CONTRACT_BY_METHOD['neural-roam.advance']).toMatchObject({
      method: 'neural-roam.advance',
      family: 'neural-roam',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['neural-roam.command']).toBe(
      BACKEND_NEURAL_ROAM_RPC_METHOD_CONTRACT_BY_METHOD['neural-roam.command'],
    );
  });

  it('exports kernel transaction ingest/dequeue/requeue contracts from the Kernel Transaction family module', () => {
    expect(BACKEND_KERNEL_TRANSACTION_RPC_METHODS).toEqual([
      'kernel.transaction.ingest',
      'kernel.transaction.dequeue',
      'kernel.transaction.requeue',
    ] satisfies BackendKernelTransactionRpcMethod[]);
    expect(BACKEND_KERNEL_TRANSACTION_RPC_METHOD_CONTRACT_BY_METHOD['kernel.transaction.ingest']).toMatchObject({
      method: 'kernel.transaction.ingest',
      family: 'kernel-transaction',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['kernel.transaction.requeue']).toBe(
      BACKEND_KERNEL_TRANSACTION_RPC_METHOD_CONTRACT_BY_METHOD['kernel.transaction.requeue'],
    );
  });

  it('exports hotspot command and job contracts from the Hotspot family module', () => {
    expect(BACKEND_HOTSPOT_RPC_METHODS).toEqual([
      'hotspot.command.submit',
      'hotspot.job.get',
    ] satisfies BackendHotspotRpcMethod[]);
    expect(BACKEND_HOTSPOT_RPC_METHOD_CONTRACT_BY_METHOD['hotspot.command.submit']).toMatchObject({
      method: 'hotspot.command.submit',
      family: 'hotspot',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['hotspot.job.get']).toBe(
      BACKEND_HOTSPOT_RPC_METHOD_CONTRACT_BY_METHOD['hotspot.job.get'],
    );
  });

  it('exports Private API audit/read/command contracts from the Private API family module', () => {
    expect(BACKEND_PRIVATE_API_RPC_METHODS).toEqual([
      'private.audit.query',
      'private.read.cards',
      'private.read.queues',
      'private.read.sessions',
      'private.command.execute',
    ] satisfies BackendPrivateApiRpcMethod[]);
    expect(BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD['private.audit.query']).toMatchObject({
      method: 'private.audit.query',
      family: 'private-api',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['private.read.sessions']).toBe(
      BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD['private.read.sessions'],
    );

    const auditResult = {
      ok: true,
      data: [{ requestId: 'private-a' }],
      diagnosticEventId: 'private-audit:1',
      auditStatus: 'recorded',
    } satisfies PrivateApiAuditQueryResult;
    const readRequest = {
      requestId: 'private-read-a',
      method: 'private.read.cards',
      callerIntent: 'test',
    } satisfies PrivateApiCardsReadRequest;

    expect(JSON.parse(JSON.stringify({ auditResult, readRequest }))).toMatchObject({
      auditResult: { auditStatus: 'recorded' },
      readRequest: { method: 'private.read.cards' },
    });
  });

  it('exports Semantic command and read contracts from the Semantic family module', () => {
    expect(BACKEND_SEMANTIC_RPC_METHODS).toEqual([
      'semantic.command.execute',
      'semantic.session.read',
      'semantic.sidebar.read',
      'semantic.browser.read',
    ] satisfies BackendSemanticRpcMethod[]);
    expect(BACKEND_SEMANTIC_RPC_METHOD_CONTRACT_BY_METHOD['semantic.command.execute']).toMatchObject({
      method: 'semantic.command.execute',
      family: 'semantic',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['semantic.browser.read']).toBe(
      BACKEND_SEMANTIC_RPC_METHOD_CONTRACT_BY_METHOD['semantic.browser.read'],
    );
  });

  it('exports Xiuyuan, Progressive, and Topic-derived command contracts from their family modules', () => {
    expect(BACKEND_XIUYUAN_RPC_METHODS).toEqual([
      'xiuyuan.sync.execute',
    ] satisfies BackendXiuyuanRpcMethod[]);
    expect(BACKEND_PROGRESSIVE_RPC_METHODS).toEqual([
      'progressive.command.execute',
    ] satisfies BackendProgressiveRpcMethod[]);
    expect(BACKEND_TOPIC_DERIVED_RPC_METHODS).toEqual([
      'topic-derived.command.execute',
    ] satisfies BackendTopicDerivedRpcMethod[]);

    expect(BACKEND_XIUYUAN_RPC_METHOD_CONTRACT_BY_METHOD['xiuyuan.sync.execute']).toMatchObject({
      method: 'xiuyuan.sync.execute',
      family: 'xiuyuan',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['progressive.command.execute']).toBe(
      BACKEND_PROGRESSIVE_RPC_METHOD_CONTRACT_BY_METHOD['progressive.command.execute'],
    );
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['topic-derived.command.execute']).toBe(
      BACKEND_TOPIC_DERIVED_RPC_METHOD_CONTRACT_BY_METHOD['topic-derived.command.execute'],
    );
  });

  it('exports Graph and P6 ownership contracts from their family modules', () => {
    expect(BACKEND_GRAPH_RPC_METHODS).toEqual([
      'graph.query',
    ] satisfies BackendGraphRpcMethod[]);
    expect(BACKEND_P6_OWNERSHIP_RPC_METHODS).toEqual([
      'p6.ownership.query',
      'p6.ownership.command',
    ] satisfies BackendP6OwnershipRpcMethod[]);

    expect(BACKEND_GRAPH_RPC_METHOD_CONTRACT_BY_METHOD['graph.query']).toMatchObject({
      method: 'graph.query',
      family: 'graph',
    });
    expect(BACKEND_P6_OWNERSHIP_RPC_METHOD_CONTRACT_BY_METHOD['p6.ownership.command']).toMatchObject({
      method: 'p6.ownership.command',
      family: 'p6-ownership',
    });
    expect(BACKEND_RPC_METHOD_CONTRACT_BY_METHOD['p6.ownership.query']).toBe(
      BACKEND_P6_OWNERSHIP_RPC_METHOD_CONTRACT_BY_METHOD['p6.ownership.query'],
    );
  });
});
