const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const checks = [
  {
    file: 'src/application/usecases/review/ReviewCommitUseCase.ts',
    forbidden: [
      { pattern: /legacy review commit fallback/i, reason: 'legacy review commit fallback still present' },
    ],
  },
  {
    file: 'src/core/scheduler/SchedulerRouter.ts',
    forbidden: [
      { pattern: /legacy scheduler commit fallback/i, reason: 'legacy scheduler commit fallback still present' },
    ],
  },
  {
    file: 'src/application/queries/browser/shared/BrowserDeckQueryKernel.ts',
    forbidden: [
      { pattern: /sql-fallback-getAllCards/i, reason: 'legacy browser SQL fallback path still present' },
    ],
  },
  {
    file: 'src/application/handlers/AutoCardHandler.ts',
    forbidden: [
      { pattern: /follower-local fallback/i, reason: 'AutoCard follower-local fallback marker still present' },
    ],
  },
];

function readFile(rootDir, relativePath) {
  const absolute = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolute)) {
    return null;
  }
  return fs.readFileSync(absolute, 'utf8');
}

function evaluate(options = {}) {
  const rootDir = options.rootDir || root;
  const checksList = options.checks || checks;
  const failures = [];
  for (const check of checksList) {
    const text = readFile(rootDir, check.file);
    if (text == null) {
      failures.push(`${check.file}: file missing`);
      continue;
    }
    for (const entry of check.forbidden) {
      if (!entry.pattern.test(text)) {
        continue;
      }
      const allowed = (check.allow || []).some((allowEntry) => allowEntry.pattern.test(text));
      if (allowed) {
        continue;
      }
      failures.push(`${check.file}: ${entry.reason}`);
    }
  }
  return failures;
}

function run() {
  const failures = evaluate();
  if (failures.length > 0) {
    console.error('Backend migration cutover check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Backend migration cutover check passed.');
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  evaluate,
  checks,
};
