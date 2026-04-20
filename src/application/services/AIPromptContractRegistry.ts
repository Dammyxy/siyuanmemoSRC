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
    summary: '同一份通用草稿会被本地渲染成列表项块，首层列表项为问题，子列表项为答案与补充。',
    contractLines: [
      '当前自测制卡模式是 list-item。',
      '这个模式只影响本地渲染和制卡，不要求模型返回 mode-specific draftMarkdown。',
      '请返回模式无关的 canonical 草稿字段：prompt、answer、details、clozeTargets。',
    ],
  },
  mark: {
    mode: 'mark',
    label: '标记制卡',
    summary: '同一份通用草稿会被本地渲染成带合法 ==标记== 的单块内容。',
    contractLines: [
      '当前自测制卡模式是 mark。',
      '这个模式只影响本地渲染和制卡，不要求模型直接返回带 ==标记== 的 markdown。',
      '请返回模式无关的 canonical 草稿字段：prompt、answer、details、clozeTargets。',
    ],
  },
  heading: {
    mode: 'heading',
    label: '标题块',
    summary: '同一份通用草稿会被本地渲染成标题块，标题下方内容作为答案区域。',
    contractLines: [
      '当前自测制卡模式是 heading。',
      '这个模式只影响本地渲染和制卡，不要求模型直接返回标题块 markdown。',
      '请返回模式无关的 canonical 草稿字段：prompt、answer、details、clozeTargets。',
    ],
  },
  'super-block': {
    mode: 'super-block',
    label: '超级块',
    summary: '同一份通用草稿会被本地渲染成超级块，首子块为问题，其余子块为答案。',
    contractLines: [
      '当前自测制卡模式是 super-block。',
      '这个模式只影响本地渲染和制卡，不要求模型直接返回超级块 markdown。',
      '请返回模式无关的 canonical 草稿字段：prompt、answer、details、clozeTargets。',
    ],
  },
  'multi-mark': {
    mode: 'multi-mark',
    label: '多标记',
    summary: '同一份通用草稿会被本地渲染成包含多个合法 ==标记== 的单块内容，用于插件多挖空卡。',
    contractLines: [
      '当前自测制卡模式是 multi-mark。',
      '这个模式只影响本地渲染和制卡，不要求模型直接返回多标记 markdown。',
      '请返回模式无关的 canonical 草稿字段：prompt、answer、details、clozeTargets。',
    ],
  },
  'cdf-multiline': {
    mode: 'cdf-multiline',
    label: 'CDF 多行',
    summary: '同一份通用草稿会被本地渲染成插件 CDF 多行结构，使用 ::: 约定。',
    contractLines: [
      '当前自测制卡模式是 cdf-multiline。',
      '这个模式只影响本地渲染和制卡，不要求模型直接返回 ::: / ;;; markdown。',
      '请返回模式无关的 canonical 草稿字段：prompt、answer、details、clozeTargets。',
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
    'selfTestCards 必须包含 cards；creationMode 由系统运行时决定，模型可以省略。',
    'selfTestCards.cards 必须是数组，每项固定包含 id、kind、selected、summary、prompt、answer、details、clozeTargets；kind 使用“辨析 / 因果 / 应用 / 反例 / 触发 / 定义 / 边界 / 其他”。',
    'summary 只保留简短识别语，不要把解释性正文塞进 summary。',
    'prompt 必须是短、明确、需要回忆的问题，避免空泛大题。',
    'answer 尽量控制在 3-20 个字；只有材料本身要求时才适度放宽，但仍保持短答、稳定、可重复。',
    'details 默认返回空数组；只有 answer 单独不足以稳定判分时，才补 1-2 条极短补充，不要把长解释塞进 details。',
    'clozeTargets 只在自然适合挖空时填写；不适合时返回空数组。',
    '宁缺毋滥：不要为了凑数量输出弱卡，也不要把大段解释拆进 answer 或 details。',
    '在材料允许时，cards 至少覆盖辨析、因果、应用、反例、触发这些 kind。',
    '不要返回 mode-specific draftMarkdown；请返回模式无关的 canonical 自测草稿。',
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
    summary: '当前 tab 局部重跑时只返回 selfTestCards，其中包含模式无关的 canonical cards 草稿数组。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 selfTestCards。',
      'selfTestCards 必须包含 cards；creationMode 由系统运行时决定，模型可以省略。',
      'selfTestCards.cards 必须是数组，每项固定包含 id、kind、selected、summary、prompt、answer、details、clozeTargets。',
      'summary 只保留简短识别语；answer 尽量控制在 3-20 个字；details 默认返回空数组，仅在必要时补 1-2 条极短补充。',
      '不要为了凑数量输出弱卡；在材料允许时优先覆盖辨析、因果、应用、反例、触发这些 kind。',
      '不要返回 mode-specific draftMarkdown；请返回模式无关的 canonical 自测草稿。',
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
