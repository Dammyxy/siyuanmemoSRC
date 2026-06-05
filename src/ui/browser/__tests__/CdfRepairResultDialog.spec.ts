import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CdfRepairResultDialog from '../dialogs/CdfRepairResultDialog.vue';

describe('CdfRepairResultDialog', () => {
  it('renders summary counts and expandable details without undo/history controls', async () => {
    const wrapper = mount(CdfRepairResultDialog, {
      props: {
        viewModel: {
          title: 'CDF repair result',
          statusLine: 'Applied 3 changes',
          detailsLabel: 'Details',
          noDetailsLabel: 'No details',
          previewOnlyLabel: 'Preview only',
          summaryItems: [
            { key: 'created', label: 'Created', count: 1 },
            { key: 'paused-orphan', label: 'Paused orphan', count: 1 },
            { key: 'restored', label: 'Restored', count: 1 },
          ],
          detailGroups: [
            {
              key: 'single-source:source-a',
              title: 'Source source-a',
              summary: '3 changes',
              previewOnly: false,
              items: [
                { key: 'create:0', kind: 'created', label: 'Created', text: 'source-a -> concept-a' },
                { key: 'orphan:1', kind: 'paused-orphan', label: 'Paused orphan', text: 'orphan-a' },
              ],
            },
          ],
          actions: [{ id: 'close', label: 'Close' }],
        },
      },
    });

    expect(wrapper.find('[data-testid="browser-cdf-repair-result-dialog"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="browser-cdf-repair-summary-item"]').map((item) => item.text()))
      .toEqual(expect.arrayContaining(['1Created', '1Paused orphan', '1Restored']));
    expect(wrapper.find('details[data-testid="browser-cdf-repair-detail-group"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('source-a -> concept-a');

    const buttons = wrapper.findAll('button').map((button) => button.text());
    expect(buttons).toEqual(['Close']);
    expect(wrapper.text()).not.toMatch(/\b(Undo|History)\b/i);

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
