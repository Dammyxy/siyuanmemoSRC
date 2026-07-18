import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-foreign-epoch-recovery-boundary.cjs';

const tempDirs: string[] = [];

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foreign-epoch-boundary-'));
  tempDirs.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe('check-foreign-epoch-recovery-boundary', () => {
  it('accepts the production recovery boundary', () => {
    expect(evaluate()).toEqual([]);
  });

  it('rejects implicit UI apply, raw RPC apply, and generic Frontier recovery', () => {
    const root = fixtureRoot();
    write(root, 'src/ui/review/ReviewView.ts', 'backend.foreignEpochRecoveryApply(request);');
    write(root, 'src/application/services/StartupMaintenance.ts', "rpc.call('recovery.foreignEpoch.apply', request);");
    write(root, 'worker/db/GenericMaintenance.ts', 'frontier.recoverFromVerifiedForeignEpochCoverage(input);');

    expect(evaluate({ rootDir: root })).toEqual(expect.arrayContaining([
      expect.stringContaining('recovery-apply-facade'),
      expect.stringContaining('raw-recovery-apply-rpc'),
      expect.stringContaining('frontier-recovery-transition'),
    ]));
  });
});
