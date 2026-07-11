const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const forbiddenPatterns = [
  { pattern: /siyuanmemo\.db/i, reason: 'kernel companion must not access siyuanmemo.db directly' },
  { pattern: /sqlite-delta(?:-log|\/)/i, reason: 'kernel companion must not own SQLite delta files' },
  { pattern: /truth\//i, reason: 'kernel companion must not own truth segments' },
  { pattern: /manifest\.v\d+\.json/i, reason: 'kernel companion must not own truth manifests' },
  { pattern: /MessagePackTruthSegmentStore/, reason: 'kernel companion must not construct truth writers' },
  { pattern: /\/api\/file\/putFile/i, reason: 'kernel companion must not write plugin DB files' },
  { pattern: /\/api\/file\/getFile/i, reason: 'kernel companion must not read plugin DB files directly' },
];

function evaluate(options = {}) {
  const rootDir = path.resolve(options.rootDir || root);
  const kernelFile = options.kernelFile || path.join(rootDir, 'src', 'kernel.ts');
  if (!fs.existsSync(kernelFile)) {
    return ['src/kernel.ts is missing'];
  }
  const content = fs.readFileSync(kernelFile, 'utf8');
  const failures = [];
  for (const entry of forbiddenPatterns) {
    if (entry.pattern.test(content)) {
      failures.push(entry.reason);
    }
  }
  if (!/writesSiyuanMemoDb:\s*false/.test(content)) {
    failures.push('kernel capability must declare writesSiyuanMemoDb: false');
  }
  return failures;
}

function run() {
  const failures = evaluate();
  if (failures.length > 0) {
    console.error('Kernel DB owner check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Kernel DB owner check passed.');
}

if (require.main === module) {
  run();
}

module.exports = {
  evaluate,
  forbiddenPatterns,
  run,
};
