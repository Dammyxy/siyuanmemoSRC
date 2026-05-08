const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function collectStartupRequiredFiles(distDir) {
  const entryPath = path.join(distDir, 'index.js');
  if (!fs.existsSync(entryPath)) {
    return new Set();
  }

  const source = fs.readFileSync(entryPath, 'utf8');
  const required = new Set();
  const requirePattern = /require\(["']\.\/([^"']+)["']\)/g;
  let match;
  while ((match = requirePattern.exec(source)) !== null) {
    required.add(toPosixPath(match[1]));
  }
  return required;
}

function classifyBundleFile(relativePath, startupRequiredFiles = new Set()) {
  if (relativePath === 'index.js') {
    return 'startup-entry';
  }
  if (startupRequiredFiles.has(relativePath)) {
    return 'startup-required';
  }
  if (relativePath === 'index.css') {
    return 'style';
  }
  if (relativePath.startsWith('chunks/') && relativePath.endsWith('.js')) {
    return 'chunk';
  }
  if (relativePath === 'kernel.js') {
    return 'kernel-companion';
  }
  return 'asset';
}

function collectFiles(rootDir, currentDir = rootDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(rootDir, absolutePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

function collectBundleComposition(distDir = path.resolve(process.cwd(), 'dist')) {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Bundle directory not found: ${distDir}`);
  }

  const startupRequiredFiles = collectStartupRequiredFiles(distDir);
  return collectFiles(distDir)
    .map((absolutePath) => {
      const relativePath = toPosixPath(path.relative(distDir, absolutePath));
      const content = fs.readFileSync(absolutePath);
      return {
        file: relativePath,
        kind: classifyBundleFile(relativePath, startupRequiredFiles),
        bytes: content.byteLength,
        gzipBytes: zlib.gzipSync(content).byteLength,
      };
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        const order = ['startup-entry', 'startup-required', 'style', 'kernel-companion', 'chunk', 'asset'];
        return order.indexOf(a.kind) - order.indexOf(b.kind);
      }
      return b.bytes - a.bytes || a.file.localeCompare(b.file);
    });
}

function formatNumber(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatBundleCompositionTable(rows) {
  const lines = [
    '| Kind | File | Bytes | Gzip bytes |',
    '| --- | --- | ---: | ---: |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.kind} | \`${row.file}\` | ${formatNumber(row.bytes)} | ${formatNumber(row.gzipBytes)} |`);
  }
  return lines.join('\n');
}

if (require.main === module) {
  const distDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(process.cwd(), 'dist');
  const rows = collectBundleComposition(distDir);
  console.log(formatBundleCompositionTable(rows));
}

module.exports = {
  collectBundleComposition,
  formatBundleCompositionTable,
};
