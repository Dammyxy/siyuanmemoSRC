import type { AIContextProviderKey } from '@/types/ai';

export type AIContextProviderInputKind = 'none' | 'line' | 'area';

export interface AIContextProviderDescriptor {
  key: AIContextProviderKey;
  title: string;
  description: string;
  inputKind: AIContextProviderInputKind;
}

const CONTEXT_PROVIDER_REGISTRY: AIContextProviderDescriptor[] = [
  {
    key: 'manual-text',
    title: '手工材料',
    description: '粘贴一段补充材料，只在下一次发送时生效。',
    inputKind: 'area',
  },
  {
    key: 'selected-content',
    title: '选中内容',
    description: '读取当前编辑器里的选中文本或选中块。',
    inputKind: 'none',
  },
  {
    key: 'block-refs',
    title: '指定块内容',
    description: '输入块 ID、块引用或思源块链接，抓取对应内容。',
    inputKind: 'line',
  },
  {
    key: 'current-document',
    title: '当前文档',
    description: '读取当前活动文档，或当前上下文对应的文档正文。',
    inputKind: 'none',
  },
];

export function getAIContextProviders(): AIContextProviderDescriptor[] {
  return CONTEXT_PROVIDER_REGISTRY.map((provider) => ({ ...provider }));
}

export function getAIContextProviderByKey(key: AIContextProviderKey): AIContextProviderDescriptor | null {
  return CONTEXT_PROVIDER_REGISTRY.find((provider) => provider.key === key) || null;
}
