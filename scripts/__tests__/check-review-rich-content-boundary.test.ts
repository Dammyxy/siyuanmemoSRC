import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-review-rich-content-boundary.cjs';

const tempDirs: string[] = [];

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolute = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-rich-content-boundary-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-review-rich-content-boundary', () => {
  it('rejects raw html fields on production Review ViewModels and props', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/core/card/quick-card/application/BadRenderService.ts', `
      export interface BadCardViewModel {
        frontHtml: string;
      }
    `);
    writeFile(rootDir, 'src/ui/review/components/BadRenderer.vue', `
      <template><CdfDirectLayout :content-html="html" /></template>
      <script setup lang="ts">
      defineProps<{
        contentHtml?: string;
      }>();
      </script>
    `);

    expect(evaluate({ rootDir })).toEqual(expect.arrayContaining([
      expect.stringContaining('frontHtml'),
      expect.stringContaining('contentHtml'),
      expect.stringContaining('content-html'),
    ]));
  });

  it('allows internal render results and RichContentResult ViewModels', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/core/card/multi-cloze/application/RenderService.ts', `
      import type { RichContentResult } from '@/core/card/common/application/richContent';
      interface InternalRenderResult {
        frontHtml: string;
        backHtml: string;
      }
      export interface GoodCardViewModel {
        frontContent: RichContentResult;
        backContent: RichContentResult;
      }
    `);

    expect(evaluate({ rootDir })).toEqual([]);
  });
});
