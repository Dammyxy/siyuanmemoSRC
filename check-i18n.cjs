const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'src');
const I18N_FILES = {
  zh_CN: path.join(SRC_DIR, 'i18n', 'zh_CN.json'),
  en_US: path.join(SRC_DIR, 'i18n', 'en_US.json'),
};

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue']);
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);
const EXCLUDED_FILE_PATTERNS = [
  /[\\/]__tests__[\\/]/,
  /\.(spec|test)\.[^.]+$/i,
  /\.d\.ts$/i,
];

const UI_PROPERTY_RE = /(?:^|[,{])\s*(label|title|text|placeholder|content|description|desc|helperText|ariaLabel|tooltip|confirmText|cancelText|emptyText|summary|noticeTitle|noticeBody)\s*:\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
const T_CALL_RE = /\bt\s*\(\s*(?:(?:this\.[A-Za-z_$][\w$.]*|[A-Za-z_$][\w$.]*)\s*,\s*)?(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1\s*,\s*(["'`])((?:\\[\s\S]|(?!\3)[\s\S])*?)\3/g;
const OPTIONAL_I18N_RE = /(?:\b(?:this|[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*\.i18n|\bi18n)\?\.(\w+(?:\.\w+)*)\s*\|\|\s*(["'`])((?:\\[\s\S]|(?!\2)[\s\S])*?)\2/g;

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
};

const NON_TRANSLATABLE_UI_TOKENS = new Set(['FSRS', 'SiyuanMemo']);

function color(text, ...styles) {
  return `${styles.join('')}${text}${ANSI.reset}`;
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function readUtf8(filePath) {
  return stripBom(fs.readFileSync(filePath, 'utf8'));
}

function readJson(filePath) {
  return JSON.parse(readUtf8(filePath));
}

function collectSourceFiles(dirPath) {
  const result = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectSourceFiles(fullPath));
      continue;
    }

    const extname = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(extname)) {
      continue;
    }

    if (EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(fullPath))) {
      continue;
    }

    result.push(fullPath);
  }

  return result.sort((a, b) => a.localeCompare(b));
}

function flattenMessages(value, prefix, issues, locale) {
  const result = new Map();

  if (typeof value === 'string') {
    result.set(prefix, value);
    return result;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push({
      kind: 'invalid-value',
      key: prefix || '<root>',
      locale,
      detail: `非字符串翻译值 (${typeof value})`,
    });
    return result;
  }

  for (const key of Object.keys(value).sort()) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    const nested = flattenMessages(value[key], nextPrefix, issues, locale);
    for (const [nestedKey, nestedValue] of nested.entries()) {
      result.set(nestedKey, nestedValue);
    }
  }

  return result;
}

function buildLineOffsets(content) {
  const offsets = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

function getLineNumber(offsets, index) {
  let low = 0;
  let high = offsets.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] <= index && (mid === offsets.length - 1 || offsets[mid + 1] > index)) {
      return mid + 1;
    }
    if (offsets[mid] > index) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return 1;
}

function getLineAt(content, lineNumber) {
  const lines = content.split(/\r?\n/);
  return lines[lineNumber - 1] || '';
}

function normalizePath(filePath) {
  return path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
}

function collapseWhitespace(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function truncate(value, maxLength = 140) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function containsCjk(value) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/u.test(value);
}

function decodeStringLiteral(raw, quote) {
  if (quote === '`' && raw.includes('${')) {
    return null;
  }

  let result = '';
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char !== '\\') {
      result += char;
      continue;
    }

    i += 1;
    if (i >= raw.length) {
      result += '\\';
      break;
    }

    const next = raw[i];
    switch (next) {
      case 'n':
        result += '\n';
        break;
      case 'r':
        result += '\r';
        break;
      case 't':
        result += '\t';
        break;
      case 'b':
        result += '\b';
        break;
      case 'f':
        result += '\f';
        break;
      case 'v':
        result += '\v';
        break;
      case '\\':
      case '\'':
      case '"':
      case '`':
        result += next;
        break;
      case '0':
        result += '\0';
        break;
      case 'x': {
        const hex = raw.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          result += String.fromCharCode(Number.parseInt(hex, 16));
          i += 2;
        } else {
          result += `\\x`;
        }
        break;
      }
      case 'u': {
        if (raw[i + 1] === '{') {
          const endIndex = raw.indexOf('}', i + 2);
          if (endIndex !== -1) {
            const codePoint = raw.slice(i + 2, endIndex);
            if (/^[0-9a-fA-F]+$/.test(codePoint)) {
              result += String.fromCodePoint(Number.parseInt(codePoint, 16));
              i = endIndex;
            } else {
              result += `\\u{${codePoint}}`;
              i = endIndex;
            }
          } else {
            result += '\\u{';
          }
        } else {
          const hex = raw.slice(i + 1, i + 5);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            result += String.fromCharCode(Number.parseInt(hex, 16));
            i += 4;
          } else {
            result += '\\u';
          }
        }
        break;
      }
      case '\r':
        if (raw[i + 1] === '\n') {
          i += 1;
        }
        break;
      case '\n':
        break;
      default:
        result += next;
        break;
    }
  }

  return result;
}

function extractPlaceholders(message) {
  const placeholders = new Set();
  const pattern = /\{([a-zA-Z0-9_]+)\}/g;
  let match = pattern.exec(message);

  while (match) {
    placeholders.add(match[1]);
    match = pattern.exec(message);
  }

  return [...placeholders].sort();
}

function resolveMissingLocales(key, zhMessages, enMessages) {
  const missing = [];
  if (!zhMessages.has(key)) {
    missing.push('zh');
  }
  if (!enMessages.has(key)) {
    missing.push('en');
  }
  return missing;
}

function formatMissingLocales(missingLocales) {
  if (missingLocales.length === 2) {
    return 'zh+en';
  }
  if (missingLocales[0] === 'zh') {
    return 'zh';
  }
  return 'en';
}

function looksUiLiteral(value) {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return false;
  }

  if (normalized.length === 1) {
    return false;
  }

  if (NON_TRANSLATABLE_UI_TOKENS.has(normalized)) {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    return false;
  }

  if (/^#[0-9a-fA-F]{3,8}$/.test(normalized)) {
    return false;
  }

  if (/^icon[A-Z][A-Za-z0-9]*$/.test(normalized)) {
    return false;
  }

  if (/^(?:Ctrl|Alt|Shift|Cmd|Del|Enter|Escape|Space|F\d{1,2})(?:\+[A-Za-z0-9]+)*$/.test(normalized)) {
    return false;
  }

  if (/^(?:var\(--|https?:\/\/|\.\/|\/)/.test(normalized)) {
    return false;
  }

  if (/^[a-z][a-z0-9_.-]*$/.test(normalized)) {
    return false;
  }

  return containsCjk(normalized) || /[A-Za-z]/.test(normalized);
}

function looksNonTranslatable(value) {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return true;
  }

  if (!/[A-Za-z]/.test(normalized) && !containsCjk(normalized)) {
    return true;
  }

  return false;
}

function isKnownNonTranslatablePair(value) {
  const normalized = collapseWhitespace(value);
  return (
    normalized === 'SQL'
    || normalized === 'FSRS'
    || /^FSRS v\d+(?:\.\d+)?$/i.test(normalized)
    || /^A-Factor(?:\s*v\d+(?:\.\d+)?)?$/i.test(normalized)
    || /^U-Factor(?:\s*v\d+(?:\.\d+)?)?$/i.test(normalized)
  );
}

function scanMissingTKeys(files, zhMessages, enMessages) {
  const issues = [];
  const suggestions = new Map();

  for (const filePath of files) {
    const content = readUtf8(filePath);
    const lineOffsets = buildLineOffsets(content);
    let match = T_CALL_RE.exec(content);

    while (match) {
      const key = decodeStringLiteral(match[2], match[1]);
      const fallback = decodeStringLiteral(match[4], match[3]);
      if (!key || !fallback) {
        match = T_CALL_RE.exec(content);
        continue;
      }

      const missingLocales = resolveMissingLocales(key, zhMessages, enMessages);
      if (!missingLocales.length) {
        match = T_CALL_RE.exec(content);
        continue;
      }

      const lineNumber = getLineNumber(lineOffsets, match.index);
      issues.push({
        filePath: normalizePath(filePath),
        lineNumber,
        key,
        fallback: collapseWhitespace(fallback),
        missingIn: formatMissingLocales(missingLocales),
      });

      if (!suggestions.has(key)) {
        suggestions.set(key, {
          fallback: collapseWhitespace(fallback),
          missingIn: formatMissingLocales(missingLocales),
        });
      }

      match = T_CALL_RE.exec(content);
    }

    T_CALL_RE.lastIndex = 0;
  }

  return { issues, suggestions };
}

function scanOptionalI18nFallbacks(files, zhMessages, enMessages) {
  const issues = [];
  const suggestions = new Map();

  for (const filePath of files) {
    const content = readUtf8(filePath);
    const lineOffsets = buildLineOffsets(content);
    let match = OPTIONAL_I18N_RE.exec(content);

    while (match) {
      const key = match[1];
      const fallback = decodeStringLiteral(match[3], match[2]);
      if (!fallback) {
        match = OPTIONAL_I18N_RE.exec(content);
        continue;
      }

      const missingLocales = resolveMissingLocales(key, zhMessages, enMessages);
      if (!missingLocales.length) {
        match = OPTIONAL_I18N_RE.exec(content);
        continue;
      }

      const lineNumber = getLineNumber(lineOffsets, match.index);
      issues.push({
        filePath: normalizePath(filePath),
        lineNumber,
        key,
        fallback: collapseWhitespace(fallback),
        missingIn: formatMissingLocales(missingLocales),
      });

      if (!suggestions.has(key)) {
        suggestions.set(key, {
          fallback: collapseWhitespace(fallback),
          missingIn: formatMissingLocales(missingLocales),
        });
      }

      match = OPTIONAL_I18N_RE.exec(content);
    }

    OPTIONAL_I18N_RE.lastIndex = 0;
  }

  return { issues, suggestions };
}

function scanHardcodedUiStrings(files) {
  const issues = [];

  for (const filePath of files) {
    const content = readUtf8(filePath);
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmedLine = line.trim();
      if (
        trimmedLine.startsWith('//')
        || trimmedLine.startsWith('/*')
        || trimmedLine.startsWith('*/')
        || trimmedLine.startsWith('*')
      ) {
        continue;
      }

      if (line.includes('i18nKey:')) {
        continue;
      }

      let match = UI_PROPERTY_RE.exec(line);

      while (match) {
        const propertyName = match[1];
        const value = decodeStringLiteral(match[3], match[2]);
        if (!value) {
          match = UI_PROPERTY_RE.exec(line);
          continue;
        }

        const normalizedValue = collapseWhitespace(value);
        if (!looksUiLiteral(normalizedValue)) {
          match = UI_PROPERTY_RE.exec(line);
          continue;
        }

        issues.push({
          filePath: normalizePath(filePath),
          lineNumber: index + 1,
          propertyName,
          value: truncate(normalizedValue),
          code: truncate(collapseWhitespace(line)),
        });

        match = UI_PROPERTY_RE.exec(line);
      }

      UI_PROPERTY_RE.lastIndex = 0;
    }
  }

  return issues;
}

function findLocaleAnomalies(zhMessages, enMessages, baseIssues) {
  const issues = [...baseIssues];
  const allKeys = [...new Set([...zhMessages.keys(), ...enMessages.keys()])].sort();

  for (const key of allKeys) {
    const zhValue = zhMessages.get(key);
    const enValue = enMessages.get(key);
    if (typeof zhValue !== 'string' || typeof enValue !== 'string') {
      continue;
    }

    if (!zhValue.trim()) {
      issues.push({
        kind: 'empty-translation',
        key,
        reason: 'zh 值为空',
        zhValue,
        enValue,
      });
    }

    if (!enValue.trim()) {
      issues.push({
        kind: 'empty-translation',
        key,
        reason: 'en 值为空',
        zhValue,
        enValue,
      });
    }

    const zhPlaceholders = extractPlaceholders(zhValue);
    const enPlaceholders = extractPlaceholders(enValue);
    if (zhPlaceholders.join(',') !== enPlaceholders.join(',')) {
      issues.push({
        kind: 'placeholder-mismatch',
        key,
        reason: `占位符不一致: zh={${zhPlaceholders.join(', ')}} / en={${enPlaceholders.join(', ')}}`,
        zhValue,
        enValue,
      });
    }

    if (containsCjk(enValue)) {
      issues.push({
        kind: 'en-contains-chinese',
        key,
        reason: 'en 值混入中文',
        zhValue,
        enValue,
      });
    }

    if (zhValue === enValue && !looksNonTranslatable(zhValue) && !isKnownNonTranslatablePair(zhValue)) {
      issues.push({
        kind: 'zh-untranslated',
        key,
        reason: 'zh 值与 en 相同，可能未翻译',
        zhValue,
        enValue,
      });
    }
  }

  return issues;
}

function findAsymmetricKeys(zhMessages, enMessages) {
  const issues = [];
  const allKeys = [...new Set([...zhMessages.keys(), ...enMessages.keys()])].sort();

  for (const key of allKeys) {
    const inZh = zhMessages.has(key);
    const inEn = enMessages.has(key);
    if (inZh && inEn) {
      continue;
    }

    issues.push({
      key,
      missingIn: inZh ? 'en_US' : 'zh_CN',
      zhValue: zhMessages.get(key),
      enValue: enMessages.get(key),
    });
  }

  return issues;
}

function printSection(title, count, colorName, printDetails) {
  const palette = ANSI[colorName] || '';
  console.log(color(`[${title.code}] ${title.text} (${count} 处)`, palette, ANSI.bold));
  if (!count) {
    console.log('  ✓ 无问题');
    console.log('');
    return;
  }

  printDetails();
  console.log('');
}

function printMissingKeyIssues(issues) {
  for (const issue of issues) {
    console.log(`  ${issue.filePath}:${issue.lineNumber}`);
    console.log(`    key: "${issue.key}"  fallback: "${issue.fallback}"  缺失于 ${issue.missingIn}`);
    console.log(`    建议: 在 ${issue.missingIn} 文件中添加 "${issue.key}" 的翻译`);
  }
}

function printHardcodedUiIssues(issues) {
  for (const issue of issues) {
    console.log(`  ${issue.filePath}:${issue.lineNumber}`);
    console.log(`    值: "${issue.value}"`);
    console.log(`    代码: ${issue.code}`);
  }
}

function printLocaleAnomalyIssues(issues) {
  for (const issue of issues) {
    console.log(`  key: "${issue.key}"  (${issue.reason})`);
    if (typeof issue.zhValue === 'string') {
      console.log(`    zh_CN: "${truncate(collapseWhitespace(issue.zhValue), 180)}"`);
    }
    if (typeof issue.enValue === 'string') {
      console.log(`    en_US: "${truncate(collapseWhitespace(issue.enValue), 180)}"`);
    }
  }
}

function printAsymmetricKeyIssues(issues) {
  for (const issue of issues) {
    console.log(`  key: "${issue.key}"  缺失于 ${issue.missingIn}`);
    if (typeof issue.zhValue === 'string') {
      console.log(`    zh_CN: "${truncate(collapseWhitespace(issue.zhValue), 180)}"`);
    }
    if (typeof issue.enValue === 'string') {
      console.log(`    en_US: "${truncate(collapseWhitespace(issue.enValue), 180)}"`);
    }
  }
}

function printSummary(sectionCounts, blockingIssueCount) {
  const total = Object.values(sectionCounts).reduce((sum, count) => sum + count, 0);
  console.log('────────────────────────────────────────────────────────────');
  console.log(color('汇总', ANSI.bold));
  console.log(`  [A] t() key 缺失导致 fallback:     ${sectionCounts.A === 0 ? color(String(sectionCounts.A), ANSI.green) : color(String(sectionCounts.A), ANSI.red) } 处`);
  console.log(`  [B] i18n?.key 缺失导致 fallback:   ${sectionCounts.B === 0 ? color(String(sectionCounts.B), ANSI.green) : color(String(sectionCounts.B), ANSI.red) } 处`);
  console.log(`  [C] 硬编码 UI 字符串:              ${sectionCounts.C === 0 ? color(String(sectionCounts.C), ANSI.green) : color(String(sectionCounts.C), ANSI.yellow) } 处`);
  console.log(`  [D] i18n 文件内容异常:             ${sectionCounts.D === 0 ? color(String(sectionCounts.D), ANSI.green) : color(String(sectionCounts.D), ANSI.yellow) } 处`);
  console.log(`  [E] key 不对称:                    ${sectionCounts.E === 0 ? color(String(sectionCounts.E), ANSI.green) : color(String(sectionCounts.E), ANSI.cyan) } 处`);
  console.log('  ──────────────────────────────');
  const totalColor = total === 0 ? ANSI.green : (blockingIssueCount === 0 ? ANSI.yellow : ANSI.red);
  const blockingColor = blockingIssueCount === 0 ? ANSI.green : ANSI.red;
  console.log(`  合计: ${color(`${total} 处提示`, totalColor, ANSI.bold)}`);
  console.log(`  阻断问题: ${color(`${blockingIssueCount} 处`, blockingColor, ANSI.bold)}`);
  console.log('');
}

function isBlockingLocaleAnomaly(issue) {
  return (
    issue.kind === 'invalid-value'
    || issue.kind === 'empty-translation'
    || issue.kind === 'placeholder-mismatch'
  );
}

function ensureI18nFilesExist() {
  const missingFiles = [];
  for (const [locale, filePath] of Object.entries(I18N_FILES)) {
    if (!fs.existsSync(filePath)) {
      missingFiles.push(`${locale}: ${path.relative(ROOT_DIR, filePath)}`);
    }
  }

  if (missingFiles.length) {
    console.error(color('[i18n-check] 缺少 i18n 文件:', ANSI.red, ANSI.bold));
    for (const file of missingFiles) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }
}

function main() {
  ensureI18nFilesExist();

  let zhJson;
  let enJson;

  try {
    zhJson = readJson(I18N_FILES.zh_CN);
  } catch (error) {
    console.error(color(`[i18n-check] 读取 zh_CN.json 失败: ${error instanceof Error ? error.message : String(error)}`, ANSI.red, ANSI.bold));
    process.exit(1);
  }

  try {
    enJson = readJson(I18N_FILES.en_US);
  } catch (error) {
    console.error(color(`[i18n-check] 读取 en_US.json 失败: ${error instanceof Error ? error.message : String(error)}`, ANSI.red, ANSI.bold));
    process.exit(1);
  }

  const baseLocaleIssues = [];
  const zhMessages = flattenMessages(zhJson, '', baseLocaleIssues, 'zh_CN');
  const enMessages = flattenMessages(enJson, '', baseLocaleIssues, 'en_US');

  const sourceFiles = collectSourceFiles(SRC_DIR);
  const missingTKeys = scanMissingTKeys(sourceFiles, zhMessages, enMessages);
  const optionalFallbacks = scanOptionalI18nFallbacks(sourceFiles, zhMessages, enMessages);
  const hardcodedUiStrings = scanHardcodedUiStrings(sourceFiles);
  const localeAnomalies = findLocaleAnomalies(zhMessages, enMessages, baseLocaleIssues);
  const asymmetricKeys = findAsymmetricKeys(zhMessages, enMessages);

  printSection(
    { code: 'A', text: 't() fallback 触发 — key 不在 i18n 文件中，运行时显示 fallback 英文' },
    missingTKeys.issues.length,
    'red',
    () => printMissingKeyIssues(missingTKeys.issues),
  );

  printSection(
    { code: 'B', text: 'i18n?.key || fallback — key 不存在，运行时显示硬编码文字' },
    optionalFallbacks.issues.length,
    'red',
    () => printMissingKeyIssues(optionalFallbacks.issues),
  );

  printSection(
    { code: 'C', text: '硬编码 UI 字符串 — 完全绕过 i18n，语言切换无效' },
    hardcodedUiStrings.length,
    'yellow',
    () => printHardcodedUiIssues(hardcodedUiStrings),
  );

  printSection(
    { code: 'D', text: 'i18n 文件内容异常 — en 混入中文 / zh 未翻译' },
    localeAnomalies.length,
    'yellow',
    () => printLocaleAnomalyIssues(localeAnomalies),
  );

  printSection(
    { code: 'E', text: 'i18n key 不对称 — 一个文件有另一个没有' },
    asymmetricKeys.length,
    'cyan',
    () => printAsymmetricKeyIssues(asymmetricKeys),
  );

  const sectionCounts = {
    A: missingTKeys.issues.length,
    B: optionalFallbacks.issues.length,
    C: hardcodedUiStrings.length,
    D: localeAnomalies.length,
    E: asymmetricKeys.length,
  };
  const blockingIssueCount = (
    sectionCounts.A
    + sectionCounts.B
    + sectionCounts.E
    + localeAnomalies.filter(isBlockingLocaleAnomaly).length
  );
  printSummary(sectionCounts, blockingIssueCount);

  const suggestionMap = new Map([
    ...missingTKeys.suggestions.entries(),
    ...optionalFallbacks.suggestions.entries(),
  ]);

  if (suggestionMap.size) {
    const orderedSuggestions = {};
    for (const key of [...suggestionMap.keys()].sort()) {
      orderedSuggestions[key] = suggestionMap.get(key);
    }
    console.log(color('需要添加到 i18n 文件的 key（建议翻译）:', ANSI.bold));
    console.log(JSON.stringify(orderedSuggestions, null, 2));
  }

  if (blockingIssueCount > 0) {
    process.exitCode = 1;
  }
}

main();
