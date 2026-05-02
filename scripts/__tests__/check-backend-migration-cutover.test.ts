import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-backend-migration-cutover.cjs';

const tempDirs: string[] = [];

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolute = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutover-check-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-backend-migration-cutover', () => {
  it('passes when behavior checks are clean and gates are consumed', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/usecases/review/ReviewCommitUseCase.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/services/BrowserApplicationService.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/handlers/AutoCardHandler.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/services/AIWorkbenchPromptRuntime.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/clients/PrivateApiClient.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/backendMigration/ownershipMap.ts', `
      export const BACKEND_MIGRATION_FEATURE_GATES = {
        autocardDecisionRelay: 'VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY',
        autocardExecuteRelay: 'VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER',
      };
    `);
    writeFile(rootDir, 'src/application/backendMigration/featureGateMatrix.ts', 'export const BACKEND_FEATURE_GATE_MATRIX = [];\n');
    writeFile(rootDir, 'src/application/backendMigration/runtimePolicy.ts', `
      import { BACKEND_MIGRATION_FEATURE_GATES } from './ownershipMap';
      const a = BACKEND_MIGRATION_FEATURE_GATES.autocardDecisionRelay;
      const b = BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay;
      export const runtime = { a, b };
    `);
    writeFile(rootDir, 'src/application/ApplicationContext.ts', 'export class ApplicationContext { private x = "PrivateApiService"; }\n');

    expect(evaluate({ rootDir, allowEntries: [] })).toEqual([]);
  });

  it('fails on real fallback and bypass patterns without allowlist', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/usecases/review/ReviewCommitUseCase.ts', 'this.deps.scheduler.commit(card, rating);\n');
    writeFile(rootDir, 'src/application/services/BrowserApplicationService.ts', 'logger.debug("Worker deck page query failed; falling back to SQL/legacy snapshot");\n');
    writeFile(rootDir, 'src/application/handlers/AutoCardHandler.ts', `
      if (runtime.getMode() === 'follower') {
        return backendClient.executeAutoCard(request);
      }
    `);
    writeFile(rootDir, 'src/application/services/AIWorkbenchPromptRuntime.ts', 'return this.deps.llmPort.chat({});\n');
    writeFile(rootDir, 'src/application/clients/PrivateApiClient.ts', `
      if (runtime.getMode() === 'follower') {
        return backendClient.privateCommand(request);
      }
    `);
    writeFile(rootDir, 'src/application/backendMigration/ownershipMap.ts', `
      export const BACKEND_MIGRATION_FEATURE_GATES = {
        autocardDecisionRelay: 'VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY',
      };
    `);
    writeFile(rootDir, 'src/application/backendMigration/featureGateMatrix.ts', 'export const BACKEND_FEATURE_GATE_MATRIX = [];\n');
    writeFile(rootDir, 'src/application/ApplicationContext.ts', 'export class ApplicationContext {}\n');

    const failures = evaluate({ rootDir, allowEntries: [] });
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('ReviewCommitUseCase.ts'),
      expect.stringContaining('BrowserApplicationService.ts'),
      expect.stringContaining('AutoCardHandler.ts'),
      expect.stringContaining('AIWorkbenchPromptRuntime.ts'),
      expect.stringContaining('PrivateApiClient.ts'),
      expect.stringContaining('feature gate autocardDecisionRelay'),
      expect.stringContaining('Private API runtime service/client wiring is missing'),
    ]));
  });

  it('supports allowlisted compatibility fallback and foundation-only status', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/usecases/review/ReviewCommitUseCase.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/services/BrowserApplicationService.ts', 'logger.debug("falling back to SQL/legacy");\n');
    writeFile(rootDir, 'src/application/handlers/AutoCardHandler.ts', `
      if (runtime.getMode() === 'follower') {
        return backendClient.executeAutoCard(request);
      }
    `);
    writeFile(rootDir, 'src/application/services/AIWorkbenchPromptRuntime.ts', 'return this.deps.llmPort.chat({});\n');
    writeFile(rootDir, 'src/application/clients/PrivateApiClient.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/backendMigration/ownershipMap.ts', `
      export const BACKEND_MIGRATION_FEATURE_GATES = {
        autocardDecisionRelay: 'VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY',
      };
    `);
    writeFile(rootDir, 'src/application/backendMigration/featureGateMatrix.ts', 'export const BACKEND_FEATURE_GATE_MATRIX = [];\n');
    writeFile(rootDir, 'src/application/backendMigration/runtimePolicy.ts', `
      import { BACKEND_MIGRATION_FEATURE_GATES } from './ownershipMap';
      const a = BACKEND_MIGRATION_FEATURE_GATES.autocardDecisionRelay;
      export const runtime = { a };
    `);
    writeFile(rootDir, 'src/application/ApplicationContext.ts', 'export class ApplicationContext {}\n');

    const allowEntries = [
      {
        id: 'allow-browser-fallback',
        checker: 'check-backend-migration-cutover',
        file: 'src/application/services/BrowserApplicationService.ts',
        kind: 'browser-sql-fallback',
        symbolPattern: 'falling back to SQL/legacy',
        owner: 'compatibility-read',
        reason: 'temporary compatibility read',
        removalCondition: 'remove later',
        trackingTask: 'RM019',
      },
      {
        id: 'allow-ai-foundation',
        checker: 'check-backend-migration-cutover',
        file: 'src/application/services/AIWorkbenchPromptRuntime.ts',
        kind: 'ai-frontend-llm-call',
        symbolPattern: 'llmPort.chat(',
        owner: 'foundation-only',
        reason: 'temporary foundation status',
        removalCondition: 'remove later',
        trackingTask: 'RM031',
      },
      {
        id: 'allow-private-unwired',
        checker: 'check-backend-migration-cutover',
        file: 'src/application/ApplicationContext.ts',
        kind: 'private-api-unwired',
        symbolPattern: 'missing PrivateApiService wiring',
        owner: 'foundation-only',
        reason: 'temporary foundation status',
        removalCondition: 'remove later',
        trackingTask: 'RM036',
      },
    ];

    const failures = evaluate({ rootDir, allowEntries });
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('AutoCardHandler.ts'),
    ]));
    expect(failures).not.toEqual(expect.arrayContaining([
      expect.stringContaining('BrowserApplicationService.ts'),
      expect.stringContaining('AIWorkbenchPromptRuntime.ts'),
      expect.stringContaining('Private API runtime service/client wiring is missing'),
    ]));
  });

  it('does not allow a different cutover marker in the same file and violation kind', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/usecases/review/ReviewCommitUseCase.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/services/BrowserApplicationService.ts', 'logger.debug("falling back to SQL/legacy");\n');
    writeFile(rootDir, 'src/application/handlers/AutoCardHandler.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/services/AIWorkbenchPromptRuntime.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/clients/PrivateApiClient.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/backendMigration/ownershipMap.ts', `export const BACKEND_MIGRATION_FEATURE_GATES = {};\n`);
    writeFile(rootDir, 'src/application/backendMigration/featureGateMatrix.ts', 'export const BACKEND_FEATURE_GATE_MATRIX = [];\n');
    writeFile(rootDir, 'src/application/ApplicationContext.ts', 'export class ApplicationContext { private x = "PrivateApiService"; }\n');

    const failures = evaluate({
      rootDir,
      allowEntries: [{
        id: 'wrong-cutover-symbol',
        checker: 'check-backend-migration-cutover',
        file: 'src/application/services/BrowserApplicationService.ts',
        kind: 'browser-sql-fallback',
        symbolPattern: 'llmPort.chat(',
        owner: 'compatibility-read',
        reason: 'temporary',
        removalCondition: 'remove later',
        trackingTask: 'RM019',
      }],
    });

    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('BrowserApplicationService.ts'),
    ]));
  });
});
