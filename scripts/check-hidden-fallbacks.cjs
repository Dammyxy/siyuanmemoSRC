const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const allowListPath = path.join(root, 'scripts', 'hidden-fallback-allowlist.json');

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue']);
const approvedClasses = new Set([
  'explicit-unavailable',
  'operator-rollback',
  'migration-compat',
  'ui-label-default',
  'parser-normalization-default',
  'test-fixture',
]);

const requiredAllowListFields = [
  'id',
  'file',
  'kind',
  'class',
  'owner',
  'reason',
  'removalCondition',
  'testEvidence',
];

const requiredMarkerFields = ['class', 'owner', 'reason', 'removal', 'test'];

const guardedPrefixes = [
  'src/application/',
  'src/core/queue/',
  'worker/',
  'packages/contracts/src/',
];

const ignoredPathPatterns = [
  /(^|\/)__tests__\//,
  /\.(test|spec)\.[cm]?[tj]sx?$/,
  /(^|\/)(dist|node_modules|coverage)\//,
  /(^|\/)\.vite\//,
];

const fallbackWordPattern = /\b(fallback|falling back|fall back|legacy|compat|degrade|degraded)\b|兜底|回退/i;

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function readFile(rootDir, relativePath) {
  const absolute = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolute)) {
    return null;
  }
  return fs.readFileSync(absolute, 'utf8');
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

function isGuardedSource(relativePath) {
  const normalized = normalizePath(relativePath);
  return guardedPrefixes.some((prefix) => normalized.startsWith(prefix))
    && !isIgnoredPath(normalized);
}

function isApplicationRuntimePath(relativePath) {
  return normalizePath(relativePath).startsWith('src/application/');
}

function discoverGuardedFiles(rootDir) {
  const files = [];
  for (const prefix of guardedPrefixes) {
    const absolute = path.join(rootDir, prefix);
    for (const file of walk(absolute)) {
      const relativePath = normalizePath(path.relative(rootDir, file));
      if (isGuardedSource(relativePath)) {
        files.push(relativePath);
      }
    }
  }
  return Array.from(new Set(files)).sort();
}

function parseAllowEntries(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload?.entries) ? payload.entries : [];
}

function validateAllowEntry(entry) {
  const failures = [];
  const id = String(entry?.id || '<unknown>');
  for (const field of requiredAllowListFields) {
    if (!String(entry?.[field] || '').trim()) {
      failures.push(`invalid allowlist entry "${id}": missing ${field}`);
    }
  }
  if (!approvedClasses.has(String(entry?.class || ''))) {
    failures.push(`invalid allowlist entry "${id}": unknown class "${entry?.class || ''}"`);
  }
  if (
    !String(entry?.symbolPattern || '').trim()
    && !String(entry?.marker || '').trim()
    && !String(entry?.linePattern || '').trim()
  ) {
    failures.push(`invalid allowlist entry "${id}": missing symbolPattern, marker, or linePattern`);
  }
  return failures;
}

function loadAllowList(customAllowListPath) {
  const resolvedPath = customAllowListPath || allowListPath;
  if (!fs.existsSync(resolvedPath)) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  return parseAllowEntries(payload);
}

function validateAllowEntries(entries) {
  const failures = [];
  if (entries.length > 0) {
    failures.push(
      `hidden fallback allowlist must be empty; remove ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} by fixing the active runtime path`,
    );
  }
  for (const entry of entries) {
    failures.push(...validateAllowEntry(entry));
  }
  return failures;
}

function parseMarkerMetadata(raw) {
  const metadata = {};
  const regex = /([a-zA-Z][a-zA-Z0-9_-]*)=("[^"]*"|'[^']*'|\S+)/g;
  let match = regex.exec(raw);
  while (match) {
    const key = match[1];
    const value = String(match[2] || '').replace(/^["']|["']$/g, '').trim();
    metadata[key] = value;
    match = regex.exec(raw);
  }
  return metadata;
}

function findInlineMarker(lines, index) {
  for (let cursor = index; cursor >= Math.max(0, index - 2); cursor -= 1) {
    const line = lines[cursor] || '';
    const markerMatch = line.match(/hidden-fallback-ok:\s*(.*)$/i);
    if (markerMatch) {
      return {
        line: cursor + 1,
        raw: markerMatch[1],
        metadata: parseMarkerMetadata(markerMatch[1]),
      };
    }
  }
  return null;
}

function validateInlineMarker(marker) {
  const failures = [];
  for (const field of requiredMarkerFields) {
    if (!String(marker.metadata[field] || '').trim()) {
      failures.push(`missing marker field ${field}`);
    }
  }
  const markerClass = String(marker.metadata.class || '');
  if (markerClass && !approvedClasses.has(markerClass)) {
    failures.push(`unknown marker class "${markerClass}"`);
  }
  return failures;
}

function isCommentOnly(line) {
  const trimmed = String(line || '').trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function isUiLabelDefault(line) {
  return /\b(fallbackLabel|fallback:\s*string|t\([^)]*fallback|translate\([^)]*fallback|getI18n\(\)\?\.\[[^\]]+\]\s*\|\|\s*fallback)\b/i.test(line);
}

function isParserNormalizationDefault(relativePath, line) {
  return /\b(normalize|clamp|parse|format|toFinite|toNumber|toString|fallback[A-Z_]|fallback\s*=)\b/i.test(line)
    && !/\b(falling back|fall back|fallback to)\b/i.test(line)
    && !/logger\.(warn|error|debug|info)\s*\(/i.test(line)
    && !/ApplicationContext|AutoCardHandler|BrowserApplicationService|DocTreeReviewScopeService/i.test(relativePath);
}

function createHit(input) {
  return {
    file: input.file,
    line: input.line,
    kind: input.kind,
    symbol: input.symbol,
    risk: input.risk,
    inferredClass: input.inferredClass,
    source: input.source || 'keyword',
    requiresClassification: Boolean(input.requiresClassification),
    status: 'unclassified',
    owner: null,
    removalCondition: null,
    testEvidence: null,
  };
}

function classifyKeywordLine(relativePath, line, lineNumber) {
  if (!fallbackWordPattern.test(line)) {
    return null;
  }

  if (isUiLabelDefault(line)) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'ui-label-default',
      symbol: line.trim(),
      risk: 'P2',
      inferredClass: 'ui-label-default',
      requiresClassification: false,
    });
  }

  if (isParserNormalizationDefault(relativePath, line)) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'parser-normalization-default',
      symbol: line.trim(),
      risk: 'P2',
      inferredClass: 'parser-normalization-default',
      requiresClassification: false,
    });
  }

  if (isCommentOnly(line)) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'comment-fallback-vocabulary',
      symbol: line.trim(),
      risk: 'P2',
      inferredClass: 'test-fixture',
      requiresClassification: false,
    });
  }

  if (relativePath.endsWith('ApplicationContext.ts') && /legacy storage|legacyPersistence|SQLite.*falling back/i.test(line)) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'storage-legacy-rollback',
      symbol: line.trim(),
      risk: 'P0',
      inferredClass: 'operator-rollback',
      requiresClassification: true,
    });
  }

  if (relativePath.endsWith('AutoCardHandler.ts') && /cardType|detect|detection|item/i.test(line)) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'autocard-card-type-detection-fallback',
      symbol: line.trim(),
      risk: 'P0',
      inferredClass: 'explicit-unavailable',
      requiresClassification: true,
    });
  }

  if (relativePath.endsWith('BrowserApplicationService.ts') && /visible counters|size methods|getStats|getSize/i.test(line)) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: /neural-roam|visible counters/i.test(line)
        ? 'neural-roam-visible-counter-operator-rollback'
        : 'queue-visible-count-operator-rollback',
      symbol: line.trim(),
      risk: 'P1',
      inferredClass: 'operator-rollback',
      requiresClassification: true,
    });
  }

  if (
    relativePath.endsWith('XiuyuanSyncService.ts')
    && /\b(falling back|fall back|fallback to)\b/i.test(line)
    && /xiuyuan|riff|sync|local/i.test(line)
  ) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'xiuyuan-sync-local-fallback',
      symbol: line.trim(),
      risk: 'P1',
      inferredClass: 'explicit-unavailable',
      requiresClassification: true,
    });
  }

  if (
    relativePath.endsWith('BrowserApplicationService.ts')
    && /\b(falling back|fall back|fallback to)\b/i.test(line)
    && /aggregate|snapshot|allRows|full snapshot/i.test(line)
  ) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'browser-aggregate-local-fallback',
      symbol: line.trim(),
      risk: 'P1',
      inferredClass: 'explicit-unavailable',
      requiresClassification: true,
    });
  }

  if (
    relativePath.endsWith('WorkerGraphQueryService.ts')
    && /\b(falling back|fall back|fallback to)\b/i.test(line)
    && /graph|renderer|sql|host effect/i.test(line)
  ) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'graph-query-renderer-fallback',
      symbol: line.trim(),
      risk: 'P1',
      inferredClass: 'explicit-unavailable',
      requiresClassification: true,
    });
  }

  if (
    relativePath.endsWith('ReviewApplicationService.ts')
    && /\b(falling back|fall back|fallback to)\b/i.test(line)
    && /review|riff|source refresh|source-refresh/i.test(line)
  ) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'review-hotspot-local-fallback',
      symbol: line.trim(),
      risk: 'P1',
      inferredClass: 'explicit-unavailable',
      requiresClassification: true,
    });
  }

  if (relativePath.endsWith('DocTreeReviewScopeService.ts') && /storage scan|SQL.*failed/i.test(line)) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'doc-tree-storage-scan-migration-compat',
      symbol: line.trim(),
      risk: 'P1',
      inferredClass: 'migration-compat',
      requiresClassification: true,
    });
  }

  if (/\b(falling back|fall back|fallback to|legacy storage)\b/i.test(line)) {
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'runtime-fallback',
      symbol: line.trim(),
      risk: /backend|worker|relay|projection|writer|private|storage|sql|detect|detection|queue/i.test(`${relativePath} ${line}`) ? 'P1' : 'P2',
      inferredClass: /compat|legacy|migration/i.test(line) ? 'migration-compat' : 'operator-rollback',
      requiresClassification: /backend|worker|relay|projection|writer|private|storage|sql|detect|detection|queue/i.test(`${relativePath} ${line}`),
    });
  }

  if (/\b(degraded|degrade)\b/i.test(line)) {
    const isStateVocabulary = /^\s*\|\s*'degraded'/.test(line)
      || /\b(state|diagnostics|diagnostic|capability|capabilities)\b/i.test(line)
      || /relay degraded/i.test(line);
    return createHit({
      file: relativePath,
      line: lineNumber,
      kind: 'degraded-runtime-state',
      symbol: line.trim(),
      risk: isStateVocabulary ? 'P2' : 'P1',
      inferredClass: 'explicit-unavailable',
      requiresClassification: !isStateVocabulary,
    });
  }

  return createHit({
    file: relativePath,
    line: lineNumber,
    kind: 'fallback-vocabulary',
    symbol: line.trim(),
    risk: 'P2',
    inferredClass: 'parser-normalization-default',
    requiresClassification: false,
  });
}

function collectCatchBlock(lines, startIndex) {
  const collected = [];
  let depth = 0;
  let started = false;
  for (let index = startIndex; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = index === startIndex && rawLine.includes('catch')
      ? rawLine.slice(rawLine.indexOf('catch'))
      : rawLine;
    collected.push(line);
    for (const char of line) {
      if (char === '{') {
        depth += 1;
        started = true;
      } else if (char === '}') {
        depth -= 1;
      }
    }
    if (started && depth <= 0) {
      break;
    }
    if (collected.length >= 40) {
      break;
    }
  }
  return collected.join('\n');
}

function classifyCatchBlock(relativePath, lines, index) {
  const line = lines[index] || '';
  if (!/\bcatch\s*(\(|{)/.test(line)) {
    return null;
  }
  const snippet = collectCatchBlock(lines, index);
  if (!/return\s+(null|\[\]|0|new\s+Map\s*\([^)]*\))\s*;/.test(snippet)) {
    return null;
  }
  if (!/\b(backend|worker|relay|projection|writer|private|sql|storage|detect|detection|migration|init|query|unavailable|failed)\b/i.test(snippet)) {
    return null;
  }

  const isHighRisk = /ApplicationContext|AutoCardHandler|BrowserApplicationService|ReviewCommitUseCase|UnifiedQueueStrategy|UnifiedDataSourceManager|PrivateApiClient|FollowerCommandClient/i
    .test(relativePath);
  const requiresClassification = true;
  return createHit({
    file: relativePath,
    line: index + 1,
    kind: 'dependency-catch-empty-return',
    symbol: snippet.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).slice(0, 3).join(' '),
    risk: isHighRisk ? 'P1' : 'P2',
    inferredClass: 'explicit-unavailable',
    source: 'behavior-pattern',
    requiresClassification,
  });
}

function classifyPromiseEmptyCatch(relativePath, line, lineNumber) {
  if (!/\.catch\s*\(\s*\(\s*\)\s*=>\s*(null|\[\]|0|new\s+Map\s*\([^)]*\)|this\.lastCounterSnapshot)\s*\)/.test(line)) {
    return null;
  }
  const isHighRisk = /ApplicationContext|AutoCardHandler|BrowserApplicationService|ReviewCommitUseCase|UnifiedQueueStrategy|UnifiedDataSourceManager|PrivateApiClient|FollowerCommandClient/i
    .test(relativePath);
  const requiresClassification = true;
  return createHit({
    file: relativePath,
    line: lineNumber,
    kind: 'dependency-promise-empty-catch',
    symbol: line.trim(),
    risk: isHighRisk ? 'P1' : 'P2',
    inferredClass: 'explicit-unavailable',
    source: 'behavior-pattern',
    requiresClassification,
  });
}

function collectHitsForFile(rootDir, relativePath) {
  const text = readFile(rootDir, relativePath);
  if (text == null) {
    return [{
      file: relativePath,
      line: 1,
      kind: 'file-missing',
      symbol: 'file missing',
      risk: 'P0',
      inferredClass: 'explicit-unavailable',
      source: 'filesystem',
      requiresClassification: true,
      status: 'violation',
      owner: null,
      removalCondition: null,
      testEvidence: null,
    }];
  }
  const lines = text.split(/\r?\n/);
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    const keywordHit = classifyKeywordLine(relativePath, lines[index], index + 1);
    if (keywordHit) {
      hits.push(keywordHit);
    }
    const promiseCatchHit = classifyPromiseEmptyCatch(relativePath, lines[index], index + 1);
    if (promiseCatchHit) {
      hits.push(promiseCatchHit);
    }
    const behaviorHit = classifyCatchBlock(relativePath, lines, index);
    if (behaviorHit) {
      hits.push(behaviorHit);
    }
  }
  return hits;
}

function entryMatchesHit(entry, hit) {
  if (normalizePath(entry.file) !== hit.file) {
    return false;
  }
  if (entry.kind !== hit.kind) {
    return false;
  }
  const symbolPattern = String(entry.symbolPattern || '').trim();
  if (symbolPattern && hit.symbol.includes(symbolPattern)) {
    return true;
  }
  const marker = String(entry.marker || '').trim();
  if (marker && hit.symbol.includes(marker)) {
    return true;
  }
  const linePattern = String(entry.linePattern || '').trim();
  if (linePattern) {
    try {
      return new RegExp(linePattern).test(hit.symbol);
    } catch {
      return hit.symbol.includes(linePattern);
    }
  }
  return false;
}

function applyClassification(rootDir, hit, allowEntries) {
  if (hit.status === 'violation') {
    return hit;
  }
  const text = readFile(rootDir, hit.file);
  const lines = text ? text.split(/\r?\n/) : [];
  const marker = findInlineMarker(lines, Math.max(0, hit.line - 1));
  if (marker) {
    const markerFailures = validateInlineMarker(marker);
    if (markerFailures.length > 0) {
      return {
        ...hit,
        status: 'violation',
        violation: `${hit.file}:${marker.line}: malformed hidden-fallback-ok marker (${markerFailures.join(', ')})`,
      };
    }
    return {
      ...hit,
      status: 'allowed',
      inferredClass: marker.metadata.class,
      owner: marker.metadata.owner,
      removalCondition: marker.metadata.removal,
      testEvidence: marker.metadata.test,
      reason: marker.metadata.reason,
    };
  }

  const allowEntry = allowEntries.find((entry) => entryMatchesHit(entry, hit));
  if (allowEntry) {
    return {
      ...hit,
      status: 'allowed',
      inferredClass: allowEntry.class,
      owner: allowEntry.owner,
      removalCondition: allowEntry.removalCondition,
      testEvidence: allowEntry.testEvidence,
      reason: allowEntry.reason,
    };
  }

  if (hit.requiresClassification) {
    return {
      ...hit,
      status: 'violation',
      violation: `${hit.file}:${hit.line}: unclassified ${hit.kind} (${hit.risk}); add hidden-fallback-ok marker or hidden-fallback-allowlist entry`,
    };
  }

  return {
    ...hit,
    status: 'info',
  };
}

function summarize(hits) {
  return hits.reduce((acc, hit) => {
    const key = `${hit.status}:${hit.risk}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function evaluate(options = {}) {
  const rootDir = options.rootDir || root;
  const allowEntries = options.allowEntries || loadAllowList(options.allowListPath);
  const allowListFailures = validateAllowEntries(allowEntries);
  const files = Array.isArray(options.files)
    ? options.files.map(normalizePath).filter(isGuardedSource)
    : discoverGuardedFiles(rootDir);
  const rawHits = files.flatMap((file) => collectHitsForFile(rootDir, file));
  const hits = rawHits.map((hit) => applyClassification(rootDir, hit, allowEntries));
  const hitFailures = hits
    .filter((hit) => hit.status === 'violation')
    .map((hit) => hit.violation || `${hit.file}:${hit.line}: ${hit.kind}`);
  return {
    failures: [...allowListFailures, ...hitFailures],
    hits,
    summary: summarize(hits),
  };
}

function formatHit(hit) {
  const evidence = hit.status === 'allowed'
    ? ` owner=${hit.owner} removal=${hit.removalCondition} test=${hit.testEvidence}`
    : '';
  return `${hit.status.toUpperCase()} ${hit.risk} ${hit.file}:${hit.line} ${hit.kind} class=${hit.inferredClass}${evidence} :: ${hit.symbol}`;
}

function run() {
  const args = new Set(process.argv.slice(2));
  const result = evaluate();
  if (args.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.has('--report')) {
    console.log('Hidden fallback inventory:');
    for (const hit of result.hits) {
      console.log(`- ${formatHit(hit)}`);
    }
    console.log(`Summary: ${JSON.stringify(result.summary)}`);
  }

  if (result.failures.length > 0 && !args.has('--report')) {
    console.error('Hidden fallback gate failed:');
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  if (!args.has('--json') && !args.has('--report')) {
    console.log('Hidden fallback gate passed.');
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  approvedClasses,
  collectHitsForFile,
  discoverGuardedFiles,
  evaluate,
  loadAllowList,
  run,
  validateAllowEntries,
};
