import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type CoveragePattern = {
  readonly label: string;
  readonly file: string;
  readonly pattern: RegExp;
};

const HOTSPOT_COVERAGE: Record<string, CoveragePattern[]> = {
  'xiuyuan/riff sync': [
    {
      label: 'happy path plans Xiuyuan sync through backend Worker',
      file: 'worker/__tests__/BackendKernel.xiuyuan-sync.test.ts',
      pattern: /plans Xiuyuan sync through backend Worker using the native Riff read proxy/,
    },
    {
      label: 'unavailable native Riff proxy is explicit',
      file: 'worker/__tests__/WorkerXiuyuanSyncPlanner.test.ts',
      pattern: /returns typed unavailable when the native Riff read proxy is absent/,
    },
  ],
  'incremental reading': [
    {
      label: 'happy path creates nested excerpt topic with native Riff sync',
      file: 'src/application/services/__tests__/ProgressiveReadingService.test.ts',
      pattern: /creates nested excerpt topics inside excerpt docs with parent lineage and native Riff sync/,
    },
    {
      label: 'native Riff unavailable keeps local excerpt artifacts',
      file: 'src/application/services/__tests__/ProgressiveReadingService.test.ts',
      pattern: /keeps split piece documents and local cards when native Riff is unavailable/,
    },
    {
      label: 'excerpt foreground path skips native Riff registration',
      file: 'src/application/services/__tests__/ProgressiveReadingService.test.ts',
      pattern: /does not put native Riff registration on the excerpt foreground path/,
    },
  ],
  'topic-derived item': [
    {
      label: 'happy path creates derived items',
      file: 'src/application/services/__tests__/TopicDerivedItemService.test.ts',
      pattern: /creates one derived item per cloze/,
    },
    {
      label: 'settings unavailable is explicit',
      file: 'src/application/services/__tests__/TopicDerivedItemService.test.ts',
      pattern: /fails explicitly when topic derivation storage mode settings cannot be read/,
    },
    {
      label: 'native Riff unavailable keeps topic-derived artifacts',
      file: 'src/application/services/__tests__/TopicDerivedItemService.test.ts',
      pattern: /keeps the new child doc and local card when native Riff is unavailable/,
    },
    {
      label: 'ordinary topic-derived items do not require native Riff',
      file: 'src/application/services/__tests__/TopicDerivedItemService.test.ts',
      pattern: /creates ordinary topic-derived items without a native Riff adapter/,
    },
  ],
  'browser aggregate': [
    {
      label: 'happy path returns backend deck page before source refresh',
      file: 'src/application/services/__tests__/BrowserApplicationService.deck-query.test.ts',
      pattern: /returns backend deck page before background source-existence refresh completes/,
    },
    {
      label: 'stale source refresh is suppressed',
      file: 'src/application/services/__tests__/BrowserApplicationService.deck-query.test.ts',
      pattern: /suppresses stale source refresh results when a newer page refresh starts/,
    },
    {
      label: 'empty aggregate snapshots do not fall back to renderer data',
      file: 'worker/__tests__/BackendKernel.hotspot-command.test.ts',
      pattern: /returns ready-empty Browser aggregate snapshots without renderer fallback/,
    },
  ],
  'neural/semantic graph': [
    {
      label: 'graph query returns presentation models',
      file: 'worker/__tests__/BackendKernel.hotspot-command.test.ts',
      pattern: /serves backend graph query presentation models with limit and content-safe diagnostics/,
    },
    {
      label: 'graph authority unavailable is explicit',
      file: 'worker/__tests__/BackendKernel.hotspot-command.test.ts',
      pattern: /classifies graph query unavailable, missing, and unreadable historical nodes explicitly/,
    },
  ],
  'finaldrill riff': [
    {
      label: 'happy path rates through backend ReviewApplicationService command',
      file: 'src/ui/review/v2/__tests__/FinalDrillV2Session.characterization.test.ts',
      pattern: /rates native Riff cards through the ReviewApplicationService backend command path/,
    },
    {
      label: 'Riff failure pushes explicit UI error',
      file: 'src/ui/review/v2/__tests__/FinalDrillV2Session.characterization.test.ts',
      pattern: /pushes explicit error and does not advance when backend Riff rating fails/,
    },
  ],
  'review source refresh': [
    {
      label: 'happy path refreshes visible content for source transaction',
      file: 'src/ui/review/v2/__tests__/reviewSourceRefreshRuntime.test.ts',
      pattern: /refreshVisibleContent.*source-transaction/s,
    },
    {
      label: 'local advance suppresses pending refresh',
      file: 'src/ui/review/v2/__tests__/ReviewView.source-block-refresh.spec.ts',
      pattern: /drops pending source refresh while local advance is pending/,
    },
  ],
};

function readRepoFile(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath);
  expect(existsSync(absolutePath), `${relativePath} should exist`).toBe(true);
  return readFileSync(absolutePath, 'utf8');
}

describe('backend migration hotspot characterization inventory', () => {
  it('keeps happy-path and unavailable characterization coverage for each runtime hotspot', () => {
    for (const [hotspot, patterns] of Object.entries(HOTSPOT_COVERAGE)) {
      for (const coverage of patterns) {
        const content = readRepoFile(coverage.file);
        expect(
          content,
          `${hotspot}: ${coverage.label} (${coverage.file})`,
        ).toMatch(coverage.pattern);
      }
    }
  });
});
