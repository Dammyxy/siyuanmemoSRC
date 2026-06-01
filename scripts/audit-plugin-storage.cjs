const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_RELATIVE_STORAGE = path.join('data', 'storage', 'petal', 'siyuan-plugin-siyuanmemo');

const MESSAGEPACK_TRUTH_FAMILIES = new Set([
  'review-events',
  'card-memory-facts',
  'domain-sync-operations',
  'ai-session-payload-refs',
  'semantic-arena-payload-refs',
  'diagnostics-records',
]);

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function toDisplayBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GiB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MiB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} KiB`;
  }
  return `${value} B`;
}

function classifyStoragePath(relativePath, stats = {}) {
  const rel = normalizePath(relativePath);
  const lower = rel.toLowerCase();
  const size = Number(stats.size) || 0;

  if (lower === 'siyuanmemo.db') {
    return {
      classification: 'forbidden-legacy-petal-db',
      kind: 'legacy-petal-db-ignored',
      diagnostic: 'legacy-petal-db-ignored',
      policy: 'Legacy petal SQLite projection is ignored; projection DB must live in workspace temp or memory.',
    };
  }

  if (lower === 'settings.json') {
    return {
      classification: 'expected-active',
      kind: 'settings-json',
      policy: 'Small user settings file; JSON remains allowed.',
    };
  }

  if (lower === 'sqlite-delta-log.v1.json') {
    return {
      classification: 'expected-active',
      kind: 'sqlite-delta-log',
      policy: 'Bounded projection delta log; pending entries should clear after full DB checkpoint.',
    };
  }

  const truthMatch = rel.match(/^truth\/([^/]+)\/device-[^/]+\/([^/]+)$/);
  if (truthMatch) {
    const family = truthMatch[1];
    const fileName = truthMatch[2];
    if (MESSAGEPACK_TRUTH_FAMILIES.has(family) && fileName === 'manifest.v1.json') {
      return {
        classification: 'expected-active',
        kind: 'messagepack-truth-manifest',
        policy: 'Per-device MessagePack truth manifest sidecar.',
      };
    }
    if (MESSAGEPACK_TRUTH_FAMILIES.has(family) && /^seg-[^/]+\.msgpack$/i.test(fileName)) {
      return {
        classification: 'expected-active',
        kind: 'messagepack-truth-segment',
        policy: 'Bounded immutable MessagePack truth segment.',
      };
    }
    return {
      classification: 'unknown',
      kind: 'truth-path-unrecognized',
      policy: 'Inside truth/ but not a known manifest or segment path.',
    };
  }

  if (/^kernel-transaction-(ingest|actions)\.snapshot\.json$/i.test(rel)) {
    return {
      classification: 'expected-active-json',
      kind: 'kernel-transaction-snapshot',
      policy: 'Bounded local worker queue snapshot; not durable synced truth.',
    };
  }

  if (lower === 'review-feedback-journal.v1.json') {
    return {
      classification: 'expected-active-json',
      kind: 'review-feedback-journal-snapshot',
      policy: 'Local Review durability buffer snapshot; should remain bounded and drain to truth segments.',
    };
  }

  if (lower === 'progressive-excerpt-records.json' || lower === 'progressive-reading.json') {
    return {
      classification: 'storage-slimming-followup',
      kind: 'progressive-lineage-json',
      policy: 'Progressive/topic lineage JSON remains a follow-up target for MessagePack truth or SiYuan source metadata.',
    };
  }

  if (/^ai-workbench\/sessions\/(index\.json|records\/[^/]+\.json)$/i.test(rel)
    || lower === 'ai-workbench/self-test-card-target.json') {
    return {
      classification: 'storage-slimming-followup',
      kind: 'ai-session-json',
      policy: 'AI session JSON is an explicit storage-slimming follow-up; should move behind backend session/job payload refs.',
    };
  }

  if (lower === 'arena/store.json') {
    return {
      classification: 'storage-slimming-followup',
      kind: 'arena-legacy-json',
      policy: 'Legacy Arena JSON; SQL-backed or MessagePack/ref-backed evidence should replace active JSON writes.',
    };
  }

  if (/^(unified-cards|queues|cards|practice-queue|practice-queue-backup|incremental-learning-queue)\.msgpack$/i.test(rel)) {
    return {
      classification: 'legacy-compat-read',
      kind: 'legacy-root-msgpack',
      policy: 'Legacy migration/import source; should not be a new runtime write target.',
    };
  }

  if (lower === 'siyuanmemo.db.delta.v1.json') {
    return {
      classification: 'cleanup-candidate',
      kind: 'legacy-sqlite-delta-log',
      policy: 'Legacy or wrong-name SQLite delta log; active delta log path is sqlite-delta-log.v1.json.',
    };
  }

  if (/^review-logs\/\d{4}-\d{2}\.json$/i.test(rel)) {
    return {
      classification: 'legacy-compat-read',
      kind: 'legacy-review-log-json',
      policy: 'Legacy monthly Review log import source.',
    };
  }

  if (/^migration-backups\/algorithm-card-state-repair-\d+\.json$/i.test(rel)) {
    return {
      classification: 'cleanup-candidate',
      kind: 'algorithm-state-repair-backup',
      policy: 'Large one-time repair safety backup; repeated creation was a storage pollution bug.',
    };
  }

  if (/^migration-backups\//i.test(rel)) {
    return {
      classification: 'cleanup-candidate',
      kind: 'migration-backup',
      policy: 'Migration safety backup; retain only by explicit operator policy.',
    };
  }

  if (/^manual-sync-backups\/siyuanmemo\.db\..*\.bak$/i.test(rel)) {
    return {
      classification: 'cleanup-candidate',
      kind: 'manual-sync-backup',
      policy: 'Manual replacement backup; retention workflow keeps newest protected backups and deletes only after preview.',
    };
  }

  if (/^siyuanmemo\.db\.(shadow-restore-.*\.bak|bak-.+|.*\.bak)$/i.test(rel)
    || /^siyuanmemo\.db\.bak/i.test(rel)
    || /^siyuanmemo\.db\.shadow-restore/i.test(rel)) {
    return {
      classification: 'cleanup-candidate',
      kind: 'root-db-backup',
      policy: 'Root DB backup/restore artifact; not active projection or MessagePack truth.',
    };
  }

  if (/(\.tmp|\.temp|\.part|\.partial|\.upload|multipart)/i.test(rel) || (size === 0 && /\.(tmp|temp)$/i.test(rel))) {
    return {
      classification: 'temp-artifact',
      kind: 'temporary-artifact',
      policy: 'Temporary or partial write artifact; should not persist in plugin storage.',
    };
  }

  if (/\.bak$/i.test(rel)) {
    return {
      classification: 'cleanup-candidate',
      kind: 'backup-file',
      policy: 'Backup-like file outside the active storage contract.',
    };
  }

  if (/\.msgpack$/i.test(rel)) {
    return {
      classification: 'unknown',
      kind: 'unrecognized-msgpack',
      policy: 'MessagePack file outside the device-owned truth segment contract.',
    };
  }

  if (/\.json$/i.test(rel)) {
    return {
      classification: 'unknown',
      kind: 'unrecognized-json',
      policy: 'JSON file outside the current active/compatibility allowlist.',
    };
  }

  return {
    classification: 'unknown',
    kind: 'unrecognized-file',
    policy: 'File does not match the storage-slimming contract allowlist.',
  };
}

function walkFiles(rootDir, current = rootDir, result = []) {
  if (!fs.existsSync(current)) {
    return result;
  }
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walkFiles(rootDir, absolute, result);
      continue;
    }
    if (entry.isFile()) {
      const stats = fs.statSync(absolute);
      result.push({
        absolutePath: absolute,
        relativePath: normalizePath(path.relative(rootDir, absolute)),
        size: stats.size,
        modifiedAt: stats.mtimeMs,
      });
    }
  }
  return result;
}

function addAggregate(map, key, size) {
  const current = map.get(key) || { files: 0, bytes: 0 };
  current.files += 1;
  current.bytes += size;
  map.set(key, current);
}

function aggregateEntries(map) {
  return Object.fromEntries(
    Array.from(map.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, {
        ...value,
        displayBytes: toDisplayBytes(value.bytes),
      }]),
  );
}

function evaluate(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  if (!fs.existsSync(rootDir)) {
    return {
      rootDir,
      exists: false,
      total: { files: 0, bytes: 0, displayBytes: '0 B' },
      byClassification: {},
      byKind: {},
      files: [],
      topFiles: [],
    };
  }

  const byClassification = new Map();
  const byKind = new Map();
  const files = walkFiles(rootDir).map((file) => {
    const rule = classifyStoragePath(file.relativePath, { size: file.size });
    addAggregate(byClassification, rule.classification, file.size);
    addAggregate(byKind, rule.kind, file.size);
    return {
      ...file,
      displaySize: toDisplayBytes(file.size),
      ...rule,
    };
  }).sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return {
    rootDir,
    exists: true,
    total: {
      files: files.length,
      bytes: totalBytes,
      displayBytes: toDisplayBytes(totalBytes),
    },
    byClassification: aggregateEntries(byClassification),
    byKind: aggregateEntries(byKind),
    files,
    topFiles: [...files].sort((left, right) => right.size - left.size).slice(0, options.topLimit || 20),
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    json: false,
    rootDir: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--root' || arg === '--storage') {
      options.rootDir = args[index + 1] || null;
      index += 1;
    } else if (!arg.startsWith('-') && !options.rootDir) {
      options.rootDir = arg;
    }
  }
  if (!options.rootDir && process.env.SIYUANMEMO_PLUGIN_STORAGE) {
    options.rootDir = process.env.SIYUANMEMO_PLUGIN_STORAGE;
  }
  if (!options.rootDir && process.env.SIYUAN_WORKSPACE) {
    options.rootDir = path.join(process.env.SIYUAN_WORKSPACE, DEFAULT_RELATIVE_STORAGE);
  }
  return options;
}

function formatSummary(result) {
  const lines = [];
  lines.push(`Storage root: ${result.rootDir}`);
  if (!result.exists) {
    lines.push('Status: missing');
    return lines.join('\n');
  }
  lines.push(`Total: ${result.total.files} files, ${result.total.displayBytes}`);
  lines.push('By classification:');
  for (const [classification, summary] of Object.entries(result.byClassification)) {
    lines.push(`- ${classification}: ${summary.files} files, ${summary.displayBytes}`);
  }
  lines.push('Largest files:');
  for (const file of result.topFiles) {
    lines.push(`- ${file.displaySize} ${file.classification}/${file.kind} ${file.relativePath}`);
  }
  return lines.join('\n');
}

function run() {
  const options = parseArgs(process.argv);
  const result = evaluate({ rootDir: options.rootDir, topLimit: 25 });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatSummary(result));
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  classifyStoragePath,
  evaluate,
  formatSummary,
  normalizePath,
  toDisplayBytes,
};
