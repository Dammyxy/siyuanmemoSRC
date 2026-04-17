import type { AIPromptSettingKey } from '@/application/services/AIPromptComposer';
import type { AIChatRegisteredSkillDescriptor } from '@/application/services/AIChatSkillRegistry';
import type { AIConceptCoachSelfTestCreationMode, AIConceptCoachTabId, AISkillId, AISkillTabId } from '@/types/ai';

export type AIStructuredPromptTask = 'concept-coach/full-run' | `concept-coach/${AISkillTabId}`;

export interface AIPromptContractDescriptor {
  settingKey: AIPromptSettingKey;
  title: string;
  summary: string;
  runtimeLines: string[];
}

export interface AIConceptCoachSelfTestModeDescriptor {
  mode: AIConceptCoachSelfTestCreationMode;
  label: string;
  summary: string;
  contractLines: string[];
}

const SELF_TEST_MODE_DESCRIPTORS: Record<AIConceptCoachSelfTestCreationMode, AIConceptCoachSelfTestModeDescriptor> = {
  'list-item': {
    mode: 'list-item',
    label: '列表项块',
    summary: '每张草稿都从实际列表项开始，首层列表项为问题，子列表项为答案。',
    contractLines: [
      '当前自测制卡模式是 list-item。',
      'selfTestCards.creationMode 必须返回 "list-item"。',
      'cards[].draftMarkdown 必须直接从实际列表项开始，不要额外包一层纯列表容器。',
      '每个草稿的首层列表项是问题，子列表项是答案。',
    ],
  },
  mark: {
    mode: 'mark',
    label: '标记制卡',
    summary: '每张草稿是一段带合法 ==标记== 的单块内容。',
    contractLines: [
      '当前自测制卡模式是 mark。',
      'selfTestCards.creationMode 必须返回 "mark"。',
      'cards[].draftMarkdown 必须是单块文本，并包含合法闭合的 ==标记==。',
      '不要返回纯问答对，也不要返回列表结构。',
    ],
  },
  heading: {
    mode: 'heading',
    label: '标题块',
    summary: '每张草稿以标题块开头，标题下方内容作为答案区域。',
    contractLines: [
      '当前自测制卡模式是 heading。',
      'selfTestCards.creationMode 必须返回 "heading"。',
      'cards[].draftMarkdown 必须以标题块开头，后续块作为答案区域。',
    ],
  },
  'super-block': {
    mode: 'super-block',
    label: '超级块',
    summary: '每张草稿以超级块为根，首子块为问题，其余子块为答案。',
    contractLines: [
      '当前自测制卡模式是 super-block。',
      'selfTestCards.creationMode 必须返回 "super-block"。',
      'cards[].draftMarkdown 必须以超级块为根，首子块为问题，其余子块为答案。',
    ],
  },
  'multi-mark': {
    mode: 'multi-mark',
    label: '多标记',
    summary: '每张草稿是一段单块内容，包含多个合法 ==标记==，用于插件多挖空卡。',
    contractLines: [
      '当前自测制卡模式是 multi-mark。',
      'selfTestCards.creationMode 必须返回 "multi-mark"。',
      'cards[].draftMarkdown 必须是单块文本，并包含多个合法闭合的 ==标记==。',
    ],
  },
  'cdf-multiline': {
    mode: 'cdf-multiline',
    label: 'CDF 多行',
    summary: '每张草稿必须满足插件 CDF 多行结构，使用 ::: 或 ;;; 约定。',
    contractLines: [
      '当前自测制卡模式是 cdf-multiline。',
      'selfTestCards.creationMode 必须返回 "cdf-multiline"。',
      'cards[].draftMarkdown 必须满足插件 CDF 多行结构，使用 ::: 或 ;;; 约定。',
    ],
  },
};

const FULL_RUN_CONTRACT: AIPromptContractDescriptor = {
  settingKey: 'conceptCoach',
  title: 'AI 理解与制卡结构化规则',
  summary: '系统会固定要求首轮返回 workingDefinition / perspectives / integratedUnderstanding / selfTestCards / realWorldTriggers 这组 JSON。',
  runtimeLines: [
    '你会收到一个 JSON payload，其中至少包含 language、skillId、tabIds、context.currentCard、context.selectedBlocks、context.queueProgress、context.neuralBatch 和 attachedContexts。',
    '严格以当前卡片和当前材料为锚点；超出材料直接支持的地方，必须明确说明“这是补充理解，不是材料原文直接说明”。',
    '只返回合法 JSON，不要附带 Markdown 代码块。',
    'JSON 顶层字段固定为 workingDefinition、perspectives、integratedUnderstanding、selfTestCards、realWorldTriggers。',
    'perspectives 固定包含 traits、contrasts、partsAndWhole、causality、significance 五个对象。',
    '如果某个视角当前材料不足，也必须保留该 key，返回显式空节，不要省略字段。',
    'perspectives 最小合法示例：{"traits":{"title":"特性和倾向","keyPoints":[]},"contrasts":{"title":"辨析异同","keyPoints":[]},"partsAndWhole":{"title":"部分和整体","keyPoints":[]},"causality":{"title":"因果关系","keyPoints":[]},"significance":{"title":"意义和影响","keyPoints":[]}}。',
    'integratedUnderstanding 固定包含 essence、notWhat、capabilities；没有内容时返回空字符串或空数组，不要省略 key。',
    'integratedUnderstanding 最小合法示例：{"essence":"","notWhat":[],"capabilities":[]}。',
    'selfTestCards 必须包含 creationMode 和 cards。',
    'selfTestCards.cards 必须是数组，每项固定包含 id、mode、kind、selected、summary、draftMarkdown；kind 使用“辨析 / 因果 / 应用 / 反例 / 触发 / 定义 / 边界 / 其他”。',
    '同一次结果里，cards[].mode 必须和 selfTestCards.creationMode 一致，不要混用多种模式。',
    'realWorldTriggers.triggers 必须是字符串数组。',
  ],
};

const TAB_CONTRACTS: Record<AIConceptCoachTabId, AIPromptContractDescriptor> = {
  'working-definition': {
    settingKey: 'conceptCoach',
    title: '工作定义结构化规则',
    summary: '当前 tab 局部重跑时只返回 workingDefinition 字符串。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 workingDefinition，值为 1-2 句话的工作定义。',
    ],
  },
  perspectives: {
    settingKey: 'conceptCoach',
    title: '多视角理解结构化规则',
    summary: '当前 tab 局部重跑时只返回 perspectives 对象。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 perspectives。',
      'perspectives 固定包含 traits、contrasts、partsAndWhole、causality、significance 五个对象。',
      '如果某个视角没有足够材料，请保留该 key 并返回显式空节，不要省略字段。',
      '最小合法示例：{"perspectives":{"traits":{"title":"特性和倾向","keyPoints":[]},"contrasts":{"title":"辨析异同","keyPoints":[]},"partsAndWhole":{"title":"部分和整体","keyPoints":[]},"causality":{"title":"因果关系","keyPoints":[]},"significance":{"title":"意义和影响","keyPoints":[]}}}。',
    ],
  },
  'integrated-understanding': {
    settingKey: 'conceptCoach',
    title: '整合理解结构化规则',
    summary: '当前 tab 局部重跑时只返回 integratedUnderstanding 对象。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 integratedUnderstanding。',
      'integratedUnderstanding 固定包含 essence、notWhat、capabilities。',
      '如果某一项当前材料不足，也必须保留该 key，空内容使用空字符串或空数组。',
      '最小合法示例：{"integratedUnderstanding":{"essence":"","notWhat":[],"capabilities":[]}}。',
    ],
  },
  'self-test-cards': {
    settingKey: 'conceptCoach',
    title: '自测卡片结构化规则',
    summary: '当前 tab 局部重跑时只返回 selfTestCards，其中包含 creationMode 和 cards 草稿数组。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 selfTestCards。',
      'selfTestCards 必须包含 creationMode 和 cards。',
      'selfTestCards.cards 必须是数组，每项固定包含 id、mode、kind、selected、summary、draftMarkdown。',
      '同一次结果里，cards[].mode 必须和 selfTestCards.creationMode 一致，不要混用多种模式。',
    ],
  },
  'real-world-triggers': {
    settingKey: 'conceptCoach',
    title: '现实触发器结构化规则',
    summary: '当前 tab 局部重跑时只返回 realWorldTriggers.triggers 数组。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 realWorldTriggers。',
      'realWorldTriggers.triggers 必须是字符串数组。',
    ],
  },
};

function cloneContract(contract: AIPromptContractDescriptor): AIPromptContractDescriptor {
  return {
    ...contract,
    runtimeLines: [...contract.runtimeLines],
  };
}

export function getSelfTestModeDescriptor(
  mode: AIConceptCoachSelfTestCreationMode,
): AIConceptCoachSelfTestModeDescriptor {
  const descriptor = SELF_TEST_MODE_DESCRIPTORS[mode] || SELF_TEST_MODE_DESCRIPTORS['list-item'];
  return {
    ...descriptor,
    contractLines: [...descriptor.contractLines],
  };
}

export function listSelfTestModeDescriptors(): AIConceptCoachSelfTestModeDescriptor[] {
  return (Object.keys(SELF_TEST_MODE_DESCRIPTORS) as AIConceptCoachSelfTestCreationMode[]).map((mode) => (
    getSelfTestModeDescriptor(mode)
  ));
}

export function getPromptContractForSetting(_settingKey: AIPromptSettingKey): AIPromptContractDescriptor {
  return cloneContract(FULL_RUN_CONTRACT);
}

export function getPromptContractForSkillRun(skillId: AISkillId, tabId?: AISkillTabId): AIPromptContractDescriptor {
  if (skillId !== 'concept-coach') {
    return cloneContract(FULL_RUN_CONTRACT);
  }
  return cloneContract(tabId && tabId in TAB_CONTRACTS ? TAB_CONTRACTS[tabId as AIConceptCoachTabId] : FULL_RUN_CONTRACT);
}

export function getPromptContractForResolvedSkillRun(
  skill: AIChatRegisteredSkillDescriptor,
  tabId?: AISkillTabId,
): AIPromptContractDescriptor {
  if (skill.id === 'concept-coach') {
    return getPromptContractForSkillRun(skill.id, tabId);
  }
  const sections = (tabId
    ? (skill.sections || []).filter((section) => section.id === tabId)
    : skill.sections || []);
  const requiredKeys = sections.filter((section) => section.required).map((section) => section.responseKey);
  const allKeys = sections.map((section) => section.responseKey);
  const example = Object.fromEntries(sections.map((section) => {
    switch (section.renderer) {
      case 'list':
        return [section.responseKey, []];
      case 'cards':
        return [section.responseKey, [{ question: '', answer: '' }]];
      case 'keyValue':
        return [section.responseKey, {}];
      default:
        return [section.responseKey, ''];
    }
  }));
  return {
    settingKey: 'conceptCoach',
    title: `${skill.title} 结构化规则`,
    summary: tabId
      ? '当前 section 局部重跑时只返回这个 section 对应的顶层 JSON key。'
      : '自定义结构化 Skill 会根据 sections 生成顶层 JSON key。缺失 section 会显示 warning，但不应省略 key。',
    runtimeLines: [
      '你会收到一个 JSON payload，其中至少包含 language、skillId、tabIds、context 和 attachedContexts。',
      '只返回合法 JSON，不要附带 Markdown 代码块，也不要返回 HTML、JS 或脚本。',
      `JSON 顶层字段必须包含：${allKeys.join('、') || '<none>'}。`,
      requiredKeys.length > 0
        ? `以下字段是必填 section；材料不足时也必须保留 key，并返回显式空值：${requiredKeys.join('、')}。`
        : '所有 section 都可以为空，但仍应保留对应 key。',
      `最小合法示例：${JSON.stringify(example)}。`,
      'markdown renderer 返回字符串；list renderer 返回字符串数组；cards renderer 返回 question/answer 对象数组；keyValue renderer 返回对象或 key/value 数组。',
    ],
  };
}

export function getPromptContractForTask(task: AIStructuredPromptTask): AIPromptContractDescriptor {
  if (task === 'concept-coach/full-run') {
    return cloneContract(FULL_RUN_CONTRACT);
  }
  const tabId = task.replace('concept-coach/', '') as AIConceptCoachTabId;
  return cloneContract(TAB_CONTRACTS[tabId] || FULL_RUN_CONTRACT);
}

export function formatStructuredPromptContract(contract: AIPromptContractDescriptor): string {
  return [
    '以下结构化输出规则由系统自动附加，优先级高于用户行为 Prompt。',
    ...contract.runtimeLines,
  ].join('\n');
}
