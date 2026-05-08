import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('startup lazy surface boundary', () => {
  it('keeps Browser, Review, and AI UI components out of manager static imports', () => {
    const managerSources = [
      'src/application/managers/DialogManager.ts',
      'src/application/managers/TabManager.ts',
    ].map(readSource).join('\n');

    expect(managerSources).not.toMatch(/import\s+SRSBrowser\s+from\s+['"]@\/ui\/browser\/SRSBrowser\.vue['"]/);
    expect(managerSources).not.toMatch(/import\s+AiWorkbench(?:Dialog|Pane)\s+from\s+['"]@\/ui\/ai\/AiWorkbench(?:Dialog|Pane)\.vue['"]/);
    expect(managerSources).not.toMatch(/import\s+\{\s*ReviewView\s*\}\s+from\s+['"]@\/ui\/review\/v2['"]/);
  });

  it('keeps the official SiYuan plugin package shape as one JavaScript file', () => {
    const viteConfig = readSource('vite.config.ts');

    expect(viteConfig).toMatch(/inlineDynamicImports:\s*true/);
    expect(viteConfig).not.toContain('siyuanChunkedPluginEntry');
    expect(viteConfig).not.toContain('patchSiyuanEntryChunkRequires');
    expect(viteConfig).not.toMatch(/chunkFileNames:\s*["']chunks\//);
  });
});
