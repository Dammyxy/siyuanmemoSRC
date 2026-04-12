import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ExcerptRecordCenterDialog from '../ExcerptRecordCenterDialog.vue';

function buildRecord(overrides: Record<string, unknown> = {}) {
  return {
    recordId: 'record-1',
    excerptEntityId: 'excerpt-1',
    excerptEntityType: 'doc',
    sourceDocId: 'doc-1',
    sourceBlockId: 'block-1',
    selectedText: 'Selected excerpt text',
    normalizedFingerprint: 'Selected excerpt text',
    colorToken: 'var(--b3-font-background4)',
    origin: 'editor',
    createdAt: Date.now(),
    status: 'active',
    sourceDocTitle: 'Doc One',
    ...overrides,
  };
}

describe('ExcerptRecordCenterDialog', () => {
  it('shows open records by default and emits row actions', async () => {
    const wrapper = mount(ExcerptRecordCenterDialog, {
      props: {
        state: {
          loading: false,
          records: [
            buildRecord(),
            buildRecord({
              recordId: 'record-2',
              excerptEntityId: 'excerpt-2',
              status: 'archived',
              sourceDocId: 'doc-2',
              sourceDocTitle: 'Doc Two',
            }),
          ],
        },
      },
    });

    const items = wrapper.findAll('.excerpt-record-center__item');
    expect(items).toHaveLength(1);
    expect(items[0].text()).toContain('Selected excerpt text');
    expect(items[0].text()).toContain('Doc One');

    const buttons = wrapper.findAll('button');
    await buttons.find((button) => button.text() === '打开原文')?.trigger('click');
    await buttons.find((button) => button.text() === '打开摘录')?.trigger('click');
    await buttons.find((button) => button.text() === '归档')?.trigger('click');
    await buttons.find((button) => button.text() === '删除')?.trigger('click');

    expect(wrapper.emitted('openSource')).toEqual([['record-1']]);
    expect(wrapper.emitted('openExcerpt')).toEqual([['record-1']]);
    expect(wrapper.emitted('archiveRecord')).toEqual([['record-1']]);
    expect(wrapper.emitted('deleteRecord')).toEqual([['record-1']]);
  });

  it('filters records by archived status and by source document', async () => {
    const wrapper = mount(ExcerptRecordCenterDialog, {
      props: {
        state: {
          loading: false,
          records: [
            buildRecord(),
            buildRecord({
              recordId: 'record-2',
              excerptEntityId: 'excerpt-2',
              sourceDocId: 'doc-2',
              sourceDocTitle: 'Doc Two',
              status: 'archived',
            }),
          ],
        },
      },
    });

    const selects = wrapper.findAll('select');
    await selects[0].setValue('archived');

    let items = wrapper.findAll('.excerpt-record-center__item');
    expect(items).toHaveLength(1);
    expect(items[0].text()).toContain('Doc Two');
    expect(items[0].text()).not.toContain('Doc One');

    await selects[0].setValue('all');
    await selects[1].setValue('doc-1');

    items = wrapper.findAll('.excerpt-record-center__item');
    expect(items).toHaveLength(1);
    expect(items[0].text()).toContain('Doc One');
    expect(items[0].text()).not.toContain('Doc Two');
  });
});
