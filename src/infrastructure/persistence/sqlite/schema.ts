export const SQLITE_DB_FILE = 'siyuanmemo.db';
export const SQLITE_SCHEMA_VERSION = 5;

export interface SqliteSkinnyProjectionColumn {
  table: string;
  name: string;
  definition: string;
}

export const CARD_PROJECTION_COLUMNS: Array<{ name: string; definition: string }> = [
  { name: 'deck_id', definition: 'deck_id TEXT' },
  { name: 'root_id', definition: 'root_id TEXT' },
  { name: 'content_text', definition: 'content_text TEXT' },
  { name: 'tags', definition: 'tags TEXT' },
  { name: 'suspended', definition: 'suspended INTEGER' },
  { name: 'lapses', definition: 'lapses INTEGER' },
  { name: 'reps', definition: 'reps INTEGER' },
  { name: 'last_review', definition: 'last_review INTEGER' },
  { name: 'created_at', definition: 'created_at INTEGER' },
  { name: 'scheduled_days', definition: 'scheduled_days INTEGER' },
  { name: 'stability', definition: 'stability REAL' },
  { name: 'difficulty', definition: 'difficulty REAL' },
  { name: 'a_factor', definition: 'a_factor REAL' },
  { name: 'search_text', definition: 'search_text TEXT' },
  { name: 'card_type_marker', definition: 'card_type_marker TEXT' },
  { name: 'source_exists', definition: 'source_exists INTEGER' },
  { name: 'source_checked_at', definition: 'source_checked_at INTEGER' },
  { name: 'source_missing_at', definition: 'source_missing_at INTEGER' },
];

export const CARD_PROJECTION_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_cards_deck_id ON cards(deck_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_root_id ON cards(root_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_state_due ON cards(state, due)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_suspended_due ON cards(suspended, due)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_priority ON cards(priority)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_lapses ON cards(lapses)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_last_review ON cards(last_review)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_card_type_marker ON cards(card_type_marker)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_source_exists ON cards(source_exists)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_source_checked ON cards(source_checked_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_source_root ON cards(source_exists, root_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_search_text ON cards(search_text)`,
];

const SEMANTIC_AI_PAYLOAD_REF_TABLES = [
  'semantic_sessions',
  'semantic_events',
  'semantic_stations',
  'semantic_relations',
  'semantic_branch_edges',
  'semantic_branch_states',
  'semantic_later_entries',
  'semantic_irrelevant_feedback',
  'semantic_suggestions',
  'semantic_projection_cache',
  'arena_predictions',
  'arena_outcomes',
  'arena_score_snapshots',
  'ai_arena_events',
  'ai_card_attributions',
] as const;

export const SQLITE_SKINNY_PROJECTION_COLUMNS: SqliteSkinnyProjectionColumn[] = [
  { table: 'cards', name: 'msgpack_ref', definition: 'msgpack_ref TEXT' },
  { table: 'cards', name: 'truth_hash', definition: 'truth_hash TEXT' },
  { table: 'cards', name: 'truth_schema_version', definition: 'truth_schema_version INTEGER' },
  { table: 'cards', name: 'projection_generation', definition: 'projection_generation INTEGER' },
  { table: 'cards', name: 'source_hash', definition: 'source_hash TEXT' },
  { table: 'review_events', name: 'msgpack_ref', definition: 'msgpack_ref TEXT' },
  { table: 'review_events', name: 'truth_hash', definition: 'truth_hash TEXT' },
  { table: 'review_events', name: 'truth_schema_version', definition: 'truth_schema_version INTEGER' },
  { table: 'review_events', name: 'projection_generation', definition: 'projection_generation INTEGER' },
  { table: 'domain_sync_operations', name: 'msgpack_ref', definition: 'msgpack_ref TEXT' },
  { table: 'domain_sync_operations', name: 'truth_hash', definition: 'truth_hash TEXT' },
  { table: 'domain_sync_operations', name: 'truth_schema_version', definition: 'truth_schema_version INTEGER' },
  { table: 'domain_sync_operations', name: 'projection_generation', definition: 'projection_generation INTEGER' },
  { table: 'queue_projection_generations', name: 'truth_generation_id', definition: 'truth_generation_id TEXT' },
  { table: 'queue_projection_generations', name: 'truth_schema_version', definition: 'truth_schema_version INTEGER' },
  { table: 'queue_projection_rows', name: 'truth_refs_json', definition: 'truth_refs_json TEXT' },
  { table: 'queue_projection_rows', name: 'source_hash', definition: 'source_hash TEXT' },
  { table: 'queue_projection_rows', name: 'truth_schema_version', definition: 'truth_schema_version INTEGER' },
  { table: 'queue_projection_rebuilds', name: 'truth_generation_id', definition: 'truth_generation_id TEXT' },
  { table: 'queue_projection_rebuilds', name: 'truth_schema_version', definition: 'truth_schema_version INTEGER' },
  ...SEMANTIC_AI_PAYLOAD_REF_TABLES.flatMap((table) => [
    { table, name: 'payload_ref_json', definition: 'payload_ref_json TEXT' },
    { table, name: 'payload_hash', definition: 'payload_hash TEXT' },
    { table, name: 'truth_schema_version', definition: 'truth_schema_version INTEGER' },
    { table, name: 'projection_generation', definition: 'projection_generation INTEGER' },
  ]),
  { table: 'diagnostics_indexes', name: 'diagnostic_event_id', definition: 'diagnostic_event_id TEXT' },
  { table: 'diagnostics_indexes', name: 'category', definition: 'category TEXT' },
  { table: 'diagnostics_indexes', name: 'severity', definition: 'severity TEXT' },
  { table: 'diagnostics_indexes', name: 'recorded_at', definition: 'recorded_at INTEGER' },
  { table: 'diagnostics_indexes', name: 'summary', definition: 'summary TEXT' },
  { table: 'diagnostics_indexes', name: 'payload_ref_json', definition: 'payload_ref_json TEXT' },
  { table: 'diagnostics_indexes', name: 'payload_hash', definition: 'payload_hash TEXT' },
  { table: 'diagnostics_indexes', name: 'truth_schema_version', definition: 'truth_schema_version INTEGER' },
  { table: 'diagnostics_indexes', name: 'projection_generation', definition: 'projection_generation INTEGER' },
];

export const SQLITE_SKINNY_PROJECTION_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_cards_msgpack_ref ON cards(msgpack_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_truth_hash ON cards(truth_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_projection_generation ON cards(projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_source_hash ON cards(source_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_review_events_msgpack_ref ON review_events(msgpack_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_review_events_projection_generation ON review_events(projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_operations_msgpack_ref ON domain_sync_operations(msgpack_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_operations_projection_generation
    ON domain_sync_operations(projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_generations_truth
    ON queue_projection_generations(truth_generation_id, truth_schema_version)`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_rows_truth
    ON queue_projection_rows(queue_type, truth_schema_version, source_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_sessions_payload_ref
    ON semantic_sessions(payload_hash, projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_events_payload_ref
    ON semantic_events(payload_hash, projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_projection_cache_payload_ref
    ON semantic_projection_cache(payload_hash, projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_arena_events_payload_ref
    ON ai_arena_events(payload_hash, projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_card_attributions_payload_ref
    ON ai_card_attributions(payload_hash, projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_arena_predictions_payload_ref
    ON arena_predictions(payload_hash, projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_arena_outcomes_payload_ref
    ON arena_outcomes(payload_hash, projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_arena_score_snapshots_payload_ref
    ON arena_score_snapshots(payload_hash, projection_generation)`,
  `CREATE INDEX IF NOT EXISTS idx_diagnostics_indexes_category
    ON diagnostics_indexes(category, severity, recorded_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_diagnostics_indexes_projection
    ON diagnostics_indexes(projection_generation, recorded_at DESC)`,
];

export function queueProjectionRowsTableStatement(tableName = 'queue_projection_rows'): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
    throw new Error(`Invalid SQLite table name: ${tableName}`);
  }
  return `CREATE TABLE IF NOT EXISTS ${tableName} (
    queue_type TEXT NOT NULL,
    row_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    block_id TEXT,
    deck_id TEXT,
    membership_reason TEXT NOT NULL,
    due_at INTEGER,
    due_bucket TEXT NOT NULL,
    priority_score REAL NOT NULL,
    sort_key TEXT NOT NULL,
    queue_index_hint INTEGER,
    policy_hash TEXT NOT NULL,
    source_generation INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    truth_refs_json TEXT,
    source_hash TEXT,
    truth_schema_version INTEGER,
    PRIMARY KEY(queue_type, policy_hash, row_id)
  )`;
}

export const QUEUE_PROJECTION_ROWS_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_rows_order
    ON queue_projection_rows(queue_type, policy_hash, source_generation, sort_key, queue_index_hint, row_id)`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_rows_card
    ON queue_projection_rows(queue_type, card_id)`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_rows_block
    ON queue_projection_rows(queue_type, block_id)`,
];

export const SQL_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS store_metadata (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    block_id TEXT,
    xiuyuan_id TEXT,
    type TEXT,
    state INTEGER,
    due INTEGER,
    priority INTEGER,
    scheduler_type TEXT,
    updated_at INTEGER,
    deck_id TEXT,
    root_id TEXT,
    content_text TEXT,
    tags TEXT,
    suspended INTEGER,
    lapses INTEGER,
    reps INTEGER,
    last_review INTEGER,
    created_at INTEGER,
    scheduled_days INTEGER,
    stability REAL,
    difficulty REAL,
    a_factor REAL,
    search_text TEXT,
    card_type_marker TEXT,
    source_exists INTEGER,
    source_checked_at INTEGER,
    source_missing_at INTEGER,
    payload_json TEXT NOT NULL,
    dto_json TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_block_id ON cards(block_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_xiuyuan_id ON cards(xiuyuan_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_type_due ON cards(type, due)`,
  `CREATE TABLE IF NOT EXISTS xiuyuans (
    id TEXT PRIMARY KEY,
    updated_at INTEGER,
    payload_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tombstones (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    deleted_at INTEGER NOT NULL,
    deleted_by TEXT,
    payload_json TEXT NOT NULL,
    PRIMARY KEY(kind, id)
  )`,
  `CREATE TABLE IF NOT EXISTS riff_sync (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS queue_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS diagnostics_indexes (
    diagnostic_event_id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    recorded_at INTEGER NOT NULL,
    summary TEXT NOT NULL,
    payload_ref_json TEXT,
    payload_hash TEXT,
    truth_schema_version INTEGER,
    projection_generation INTEGER,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS neural_roam_routes (
    route_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    temporary INTEGER NOT NULL,
    previous_route_id TEXT,
    initial_seed_node_ids_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_neural_roam_routes_last_used
    ON neural_roam_routes(temporary, last_used_at)`,
  `CREATE TABLE IF NOT EXISTS neural_roam_route_pool_entries (
    route_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    node_kind TEXT NOT NULL,
    role TEXT,
    priority REAL NOT NULL,
    added_at INTEGER NOT NULL,
    visited_at INTEGER,
    preview TEXT NOT NULL,
    PRIMARY KEY(route_id, node_id, kind)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_neural_roam_route_pool_kind
    ON neural_roam_route_pool_entries(route_id, kind, added_at)`,
  `CREATE TABLE IF NOT EXISTS neural_roam_route_history_events (
    event_id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,
    engine_mode TEXT NOT NULL,
    node_id TEXT NOT NULL,
    card_id TEXT,
    title TEXT NOT NULL,
    activation_kind TEXT NOT NULL,
    source_node_id TEXT,
    source_event_id TEXT,
    branch_root_node_id TEXT,
    source_role TEXT,
    origin TEXT,
    trace_quality TEXT,
    depth INTEGER,
    conduction_score REAL,
    visited_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_neural_roam_route_history_route
    ON neural_roam_route_history_events(route_id, visited_at DESC, event_id)`,
  `CREATE TABLE IF NOT EXISTS neural_roam_route_session_snapshots (
    route_id TEXT NOT NULL,
    engine_mode TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(route_id, engine_mode)
  )`,
  `CREATE TABLE IF NOT EXISTS neural_roam_route_active (
    singleton_id TEXT PRIMARY KEY,
    active_route_id TEXT NOT NULL,
    engine_mode TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS queue_projection_generations (
    queue_type TEXT PRIMARY KEY,
    policy_hash TEXT NOT NULL,
    generation INTEGER NOT NULL,
    status TEXT NOT NULL,
    rebuild_reason TEXT,
    updated_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL
  )`,
  queueProjectionRowsTableStatement(),
  ...QUEUE_PROJECTION_ROWS_INDEX_STATEMENTS,
  `CREATE TABLE IF NOT EXISTS queue_projection_counters (
    queue_type TEXT NOT NULL,
    policy_hash TEXT NOT NULL,
    generation INTEGER NOT NULL,
    version INTEGER NOT NULL,
    remaining INTEGER NOT NULL,
    due INTEGER NOT NULL,
    total INTEGER NOT NULL,
    buckets_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(queue_type, policy_hash)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_counters_generation
    ON queue_projection_counters(queue_type, generation, version)`,
  `CREATE TABLE IF NOT EXISTS queue_projection_invalidations (
    id TEXT PRIMARY KEY,
    queue_type TEXT NOT NULL,
    reason TEXT NOT NULL,
    affected_card_ids_json TEXT NOT NULL,
    affected_block_ids_json TEXT NOT NULL,
    generation INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_invalidations_queue
    ON queue_projection_invalidations(queue_type, created_at)`,
  `CREATE TABLE IF NOT EXISTS queue_projection_rebuilds (
    id TEXT PRIMARY KEY,
    queue_type TEXT NOT NULL,
    reason TEXT NOT NULL,
    policy_hash TEXT NOT NULL,
    generation INTEGER NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    metadata_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_rebuilds_queue
    ON queue_projection_rebuilds(queue_type, started_at)`,
  `CREATE TABLE IF NOT EXISTS srs_card_semantic_repair_receipts (
    receipt_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    repaired_count INTEGER NOT NULL,
    skipped_count INTEGER NOT NULL,
    ambiguous_count INTEGER NOT NULL,
    insufficient_count INTEGER NOT NULL,
    failed_count INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_srs_card_semantic_repair_receipts_created
    ON srs_card_semantic_repair_receipts(created_at)`,
  `CREATE TABLE IF NOT EXISTS domain_sync_operations (
    operation_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    source_device_id TEXT,
    source_generation INTEGER,
    operation_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_block_id TEXT,
    occurred_at INTEGER NOT NULL,
    observed_at INTEGER NOT NULL,
    payload_fingerprint TEXT NOT NULL,
    idempotency_key TEXT,
    review_event_id TEXT,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_operations_source
    ON domain_sync_operations(source_id, source_generation, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_operations_entity
    ON domain_sync_operations(entity_type, entity_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_operations_type
    ON domain_sync_operations(operation_type, occurred_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_sync_operations_idempotency
    ON domain_sync_operations(operation_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_operations_review_event
    ON domain_sync_operations(review_event_id)
    WHERE review_event_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS domain_sync_processed_sources (
    source_id TEXT NOT NULL,
    source_fingerprint TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    path TEXT,
    processed_at INTEGER NOT NULL,
    imported_operations INTEGER NOT NULL,
    ignored_operations INTEGER NOT NULL,
    imported_review_events INTEGER NOT NULL,
    ignored_review_events INTEGER NOT NULL,
    imported_cards INTEGER NOT NULL,
    ignored_cards INTEGER NOT NULL,
    skipped_reason TEXT,
    latest_sanity_status TEXT,
    metadata_json TEXT NOT NULL,
    PRIMARY KEY(source_id, source_fingerprint)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_processed_sources_source
    ON domain_sync_processed_sources(source_id, processed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_processed_sources_fingerprint
    ON domain_sync_processed_sources(source_fingerprint, processed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_processed_sources_skipped
    ON domain_sync_processed_sources(skipped_reason, processed_at)`,
  `CREATE TABLE IF NOT EXISTS domain_sync_sanity_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    checked_at INTEGER NOT NULL,
    ledger_operation_count INTEGER NOT NULL,
    pending_import_count INTEGER NOT NULL,
    processed_source_count INTEGER NOT NULL,
    skipped_source_count INTEGER NOT NULL,
    repairable_divergence_count INTEGER NOT NULL,
    divergent_card_count INTEGER NOT NULL,
    source_error_count INTEGER NOT NULL,
    truncated INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_sanity_snapshots_status
    ON domain_sync_sanity_snapshots(status, checked_at)`,
  `CREATE TABLE IF NOT EXISTS domain_sync_repair_plans (
    plan_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    scope_json TEXT NOT NULL,
    scheduler_config_hash TEXT,
    ledger_generation INTEGER NOT NULL,
    card_state_fingerprint TEXT NOT NULL,
    review_history_fingerprint TEXT NOT NULL,
    affected_card_count INTEGER NOT NULL,
    apply_idempotency_key TEXT,
    applied_at INTEGER,
    result_json TEXT,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_domain_sync_repair_plans_status
    ON domain_sync_repair_plans(status, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_sync_repair_plans_apply_key
    ON domain_sync_repair_plans(apply_idempotency_key)
    WHERE apply_idempotency_key IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS review_events (
    id TEXT PRIMARY KEY,
    card_id TEXT,
    attempt_id TEXT,
    rating INTEGER,
    reviewed_at INTEGER NOT NULL,
    commit_idempotency_key TEXT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_review_events_month ON review_events(year, month, reviewed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_review_events_card ON review_events(card_id, reviewed_at)`,
  `CREATE TABLE IF NOT EXISTS review_transaction_undo_journal (
    undo_token TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    queue_type TEXT NOT NULL,
    operation TEXT NOT NULL,
    card_id TEXT,
    original_review_idempotency_key TEXT,
    status TEXT NOT NULL,
    recorded_at INTEGER NOT NULL,
    undone_at INTEGER,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_review_transaction_undo_journal_session
    ON review_transaction_undo_journal(session_id, status, recorded_at)`,
  `CREATE INDEX IF NOT EXISTS idx_review_transaction_undo_journal_card
    ON review_transaction_undo_journal(card_id, recorded_at)`,
  `CREATE TABLE IF NOT EXISTS drill_events (
    id TEXT PRIMARY KEY,
    card_id TEXT,
    rating INTEGER,
    reviewed_at INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_drill_events_month ON drill_events(year, month, reviewed_at)`,
  `CREATE TABLE IF NOT EXISTS reschedule_events (
    id TEXT PRIMARY KEY,
    action TEXT,
    source TEXT,
    occurred_at INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reschedule_events_month ON reschedule_events(year, month, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS algorithm_registry (
    algorithm_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    domain TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    state TEXT NOT NULL,
    runtime_kind TEXT NOT NULL,
    version TEXT NOT NULL,
    parameter_hash TEXT NOT NULL,
    state_schema_version INTEGER NOT NULL,
    metadata_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS algorithm_card_state (
    card_id TEXT NOT NULL,
    algorithm_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(card_id, algorithm_id)
  )`,
  `CREATE TABLE IF NOT EXISTS algorithm_model_state (
    algorithm_id TEXT NOT NULL,
    model_key TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(algorithm_id, model_key)
  )`,
  `CREATE TABLE IF NOT EXISTS arena_predictions (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    attempt_id TEXT,
    card_id TEXT,
    pool_key TEXT NOT NULL,
    contestant_id TEXT NOT NULL,
    predicted_recall REAL,
    interval_days REAL,
    due INTEGER,
    created_at INTEGER NOT NULL,
    runtime_kind TEXT NOT NULL,
    parameter_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_arena_predictions_attempt ON arena_predictions(attempt_id, card_id)`,
  `CREATE INDEX IF NOT EXISTS idx_arena_predictions_contestant ON arena_predictions(contestant_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS arena_outcomes (
    id TEXT PRIMARY KEY,
    prediction_id TEXT,
    domain TEXT NOT NULL,
    attempt_id TEXT,
    card_id TEXT,
    contestant_id TEXT,
    actual_recall INTEGER,
    rating INTEGER,
    reviewed_at INTEGER NOT NULL,
    final_due INTEGER,
    accepted INTEGER,
    cost_score REAL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_arena_outcomes_attempt ON arena_outcomes(attempt_id, card_id)`,
  `CREATE INDEX IF NOT EXISTS idx_arena_outcomes_contestant ON arena_outcomes(contestant_id, reviewed_at)`,
  `CREATE TABLE IF NOT EXISTS arena_metric_bins (
    algorithm_id TEXT NOT NULL,
    pool_key TEXT NOT NULL,
    bin_key TEXT NOT NULL,
    window_key TEXT NOT NULL,
    sample_count INTEGER NOT NULL,
    mean_prediction REAL NOT NULL,
    actual_recall_rate REAL NOT NULL,
    bet_win_error REAL NOT NULL,
    rms_contribution REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(algorithm_id, pool_key, bin_key, window_key)
  )`,
  `CREATE TABLE IF NOT EXISTS arena_score_snapshots (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    pool_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_arena_score_snapshots_pool ON arena_score_snapshots(domain, pool_key, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ai_arena_events (
    id TEXT PRIMARY KEY,
    exposure_id TEXT,
    pool_key TEXT NOT NULL,
    pack_id TEXT,
    event_type TEXT NOT NULL,
    quality_label TEXT,
    score_delta REAL,
    created_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_arena_events_pool ON ai_arena_events(pool_key, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ai_card_attributions (
    card_id TEXT PRIMARY KEY,
    pool_key TEXT NOT NULL,
    source_pack_id TEXT NOT NULL,
    exposure_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    review_count INTEGER NOT NULL,
    last_outcome TEXT,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_card_attributions_pack ON ai_card_attributions(source_pack_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS semantic_sessions (
    session_id TEXT PRIMARY KEY,
    root_focus_node_id TEXT NOT NULL,
    current_node_id TEXT NOT NULL,
    active_lens TEXT NOT NULL,
    narrative_path_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    payload_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_sessions_root
    ON semantic_sessions(root_focus_node_id, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_sessions_updated
    ON semantic_sessions(updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS semantic_events (
    event_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    node_id TEXT,
    from_node_id TEXT,
    to_node_id TEXT,
    lens TEXT,
    occurred_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_events_session
    ON semantic_events(session_id, occurred_at ASC, event_id ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_events_node
    ON semantic_events(node_id, occurred_at DESC)`,
  `CREATE TABLE IF NOT EXISTS semantic_stations (
    station_id TEXT PRIMARY KEY,
    station_type TEXT NOT NULL,
    session_id TEXT NOT NULL,
    node_id TEXT,
    path_json TEXT NOT NULL,
    lens_history_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_stations_session
    ON semantic_stations(session_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_stations_node
    ON semantic_stations(node_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS semantic_relations (
    relation_id TEXT PRIMARY KEY,
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    source TEXT NOT NULL,
    confidence REAL NOT NULL,
    reason TEXT,
    decided_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_relations_from
    ON semantic_relations(from_node_id, decision, decided_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_relations_to
    ON semantic_relations(to_node_id, decision, decided_at DESC)`,
  `CREATE TABLE IF NOT EXISTS semantic_branch_edges (
    edge_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    lens TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_branch_edges_session
    ON semantic_branch_edges(session_id, created_at ASC, edge_id ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_branch_edges_branch
    ON semantic_branch_edges(branch_id, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS semantic_branch_states (
    branch_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    root_node_id TEXT NOT NULL,
    active_cursor_node_id TEXT NOT NULL,
    archived_at INTEGER,
    restored_at INTEGER,
    updated_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_branch_states_session
    ON semantic_branch_states(session_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS semantic_later_entries (
    entry_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL,
    removed_at INTEGER,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_later_entries_session
    ON semantic_later_entries(session_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS semantic_irrelevant_feedback (
    feedback_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    root_focus_node_id TEXT,
    created_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_irrelevant_feedback_session
    ON semantic_irrelevant_feedback(session_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_irrelevant_feedback_root
    ON semantic_irrelevant_feedback(root_focus_node_id, node_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS semantic_suggestions (
    suggestion_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    source TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL,
    target_node_id TEXT,
    bound_node_id TEXT,
    materialized_block_id TEXT,
    materialized_card_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_suggestions_session
    ON semantic_suggestions(session_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS semantic_projection_cache (
    projection_key TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    session_id TEXT,
    node_memory_json TEXT NOT NULL,
    edge_memory_json TEXT NOT NULL,
    rebuilt_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_semantic_projection_session
    ON semantic_projection_cache(session_id, rebuilt_at DESC)`,
];
