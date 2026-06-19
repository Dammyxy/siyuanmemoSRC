const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const forbiddenFields = ['frontHtml', 'backHtml', 'contentHtml', 'questionHtml'];
const sourceExtensions = new Set(['.ts', '.vue']);
const guardedPrefixes = [
  'src/core/card/',
  'src/ui/review/',
  'src/ui/shared/cdf-direct/',
];

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

function isTestFile(relativePath) {
  return /(^|\/)__tests__\//.test(relativePath)
    || /\.(spec|test)\.ts$/.test(relativePath);
}

function isGuardedFile(relativePath) {
  const normalized = normalizePath(relativePath);
  return guardedPrefixes.some(prefix => normalized.startsWith(prefix))
    && !isTestFile(normalized);
}

function readProductionFiles(rootDir) {
  const srcRoot = path.join(rootDir, 'src');
  return walk(srcRoot)
    .map(file => ({
      absolutePath: file,
      relativePath: normalizePath(path.relative(rootDir, file)),
    }))
    .filter(file => isGuardedFile(file.relativePath));
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function collectViewModelBlocks(text) {
  const blocks = [];
  const declarationPattern = /\bexport\s+(?:interface|type)\s+([A-Za-z0-9_]*ViewModel)\b/g;
  let match = declarationPattern.exec(text);
  while (match) {
    const declarationStart = match.index;
    const bodyStart = text.indexOf('{', declarationStart);
    if (bodyStart === -1) {
      match = declarationPattern.exec(text);
      continue;
    }

    let depth = 0;
    let bodyEnd = bodyStart;
    for (let index = bodyStart; index < text.length; index += 1) {
      const char = text[index];
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          bodyEnd = index + 1;
          break;
        }
      }
    }

    blocks.push({
      name: match[1],
      start: declarationStart,
      text: text.slice(declarationStart, bodyEnd),
    });
    match = declarationPattern.exec(text);
  }
  return blocks;
}

function collectVuePropBlocks(text) {
  const blocks = [];
  const declarationPattern = /defineProps\s*<\s*{/g;
  let match = declarationPattern.exec(text);
  while (match) {
    const bodyStart = text.indexOf('{', match.index);
    if (bodyStart === -1) {
      match = declarationPattern.exec(text);
      continue;
    }

    let depth = 0;
    let bodyEnd = bodyStart;
    for (let index = bodyStart; index < text.length; index += 1) {
      const char = text[index];
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          bodyEnd = index + 1;
          break;
        }
      }
    }

    blocks.push({
      name: 'defineProps',
      start: match.index,
      text: text.slice(match.index, bodyEnd),
    });
    match = declarationPattern.exec(text);
  }
  return blocks;
}

function collectTemplateBindings(text) {
  const blocks = [];
  const bindingPattern = /(?:^|\s):?(front-html|back-html|content-html|question-html)\s*=/g;
  let match = bindingPattern.exec(text);
  while (match) {
    blocks.push({
      name: 'template-binding',
      field: match[1],
      start: match.index,
      text: match[0],
    });
    match = bindingPattern.exec(text);
  }
  return blocks;
}

function findForbiddenFields(blockText) {
  return forbiddenFields.filter((field) => {
    const pattern = new RegExp(`\\b${field}\\s*[?:]`, 'u');
    return pattern.test(blockText);
  });
}

function evaluate(options = {}) {
  const rootDir = options.rootDir || root;
  const files = Array.isArray(options.files)
    ? options.files.map(file => ({
        absolutePath: path.join(rootDir, file),
        relativePath: normalizePath(file),
      })).filter(file => isGuardedFile(file.relativePath))
    : readProductionFiles(rootDir);

  const failures = [];
  for (const file of files) {
    if (!fs.existsSync(file.absolutePath)) {
      continue;
    }
    const text = fs.readFileSync(file.absolutePath, 'utf8');
    const blocks = [
      ...collectViewModelBlocks(text),
      ...collectVuePropBlocks(text),
    ];

    for (const block of blocks) {
      for (const field of findForbiddenFields(block.text)) {
        failures.push(`${file.relativePath}:${lineNumberAt(text, block.start)}: ${block.name} exposes raw Review HTML field "${field}"; use RichContentResult instead`);
      }
    }

    for (const binding of collectTemplateBindings(text)) {
      failures.push(`${file.relativePath}:${lineNumberAt(text, binding.start)}: template passes raw Review HTML binding "${binding.field}"; pass RichContentResult instead`);
    }
  }

  return failures;
}

function run() {
  const failures = evaluate();
  if (failures.length > 0) {
    console.error('Review rich-content boundary check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Review rich-content boundary check passed.');
}

if (require.main === module) {
  run();
}

module.exports = {
  evaluate,
};
