import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AiToolPermissionManagerDialog from '../AiToolPermissionManagerDialog.vue';
import {
  AI_CHAT_TOOL_DESCRIPTORS,
  AI_CHAT_TOOL_GROUPS,
} from '@/application/services/AIChatToolRegistry';

describe('AiToolPermissionManagerDialog', () => {
  it('filters tools by group and clears overrides before saving', async () => {
    const wrapper = mount(AiToolPermissionManagerDialog, {
      props: {
        groupKey: 'study-decision',
        groups: AI_CHAT_TOOL_GROUPS,
        tools: AI_CHAT_TOOL_DESCRIPTORS,
        executionPolicies: {
          DecideStudyAction: 'ask-always',
          GetCurrentContext: 'ask-once',
        },
        resultApprovalPolicies: {
          DecideStudyAction: 'always',
        },
      },
    });

    expect(wrapper.text()).toContain('判断学习动作');
    expect(wrapper.text()).not.toContain('读取当前上下文');

    const buttons = wrapper.findAll('button');
    await buttons[0]!.trigger('click');
    await buttons[2]!.trigger('click');

    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({
      executionPolicies: {
        GetCurrentContext: 'ask-once',
      },
      resultApprovalPolicies: {},
    });
  });
});
