const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceExtensions = new Set(['.ts', '.vue']);

const guardedRoots = [
  path.join('src', 'ui', 'browser'),
  path.join('src', 'ui', 'review'),
];

const transferRuntimeAllowlist = new Set([
  'src/ui/review/v2/reviewTabTransferRuntime.ts',
]);

const queueAuthorityCallPattern = /\b\w*queue\w*\s*\.\s*(getCards|addCards|removeCards|setFilter)\s*\(/i;
const chainedQueueAuthorityCallPattern = /\.getQueue\s*\([^)]*\)\s*\.\s*(getCards|addCards|removeCards|setFilter)\s*\(/;
const sessionSnapshotCallPattern = /\.\s*(serializeSessionSnapshot|restoreSessionSnapshot)\s*\(/;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
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

function rel(rootDir, file) {
  return path.relative(rootDir, file).replace(/\\/g, '/');
}

function isTestFile(relativePath) {
  return /(^|\/)__tests__\//.test(relativePath)
    || /\.(spec|test)\.ts$/.test(relativePath);
}

function isGuardedPath(relativePath) {
  const normalized = relativePath.replace(/\//g, path.sep);
  return guardedRoots.some((guardedRoot) => (
    normalized === guardedRoot
    || normalized.startsWith(`${guardedRoot}${path.sep}`)
  ));
}

function isAllowedSnapshotOwner(relativePath) {
  return transferRuntimeAllowlist.has(relativePath);
}

function evaluate(options = {}) {
  const rootDir = options.rootDir || root;
  const srcDir = options.srcDir || path.join(rootDir, 'src');
  const failures = [];

  for (const file of walk(srcDir)) {
    const relativePath = rel(rootDir, file);
    if (!isGuardedPath(relativePath) || isTestFile(relativePath)) {
      continue;
    }

    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const queueAuthorityMatch = line.match(queueAuthorityCallPattern)
        || line.match(chainedQueueAuthorityCallPattern);
      if (queueAuthorityMatch) {
        failures.push(`${relativePath}:${index + 1}: public queue authority call "${queueAuthorityMatch[1]}" is forbidden in Browser/Review runtime`);
      }

      const snapshotMatch = line.match(sessionSnapshotCallPattern);
      if (snapshotMatch && !isAllowedSnapshotOwner(relativePath)) {
        failures.push(`${relativePath}:${index + 1}: queue session snapshot method "${snapshotMatch[1]}" must stay behind review transfer runtime`);
      }
    });
  }

  return failures;
}

function run() {
  const failures = evaluate();
  if (failures.length > 0) {
    console.error('Public review queue API boundary check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Public review queue API boundary check passed.');
}

if (require.main === module) {
  run();
}

module.exports = {
  evaluate,
  run,
};
