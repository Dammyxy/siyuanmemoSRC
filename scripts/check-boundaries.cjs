const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const srcRoot = path.join(root, 'src');

const sourceExtensions = new Set(['.ts', '.vue']);
const failures = [];

function walk(dir, files = []) {
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

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function addFailure(file, message) {
  failures.push(`${rel(file)}: ${message}`);
}

function isTestFile(relativePath) {
  return /(^|\/)__tests__\//.test(relativePath)
    || /\.(spec|test)\.ts$/.test(relativePath);
}

function isApplicationManagerOrFactory(relativePath) {
  return relativePath.startsWith('src/application/managers/')
    || relativePath.startsWith('src/application/factories/');
}

for (const file of walk(srcRoot)) {
  const relativePath = rel(file);
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('@/') && !text.includes('core/extensions')) {
    continue;
  }

  if (text.includes('@/core/extensions') || text.includes('core/extensions')) {
    addFailure(file, 'deprecated core/extensions import is forbidden');
  }

  if (
    relativePath.startsWith('src/application/')
    && text.includes('@/ui/browser')
    && !isApplicationManagerOrFactory(relativePath)
    && !isTestFile(relativePath)
  ) {
    addFailure(file, 'application browser query/service code must not import @/ui/browser');
  }

  if (
    relativePath.startsWith('src/ui/')
    && text.includes('@/infrastructure/')
    && !isTestFile(relativePath)
  ) {
    addFailure(file, 'UI imports from infrastructure must go through an application factory/port');
  }
}

if (failures.length > 0) {
  console.error('Boundary check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Boundary check passed.');
