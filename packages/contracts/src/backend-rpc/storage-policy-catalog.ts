export const MESSAGEPACK_TRUTH_SCHEMA_VERSION = 1;

export type MessagePackTruthFamily =
  | 'review-events'
  | 'card-memory-facts'
  | 'domain-sync-operations'
  | 'ai-session-payload-refs'
  | 'semantic-arena-payload-refs'
  | 'diagnostics-records';

export type MessagePackTruthPayloadPolicy =
  | 'event-fact'
  | 'entity-fact'
  | 'operation-fact'
  | 'payload-ref'
  | 'diagnostic-fact';

export interface MessagePackTruthFamilySchema {
  family: MessagePackTruthFamily;
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  payloadPolicy: MessagePackTruthPayloadPolicy;
  sqlProjection: 'skinny-index-ref' | 'diagnostic-index-ref';
  sourceOwner: 'plugin-truth' | 'siyuan-source-plus-plugin-truth';
}

export type MessagePackTruthRetentionMode =
  | 'retain-truth-indefinitely'
  | 'ttl-after-compaction';

export interface MessagePackTruthCompactionPolicy {
  closedSegmentThreshold: number;
  targetClosedSegments: number;
  minSegmentAgeMs: number;
}

export interface MessagePackTruthRetentionPolicy {
  mode: MessagePackTruthRetentionMode;
  keepUntilProjectionCheckpointed: boolean;
  compactedInputRetainDays: number;
}

export interface MessagePackTruthFamilyStoragePolicy {
  family: MessagePackTruthFamily;
  maxSegmentBytes: number;
  compaction: MessagePackTruthCompactionPolicy;
  retention: MessagePackTruthRetentionPolicy;
}

export const MESSAGEPACK_TRUTH_FAMILY_SCHEMAS = [
  {
    family: 'review-events',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'event-fact',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'plugin-truth',
  },
  {
    family: 'card-memory-facts',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'entity-fact',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'siyuan-source-plus-plugin-truth',
  },
  {
    family: 'domain-sync-operations',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'operation-fact',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'plugin-truth',
  },
  {
    family: 'ai-session-payload-refs',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'payload-ref',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'plugin-truth',
  },
  {
    family: 'semantic-arena-payload-refs',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'payload-ref',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'siyuan-source-plus-plugin-truth',
  },
  {
    family: 'diagnostics-records',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'diagnostic-fact',
    sqlProjection: 'diagnostic-index-ref',
    sourceOwner: 'plugin-truth',
  },
] as const satisfies readonly MessagePackTruthFamilySchema[];

const ONE_MIB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

function truthStoragePolicy(
  family: MessagePackTruthFamily,
  maxSegmentBytes: number,
  retentionMode: MessagePackTruthRetentionMode = 'retain-truth-indefinitely',
  compactedInputRetainDays = 30,
): MessagePackTruthFamilyStoragePolicy {
  return {
    family,
    maxSegmentBytes,
    compaction: {
      closedSegmentThreshold: 48,
      targetClosedSegments: 16,
      minSegmentAgeMs: DAY_MS,
    },
    retention: {
      mode: retentionMode,
      keepUntilProjectionCheckpointed: true,
      compactedInputRetainDays,
    },
  };
}

export const MESSAGEPACK_TRUTH_FAMILY_STORAGE_POLICIES = [
  truthStoragePolicy('review-events', ONE_MIB),
  truthStoragePolicy('card-memory-facts', 2 * ONE_MIB),
  truthStoragePolicy('domain-sync-operations', 2 * ONE_MIB),
  truthStoragePolicy('ai-session-payload-refs', 4 * ONE_MIB),
  truthStoragePolicy('semantic-arena-payload-refs', 4 * ONE_MIB),
  truthStoragePolicy('diagnostics-records', ONE_MIB, 'ttl-after-compaction', 14),
] as const satisfies readonly MessagePackTruthFamilyStoragePolicy[];

export function getMessagePackTruthFamilyStoragePolicy(
  family: MessagePackTruthFamily,
): MessagePackTruthFamilyStoragePolicy {
  const policy = MESSAGEPACK_TRUTH_FAMILY_STORAGE_POLICIES.find((candidate) => candidate.family === family);
  if (!policy) {
    throw new Error(`Unsupported MessagePack truth family storage policy: ${family}`);
  }
  return policy;
}

export const SQL_PROJECTION_SCHEMA_VERSION = 1;

export type SqlProjectionFamily =
  | 'cards'
  | 'review-event-indexes'
  | 'domain-sync-indexes'
  | 'queue-projections'
  | 'semantic-ai-indexes'
  | 'diagnostics-indexes';

export type SqlProjectionSource =
  | 'messagepack-truth'
  | 'siyuan-source'
  | 'allowlisted-block-attrs'
  | 'local-projection'
  | 'worker-diagnostics';

export type SqlProjectionColumnRole =
  | 'identity'
  | 'source-ref'
  | 'truth-ref'
  | 'skinny-index'
  | 'search-index'
  | 'ordering-index'
  | 'counter'
  | 'status'
  | 'summary'
  | 'rebuild-metadata'
  | 'retained-import-input';

export type SqlProjectionPayloadColumnPolicy =
  | 'skinny-index-json'
  | 'truth-ref-json'
  | 'retained-import-input';

export interface SqlProjectionColumnOwnership {
  table: string;
  column: string;
  role: SqlProjectionColumnRole;
  source: SqlProjectionSource | readonly SqlProjectionSource[];
  payloadPolicy?: SqlProjectionPayloadColumnPolicy;
}

export interface SqlProjectionFamilySchema {
  family: SqlProjectionFamily;
  schemaVersion: typeof SQL_PROJECTION_SCHEMA_VERSION;
  tables: readonly string[];
  truthFamilies: readonly MessagePackTruthFamily[];
  sourceInputs: readonly SqlProjectionSource[];
  columns: readonly SqlProjectionColumnOwnership[];
}

function projectionColumn(
  table: string,
  column: string,
  role: SqlProjectionColumnRole,
  source: SqlProjectionSource | readonly SqlProjectionSource[],
  payloadPolicy?: SqlProjectionPayloadColumnPolicy,
): SqlProjectionColumnOwnership {
  return payloadPolicy
    ? { table, column, role, source, payloadPolicy }
    : { table, column, role, source };
}

export const SQL_PROJECTION_FAMILY_SCHEMAS = [
  {
    family: 'cards',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: ['cards', 'xiuyuans', 'tombstones'],
    truthFamilies: ['card-memory-facts'],
    sourceInputs: ['messagepack-truth', 'siyuan-source', 'allowlisted-block-attrs'],
    columns: [
      projectionColumn('cards', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('cards', 'block_id', 'source-ref', ['messagepack-truth', 'siyuan-source']),
      projectionColumn('cards', 'xiuyuan_id', 'source-ref', ['messagepack-truth', 'allowlisted-block-attrs']),
      projectionColumn('cards', 'type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('cards', 'state', 'skinny-index', 'messagepack-truth'),
      projectionColumn('cards', 'due', 'ordering-index', 'messagepack-truth'),
      projectionColumn('cards', 'priority', 'ordering-index', 'messagepack-truth'),
      projectionColumn('cards', 'scheduler_type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('cards', 'deck_id', 'source-ref', 'siyuan-source'),
      projectionColumn('cards', 'root_id', 'source-ref', 'siyuan-source'),
      projectionColumn('cards', 'content_text', 'summary', 'siyuan-source'),
      projectionColumn('cards', 'tags', 'search-index', 'siyuan-source', 'skinny-index-json'),
      projectionColumn('cards', 'search_text', 'search-index', 'siyuan-source'),
      projectionColumn('cards', 'card_type_marker', 'skinny-index', ['messagepack-truth', 'allowlisted-block-attrs']),
      projectionColumn('cards', 'source_exists', 'status', 'siyuan-source'),
      projectionColumn('cards', 'source_checked_at', 'status', 'siyuan-source'),
      projectionColumn('cards', 'source_missing_at', 'status', 'siyuan-source'),
      projectionColumn('cards', 'msgpack_ref', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('cards', 'truth_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('cards', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('cards', 'projection_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('cards', 'source_hash', 'rebuild-metadata', 'siyuan-source'),
      projectionColumn('cards', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
      projectionColumn('cards', 'dto_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
    ],
  },
  {
    family: 'review-event-indexes',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: ['review_events', 'drill_events', 'reschedule_events'],
    truthFamilies: ['review-events'],
    sourceInputs: ['messagepack-truth', 'siyuan-source', 'local-projection'],
    columns: [
      projectionColumn('review_events', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('review_events', 'card_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'attempt_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'rating', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'reviewed_at', 'ordering-index', 'messagepack-truth'),
      projectionColumn('review_events', 'commit_idempotency_key', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'year', 'ordering-index', 'messagepack-truth'),
      projectionColumn('review_events', 'month', 'ordering-index', 'messagepack-truth'),
      projectionColumn('review_events', 'event_type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'msgpack_ref', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('review_events', 'truth_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('review_events', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('review_events', 'projection_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('review_events', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
    ],
  },
  {
    family: 'domain-sync-indexes',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: [
      'domain_sync_operations',
      'domain_sync_processed_sources',
      'domain_sync_sanity_snapshots',
      'domain_sync_repair_plans',
    ],
    truthFamilies: ['domain-sync-operations'],
    sourceInputs: ['messagepack-truth', 'local-projection'],
    columns: [
      projectionColumn('domain_sync_operations', 'operation_id', 'identity', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'source_id', 'source-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'source_device_id', 'source-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'source_generation', 'rebuild-metadata', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'operation_type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'entity_type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'entity_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'entity_block_id', 'source-ref', ['messagepack-truth', 'siyuan-source']),
      projectionColumn('domain_sync_operations', 'occurred_at', 'ordering-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'observed_at', 'ordering-index', 'local-projection'),
      projectionColumn('domain_sync_operations', 'payload_fingerprint', 'truth-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'idempotency_key', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'review_event_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'msgpack_ref', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('domain_sync_operations', 'truth_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'projection_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('domain_sync_operations', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
    ],
  },
  {
    family: 'queue-projections',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: [
      'queue_projection_generations',
      'queue_projection_rows',
      'queue_projection_counters',
      'queue_projection_invalidations',
      'queue_projection_rebuilds',
    ],
    truthFamilies: ['review-events', 'card-memory-facts'],
    sourceInputs: ['messagepack-truth', 'siyuan-source', 'local-projection'],
    columns: [
      projectionColumn('queue_projection_generations', 'queue_type', 'identity', 'local-projection'),
      projectionColumn('queue_projection_generations', 'policy_hash', 'rebuild-metadata', 'local-projection'),
      projectionColumn('queue_projection_generations', 'generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('queue_projection_generations', 'status', 'status', 'local-projection'),
      projectionColumn('queue_projection_generations', 'truth_generation_id', 'truth-ref', 'messagepack-truth'),
      projectionColumn('queue_projection_generations', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('queue_projection_generations', 'metadata_json', 'rebuild-metadata', 'local-projection', 'skinny-index-json'),
      projectionColumn('queue_projection_rows', 'row_id', 'identity', 'local-projection'),
      projectionColumn('queue_projection_rows', 'card_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('queue_projection_rows', 'block_id', 'source-ref', 'siyuan-source'),
      projectionColumn('queue_projection_rows', 'deck_id', 'source-ref', 'siyuan-source'),
      projectionColumn('queue_projection_rows', 'membership_reason', 'skinny-index', 'local-projection'),
      projectionColumn('queue_projection_rows', 'sort_key', 'ordering-index', 'local-projection'),
      projectionColumn('queue_projection_rows', 'source_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('queue_projection_rows', 'truth_refs_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('queue_projection_rows', 'source_hash', 'rebuild-metadata', 'siyuan-source'),
      projectionColumn('queue_projection_rows', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('queue_projection_rows', 'payload_json', 'summary', 'local-projection', 'skinny-index-json'),
      projectionColumn('queue_projection_counters', 'buckets_json', 'counter', 'local-projection', 'skinny-index-json'),
    ],
  },
  {
    family: 'semantic-ai-indexes',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: [
      'semantic_sessions',
      'semantic_events',
      'semantic_projection_cache',
      'arena_predictions',
      'arena_outcomes',
      'arena_score_snapshots',
      'ai_arena_events',
      'ai_card_attributions',
    ],
    truthFamilies: ['ai-session-payload-refs', 'semantic-arena-payload-refs'],
    sourceInputs: ['messagepack-truth', 'siyuan-source', 'local-projection'],
    columns: [
      projectionColumn('semantic_sessions', 'session_id', 'identity', 'messagepack-truth'),
      projectionColumn('semantic_sessions', 'root_focus_node_id', 'source-ref', 'siyuan-source'),
      projectionColumn('semantic_sessions', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('semantic_sessions', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('semantic_sessions', 'projection_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('semantic_sessions', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
      projectionColumn('semantic_projection_cache', 'projection_key', 'identity', 'local-projection'),
      projectionColumn('semantic_projection_cache', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('semantic_projection_cache', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('semantic_projection_cache', 'payload_json', 'summary', 'local-projection', 'skinny-index-json'),
      projectionColumn('semantic_events', 'event_id', 'identity', 'messagepack-truth'),
      projectionColumn('semantic_events', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('ai_arena_events', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('ai_arena_events', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('ai_arena_events', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('ai_arena_events', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
      projectionColumn('arena_predictions', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('arena_predictions', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('arena_outcomes', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('arena_outcomes', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('arena_outcomes', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
      projectionColumn('arena_score_snapshots', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('ai_card_attributions', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
    ],
  },
  {
    family: 'diagnostics-indexes',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: ['diagnostics_indexes'],
    truthFamilies: ['diagnostics-records'],
    sourceInputs: ['messagepack-truth', 'worker-diagnostics', 'local-projection'],
    columns: [
      projectionColumn('diagnostics_indexes', 'diagnostic_event_id', 'identity', 'messagepack-truth'),
      projectionColumn('diagnostics_indexes', 'category', 'skinny-index', 'worker-diagnostics'),
      projectionColumn('diagnostics_indexes', 'severity', 'status', 'worker-diagnostics'),
      projectionColumn('diagnostics_indexes', 'recorded_at', 'ordering-index', 'worker-diagnostics'),
      projectionColumn('diagnostics_indexes', 'summary', 'summary', 'worker-diagnostics'),
      projectionColumn('diagnostics_indexes', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('diagnostics_indexes', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('diagnostics_indexes', 'projection_generation', 'rebuild-metadata', 'local-projection'),
    ],
  },
] as const satisfies readonly SqlProjectionFamilySchema[];

export type StorageSlimmingFamily =
  | 'review-events'
  | 'card-memory'
  | 'domain-sync-operations'
  | 'queue-projections'
  | 'semantic-projections'
  | 'arena-evidence'
  | 'ai-sessions'
  | 'progressive-topic-lineage'
  | 'diagnostics'
  | 'block-attrs';

export type StorageSlimmingOwner =
  | 'messagepack-truth'
  | 'messagepack-truth-or-ref'
  | 'messagepack-truth-or-siyuan-source'
  | 'sql-projection-cache'
  | 'ttl-diagnostics-truth'
  | 'siyuan-source-metadata';

export type StorageSlimmingSqlPayloadRole =
  | 'skinny-index-plus-truth-ref'
  | 'rebuildable-cache'
  | 'ttl-index-plus-truth-ref'
  | 'source-binding-metadata-only';

export type StorageSlimmingWriteMode =
  | 'messagepack-truth-sql-projection'
  | 'messagepack-ref-sql-index'
  | 'projection-cache-only'
  | 'strict-allowlist-only'
  | 'background-diagnostics-ttl';

export interface StorageSlimmingLegacyCompatibilityPolicy {
  legacySources: readonly string[];
  expiryCondition: string;
  removalValidation: string;
}

export interface StorageSlimmingFamilyPolicy {
  family: StorageSlimmingFamily;
  owner: StorageSlimmingOwner;
  truthFamily: MessagePackTruthFamily | null;
  sqlProjectionFamily: SqlProjectionFamily | null;
  sqlPayloadRole: StorageSlimmingSqlPayloadRole;
  writeMode: StorageSlimmingWriteMode;
  legacyCompatibility: StorageSlimmingLegacyCompatibilityPolicy;
}

function slimmingPolicy(
  family: StorageSlimmingFamily,
  owner: StorageSlimmingOwner,
  truthFamily: MessagePackTruthFamily | null,
  sqlProjectionFamily: SqlProjectionFamily | null,
  sqlPayloadRole: StorageSlimmingSqlPayloadRole,
  writeMode: StorageSlimmingWriteMode,
  legacySources: readonly string[],
  expiryCondition: string,
  removalValidation: string,
): StorageSlimmingFamilyPolicy {
  return {
    family,
    owner,
    truthFamily,
    sqlProjectionFamily,
    sqlPayloadRole,
    writeMode,
    legacyCompatibility: {
      legacySources,
      expiryCondition,
      removalValidation,
    },
  };
}

export const STORAGE_SLIMMING_FAMILY_POLICIES = [
  slimmingPolicy(
    'review-events',
    'messagepack-truth',
    'review-events',
    'review-event-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-truth-sql-projection',
    ['review_events.payload_json', 'monthly review log files'],
    'review-events truth flush, rebuild, and idempotency parity pass for imported rows',
    'storage.projection.rebuild review-event-indexes plus review feedback idempotency tests',
  ),
  slimmingPolicy(
    'card-memory',
    'messagepack-truth',
    'card-memory-facts',
    'cards',
    'skinny-index-plus-truth-ref',
    'messagepack-truth-sql-projection',
    ['cards.payload_json', 'cards.dto_json', 'xiuyuans.payload_json', 'legacy cardDTOs'],
    'card-memory/source-binding truth segments rebuild cards and Xiuyuan projections on a second device',
    'storage.projection.rebuild cards tests with deleted SQL and source reads',
  ),
  slimmingPolicy(
    'domain-sync-operations',
    'messagepack-truth',
    'domain-sync-operations',
    'domain-sync-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-truth-sql-projection',
    ['domain_sync_operations.payload_json', 'sync conflict database rows'],
    'domain-sync operation facts and conflict decisions are replayable from MessagePack truth',
    'conflict merge, repair ledger, and idempotency replay tests',
  ),
  slimmingPolicy(
    'queue-projections',
    'sql-projection-cache',
    null,
    'queue-projections',
    'rebuildable-cache',
    'projection-cache-only',
    ['queue_projection_rows.payload_json', 'queue_state.value_json'],
    'queue projections rebuild from card/review truth plus SiYuan source reads',
    'queue projection materialization and stale/deleted SQL rebuild checks',
  ),
  slimmingPolicy(
    'semantic-projections',
    'messagepack-truth-or-ref',
    'semantic-arena-payload-refs',
    'semantic-ai-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-ref-sql-index',
    ['semantic_* payload_json columns'],
    'semantic payload bodies have payload_ref_json/hash or are documented rebuildable cache rows',
    'semantic SQL index/ref contract and payload budget tests',
  ),
  slimmingPolicy(
    'arena-evidence',
    'messagepack-truth-or-ref',
    'semantic-arena-payload-refs',
    'semantic-ai-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-ref-sql-index',
    ['arena_* payload_json columns', 'ai_arena_events.payload_json'],
    'arena evidence payload bodies have payload_ref_json/hash or TTL/cache classification',
    'arena SQL-backed recording and payload ref contract tests',
  ),
  slimmingPolicy(
    'ai-sessions',
    'messagepack-truth-or-ref',
    'ai-session-payload-refs',
    'semantic-ai-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-ref-sql-index',
    ['ai-workbench session JSON records', 'AI session payload_json rows'],
    'AI session payload bodies move behind backend session/job payload refs or explicit legacy read',
    'AI backend session contract and legacy session load tests',
  ),
  slimmingPolicy(
    'progressive-topic-lineage',
    'messagepack-truth-or-siyuan-source',
    'card-memory-facts',
    'cards',
    'skinny-index-plus-truth-ref',
    'messagepack-ref-sql-index',
    ['progressive/topic lineage attrs', 'progressive payload JSON records'],
    'source-binding and topic lineage facts rebuild from MessagePack truth plus SiYuan source metadata',
    'card/source-binding rebuild and strict block-attr allowlist tests',
  ),
  slimmingPolicy(
    'diagnostics',
    'ttl-diagnostics-truth',
    'diagnostics-records',
    'diagnostics-indexes',
    'ttl-index-plus-truth-ref',
    'background-diagnostics-ttl',
    ['diagnostic payload_json fields', 'debug JSON files'],
    'diagnostics payloads are TTL truth records or bounded summaries, not permanent SQL truth',
    'diagnostics index/ref contract and retention policy tests',
  ),
  slimmingPolicy(
    'block-attrs',
    'siyuan-source-metadata',
    null,
    null,
    'source-binding-metadata-only',
    'strict-allowlist-only',
    ['custom-fsrs-* legacy attrs', 'custom-xiuyuan-id legacy binding attrs'],
    'all non-source-metadata writes are rejected and legacy attrs are read-only or cleanup-only',
    'BlockAttrPolicy and Siyuan API BLOCK_ATTR_WRITE_FORBIDDEN tests',
  ),
] as const satisfies readonly StorageSlimmingFamilyPolicy[];
