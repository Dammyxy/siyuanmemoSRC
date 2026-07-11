const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue']);

const scanPrefixes = [
  'src/application/',
  'src/core/',
  'src/infrastructure/',
  'worker/',
  'packages/contracts/src/',
];

const ignoredPathPatterns = [
  /(^|\/)__tests__\//,
  /\.(test|spec)\.[cm]?[tj]sx?$/,
  /(^|\/)(dist|node_modules|coverage)\//,
  /(^|\/)\.vite\//,
  /(^|\/)src\/core\/storage\/README\.md$/,
  /(^|\/)src\/infrastructure\/persistence\/README\.md$/,
];

const allowedRules = [
  {
    file: 'src/infrastructure/services/FileService.ts',
    reason: 'low-level file adapter API; runtime owners must not call msgpack methods directly',
  },
  {
    file: 'src/infrastructure/persistence/sqlite/SqliteMigrationService.ts',
    reason: 'SQLite initial migration reads old msgpack storage as migration source',
  },
  {
    file: 'src/application/services/LegacyStorageMigrationSourcePlanner.ts',
    reason: 'explicit lazy migration planner reads retired msgpack sources only for pending Worker maintenance operations',
  },
  {
    file: 'src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts',
    reason: 'bounded SQLite delta v2 MessagePack segment adapter',
  },
  {
    file: 'src/core/storage/UnifiedStoragePersistence.ts',
    reason: 'legacy unified-store loader exists only as SQLite initial migration source',
  },
  {
    file: 'src/core/storage/UnifiedStorageManager.ts',
    reason: 'type/import compatibility for unified store migration path',
  },
  {
    file: 'src/core/storage/manager.ts',
    reason: 'legacy storage manager retained for old-storage migration and non-active compatibility',
  },
  {
    file: 'src/core/xiuyuan/types.ts',
    reason: 'legacy Xiuyuan storage key constant for migration compatibility',
  },
  {
    file: 'src/index.ts',
    reason: 'uninstall/local cleanup list for old plugin data files',
  },
  {
    file: 'worker/truth/MessagePackTruthSegmentStore.ts',
    reason: 'bounded MessagePack truth segment adapter; callers must stay outside direct msgpack access',
  },
  {
    file: 'worker/bootstrap/ReviewFeedbackTimingScope.ts',
    reason: 'classifies bounded SQLite delta/truth segment host-effect paths for review durability diagnostics',
  },
  {
    file: 'worker/truth/LegacyUnifiedCardsMigrationReceipt.ts',
    reason: 'passive retired legacy migration receipt metadata; must not read legacy MessagePack bytes',
  },
];

const msgpackPattern = /\b(readMsgpack|writeMsgpack)\b|@msgpack\/msgpack|['"`][^'"`]*\.msgpack['"`]/;

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isIgnoredPath(relativePath) {
  return ignoredPathPatterns.some((pattern) => pattern.test(relativePath));
}

function isAllowed(relativePath) {
  return allowedRules.some((rule) => rule.file === relativePath);
}

function discoverFiles(rootDir) {
  const files = [];
  for (const prefix of scanPrefixes) {
    const absolute = path.join(rootDir, prefix);
    for (const file of walk(absolute)) {
      const relativePath = normalizePath(path.relative(rootDir, file));
      if (!isIgnoredPath(relativePath)) {
        files.push(relativePath);
      }
    }
  }
  return Array.from(new Set(files)).sort();
}

function evaluate(options = {}) {
  const rootDir = options.rootDir || root;
  const files = options.files || discoverFiles(rootDir);
  const failures = [];
  for (const relativePath of files) {
    const absolute = path.join(rootDir, relativePath);
    if (!fs.existsSync(absolute)) {
      continue;
    }
    const text = fs.readFileSync(absolute, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!msgpackPattern.test(line)) {
        continue;
      }
      if (isAllowed(relativePath)) {
        continue;
      }
      failures.push(`${relativePath}:${index + 1}: runtime msgpack access is forbidden outside explicit migration/adapter allowlist`);
    }
  }
  return failures;
}

function run() {
  const failures = evaluate();
  if (failures.length > 0) {
    console.error('No-runtime-msgpack check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('No-runtime-msgpack check passed.');
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  evaluate,
  allowedRules,
};
