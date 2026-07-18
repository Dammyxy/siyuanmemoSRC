const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceExtensions = new Set(['.ts', '.vue']);

const rules = [
  {
    kind: 'recovery-apply-facade',
    pattern: /\bforeignEpochRecoveryApply\s*\(/g,
    allowedFiles: new Set(['src/application/clients/SrsBackendClient.ts']),
  },
  {
    kind: 'raw-recovery-apply-rpc',
    pattern: /\.call\s*\(\s*['"]recovery\.foreignEpoch\.apply['"]/g,
    allowedFiles: new Set(['src/application/clients/backend/BackendForeignEpochRecoveryRpcClient.ts']),
  },
  {
    kind: 'frontier-recovery-transition',
    pattern: /\.recoverFromVerifiedForeignEpochCoverage\s*\(/g,
    allowedFiles: new Set(['worker/recovery/WorkerSqliteForeignEpochContinuityApplier.ts']),
  },
  {
    kind: 'renderer-worker-recovery-import',
    pattern: /from\s+['"][^'"]*worker\/recovery\//g,
    allowedFiles: new Set(),
  },
];

function isTestFile(relativePath) {
  return /(^|\/)__tests__\//.test(relativePath)
    || /\.(test|spec)\.ts$/.test(relativePath);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function evaluate(options = {}) {
  const rootDir = path.resolve(options.rootDir || root);
  const activeRules = options.rules || rules;
  const files = [
    ...walk(path.join(rootDir, 'src')),
    ...walk(path.join(rootDir, 'worker')),
  ];
  const failures = [];
  for (const file of files) {
    const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
    if (isTestFile(relativePath)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const rule of activeRules) {
      const count = Array.from(text.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags))).length;
      if (count > 0 && !rule.allowedFiles.has(relativePath)) {
        failures.push(`${relativePath}: forbidden ${rule.kind} occurrences ${count}`);
      }
    }
  }
  return failures;
}

function run() {
  const failures = evaluate();
  if (failures.length > 0) {
    console.error('Foreign-epoch recovery boundary check failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log('Foreign-epoch recovery boundary check passed.');
}

if (require.main === module) run();

module.exports = { evaluate, rules, run };
