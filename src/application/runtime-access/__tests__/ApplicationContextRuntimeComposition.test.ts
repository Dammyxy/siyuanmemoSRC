import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ApplicationContext runtime-access composition', () => {
  const applicationContextSource = readFileSync(
    resolve(process.cwd(), 'src/application/ApplicationContext.ts'),
    'utf8',
  );
  const blockMenuHandlerSource = readFileSync(
    resolve(process.cwd(), 'src/application/managers/BlockMenuHandler.ts'),
    'utf8',
  );
  const reviewBrowserFactorySource = readFileSync(
    resolve(process.cwd(), 'src/application/factories/createReviewBrowserServiceBundle.ts'),
    'utf8',
  );
  const reviewDialogFactorySource = readFileSync(
    resolve(process.cwd(), 'src/application/factories/createUnifiedReviewDialog.ts'),
    'utf8',
  );

  it('removes mutable contextRef and BlockMenu ApplicationContext wiring', () => {
    expect(applicationContextSource).not.toContain('contextRef');
    expect(blockMenuHandlerSource).not.toContain('applicationContext: ApplicationContext');
    expect(blockMenuHandlerSource).not.toContain('setApplicationContext(');
  });

  it('owns all four bounded-context runtime access modules', () => {
    expect(applicationContextSource).toContain('ReviewRuntimeAccess');
    expect(applicationContextSource).toContain('BrowserQueueRuntimeAccess');
    expect(applicationContextSource).toContain('ProgressiveRuntimeAccess');
    expect(applicationContextSource).toContain('IntegrationRuntimeAccess');
  });

  it('keeps Review and Browser factories on explicit runtime members', () => {
    expect(reviewBrowserFactorySource).toContain('runtimeAccess: BrowserQueueRuntimeAccess');
    expect(reviewBrowserFactorySource).toContain('runtimeAccess: ReviewRuntimeAccess');
    expect(reviewBrowserFactorySource).not.toContain('getSrsBackendClient:');
    expect(reviewDialogFactorySource).toContain('runtimeAccess: ReviewRuntimeAccess');
    expect(reviewDialogFactorySource).not.toContain('plugin.getContext');
  });

  it('disposes runtime modules and bootstrap callback ports centrally', () => {
    expect(applicationContextSource).toContain('this.reviewRuntimeAccess.dispose()');
    expect(applicationContextSource).toContain('this.browserQueueRuntimeAccess.dispose()');
    expect(applicationContextSource).toContain('this.progressiveRuntimeAccess.dispose()');
    expect(applicationContextSource).toContain('this.integrationRuntimeAccess.dispose()');
    expect(applicationContextSource).toContain('callbackPort.dispose()');
  });
});
