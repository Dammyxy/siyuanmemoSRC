export const SQLITE_DB_FILE = 'siyuanmemo.db';
export const SQLITE_SCHEMA_VERSION = 1;

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
