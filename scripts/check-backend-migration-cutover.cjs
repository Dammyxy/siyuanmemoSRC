const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const allowListPath = path.join(root, 'scripts', 'backend-migration-compat-allowlist.json');
const sourceExtensions = new Set(['.ts', '.vue']);

const behaviorChecks = [
  {
    file: 'src/application/usecases/review/ReviewCommitUseCase.ts',
    kind: 'review-local-fallback',
    symbolPattern: 'scheduler.commit(',
    pattern: /(legacy review commit fallback|scheduler\.commit\s*\()/i,
    reason: 'review local fallback path still present',
  },
  {
    file: 'src/application/services/BrowserApplicationService.ts',
    kind: 'browser-sql-fallback',
    symbolPattern: 'browserDeckReadPort.queryDeckPage/queryDeckMatchedIds/getDeckCardsByIds/countCards/getBrowserStats',
    pattern: /(browserDeckReadPort\.(queryDeckPage|queryDeckMatchedIds|getDeckCardsByIds|countCards|getBrowserStats)\s*\()/i,
    reason: 'browser compatibility fallback still present in production path',
  },
  {
    file: 'src/application/handlers/AutoCardHandler.ts',
    kind: 'autocard-follower-direct-mutation',
    symbolPattern: 'follower backendClient.executeAutoCard(',
    pattern: /getMode\(\)\s*===\s*'follower'[\s\S]{0,220}backendClient\.executeAutoCard\s*\(/i,
    reason: 'AutoCard follower path still allows direct backend mutation bypass',
  },
  {
    file: 'src/application/services/AIWorkbenchPromptRuntime.ts',
    kind: 'ai-frontend-llm-call',
    symbolPattern: 'llmPort.chat(',
    pattern: /llmPort\.chat\s*\(/,
    reason: 'AI runtime still calls frontend llmPort chat path',
  },
  {
    file: 'src/application/ApplicationContext.ts',
    kind: 'ai-backend-raw-fetch-proxy',
    symbolPattern: 'BackendAINetworkProxyAdapter',
    pattern: /BackendAINetworkProxyAdapter/,
    reason: 'AI backend runtime still wires renderer/raw fetch adapter instead of kernel network proxy',
  },
  {
    file: 'src/application/clients/PrivateApiClient.ts',
    kind: 'private-follower-direct-mutation',
    symbolPattern: 'follower backendClient.privateCommand(',
    pattern: /getMode\(\)\s*===\s*'follower'[\s\S]{0,220}backendClient\.privateCommand\s*\(/i,
    reason: 'Private API follower path still allows direct backend mutation bypass',
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

const FALLBACK_CLASSIFICATIONS = new Set([
  'migration-source',
  'explicit-unavailable',
  'bounded-compat-read',
  'bug',
]);

function readFile(rootDir, relativePath) {
  const absolute = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolute)) {
    return null;
  }
  return fs.readFileSync(absolute, 'utf8');
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
  return entries.filter((entry) => entry.checker === 'check-backend-migration-cutover');
}

function isAllowed(allowEntries, check) {
  return allowEntries.some((entry) => (
    entry.file === check.file
    && entry.kind === check.kind
    && entry.symbolPattern === check.symbolPattern
  ));
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') {
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

function isTestFile(relativePath) {
  return /(^|\/)__tests__\//.test(relativePath)
    || /\.(test|spec)\.ts$/.test(relativePath);
}

function evaluateFallbackClassification(rootDir, options = {}) {
  const files = Array.isArray(options.fallbackClassificationFiles)
    ? options.fallbackClassificationFiles
    : [];
  if (files.length === 0) {
    return [];
  }

  const failures = [];
  for (const file of files) {
    const text = readFile(rootDir, file);
    if (text == null) {
      failures.push(`${file}: file missing`);
      continue;
    }

    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const fallbackLike = /\b(fallback|legacy|compat|degrade)\b/i.test(line);
      if (!fallbackLike) {
        continue;
      }

      const markerMatch = line.match(/backend-migration-fallback:\s*([a-z-]+)/i);
      if (!markerMatch) {
        failures.push(
          `${file}:${index + 1}: unclassified fallback branch marker missing (add "backend-migration-fallback: <class>")`,
        );
        continue;
      }
      const classification = String(markerMatch[1] || '').trim();
      if (!FALLBACK_CLASSIFICATIONS.has(classification)) {
        failures.push(
          `${file}:${index + 1}: unknown fallback classification "${classification}" (allowed: migration-source|explicit-unavailable|bounded-compat-read|bug)`,
        );
      }
    }
  }

  return failures;
}

function evaluateFeatureGateUsage(rootDir) {
  const failures = [];
  const ownershipMapText = readFile(rootDir, 'src/application/backendMigration/ownershipMap.ts');
  if (!ownershipMapText) {
    failures.push('src/application/backendMigration/ownershipMap.ts: file missing');
    return failures;
  }

  const gateKeys = [];
  const gateKeyRegex = /([a-zA-Z0-9_]+)\s*:\s*'VITE_SIYUANMEMO_[A-Z0-9_]+'/g;
  let match = gateKeyRegex.exec(ownershipMapText);
  while (match) {
    gateKeys.push(match[1]);
    match = gateKeyRegex.exec(ownershipMapText);
  }

  const files = walk(path.join(rootDir, 'src'))
    .map((file) => path.relative(rootDir, file).replace(/\\/g, '/'))
    .filter((relativePath) => !isTestFile(relativePath))
    .filter((relativePath) => relativePath !== 'src/application/backendMigration/ownershipMap.ts')
    .filter((relativePath) => relativePath !== 'src/application/backendMigration/featureGateMatrix.ts');

  const fileTexts = new Map();
  for (const relativePath of files) {
    fileTexts.set(relativePath, readFile(rootDir, relativePath) || '');
  }

  for (const gateKey of gateKeys) {
    const usageMarker = `BACKEND_MIGRATION_FEATURE_GATES.${gateKey}`;
    const isUsed = Array.from(fileTexts.values()).some((text) => text.includes(usageMarker));
    if (!isUsed) {
      failures.push(`src/application/backendMigration/featureGateMatrix.ts: feature gate ${gateKey} is not consumed by production runtime code`);
    }
  }
  return failures;
}

function evaluateServiceWiring(rootDir, allowEntries) {
  const failures = [];
  const applicationContextText = readFile(rootDir, 'src/application/ApplicationContext.ts') || '';
  const hasPrivateApiWiring = (
    applicationContextText.includes('PrivateApiService')
    || applicationContextText.includes('PrivateApiClient')
    || applicationContextText.includes('PrivateApiAuditService')
  );
  if (!hasPrivateApiWiring) {
    const check = {
      file: 'src/application/ApplicationContext.ts',
      kind: 'private-api-unwired',
      symbolPattern: 'missing PrivateApiService wiring',
    };
    if (!isAllowed(allowEntries, check)) {
      failures.push('src/application/ApplicationContext.ts: Private API runtime service/client wiring is missing in composition root');
    }
  }
  return failures;
}

function evaluate(options = {}) {
  const rootDir = options.rootDir || root;
  const checksList = options.checks || behaviorChecks;
  const allowEntries = options.allowEntries || loadAllowList(options.allowListPath);
  const failures = [];
  for (const check of checksList) {
    const text = readFile(rootDir, check.file);
    if (text == null) {
      failures.push(`${check.file}: file missing`);
      continue;
    }
    if (!check.pattern.test(text)) {
      continue;
    }
    if (isAllowed(allowEntries, check)) {
      continue;
    }
    failures.push(`${check.file}: ${check.reason}`);
  }
  failures.push(...evaluateFeatureGateUsage(rootDir));
  failures.push(...evaluateServiceWiring(rootDir, allowEntries));
  failures.push(...evaluateFallbackClassification(rootDir, options));
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
  behaviorChecks,
  evaluateFeatureGateUsage,
  evaluateServiceWiring,
  evaluateFallbackClassification,
  loadAllowList,
};
