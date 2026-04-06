import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ProgressiveSplitDialog from '../ProgressiveSplitDialog.vue';

describe('ProgressiveSplitDialog', () => {
  it('keeps config validation active when no markers are selected', async () => {
    const wrapper = mount(ProgressiveSplitDialog, {
      props: {
        initialConfig: {
          horizontalRule: false,
          headingLevels: [],
          customStringEnabled: false,
          customString: '',
        },
      },
    });

    const confirmButton = wrapper.findAll('button').find((button) => button.text().includes('确认'));
    expect(confirmButton?.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('至少选择一个切割标记');
  });

  it('renders running progress details and emits cancel while running', async () => {
    const wrapper = mount(ProgressiveSplitDialog, {
      props: {
        progressState: {
          status: 'running',
          progress: {
            phase: 'createDocs',
            current: 2,
            total: 5,
            percentage: 48,
            message: 'Creating piece documents',
            currentTitle: '02 Intro/01 Detail',
            createdDocCount: 2,
            createdCardCount: 0,
          },
        },
      },
    });

    expect(wrapper.text()).toContain('48%');
    expect(wrapper.text()).toContain('创建子文档');
    expect(wrapper.text()).toContain('2/5');
    expect(wrapper.text()).toContain('02 Intro/01 Detail');

    await wrapper.find('.progressive-split-dialog__cancel-running').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('shows cancelling state as disabled progress UI', async () => {
    const wrapper = mount(ProgressiveSplitDialog, {
      props: {
        progressState: {
          status: 'cancelling',
          progress: {
            phase: 'cleanup',
            current: 1,
            total: 2,
            percentage: 98,
            message: 'Cleaning up cancelled split',
            currentTitle: 'piece-1',
            createdDocCount: 1,
            createdCardCount: 0,
          },
        },
      },
    });

    const cancelButton = wrapper.find('.progressive-split-dialog__cancel-running');
    expect(wrapper.text()).toContain('正在取消并清理');
    expect(cancelButton.attributes('disabled')).toBeDefined();
  });
});
