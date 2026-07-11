const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceExtensions = new Set(['.ts', '.vue']);

const authorityRules = [
  {
    kind: 'renderer-sql-service-construction',
    pattern: /new\s+SqliteDatabaseService\s*\(/g,
  },
  {
    kind: 'renderer-sql-repository-construction',
    pattern: /new\s+SqlUnifiedStorageRepository\s*\(/g,
  },
  {
    kind: 'renderer-truth-writer-import',
    pattern: /from\s+['"][^'"]*(?:worker\/truth\/MessagePackTruthSegmentStore|MessagePackTruthSegmentStore)['"]/g,
  },
  {
    kind: 'renderer-truth-file-write',
    pattern: /\b(?:writeJSON|writeBinary)\s*\(\s*['"`][^'"`]*(?:truth\/|manifest\.v\d+\.json)/g,
  },
  {
    kind: 'whole-database-save-store-caller',
    pattern: /\b(?:unified|sqlUnifiedRepository|repositories\.unified)\.saveStore\s*\(/g,
  },
  {
    kind: 'whole-database-manager-save-caller',
    pattern: /\b(?:unifiedStorageManager|unifiedStorage)\.save\s*\(/g,
  },
  {
    kind: 'whole-database-rpc-persist-caller',
    pattern: /\.call\s*\(\s*['"]db\.persist['"]/g,
  },
];

const mutationFamilyAuthorityRules = [
  {
    family: 'review',
    evidence: [
      {
        file: 'src/application/adapters/review-session/WorkerReviewSessionQueueRuntime.ts',
        kind: 'renderer-review-feedback-command',
        pattern: /this\.backend\.reviewSessionFeedback\s*\(/g,
        expectedOccurrences: 1,
      },
      {
        file: 'src/application/adapters/review-session/WorkerReviewSessionQueueRuntime.ts',
        kind: 'renderer-review-undo-command',
        pattern: /this\.backend\.reviewSessionUndo\s*\(/g,
        expectedOccurrences: 1,
      },
      {
        file: 'worker/bootstrap/rpc/BackendReviewRpcAdapter.ts',
        kind: 'worker-review-feedback-handler',
        pattern: /context\.review\.handleReviewSessionFeedback\s*\(\s*params\s*\)/g,
        expectedOccurrences: 1,
      },
      {
        file: 'worker/bootstrap/rpc/BackendReviewRpcAdapter.ts',
        kind: 'worker-review-undo-handler',
        pattern: /context\.review\.handleReviewSessionUndo\s*\(\s*params\s*\)/g,
        expectedOccurrences: 1,
      },
    ],
  },
  {
    family: 'card-schedule',
    evidence: [
      {
        file: 'src/application/adapters/WorkerCardScheduleUpdateAdapter.ts',
        kind: 'renderer-card-schedule-command',
        pattern: /this\.executor\.execute\s*\(\s*request\s*\)/g,
        expectedOccurrences: 1,
      },
      {
        file: 'worker/bootstrap/rpc/BackendCardRpcAdapter.ts',
        kind: 'worker-card-schedule-writer',
        pattern: /this\.options\.database\.commitCardScheduleBatch\s*\(\s*request\s*\)/g,
        expectedOccurrences: 1,
      },
    ],
  },
  {
    family: 'queue',
    evidence: [
      {
        file: 'src/infrastructure/services/QueuePersistenceService.ts',
        kind: 'renderer-queue-command',
        pattern: /this\.executor!\.batchMutate\s*\(/g,
        expectedOccurrences: 2,
      },
      {
        file: 'worker/bootstrap/rpc/BackendQueueRpcAdapter.ts',
        kind: 'worker-queue-writer',
        pattern: /this\.options\.database\.commitQueueStateBatch\s*\(\s*request\s*\)/g,
        expectedOccurrences: 1,
      },
    ],
  },
  {
    family: 'card-crud',
    evidence: [
      {
        file: 'src/application/adapters/WorkerCardCrudMutationAdapter.ts',
        kind: 'renderer-card-crud-command',
        pattern: /this\.executor\.execute\s*\(\s*request\s*\)/g,
        expectedOccurrences: 1,
      },
      {
        file: 'worker/bootstrap/rpc/BackendCardRpcAdapter.ts',
        kind: 'worker-card-crud-writer',
        pattern: /this\.options\.database\.commitCardCrudBatch\s*\(\s*request\s*\)/g,
        expectedOccurrences: 1,
      },
    ],
  },
  {
    family: 'import-repair',
    evidence: [
      {
        file: 'src/application/services/StartupWorkerStorageMaintenance.ts',
        kind: 'renderer-startup-maintenance-command',
        pattern: /options\.executeScheduleBatch\s*\(/g,
        expectedOccurrences: 1,
      },
      {
        file: 'src/application/adapters/WorkerSrsCardSemanticsRepairRepository.ts',
        kind: 'renderer-semantics-repair-command',
        pattern: /this\.deps\.execute\s*\(/g,
        expectedOccurrences: 1,
      },
      {
        file: 'worker/bootstrap/rpc/BackendCoreRpcAdapter.ts',
        kind: 'worker-maintenance-writer',
        pattern: /context\.core\.database\.applyStorageMaintenanceBatch\s*\(/g,
        expectedOccurrences: 1,
      },
    ],
  },
  {
    family: 'renderer-projection',
    evidence: [
      {
        file: 'src/application/ApplicationContext.ts',
        kind: 'worker-projection-snapshot-load',
        pattern: /loadResult\.projectionSnapshot/g,
        expectedOccurrences: 1,
      },
      {
        file: 'src/application/ApplicationContext.ts',
        kind: 'worker-semantics-repair-composition',
        pattern: /new\s+WorkerSrsCardSemanticsRepairRepository\s*\(/g,
        expectedOccurrences: 1,
      },
    ],
    forbidden: [
      {
        file: 'src/application/ApplicationContext.ts',
        kind: 'renderer-sql-persistence-composition',
        pattern: /\bsqlPersistence\b/g,
      },
      {
        file: 'src/application/ApplicationContext.ts',
        kind: 'renderer-whole-store-save',
        pattern: /\bunifiedStorageManager\.save\s*\(|\.saveStore\s*\(|db\.persist/g,
      },
    ],
  },
  {
    family: 'kernel-companion',
    evidence: [],
    forbidden: [
      {
        file: 'src/kernel.ts',
        kind: 'kernel-database-or-truth-owner',
        pattern: /\b(?:SqliteDatabaseService|SqlUnifiedStorageRepository|MessagePackTruthSegmentStore)\b|siyuanmemo\.db|\.writeBinary\s*\(|\.writeJSON\s*\(|db\.persist/g,
      },
    ],
  },
];

const legacyWriterInventory = [];

const approvedLegacySites = legacyWriterInventory.map((entry) => ({
  file: entry.file,
  kind: entry.kind,
  maxOccurrences: entry.maxOccurrences,
}));

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        continue;
      }
      walk(absolute, files);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function isTestFile(relativePath) {
  return /(^|\/)__tests__\//.test(relativePath)
    || /\.(test|spec)\.ts$/.test(relativePath);
}

function countMatches(text, pattern) {
  return Array.from(text.matchAll(new RegExp(pattern.source, pattern.flags))).length;
}

function approvedLimit(approvedSites, file, kind) {
  return approvedSites
    .filter((entry) => entry.file === file && entry.kind === kind)
    .reduce((total, entry) => total + Math.max(0, Number(entry.maxOccurrences) || 0), 0);
}

function readAuthorityFile(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function evaluateMutationFamilyAuthorities(options = {}) {
  const rootDir = path.resolve(options.rootDir || root);
  const rules = options.rules || mutationFamilyAuthorityRules;
  const failures = [];

  for (const rule of rules) {
    for (const evidence of rule.evidence || []) {
      const text = readAuthorityFile(rootDir, evidence.file);
      if (text === null) {
        failures.push(`${rule.family}: missing authority evidence file ${evidence.file}`);
        continue;
      }
      const occurrences = countMatches(text, evidence.pattern);
      if (occurrences !== evidence.expectedOccurrences) {
        failures.push(
          `${rule.family}: ${evidence.file} ${evidence.kind} occurrences ${occurrences} `
          + `must equal ${evidence.expectedOccurrences}`,
        );
      }
    }
    for (const forbidden of rule.forbidden || []) {
      const text = readAuthorityFile(rootDir, forbidden.file);
      if (text === null) {
        failures.push(`${rule.family}: missing authority boundary file ${forbidden.file}`);
        continue;
      }
      const occurrences = countMatches(text, forbidden.pattern);
      if (occurrences > 0) {
        failures.push(
          `${rule.family}: ${forbidden.file} contains forbidden ${forbidden.kind} `
          + `occurrences ${occurrences}`,
        );
      }
    }
  }

  return failures;
}

function evaluate(options = {}) {
  const rootDir = path.resolve(options.rootDir || root);
  const rules = options.rules || authorityRules;
  const approvedSites = options.approvedSites || approvedLegacySites;
  const scanDir = path.join(rootDir, 'src');
  const failures = [];

  for (const file of walk(scanDir)) {
    const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
    if (isTestFile(relativePath)) {
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    for (const rule of rules) {
      const occurrences = countMatches(text, rule.pattern);
      if (occurrences === 0) {
        continue;
      }
      const limit = approvedLimit(approvedSites, relativePath, rule.kind);
      if (occurrences > limit) {
        failures.push(`${relativePath}: ${rule.kind} occurrences ${occurrences} exceed approved baseline ${limit}`);
      }
    }
  }
  return failures;
}

function run() {
  const failures = [
    ...evaluate(),
    ...evaluateMutationFamilyAuthorities(),
  ];
  if (failures.length > 0) {
    console.error('Storage writer authority check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Storage writer authority check passed.');
}

if (require.main === module) {
  run();
}

module.exports = {
  approvedLegacySites,
  authorityRules,
  evaluate,
  evaluateMutationFamilyAuthorities,
  legacyWriterInventory,
  mutationFamilyAuthorityRules,
  run,
};
