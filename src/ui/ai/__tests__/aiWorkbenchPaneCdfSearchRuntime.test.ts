import { describe, expect, it } from 'vitest';
import { createAiWorkbenchPaneCdfSearchRuntime } from '../aiWorkbenchPaneCdfSearchRuntime';

describe('aiWorkbenchPaneCdfSearchRuntime', () => {
  it('projects CDF search keys, query state, busy flags, errors, and results', () => {
    const runtime = createAiWorkbenchPaneCdfSearchRuntime();
    const key = runtime.key('message-1', 'anchor-1');

    runtime.openKeys.value = [key];
    runtime.busyKeys.value = [key];
    runtime.conceptDocumentBusyKeys.value = [key];
    runtime.errors.value = { [key]: 'search failed' };
    runtime.conceptDocumentErrors.value = { [key]: 'create failed' };
    runtime.resultsByKey.value = { [key]: [{ id: 'doc-1', title: 'Concept' }] as never };
    runtime.setQuery('message-1', 'anchor-1', 'concept');

    expect(runtime.isOpen('message-1', 'anchor-1')).toBe(true);
    expect(runtime.isBusy('message-1', 'anchor-1')).toBe(true);
    expect(runtime.isConceptDocumentBusy('message-1', 'anchor-1')).toBe(true);
    expect(runtime.query('message-1', 'anchor-1')).toBe('concept');
    expect(runtime.error('message-1', 'anchor-1')).toBe('search failed');
    expect(runtime.conceptDocumentError('message-1', 'anchor-1')).toBe('create failed');
    expect(runtime.results('message-1', 'anchor-1')).toEqual([{ id: 'doc-1', title: 'Concept' }]);
  });
});
