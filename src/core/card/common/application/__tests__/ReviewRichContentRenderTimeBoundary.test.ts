import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../../../../../..');
const guardedPrefixes = [
  'src/application/usecases/card',
  'src/application/services/card-editor',
  'src/application/usecases/xiuyuan',
  'src/core/xiuyuan',
  'src/infrastructure/persistence',
];

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
    } else if (/\.(ts|vue)$/u.test(entry.name) && !/\.(test|spec)\.ts$/u.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

function relative(file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}

describe('Review rich-content render-time boundary', () => {
  it('does not persist RichContentResult atoms or diagnostics through Card CRUD, Xiuyuan, or persistence DTOs', () => {
    const offenders: string[] = [];
    for (const prefix of guardedPrefixes) {
      for (const file of walk(path.join(root, prefix))) {
        const text = fs.readFileSync(file, 'utf8');
        if (
          /RichContent(Result|Atom|Diagnostic)\b/u.test(text)
          || /@\/core\/card\/common\/application\/richContent/u.test(text)
        ) {
          offenders.push(relative(file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
