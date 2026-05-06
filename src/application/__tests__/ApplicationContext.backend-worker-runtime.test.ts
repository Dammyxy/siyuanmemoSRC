import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ApplicationContext backend worker runtime boundary', () => {
  it('uses browser Worker transport instead of renderer-local BackendKernel construction', () => {
    const sourcePath = resolve(process.cwd(), 'src/application/ApplicationContext.ts');
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain("import { BrowserSrsBackendWorkerTransport }");
    expect(source).toContain('new BrowserSrsBackendWorkerTransport');
    expect(source).not.toContain('new BackendKernel');
    expect(source).not.toContain("from '../../worker/bootstrap/BackendKernel'");
    expect(source).not.toContain("from '../../worker/db/SqliteDatabaseService'");
  });
});
