import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReviewInlineCardEditor from '../components/ReviewInlineCardEditor.vue';
import type { ReviewEditableTargetEditorEntry } from '../reviewCurrentContentEditorRuntime';

function buildEntry(): ReviewEditableTargetEditorEntry {
  return {
    target: {
      id: 'main-protyle:current-content:block-1',
      blockId: 'block-1',
      rendererKind: 'quick',
      role: 'current-content',
      sourceKind: 'block-markdown',
      title: '问题',
    },
    value: '原始内容',
    originalValue: '原始内容',
  };
}

function buildConceptReferenceEntry(): ReviewEditableTargetEditorEntry {
  return {
    target: {
      id: 'concept-definition:concept-reference:concept-block',
      blockId: 'concept-block',
      rendererKind: 'concept-definition',
      role: 'concept',
      sourceKind: 'concept-reference',
      title: '更换概念卡',
      referenceLabel: '原概念',
    },
    value: '原概念',
    originalValue: '原概念',
  };
}

describe('ReviewInlineCardEditor', () => {
  it('renders source editing controls without repeated panel chrome', () => {
    const wrapper = mount(ReviewInlineCardEditor, {
      props: {
        open: true,
        title: '编辑源内容',
        hint: '修改后会刷新当前复习卡',
        sourceOpen: true,
        sourceEntries: [buildEntry(), buildConceptReferenceEntry()],
        sourceReadonly: false,
        sourcePlaceholder: '使用 Markdown 编辑源块',
        sourceConfirmDisabled: false,
        cancelLabel: '取消',
        saveLabel: '保存',
        closeLabel: '取消',
        sourceLatestConflictLabel: '使用源文档最新',
        draftOverwriteConflictLabel: '保留我的草稿',
      },
    });

    expect(wrapper.get('.review-inline-card-editor__title').text()).toBe('编辑源内容');
    expect(wrapper.find('.review-inline-card-editor__section-title').exists()).toBe(false);
    expect(wrapper.find('.review-editable-targets-panel__title').exists()).toBe(false);
    expect(wrapper.find('.review-editable-targets-panel__footer').exists()).toBe(false);
    expect(wrapper.get('.review-editable-targets-panel__target-title').text()).toBe('问题');
    expect(wrapper.findAll('.review-editable-targets-panel__textarea')).toHaveLength(1);
    const conceptReference = wrapper.get('[data-testid="review-editable-target-concept-reference"]');
    const conceptReferenceInput = wrapper.get('[data-testid="review-editable-target-concept-reference-input"]');
    expect(conceptReferenceInput.attributes('readonly')).toBeUndefined();
    expect((conceptReferenceInput.element as HTMLInputElement).value).toBe('原概念');
    expect(conceptReference.text()).toContain('输入概念块 ID');
  });

  it('hides answer-side fields until answer reveal is confirmed', async () => {
    const wrapper = mount(ReviewInlineCardEditor, {
      props: {
        open: true,
        title: '编辑源内容',
        hint: '修改后会刷新当前复习卡',
        sourceOpen: true,
        sourceEntries: [buildEntry()],
        sourceReadonly: false,
        sourcePlaceholder: '使用 Markdown 编辑源块',
        sourceConfirmDisabled: false,
        structuredModel: {
          mode: 'structured',
          family: 'item',
          relationChips: [],
          direction: {
            kind: 'forward',
            relationKind: null,
            readonly: true,
          },
          fallbackReason: null,
          fields: [
            {
              id: 'question',
              role: 'question',
              label: 'Question',
              value: 'Prompt',
              originalValue: 'Prompt',
              required: true,
              multiline: true,
              readonly: false,
              origin: {
                kind: 'grammar',
                blockId: 'block-1',
                hash: 'question-hash',
              },
            },
            {
              id: 'answer',
              role: 'answer',
              label: 'Answer',
              value: 'Hidden answer',
              originalValue: 'Hidden answer',
              required: true,
              multiline: true,
              readonly: false,
              origin: {
                kind: 'grammar',
                blockId: 'block-1',
                hash: 'answer-hash',
              },
            },
          ],
        },
        answerRevealed: false,
        cancelLabel: '取消',
        saveLabel: '保存',
        closeLabel: '取消',
        sourceLatestConflictLabel: '使用源文档最新',
        draftOverwriteConflictLabel: '保留我的草稿',
      },
    });

    expect(wrapper.findAll('.review-editable-targets-panel__target-title').map(title => title.text()))
      .toEqual(['Question']);
    expect(wrapper.findAll('.review-editable-targets-panel__textarea')).toHaveLength(1);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Prompt');
    expect(wrapper.get('[data-testid="review-inline-card-editor-reveal-answer-fields"]').text())
      .toBe('显示答案字段');

    await wrapper.get('[data-testid="review-inline-card-editor-reveal-answer-fields"]').trigger('click');
    expect(wrapper.emitted('reveal-answer-fields')).toHaveLength(1);

    await wrapper.setProps({ answerRevealed: true });
    expect(wrapper.findAll('.review-editable-targets-panel__target-title').map(title => title.text()))
      .toEqual(['Question', 'Answer']);
    expect(wrapper.find('[data-testid="review-inline-card-editor-reveal-answer-fields"]').exists()).toBe(false);
  });

  it('hides raw source fallback that may contain answer content until reveal', () => {
    const wrapper = mount(ReviewInlineCardEditor, {
      props: {
        open: true,
        title: '编辑源内容',
        hint: '修改后会刷新当前复习卡',
        sourceOpen: true,
        sourceEntries: [buildEntry()],
        sourceReadonly: false,
        sourcePlaceholder: '使用 Markdown 编辑源块',
        sourceConfirmDisabled: false,
        structuredModel: {
          mode: 'source-fallback',
          family: 'source',
          relationChips: [],
          direction: {
            kind: 'unknown',
            relationKind: null,
            readonly: true,
          },
          fallbackReason: 'invalid-source-grammar',
          fields: [{
            id: 'source',
            role: 'source',
            label: 'Source',
            value: 'Prompt >> Hidden answer >> extra',
            originalValue: 'Prompt >> Hidden answer >> extra',
            required: true,
            multiline: true,
            readonly: false,
            origin: {
              kind: 'source-fallback',
              blockId: 'block-1',
              hash: 'source-hash',
            },
          }],
        },
        answerRevealed: false,
        cancelLabel: '取消',
        saveLabel: '保存',
        closeLabel: '取消',
        sourceLatestConflictLabel: '使用源文档最新',
        draftOverwriteConflictLabel: '保留我的草稿',
      },
    });

    expect(wrapper.findAll('.review-editable-targets-panel__textarea')).toHaveLength(0);
    expect(wrapper.get('[data-testid="review-inline-card-editor-reveal-answer-fields"]').text())
      .toBe('显示答案字段');
  });
});
