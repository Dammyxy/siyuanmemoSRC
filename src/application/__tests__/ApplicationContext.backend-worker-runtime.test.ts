import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ApplicationContext backend worker runtime boundary', () => {
  it('uses browser Worker transport instead of renderer-local BackendKernel construction', () => {
    const sourcePath = resolve(process.cwd(), 'src/application/ApplicationContext.ts');
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain('BrowserSrsBackendWorkerTransport');
    expect(source).toContain("from '@/application/clients/BrowserSrsBackendWorkerTransport'");
    expect(source).toContain('new BrowserSrsBackendWorkerTransport');
    expect(source).not.toContain('new BackendKernel');
    expect(source).not.toContain("from '../../worker/bootstrap/BackendKernel'");
    expect(source).not.toContain("from '../../worker/db/SqliteDatabaseService'");
  });

  it('passes backend Worker health diagnostics into the frontend writer runtime', () => {
    const sourcePath = resolve(process.cwd(), 'src/application/ApplicationContext.ts');
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain('backendWorkerHealth: () =>');
    expect(source).toContain('srsBackendTransport?.getDiagnostics?.()');
    expect(source).toContain("diagnostics.health === 'healthy'");
    expect(source).toContain("diagnostics.health === 'starting'");
  });
});
