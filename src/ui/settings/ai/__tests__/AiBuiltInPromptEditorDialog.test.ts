import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AiBuiltInPromptEditorDialog from '../AiBuiltInPromptEditorDialog.vue';

describe('AiBuiltInPromptEditorDialog', () => {
  it('edits the general chat prompt with a single textarea', async () => {
    const wrapper = mount(AiBuiltInPromptEditorDialog, {
      props: {
        mode: 'generalChat',
        title: 'General Chat',
        summary: 'General chat prompt',
        generalChatTemplate: {
          systemPrompt: 'Default prompt',
        },
        tabs: [],
      },
    });

    const textareas = wrapper.findAll('textarea');
    expect(textareas).toHaveLength(1);
    await textareas[0]!.setValue('Custom general prompt');
    await wrapper.findAll('button')[1]!.trigger('click');

    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({
      generalChatTemplate: {
        systemPrompt: 'Custom general prompt',
      },
    });
  });

  it('switches concept-coach panels and saves tab prompts', async () => {
    const wrapper = mount(AiBuiltInPromptEditorDialog, {
      props: {
        mode: 'conceptCoach',
        title: 'Concept Coach',
        summary: 'Structured prompt',
        conceptCoachTemplate: {
          baseRun: 'Base run',
          tabs: {
            'working-definition': { run: 'Working run', followUp: 'Working follow-up' },
            perspectives: { run: 'Perspectives run', followUp: 'Perspectives follow-up' },
            'integrated-understanding': { run: '', followUp: '' },
            'self-test-cards': { run: '', followUp: '' },
            'cdf-structure': { run: '', followUp: '' },
            'real-world-triggers': { run: '', followUp: '' },
          },
        },
        tabs: [
          { id: 'working-definition', title: 'Working Definition' },
          { id: 'perspectives', title: 'Perspectives' },
        ],
        contractSummary: 'Contract summary',
        contractLines: ['Rule 1'],
      },
    });

    const navButtons = wrapper.findAll('.ai-built-in-editor__nav-item');
    await navButtons[1]!.trigger('click');
    expect(wrapper.text()).toContain('Contract summary');
    await navButtons[3]!.trigger('click');

    const textareas = wrapper.findAll('textarea');
    expect(textareas).toHaveLength(2);
    await textareas[0]!.setValue('Updated perspectives run');
    await textareas[1]!.setValue('Updated perspectives follow-up');
    const buttons = wrapper.findAll('button');
    await buttons[buttons.length - 1]!.trigger('click');

    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({
      conceptCoachTemplate: {
        baseRun: 'Base run',
        tabs: {
          'working-definition': { run: 'Working run', followUp: 'Working follow-up' },
          perspectives: { run: 'Updated perspectives run', followUp: 'Updated perspectives follow-up' },
          'integrated-understanding': { run: '', followUp: '' },
          'self-test-cards': { run: '', followUp: '' },
          'cdf-structure': { run: '', followUp: '' },
          'real-world-triggers': { run: '', followUp: '' },
        },
      },
    });
  });
});
