export const SQLITE_DB_FILE = 'siyuanmemo.db';
export const SQLITE_SCHEMA_VERSION = 4;

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
  `CREATE TABLE IF NOT EXISTS queue_projection_generations (
    queue_type TEXT PRIMARY KEY,
    policy_hash TEXT NOT NULL,
    generation INTEGER NOT NULL,
    status TEXT NOT NULL,
    rebuild_reason TEXT,
    updated_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS queue_projection_rows (
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
    PRIMARY KEY(queue_type, row_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_rows_order
    ON queue_projection_rows(queue_type, policy_hash, source_generation, sort_key, queue_index_hint, row_id)`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_rows_card
    ON queue_projection_rows(queue_type, card_id)`,
  `CREATE INDEX IF NOT EXISTS idx_queue_projection_rows_block
    ON queue_projection_rows(queue_type, block_id)`,
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
  `CREATE TABLE IF NOT EXISTS review_events (
    id TEXT PRIMARY KEY,
    card_id TEXT,
    attempt_id TEXT,
    rating INTEGER,
    reviewed_at INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_review_events_month ON review_events(year, month, reviewed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_review_events_card ON review_events(card_id, reviewed_at)`,
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
];
