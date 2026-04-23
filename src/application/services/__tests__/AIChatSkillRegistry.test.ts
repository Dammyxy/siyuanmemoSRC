import { describe, expect, it } from 'vitest';
import {
  getAIChatSkill,
  getAIChatSkills,
  getAIChatSkillTabs,
  normalizeAIChatSkillId,
} from '@/application/services/AIChatSkillRegistry';
import { DEFAULT_AI_SETTINGS, normalizeAISettings } from '@/types/settings';

describe('AIChatSkillRegistry', () => {
  it('keeps the builtin general-chat prompt aligned with the workbench CTA copy', () => {
    const skill = getAIChatSkill('general-chat');

    expect(skill.composerPreset).toBe(
      '我想围绕当前内容继续聊聊。你可以先帮我抓重点、解释疑点；如果上下文还不够，请直接告诉我还需要补什么。',
    );
    expect(skill.defaultToolGroups).toContain('study-decision');
  });

  it('lets settings override the builtin general-chat system prompt', () => {
    const settings = normalizeAISettings({
      ...DEFAULT_AI_SETTINGS,
      prompts: {
        ...DEFAULT_AI_SETTINGS.prompts,
        skills: {
          ...DEFAULT_AI_SETTINGS.prompts.skills,
          generalChat: {
            systemPrompt: 'Custom general chat prompt',
          },
        },
      },
    });

    expect(getAIChatSkill('general-chat', settings).systemPromptTemplate).toBe('Custom general chat prompt');
  });

  it('merges builtin skills with enabled user skills', () => {
    const settings = normalizeAISettings({
      ...DEFAULT_AI_SETTINGS,
      userSkills: [
        {
          id: 'coach',
          title: 'Coach',
          brief: 'Custom chat helper',
          enabled: true,
          mode: 'chat',
          systemPromptTemplate: 'Chat prompt',
          composerPreset: 'Ask coach',
          primaryActionLabel: 'Chat',
          defaultToolGroups: ['context-read', 'vars'],
          sections: [],
          version: 1,
        },
        {
          id: 'outline',
          title: 'Outline',
          brief: 'Structured helper',
          enabled: true,
          mode: 'structured',
          systemPromptTemplate: 'Structured prompt',
          composerPreset: 'Run outline',
          primaryActionLabel: 'Run',
          defaultToolGroups: ['context-read'],
          sections: [
            {
              id: 'summary',
              title: 'Summary',
              emptyHint: 'No summary',
              runPrompt: 'Generate summary',
              followUpPrompt: 'Answer based on summary',
              responseKey: 'summary',
              renderer: 'list',
              required: true,
            },
          ],
          version: 1,
        },
      ],
    });

    const skills = getAIChatSkills(settings);

    expect(skills.map((skill) => skill.id)).toEqual([
      'general-chat',
      'concept-coach',
      'user:coach',
      'user:outline',
    ]);
    expect(getAIChatSkill('user:coach', settings).mode).toBe('chat');
    expect(getAIChatSkillTabs('user:outline', settings)).toEqual([
      expect.objectContaining({
        id: 'user:outline:summary',
        title: 'Summary',
      }),
    ]);
    expect(normalizeAIChatSkillId('user:outline', 'general-chat', settings)).toBe('user:outline');
  });
});
