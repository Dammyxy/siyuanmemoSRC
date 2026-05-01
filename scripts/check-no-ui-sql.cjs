const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const scanRoots = [
  path.join(root, 'src', 'ui'),
  path.join(root, 'src', 'application'),
];
const sourceExtensions = new Set(['.ts', '.vue']);

const sqlPatterns = [
  /from\s+['"]sql\.js['"]/,
];

const runtimeSqliteImportPatterns = [
  /import\s+(?!type\b)[^;]*from\s+['"]@\/infrastructure\/persistence\/sqlite['"]/,
  /import\s+(?!type\b)[^;]*from\s+['"]@\/infrastructure\/persistence\/sqlite\//,
];

const allowList = new Set([
  'src/application/ApplicationContext.ts',
]);

const failures = [];

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

for (const scanRoot of scanRoots) {
  for (const file of walk(scanRoot)) {
    const relativePath = rel(file);
    if (allowList.has(relativePath)) {
      continue;
    }
    if (/\.(test|spec)\.ts$/.test(relativePath)) {
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    let runtimeSqlViolation = false;
    for (const pattern of runtimeSqliteImportPatterns) {
      if (pattern.test(text)) {
        failures.push(`${relativePath}: violates no-ui-sql rule (${pattern})`);
        runtimeSqlViolation = true;
        break;
      }
    }
    if (runtimeSqlViolation) {
      continue;
    }
    for (const pattern of sqlPatterns) {
      if (pattern.test(text)) {
        failures.push(`${relativePath}: violates no-ui-sql rule (${pattern})`);
        break;
      }
    }
  }
}

if (failures.length > 0) {
  console.error('No-UI-SQL boundary check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('No-UI-SQL boundary check passed.');
