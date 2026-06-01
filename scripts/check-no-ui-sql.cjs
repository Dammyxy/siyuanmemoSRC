const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const allowListPath = path.join(root, 'scripts', 'backend-migration-compat-allowlist.json');
const scanRoots = [
  { scope: 'ui', dir: path.join(root, 'src', 'ui') },
  { scope: 'application', dir: path.join(root, 'src', 'application') },
];
const sourceExtensions = new Set(['.ts', '.vue']);

const violationRules = [
  {
    kind: 'sqljs-import',
    scopes: ['ui', 'application'],
    symbolPattern: 'sql.js import',
    pattern: /from\s+['"]sql\.js['"]/,
  },
  {
    kind: 'runtime-sqlite-import',
    scopes: ['ui', 'application'],
    symbolPattern: '@/infrastructure/persistence/sqlite import',
    pattern: /import\s+(?!type\b)[^;]*from\s+['"]@\/infrastructure\/persistence\/sqlite(?:\/|['"])/,
  },
  {
    kind: 'siyuan-api-sql',
    scopes: ['ui', 'application'],
    symbolPattern: 'siyuanApi.sql(',
    pattern: /siyuanApi\.sql\s*\(/,
  },
  {
    kind: 'host-sql-endpoint',
    scopes: ['ui', 'application'],
    symbolPattern: '/api/query/sql',
    pattern: /\/api\/query\/sql/,
  },
  {
    kind: 'host-plugin-rpc-endpoint',
    scopes: ['ui', 'application'],
    symbolPattern: '/api/plugin/rpc',
    pattern: /\/api\/plugin\/rpc/,
  },
  {
    kind: 'host-fetch-api',
    scopes: ['ui', 'application'],
    symbolPattern: 'fetch(\'/api/...)',
    pattern: /fetch\s*\(\s*['"]\s*\/api\//,
  },
  {
    kind: 'siyuan-query-adapter-import',
    scopes: ['ui', 'application'],
    symbolPattern: 'QuerySiyuanAdapter/ManagerSiyuanAdapter/BrowserSiyuanAdapter import',
    pattern: /from\s+['"]@\/infrastructure\/siyuan\/(?:QuerySiyuanAdapter|ManagerSiyuanAdapter|BrowserSiyuanAdapter)['"]/,
  },
  {
    kind: 'review-sql-mutation',
    scopes: ['ui', 'application'],
    symbolPattern: 'sqlRepository.addReviewLog*/addDrillLogV2/addRescheduleLog',
    pattern: /sqlRepository\.(?:addReviewLog|addReviewLogV2|addDrillLogV2|addRescheduleLog)\s*\(/,
  },
];

const requiredAllowListFields = [
  'id',
  'checker',
  'file',
  'kind',
  'symbolPattern',
  'owner',
  'reason',
  'removalCondition',
  'trackingTask',
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        continue;
      }
      walk(fullPath, files);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function isTestFile(relativePath) {
  return /(^|\/)__tests__\//.test(relativePath)
    || /\.(test|spec)\.ts$/.test(relativePath);
}

function loadAllowList(customAllowListPath) {
  const resolvedPath = customAllowListPath || allowListPath;
  if (!fs.existsSync(resolvedPath)) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const invalidEntries = [];
  for (const entry of entries) {
    for (const field of requiredAllowListFields) {
      if (!String(entry[field] || '').trim()) {
        invalidEntries.push(`invalid allowlist entry "${entry.id || '<unknown>'}": missing ${field}`);
      }
    }
  }
  if (invalidEntries.length > 0) {
    throw new Error(invalidEntries.join('\n'));
  }
  return entries.filter((entry) => entry.checker === 'check-no-ui-sql');
}

function isAllowed(allowEntries, violation) {
  return allowEntries.some((entry) => (
    entry.file === violation.file
    && entry.kind === violation.kind
    && entry.symbolPattern === violation.symbolPattern
  ));
}

function evaluate(options = {}) {
  const rootDir = options.rootDir || root;
  const rules = options.rules || violationRules;
  const allowEntries = options.allowEntries || loadAllowList(options.allowListPath);
  const failures = [];
  const defaultScanRootsByScope = {
    ui: path.join(rootDir, 'src', 'ui'),
    application: path.join(rootDir, 'src', 'application'),
  };

  for (const scanRoot of scanRoots) {
    const scanDir = options.scanRootsByScope?.[scanRoot.scope] || defaultScanRootsByScope[scanRoot.scope];
    for (const file of walk(scanDir)) {
      const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
      if (isTestFile(relativePath)) {
        continue;
      }
      const text = fs.readFileSync(file, 'utf8');
      for (const rule of rules) {
        if (!rule.scopes.includes(scanRoot.scope)) {
          continue;
        }
        if (!rule.pattern.test(text)) {
          continue;
        }
        const violation = {
          file: relativePath,
          kind: rule.kind,
          symbolPattern: rule.symbolPattern || rule.pattern.toString(),
        };
        if (isAllowed(allowEntries, violation)) {
          continue;
        }
        failures.push(`${relativePath}: violates no-ui-sql rule (${rule.kind})`);
      }
    }
  }
  return failures;
}

function run() {
  const failures = evaluate();
  if (failures.length > 0) {
    console.error('No-UI-SQL boundary check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('No-UI-SQL boundary check passed.');
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  evaluate,
  violationRules,
  loadAllowList,
};
