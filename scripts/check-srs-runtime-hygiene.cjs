#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const mode = process.argv.includes('--dist') ? 'dist' : 'source';

const text = (...codes) => String.fromCharCode(...codes);
const removedTokens = [
  text(115, 109, 50),
  text(115, 109, 53),
  text(115, 109, 56),
  text(115, 109, 49, 53),
  text(115, 109, 49, 56),
  text(115, 109, 49, 57),
  text(115, 109, 50, 48),
  text(115, 109, 45, 50),
  text(115, 109, 45, 53),
  text(115, 109, 45, 56),
  text(115, 109, 45, 49, 53),
  text(115, 109, 45, 49, 56),
  text(115, 109, 45, 49, 57),
  text(115, 109, 45, 50, 48),
  text(115, 117, 112, 101, 114, 109, 101, 109, 111),
  text(102, 115, 114, 115, 118, 53),
];

const sourceTargets = [
  'src/core/scheduler',
  'src/application/services/ArenaKernelService.ts',
  'src/application/services/SrsTransparencyApplicationService.ts',
  'src/application/helpers/srsDisplayLabels.ts',
  'src/application/commands/card/CreateCardCommand.ts',
  'src/application/usecases/card/CreateCardUseCase.ts',
  'src/types/arena.ts',
  'src/types/settings.ts',
  'src/types/card.ts',
  'src/infrastructure/persistence/dto/CardPersistenceDTO.ts',
  'src/core/storage/manager.ts',
  'src/ui/browser/SRSBrowser.vue',
  'src/ui/browser/dialogs/PostponeDialog.vue',
  'src/ui/settings',
  'src/i18n',
  'worker',
  'packages/contracts/src',
];

const sourceExtensions = new Set(['.ts', '.tsx', '.vue', '.json', '.cjs', '.js', '.mjs']);
const distExtensions = new Set(['.js', '.css', '.json', '.html']);
const excludedSegments = new Set(['__tests__', 'docs', 'test', 'tests']);
const skippedFileSuffixes = [
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  '.md',
  '.map',
];

function shouldSkip(filePath) {
  const normalized = filePath.split(path.sep);
  if (normalized.some((part) => excludedSegments.has(part))) {
    return true;
  }
  return skippedFileSuffixes.some((suffix) => filePath.endsWith(suffix));
}

function collectFiles(entry, allowedExtensions, acc = []) {
  if (!fs.existsSync(entry)) {
    return acc;
  }
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(entry)) {
      collectFiles(path.join(entry, child), allowedExtensions, acc);
    }
    return acc;
  }
  if (stat.isFile() && allowedExtensions.has(path.extname(entry)) && !shouldSkip(entry)) {
    acc.push(entry);
  }
  return acc;
}

function isTokenHit(line, token) {
  const lower = line.toLowerCase();
  if (!lower.includes(token)) {
    return false;
  }
  if (/^\s*(\/\/|\*|\/\*)/.test(line)) {
    return false;
  }
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9-])${escaped}([^a-z0-9-]|$)`, 'i').test(line);
}

function scanFiles(files) {
  const violations = [];
  for (const file of files) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    const relativeLower = relative.toLowerCase();
    for (const token of removedTokens) {
      if (relativeLower.includes(token)) {
        violations.push(`${relative}: path contains removed scheduler token "${token}"`);
      }
    }
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const token of removedTokens) {
        if (isTokenHit(line, token)) {
          violations.push(`${relative}:${index + 1}: removed scheduler token "${token}"`);
        }
      }
    });
  }
  return violations;
}

const files = mode === 'dist'
  ? collectFiles(path.join(root, 'dist'), distExtensions)
  : sourceTargets.flatMap((target) => collectFiles(path.join(root, target), sourceExtensions));

if (mode === 'dist' && files.length === 0) {
  console.error('SRS runtime hygiene check failed: dist output missing. Run pnpm build first.');
  process.exit(1);
}

const violations = scanFiles(files);
if (violations.length > 0) {
  console.error(`SRS runtime hygiene check failed (${mode}).`);
  for (const violation of violations.slice(0, 80)) {
    console.error(`- ${violation}`);
  }
  if (violations.length > 80) {
    console.error(`- ... ${violations.length - 80} more`);
  }
  process.exit(1);
}

console.log(`SRS runtime hygiene check passed. mode=${mode} files=${files.length}`);
