import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReviewEditableTargetsPanel from '../components/ReviewEditableTargetsPanel.vue';

describe('ReviewEditableTargetsPanel', () => {
  it('keeps plain Enter inside multiline fields and reserves Ctrl/Meta+Enter for save', async () => {
    const wrapper = mount(ReviewEditableTargetsPanel, {
      props: {
        open: true,
        title: 'Edit fields',
        entries: [{
          target: {
            id: 'field-target',
            blockId: 'block-1',
            title: 'Answer',
            role: 'current-content',
            rendererKind: 'main-protyle',
            sourceKind: 'block-markdown',
          },
          value: 'Line one',
          originalValue: 'Line one',
        }],
        readonly: false,
        confirmDisabled: false,
        confirmLabel: 'Save',
        cancelLabel: 'Cancel',
      },
    });

    const textarea = wrapper.get('textarea');
    const plainEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    const plainEnterWasNotPrevented = textarea.element.dispatchEvent(plainEnter);

    expect(plainEnterWasNotPrevented).toBe(true);
    expect(wrapper.emitted('confirm')).toBeUndefined();

    await textarea.setValue('Line one\nLine two');
    expect(wrapper.emitted('update-target')?.at(-1)).toEqual([
      'field-target',
      'Line one\nLine two',
    ]);

    await textarea.trigger('keydown', {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('shows field-level save errors without clearing the draft', () => {
    const wrapper = mount(ReviewEditableTargetsPanel, {
      props: {
        open: true,
        title: 'Edit fields',
        entries: [{
          target: {
            id: 'answer-target',
            blockId: 'block-1',
            title: 'Answer',
            role: 'current-content',
            rendererKind: 'main-protyle',
            sourceKind: 'block-markdown',
          },
          value: 'Draft answer',
          originalValue: 'Original answer',
          saveError: 'write failed',
        }],
        readonly: false,
        confirmDisabled: false,
        confirmLabel: 'Save',
        cancelLabel: 'Cancel',
      },
    });

    expect(wrapper.get('textarea').element.value).toBe('Draft answer');
    expect(wrapper.get('[role="alert"]').text()).toBe('write failed');
    expect(wrapper.get('.review-editable-targets-panel__dirty').text()).toBe('已修改');
  });

  it('shows conflict choices and emits the selected resolution', async () => {
    const wrapper = mount(ReviewEditableTargetsPanel, {
      props: {
        open: true,
        title: 'Edit fields',
        entries: [{
          target: {
            id: 'answer-target',
            blockId: 'block-1',
            title: 'Answer',
            role: 'current-content',
            rendererKind: 'main-protyle',
            sourceKind: 'block-markdown',
          },
          value: 'Local draft',
          originalValue: 'Original answer',
          saveError: 'external field changed',
          conflict: {
            message: 'external field changed',
            sourceLatestValue: 'External answer',
            draftValue: 'Local draft',
          },
        }],
        readonly: false,
        confirmDisabled: false,
        confirmLabel: 'Save',
        cancelLabel: 'Cancel',
        sourceLatestConflictLabel: 'Use source latest',
        draftOverwriteConflictLabel: 'Keep draft',
      },
    });

    expect(wrapper.get('[data-testid="review-editable-target-conflict"]').text())
      .toContain('external field changed');

    const buttons = wrapper.findAll('[data-testid="review-editable-target-conflict"] button');
    expect(buttons.map(button => button.text())).toEqual(['Use source latest', 'Keep draft']);

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    expect(wrapper.emitted('resolve-conflict')).toEqual([
      ['answer-target', 'source-latest'],
      ['answer-target', 'draft-overwrite'],
    ]);
  });

  it('edits concept reference as a block id input and confirms with Enter', async () => {
    const wrapper = mount(ReviewEditableTargetsPanel, {
      props: {
        open: true,
        title: 'Edit fields',
        entries: [{
          target: {
            id: 'descriptor:concept-reference:concept-a',
            blockId: 'concept-a',
            title: '更换概念卡',
            role: 'concept',
            rendererKind: 'descriptor',
            sourceKind: 'concept-reference',
            referenceLabel: '原概念',
          },
          value: 'concept-a',
          originalValue: 'concept-a',
        }],
        readonly: false,
        confirmDisabled: false,
        confirmLabel: 'Save',
        cancelLabel: 'Cancel',
      },
    });

    const input = wrapper.get('[data-testid="review-editable-target-concept-reference-input"]');
    await input.setValue('concept-b');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update-target')?.at(-1)).toEqual([
      'descriptor:concept-reference:concept-a',
      'concept-b',
    ]);
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });
});
