const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const kernelFile = path.join(root, 'src', 'kernel.ts');

if (!fs.existsSync(kernelFile)) {
  console.error('Kernel DB owner check failed: src/kernel.ts is missing');
  process.exit(1);
}

const content = fs.readFileSync(kernelFile, 'utf8');
const failures = [];

const forbiddenPatterns = [
  { pattern: /siyuanmemo\.db/i, reason: 'kernel companion must not access siyuanmemo.db directly' },
  { pattern: /\/api\/file\/putFile/i, reason: 'kernel companion must not write plugin DB files' },
  { pattern: /\/api\/file\/getFile/i, reason: 'kernel companion must not read plugin DB files directly' },
];

for (const entry of forbiddenPatterns) {
  if (entry.pattern.test(content)) {
    failures.push(entry.reason);
  }
}

if (!/writesSiyuanMemoDb:\s*false/.test(content)) {
  failures.push('kernel capability must declare writesSiyuanMemoDb: false');
}

if (failures.length > 0) {
  console.error('Kernel DB owner check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Kernel DB owner check passed.');
