#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const ACTIVE_ALGORITHM_IDS = ['fsrs-v6', 'a-factor-v2'];
const MIN_VALID_DUE = Date.UTC(2000, 0, 1);
const DEFAULT_A_FACTOR = 2.5;
const DAY_MS = 24 * 60 * 60 * 1000;
const CARD_STATE_NEW = 0;
const CARD_STATE_LEARNING = 1;
const CARD_STATE_REVIEW = 2;
const MIN_MATURE_LEARNING_INTERVAL_DAYS = 7;

function parseArgs(argv) {
  const args = {
    apply: false,
    db: '',
    historyDb: '',
    json: false,
    cardId: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--dry-run') {
      args.apply = false;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--db') {
      args.db = argv[++index] || '';
    } else if (arg === '--history-db') {
      args.historyDb = argv[++index] || '';
    } else if (arg === '--card-id') {
      args.cardId = argv[++index] || '';
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/repair-native-riff-scheduling-state.cjs --db <siyuanmemo.db> [--history-db <history/siyuanmemo.db>] [--card-id <card-id>] [--dry-run|--apply] [--json]',
    '',
    'Default mode is --dry-run. --history-db defaults to --db so review_events can repair current scheduling resets. --apply creates a timestamped .bak file before writing.',
  ].join('\n');
}

function readFileBytes(filePath) {
  return new Uint8Array(fs.readFileSync(filePath));
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function exec(db, sql, params = []) {
  db.run(sql, params);
}

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteInteger(value) {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Math.floor(parsed);
}

function numberOr(value, fallback) {
  const parsed = finiteNumber(value);
  return parsed === null ? fallback : parsed;
}

function stringOrNull(value) {
  const text = normalizeString(value);
  return text || null;
}

function isRiffManaged(card) {
  const meta = isRecord(card.meta) ? card.meta : {};
  return normalizeString(meta.templateID) === 'builtin-riff-sync'
    || normalizeString(meta.ownership) === 'riff-managed'
    || normalizeString(meta.source) === 'riff-sync'
    || normalizeString(card.riffCardId) !== ''
    || normalizeString(meta.riffCardId) !== '';
}

function hasValidSchedule(card) {
  const due = finiteNumber(card.due);
  const state = finiteInteger(card.state);
  const reps = finiteInteger(card.reps);
  return due !== null
    && due >= MIN_VALID_DUE
    && state !== null
    && state >= 0
    && state <= 4
    && reps !== null
    && reps >= 0
    && normalizeString(card.type) !== '';
}

function isPollutedRiffCard(row, card) {
  if (!isRiffManaged(card)) {
    return false;
  }
  if (shouldPromoteMatureLearningState(card)) {
    return true;
  }
  if (isMatureResetNewState(card)) {
    return true;
  }
  if (!hasValidSchedule(card)) {
    return true;
  }
  const rowDue = finiteNumber(row.due);
  return rowDue === null || rowDue < MIN_VALID_DUE;
}

function shouldPromoteMatureLearningState(card) {
  if (finiteInteger(card.state) !== CARD_STATE_LEARNING) {
    return false;
  }
  const due = finiteNumber(card.due);
  const lastReview = finiteNumber(card.lastReview);
  const reps = finiteInteger(card.reps);
  const scheduledDays = finiteInteger(card.scheduledDays);
  const stability = finiteNumber(card.stability);
  const intervalDays = due !== null && lastReview !== null && due > lastReview
    ? Math.max(1, Math.floor((due - lastReview) / DAY_MS))
    : 0;
  return (reps ?? 0) > 0
    && (lastReview ?? 0) > 0
    && Math.max(intervalDays, scheduledDays ?? 0, stability ?? 0) >= MIN_MATURE_LEARNING_INTERVAL_DAYS;
}

function isMatureResetNewState(card) {
  if (finiteInteger(card.state) !== CARD_STATE_NEW || (finiteInteger(card.reps) ?? 0) > 0) {
    return false;
  }
  const due = finiteNumber(card.due);
  const lastReview = finiteNumber(card.lastReview);
  const scheduledDays = finiteInteger(card.scheduledDays);
  const stability = finiteNumber(card.stability);
  const intervalDays = due !== null && lastReview !== null && due > lastReview
    ? Math.max(1, Math.floor((due - lastReview) / DAY_MS))
    : 0;
  return (lastReview ?? 0) > 0
    && (stability ?? 0) > 0
    && Math.max(intervalDays, scheduledDays ?? 0, stability ?? 0) >= MIN_MATURE_LEARNING_INTERVAL_DAYS;
}

function promoteMatureLearningState(card) {
  const currentMeta = isRecord(card.meta) ? card.meta : {};
  const now = Date.now();
  return {
    ...card,
    state: CARD_STATE_REVIEW,
    learning_step: 0,
    updatedAt: now,
    meta: {
      ...currentMeta,
      templateID: 'builtin-riff-sync',
      ownership: 'riff-managed',
      source: 'riff-sync',
      repairSchedulingState: {
        source: 'mature-learning-state',
        repairedAt: now,
      },
    },
  };
}

function promoteMatureResetNewState(card) {
  const currentMeta = isRecord(card.meta) ? card.meta : {};
  const now = Date.now();
  return {
    ...card,
    state: CARD_STATE_REVIEW,
    reps: Math.max(1, finiteInteger(card.reps) ?? 0),
    learning_step: 0,
    updatedAt: now,
    meta: {
      ...currentMeta,
      templateID: 'builtin-riff-sync',
      ownership: 'riff-managed',
      source: 'riff-sync',
      repairSchedulingState: {
        source: 'mature-new-state',
        repairedAt: now,
      },
    },
  };
}

function rowToCard(row) {
  const payload = parseJson(row.payload_json, {});
  const card = isRecord(payload) ? { ...payload } : {};
  card.id = normalizeString(card.id) || normalizeString(row.id);
  card.blockId = normalizeString(card.blockId) || normalizeString(row.block_id);
  card.xiuyuanID = normalizeString(card.xiuyuanID) || normalizeString(row.xiuyuan_id);
  if (!normalizeString(card.schedulerType)) {
    card.schedulerType = normalizeString(row.scheduler_type) || undefined;
  }
  return card;
}

function loadCards(db) {
  return queryAll(
    db,
    `SELECT id, block_id, xiuyuan_id, type, state, due, priority, scheduler_type, updated_at,
            deck_id, content_text, tags, suspended, lapses, reps, last_review, created_at,
            scheduled_days, stability, difficulty, a_factor, search_text, card_type_marker,
            source_exists, source_checked_at, source_missing_at, payload_json, dto_json
       FROM cards
       ORDER BY id`,
  ).map((row) => ({ row, card: rowToCard(row) }));
}

function addIndex(map, key, entry) {
  const normalized = normalizeString(key);
  if (!normalized) {
    return;
  }
  const bucket = map.get(normalized) || [];
  bucket.push(entry);
  map.set(normalized, bucket);
}

function buildHistoryIndexes(entries) {
  const byId = new Map();
  const byRiff = new Map();
  const byBlock = new Map();
  for (const entry of entries) {
    if (!hasValidSchedule(entry.card)) {
      continue;
    }
    addIndex(byId, entry.card.id, entry);
    addIndex(byRiff, entry.card.riffCardId, entry);
    const meta = isRecord(entry.card.meta) ? entry.card.meta : {};
    addIndex(byRiff, meta.riffCardId, entry);
    addIndex(byBlock, entry.card.blockId, entry);
  }
  return { byId, byRiff, byBlock };
}

function uniqueCandidates(candidates) {
  const byId = new Map();
  for (const candidate of candidates) {
    byId.set(candidate.card.id, candidate);
  }
  return Array.from(byId.values());
}

function singleCandidate(map, key) {
  const candidates = uniqueCandidates(map.get(normalizeString(key)) || []);
  return candidates.length === 1 ? candidates[0] : null;
}

function findRepairSource(card, indexes) {
  const sameId = singleCandidate(indexes.byId, card.id);
  if (sameId) {
    return { source: sameId, reason: 'same-id' };
  }

  const riffId = normalizeString(card.riffCardId) || normalizeString(isRecord(card.meta) ? card.meta.riffCardId : '');
  const byRiff = singleCandidate(indexes.byId, riffId) || singleCandidate(indexes.byRiff, riffId);
  if (byRiff) {
    return { source: byRiff, reason: 'riff-id' };
  }

  const byBlock = singleCandidate(indexes.byBlock, card.blockId);
  if (byBlock) {
    return { source: byBlock, reason: 'unique-block-id' };
  }

  return null;
}

function findLatestReviewSchedule(db, cardId) {
  const rows = queryAll(
    db,
    `SELECT id, reviewed_at, payload_json
       FROM review_events
      WHERE card_id = ?
      ORDER BY reviewed_at DESC, id DESC
      LIMIT 5`,
    [cardId],
  );
  for (const row of rows) {
    const payload = parseJson(row.payload_json, {});
    if (!isRecord(payload)) {
      continue;
    }
    const after = isRecord(payload.after) ? payload.after : null;
    if (after && hasValidSchedule(after)) {
      return { card: after, sourceId: row.id, reason: 'review-event-after' };
    }
  }
  return null;
}

function copySchedule(target, source) {
  const next = { ...target };
  const fields = [
    'due',
    'stability',
    'difficulty',
    'reps',
    'lapses',
    'state',
    'lastReview',
    'elapsedDays',
    'scheduledDays',
    'learning_step',
    'aFactor',
    'schedulerMeta',
    'type',
    'schedulerType',
  ];
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null) {
      next[field] = source[field];
    }
  }
  next.priority = target.priority ?? source.priority ?? 50;
  next.tags = Array.isArray(target.tags) ? target.tags : (Array.isArray(source.tags) ? source.tags : []);
  next.leechCount = target.leechCount ?? source.leechCount ?? 0;
  next.isLeech = target.isLeech ?? source.isLeech ?? false;
  next.skipped = target.skipped ?? source.skipped ?? false;
  next.createdAt = target.createdAt ?? source.createdAt ?? Date.now();
  next.updatedAt = Date.now();
  return next;
}

function mergeRepairCard(current, backup) {
  const currentMeta = isRecord(current.meta) ? current.meta : {};
  const backupMeta = isRecord(backup.meta) ? backup.meta : {};
  const next = copySchedule(current, backup);
  next.id = current.id;
  next.blockId = current.blockId || backup.blockId;
  next.xiuyuanID = current.xiuyuanID || backup.xiuyuanID;
  next.riffCardId = current.riffCardId || backup.riffCardId || currentMeta.riffCardId || backupMeta.riffCardId;
  next.content = current.content ?? backup.content;
  next.meta = {
    ...backupMeta,
    ...currentMeta,
    templateID: 'builtin-riff-sync',
    ownership: 'riff-managed',
    source: 'riff-sync',
  };
  if (next.riffCardId) {
    next.meta.riffCardId = next.riffCardId;
  }
  if (!next.meta.deckId && currentMeta.deckID) {
    next.meta.deckId = currentMeta.deckID;
  }
  if (!normalizeString(next.type)) {
    next.type = 'topic';
  }
  if (next.type === 'topic' || next.type === 'concept') {
    next.schedulerType = 'a-factor-v2';
  } else if (next.type === 'item' || next.type === 'descriptor') {
    next.schedulerType = 'fsrs-v6';
  }
  return next;
}

function buildInitializedCard(current) {
  const now = Date.now();
  const currentMeta = isRecord(current.meta) ? current.meta : {};
  const next = {
    ...current,
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: current.priority ?? 50,
    type: current.type || 'topic',
    tags: Array.isArray(current.tags) ? current.tags : [],
    leechCount: current.leechCount ?? 0,
    isLeech: current.isLeech ?? false,
    skipped: current.skipped ?? false,
    createdAt: current.createdAt ?? now,
    updatedAt: now,
    schedulerType: current.schedulerType || 'a-factor-v2',
    aFactor: current.aFactor ?? DEFAULT_A_FACTOR,
    meta: {
      ...currentMeta,
      templateID: 'builtin-riff-sync',
      ownership: 'riff-managed',
      source: 'riff-sync',
      repairSchedulingState: {
        source: 'initialized-no-history-or-review',
        repairedAt: now,
      },
    },
  };
  if (next.riffCardId) {
    next.meta.riffCardId = next.riffCardId;
  }
  return next;
}

function projectionFor(card) {
  const meta = isRecord(card.meta) ? card.meta : {};
  const contentText = stringOrNull(meta.content)
    || stringOrNull(meta.title)
    || stringOrNull(meta.imageOcclusionPrompt)
    || stringOrNull(card.content);
  const tags = new Set();
  for (const tag of Array.isArray(card.tags) ? card.tags : []) {
    const normalized = normalizeString(tag);
    if (normalized) {
      tags.add(normalized);
    }
  }
  for (const tag of Array.isArray(meta.tags) ? meta.tags : []) {
    const normalized = normalizeString(tag);
    if (normalized) {
      tags.add(normalized);
    }
  }
  const suspended = card.state === 4 || meta.suspended === true ? 1 : 0;
  return {
    deckId: stringOrNull(meta.deckId) || stringOrNull(card.deckId) || stringOrNull(card.deckID),
    rootId: stringOrNull(meta.rootId) || stringOrNull(card.rootId),
    contentText,
    tags: tags.size > 0 ? `\n${Array.from(tags).sort().join('\n')}\n` : null,
    suspended,
    lapses: finiteNumber(card.lapses),
    reps: finiteNumber(card.reps),
    lastReview: finiteNumber(card.lastReview),
    createdAt: finiteNumber(card.createdAt),
    scheduledDays: finiteNumber(card.scheduledDays),
    stability: finiteNumber(card.stability),
    difficulty: finiteNumber(card.difficulty),
    aFactor: finiteNumber(card.aFactor),
    searchText: contentText ? contentText.toLowerCase() : null,
    cardTypeMarker: stringOrNull(card.cardTypeMarker) || stringOrNull(meta.cardTypeMarker),
  };
}

function resolveAlgorithmId(card) {
  return card.type === 'topic' || card.type === 'concept' ? 'a-factor-v2' : 'fsrs-v6';
}

function algorithmStateFor(card, algorithmId) {
  const common = {
    due: numberOr(card.due, 0),
    state: numberOr(card.state, 0),
    reps: numberOr(card.reps, 0),
    lapses: numberOr(card.lapses, 0),
    lastReview: numberOr(card.lastReview, 0),
    elapsedDays: numberOr(card.elapsedDays, 0),
    scheduledDays: numberOr(card.scheduledDays, 0),
  };
  if (finiteNumber(card.learning_step) !== null) {
    common.learning_step = finiteNumber(card.learning_step);
  }
  const state = {
    schemaVersion: 1,
    schedulerType: algorithmId,
    common,
  };
  if (algorithmId === 'a-factor-v2') {
    state.topic = {
      aFactor: numberOr(card.aFactor, DEFAULT_A_FACTOR),
      schedulerMeta: isRecord(card.schedulerMeta) && isRecord(card.schedulerMeta.topic)
        ? { topic: card.schedulerMeta.topic }
        : undefined,
    };
  } else {
    state.fsrs = {
      stability: numberOr(card.stability, 1),
      difficulty: numberOr(card.difficulty, 5),
    };
  }
  return JSON.stringify(state);
}

function repairCard(db, row, card) {
  const projection = projectionFor(card);
  const payloadJson = JSON.stringify(card);
  exec(
    db,
    `UPDATE cards
        SET block_id = ?, xiuyuan_id = ?, type = ?, state = ?, due = ?, priority = ?,
            scheduler_type = ?, updated_at = ?, deck_id = ?, root_id = ?, content_text = ?,
            tags = ?, suspended = ?, lapses = ?, reps = ?, last_review = ?, created_at = ?,
            scheduled_days = ?, stability = ?, difficulty = ?, a_factor = ?, search_text = ?,
            card_type_marker = ?, payload_json = ?, dto_json = NULL
      WHERE id = ?`,
    [
      stringOrNull(card.blockId),
      stringOrNull(card.xiuyuanID),
      stringOrNull(card.type),
      finiteNumber(card.state),
      finiteNumber(card.due),
      finiteNumber(card.priority),
      stringOrNull(card.schedulerType),
      finiteNumber(card.updatedAt) || Date.now(),
      projection.deckId,
      projection.rootId,
      projection.contentText,
      projection.tags,
      projection.suspended,
      projection.lapses,
      projection.reps,
      projection.lastReview,
      projection.createdAt,
      projection.scheduledDays,
      projection.stability,
      projection.difficulty,
      projection.aFactor,
      projection.searchText,
      projection.cardTypeMarker,
      payloadJson,
      row.id,
    ],
  );

  const algorithmId = resolveAlgorithmId(card);
  exec(
    db,
    `DELETE FROM algorithm_card_state
      WHERE card_id = ?
        AND algorithm_id IN (?, ?)
        AND algorithm_id != ?`,
    [card.id, ...ACTIVE_ALGORITHM_IDS, algorithmId],
  );
  exec(
    db,
    `INSERT OR REPLACE INTO algorithm_card_state (card_id, algorithm_id, state_json, updated_at)
     VALUES (?, ?, ?, ?)`,
    [card.id, algorithmId, algorithmStateFor(card, algorithmId), Date.now()],
  );
}

function createBackup(dbPath) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const backupPath = `${dbPath}.bak-${stamp}`;
  fs.copyFileSync(dbPath, backupPath, fs.constants.COPYFILE_EXCL);
  return backupPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.db) {
    throw new Error(`--db is required\n\n${usage()}`);
  }
  const dbPath = path.resolve(args.db);
  const historyPath = path.resolve(args.historyDb || args.db);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`DB does not exist: ${dbPath}`);
  }
  if (!fs.existsSync(historyPath)) {
    throw new Error(`History DB does not exist: ${historyPath}`);
  }

  const SQL = await initSqlJs({
    locateFile: (file) => path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
  });
  const db = new SQL.Database(readFileBytes(dbPath));
  const historyDb = new SQL.Database(readFileBytes(historyPath));

  const currentEntries = loadCards(db);
  const scopedEntries = normalizeString(args.cardId)
    ? currentEntries.filter(entry => normalizeString(entry.card.id) === normalizeString(args.cardId))
    : currentEntries;
  const historyEntries = loadCards(historyDb);
  const historyIndexes = buildHistoryIndexes(historyEntries);
  const polluted = scopedEntries.filter(({ row, card }) => isPollutedRiffCard(row, card));
  const repairs = [];
  const initialized = [];
  const unresolved = [];

  for (const entry of polluted) {
    const matureLearning = shouldPromoteMatureLearningState(entry.card);
    const matureResetNew = isMatureResetNewState(entry.card);
    const reviewSchedule = matureLearning ? null : findLatestReviewSchedule(db, entry.card.id);
    const match = matureLearning || matureResetNew || reviewSchedule ? null : findRepairSource(entry.card, historyIndexes);
    const repaired = matureLearning
      ? promoteMatureLearningState(entry.card)
      : match
        ? mergeRepairCard(entry.card, match.source.card)
        : reviewSchedule
          ? mergeRepairCard(entry.card, reviewSchedule.card)
          : matureResetNew
            ? promoteMatureResetNewState(entry.card)
          : buildInitializedCard(entry.card);
    if (!hasValidSchedule(repaired)) {
      unresolved.push({
        id: entry.card.id,
        blockId: entry.card.blockId || null,
        riffCardId: entry.card.riffCardId || null,
        reason: 'repair-source-invalid-schedule',
        sourceId: match?.source.card.id || reviewSchedule?.sourceId || null,
      });
      continue;
    }
    const repair = {
      row: entry.row,
      card: repaired,
      sourceId: match?.source.card.id || reviewSchedule?.sourceId || null,
      sourceReason: matureLearning ? 'mature-learning-state' : match?.reason || reviewSchedule?.reason || (matureResetNew ? 'mature-new-state' : 'initialized-no-history-or-review'),
    };
    if (repair.sourceReason === 'initialized-no-history-or-review') {
      initialized.push(repair);
    }
    repairs.push(repair);
  }

  let backupPath = null;
  if (args.apply && repairs.length > 0) {
    backupPath = createBackup(dbPath);
    db.run('BEGIN');
    try {
      for (const repair of repairs) {
        repairCard(db, repair.row, repair.card);
      }
      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
  }

  const summary = {
    mode: args.apply ? 'apply' : 'dry-run',
    db: dbPath,
    historyDb: historyPath,
    cardId: normalizeString(args.cardId) || null,
    backupPath,
    totalCards: currentEntries.length,
    scopedCards: scopedEntries.length,
    pollutedRiffCards: polluted.length,
    repairable: repairs.length,
    initializedNoEvidence: initialized.length,
    unresolved: unresolved.length,
    repairSources: repairs.reduce((acc, repair) => {
      acc[repair.sourceReason] = (acc[repair.sourceReason] || 0) + 1;
      return acc;
    }, {}),
    unresolvedCards: unresolved,
  };

  db.close();
  historyDb.close();

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`mode: ${summary.mode}`);
    console.log(`total cards: ${summary.totalCards}`);
    console.log(`polluted riff cards: ${summary.pollutedRiffCards}`);
    console.log(`repairable: ${summary.repairable}`);
    console.log(`unresolved: ${summary.unresolved}`);
    console.log(`repair sources: ${JSON.stringify(summary.repairSources)}`);
    if (summary.backupPath) {
      console.log(`backup: ${summary.backupPath}`);
    }
    if (summary.unresolvedCards.length > 0) {
      console.log('unresolved cards:');
      for (const card of summary.unresolvedCards) {
        console.log(`  ${card.id} block=${card.blockId || ''} riff=${card.riffCardId || ''} reason=${card.reason}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
