#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

function parseArgs(argv) {
  const args = { apply: false, db: '', json: false };
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
    '  node scripts/repair-xiuyuan-binding-drift.cjs --db <siyuanmemo.db> [--dry-run|--apply] [--json]',
    '',
    'Default mode is --dry-run. --apply creates a timestamped .bak file before writing.',
  ].join('\n');
}

function parseJson(value, fallback = {}) {
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

function buildBackupPath(dbPath) {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    '-',
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');
  return `${dbPath}.bak-${stamp}`;
}

function readRiffCardId(value) {
  const record = isRecord(value) ? value : {};
  const meta = isRecord(record.meta) ? record.meta : {};
  return normalizeString(record.riffCardId) || normalizeString(meta.riffCardId);
}

function readBlockIds(xiuyuanPayload) {
  return Array.isArray(xiuyuanPayload.blockIDs)
    ? xiuyuanPayload.blockIDs.map(normalizeString).filter(Boolean)
    : [];
}

function findCandidates(card, xiuyuansById) {
  const blockId = normalizeString(card.blockId);
  const riffCardId = readRiffCardId(card.payload) || readRiffCardId(card.dto);
  return Array.from(xiuyuansById.values()).filter((candidate) => {
    if (blockId && readBlockIds(candidate.payload).includes(blockId)) {
      return true;
    }
    const candidateRiffCardId = readRiffCardId(candidate.payload);
    return riffCardId && candidateRiffCardId === riffCardId;
  });
}

function applyXiuyuanIdToCardPayload(value, xiuyuanId) {
  const record = isRecord(value) ? { ...value } : {};
  const meta = isRecord(record.meta) ? { ...record.meta } : {};
  record.xiuyuanID = xiuyuanId;
  record.meta = {
    ...meta,
    xiuyuanID: xiuyuanId,
  };
  return record;
}

function buildXiuyuanFromCard(card) {
  const source = isRecord(card.dto) ? card.dto : card.payload;
  const meta = isRecord(source.meta) ? source.meta : {};
  const blockId = normalizeString(source.blockId) || normalizeString(card.blockId);
  if (!blockId || !card.targetXiuyuanId) {
    return null;
  }
  const frontBlockIDs = Array.isArray(source.frontBlockIDs) ? source.frontBlockIDs.map(normalizeString).filter(Boolean) : [];
  const backBlockIDs = Array.isArray(source.backBlockIDs) ? source.backBlockIDs.map(normalizeString).filter(Boolean) : [];
  const fieldMapping = isRecord(source.fieldMapping) ? source.fieldMapping : {};
  const fieldBlockIds = Object.values(fieldMapping).map(normalizeString).filter(Boolean);
  const blockIDs = Array.from(new Set([blockId, ...frontBlockIDs, ...backBlockIDs, ...fieldBlockIds]));
  const now = Number(source.updatedAt);
  const updatedAt = Number.isFinite(now) && now > 0 ? now : Date.now();
  return {
    id: card.targetXiuyuanId,
    blockIDs,
    fields: blockIDs.map((fieldBlockId, index) => ({
      name: index === 0 ? 'content' : `field-${index}`,
      blockID: fieldBlockId,
    })),
    templateID: normalizeString(source.templateID) || normalizeString(meta.templateID) || 'builtin-riff-sync',
    content: normalizeString(source.content) || normalizeString(meta.content) || undefined,
    createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : updatedAt,
    updatedAt,
    meta: {
      ...meta,
      xiuyuanID: card.targetXiuyuanId,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.db) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const dbPath = path.resolve(args.db);
  const SQL = await initSqlJs();
  const bytes = new Uint8Array(fs.readFileSync(dbPath));
  const db = new SQL.Database(bytes);
  const xiuyuansById = new Map(
    queryAll(db, 'SELECT id, payload_json FROM xiuyuans ORDER BY id')
      .map((row) => [
        normalizeString(row.id),
        { id: normalizeString(row.id), payload: parseJson(row.payload_json, {}) },
      ]),
  );
  const cardRows = queryAll(
    db,
    `SELECT c.id, c.block_id, c.xiuyuan_id, c.payload_json, c.dto_json
       FROM cards c
       LEFT JOIN xiuyuans x ON x.id = c.xiuyuan_id
      WHERE x.id IS NULL
        AND (c.source_exists IS NULL OR c.source_exists != 0)
      ORDER BY c.id`,
  );

  const repairable = [];
  const reconstructable = [];
  const unresolved = [];
  for (const row of cardRows) {
    const card = {
      id: normalizeString(row.id),
      blockId: normalizeString(row.block_id),
      targetXiuyuanId: normalizeString(row.xiuyuan_id),
      payload: parseJson(row.payload_json, {}),
      dto: parseJson(row.dto_json, {}),
    };
    if (!card.targetXiuyuanId) {
      unresolved.push({ id: card.id, reason: 'missing-target-xiuyuan-id' });
      continue;
    }
    const candidates = findCandidates(card, xiuyuansById);
    if (candidates.length === 0) {
      const reconstructedXiuyuan = buildXiuyuanFromCard(card);
      if (reconstructedXiuyuan) {
        reconstructable.push({ ...card, reconstructedXiuyuan });
      } else {
        unresolved.push({ id: card.id, targetXiuyuanId: card.targetXiuyuanId, candidateCount: 0 });
      }
      continue;
    }
    if (candidates.length !== 1) {
      unresolved.push({ id: card.id, targetXiuyuanId: card.targetXiuyuanId, candidateCount: candidates.length });
      continue;
    }
    if (xiuyuansById.has(card.targetXiuyuanId)) {
      unresolved.push({ id: card.id, targetXiuyuanId: card.targetXiuyuanId, reason: 'target-exists' });
      continue;
    }
    repairable.push({ ...card, sourceXiuyuan: candidates[0] });
  }

  let backupPath = null;
  if (args.apply && (repairable.length > 0 || reconstructable.length > 0)) {
    backupPath = buildBackupPath(dbPath);
    fs.copyFileSync(dbPath, backupPath);
    db.run('BEGIN IMMEDIATE');
    try {
      for (const repair of repairable) {
        const nextXiuyuanPayload = {
          ...repair.sourceXiuyuan.payload,
          id: repair.targetXiuyuanId,
        };
        db.run(
          'UPDATE xiuyuans SET id = ?, payload_json = ? WHERE id = ?',
          [repair.targetXiuyuanId, JSON.stringify(nextXiuyuanPayload), repair.sourceXiuyuan.id],
        );
        db.run(
          'UPDATE tombstones SET id = ? WHERE kind = ? AND id = ?',
          [repair.targetXiuyuanId, 'xiuyuan', repair.sourceXiuyuan.id],
        );
        const nextPayload = applyXiuyuanIdToCardPayload(repair.payload, repair.targetXiuyuanId);
        const nextDto = applyXiuyuanIdToCardPayload(repair.dto, repair.targetXiuyuanId);
        db.run(
          'UPDATE cards SET xiuyuan_id = ?, payload_json = ?, dto_json = ? WHERE id = ?',
          [repair.targetXiuyuanId, JSON.stringify(nextPayload), JSON.stringify(nextDto), repair.id],
        );
      }
      for (const repair of reconstructable) {
        db.run(
          'INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)',
          [repair.targetXiuyuanId, repair.reconstructedXiuyuan.updatedAt, JSON.stringify(repair.reconstructedXiuyuan)],
        );
        const nextPayload = applyXiuyuanIdToCardPayload(repair.payload, repair.targetXiuyuanId);
        const nextDto = applyXiuyuanIdToCardPayload(repair.dto, repair.targetXiuyuanId);
        db.run(
          'UPDATE cards SET xiuyuan_id = ?, payload_json = ?, dto_json = ? WHERE id = ?',
          [repair.targetXiuyuanId, JSON.stringify(nextPayload), JSON.stringify(nextDto), repair.id],
        );
      }
      db.run('COMMIT');
      fs.writeFileSync(dbPath, Buffer.from(db.export()));
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }

  const output = {
    mode: args.apply ? 'apply' : 'dry-run',
    db: dbPath,
    backupPath,
    missingXiuyuanCards: cardRows.length,
    repairable: repairable.length + reconstructable.length,
    renamed: repairable.length,
    reconstructed: reconstructable.length,
    unresolved: unresolved.length,
    repairedCards: [
      ...repairable.map((repair) => ({
        id: repair.id,
        sourceXiuyuanId: repair.sourceXiuyuan.id,
        targetXiuyuanId: repair.targetXiuyuanId,
        action: 'rename-xiuyuan',
      })),
      ...reconstructable.map((repair) => ({
        id: repair.id,
        sourceXiuyuanId: null,
        targetXiuyuanId: repair.targetXiuyuanId,
        action: 'reconstruct-xiuyuan',
      })),
    ],
    unresolvedCards: unresolved.slice(0, 50),
  };
  db.close();
  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
