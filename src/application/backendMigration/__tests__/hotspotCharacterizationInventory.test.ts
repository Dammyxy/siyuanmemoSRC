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
  'progressive reading': [
    {
      label: 'happy path creates nested excerpt topic with native Riff sync',
      file: 'src/application/services/__tests__/ProgressiveReadingService.test.ts',
      pattern: /creates nested excerpt topics inside excerpt docs with parent lineage and native Riff sync/,
    },
    {
      label: 'native Riff failure rolls back excerpt artifacts',
      file: 'src/application/services/__tests__/ProgressiveReadingService.test.ts',
      pattern: /rolls back new excerpt artifacts when native Riff registration fails/,
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
      label: 'native Riff failure rolls back derived item artifacts',
      file: 'src/application/services/__tests__/TopicDerivedItemService.test.ts',
      pattern: /rolls back the new child doc and local card when native Riff sync fails/,
    },
  ],
  'ai tool write': [
    {
      label: 'happy path creates topic items through continuation service',
      file: 'src/application/services/__tests__/AIFlashcardToolService.test.ts',
      pattern: /creates topic items through the continuation service and exposes preparation metadata/,
    },
    {
      label: 'network proxy unavailable is explicit',
      file: 'src/application/services/__tests__/AIBackendSessionService.test.ts',
      pattern: /rejects network proxy when adapter is unavailable/,
    },
    {
      label: 'backend session unavailable is explicit',
      file: 'src/application/services/__tests__/AIBackendSessionService.test.ts',
      pattern: /surfaces backend unavailable when backend session client fails/,
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
      label: 'aggregate placeholders fail closed',
      file: 'worker/__tests__/BackendKernel.hotspot-command.test.ts',
      pattern: /returns typed unavailable placeholders for aggregate and graph reads/,
    },
  ],
  'neural/semantic graph': [
    {
      label: 'happy path advances NeuralRoam through backend graph query',
      file: 'worker/__tests__/BackendKernel.test.ts',
      pattern: /advances neural-roam through backend graph query and persisted session state/,
    },
    {
      label: 'graph authority unavailable is explicit',
      file: 'worker/__tests__/BackendKernel.test.ts',
      pattern: /returns explicit unavailable when neural-roam graph query authority is absent/,
    },
    {
      label: 'Semantic read models avoid bare ids',
      file: 'worker/__tests__/BackendKernel.test.ts',
      pattern: /serves presentation-ready Semantic session read models without bare ids as primary labels/,
    },
  ],
  'finaldrill riff': [
    {
      label: 'happy path rates through ReviewSiyuanPort',
      file: 'src/ui/review/v2/__tests__/FinalDrillV2Session.characterization.test.ts',
      pattern: /rates native Riff cards through the current ReviewSiyuanPort path/,
    },
    {
      label: 'Riff failure pushes current explicit UI error',
      file: 'src/ui/review/v2/__tests__/FinalDrillV2Session.characterization.test.ts',
      pattern: /pushes the current explicit error when native Riff rating fails/,
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
