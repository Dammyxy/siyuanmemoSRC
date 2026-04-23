import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AiUserSkillEditorDialog from '../AiUserSkillEditorDialog.vue';
import AiSettingsDraggableList from '../AiSettingsDraggableList.vue';
import type { AIUserSkillDefinition } from '@/types/ai';

const toolGroupOptions = [
  { key: 'context-read' as const, label: 'context-read', hint: 'Read context' },
  { key: 'study-decision' as const, label: 'study-decision', hint: 'Decide actions' },
];

const rendererOptions = [
  { key: 'markdown' as const, label: 'Markdown' },
  { key: 'list' as const, label: 'List' },
];

function createStructuredSkill(): AIUserSkillDefinition {
  return {
    id: 'user:test-skill',
    title: 'Test Skill',
    brief: 'Summarize the selection.',
    enabled: true,
    mode: 'structured',
    systemPromptTemplate: 'You are a study helper.',
    composerPreset: 'Use the current material.',
    primaryActionLabel: 'Run Skill',
    defaultToolGroups: ['context-read'],
    sections: [{
      id: 'section-1',
      title: 'Summary',
      emptyHint: 'No summary',
      runPrompt: 'Write a summary.',
      followUpPrompt: 'Answer follow-up questions.',
      responseKey: 'summary',
      renderer: 'markdown',
      required: true,
    }],
    surfaceHints: {
      compactTitle: 'Skill',
      hideTabs: false,
      composerRows: 4,
    },
    version: 1,
  };
}

describe('AiUserSkillEditorDialog', () => {
  it('manages structured sections in a local draft before saving', async () => {
    const wrapper = mount(AiUserSkillEditorDialog, {
      props: {
        skill: createStructuredSkill(),
        toolGroupOptions,
        rendererOptions,
      },
    });

    const addSectionButton = wrapper.findAll('button').find((button) => button.text().includes('新增 Section'));
    expect(addSectionButton).toBeDefined();
    await addSectionButton!.trigger('click');
    expect(wrapper.text()).toContain('Section 2');

    const dragList = wrapper.findComponent(AiSettingsDraggableList);
    dragList.vm.$emit('reorder', [{ id: 'section-2' }, { id: 'section-1' }]);
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll('button');
    const saveButton = buttons[buttons.length - 1];
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as AIUserSkillDefinition;
    expect(payload.sections.map((section) => section.id)).toEqual(['section-2', 'section-1']);
    expect(payload.surfaceHints?.composerRows).toBe(4);
  });
});
