import type {
  AIChatToolDescriptor,
  AIChatToolGroupKey,
} from '@/types/ai';
import type { AISettings } from '@/types/settings';

function objectParameters(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const TOOL_DESCRIPTORS: AIChatToolDescriptor[] = [
  {
    name: 'GetCurrentContext',
    title: '读取当前上下文',
    group: 'context-read',
    description: '读取当前 AI 会话的卡片、选中块、队列和已附加材料摘要。',
    definition: {
      type: 'function',
      function: {
        name: 'GetCurrentContext',
        description: 'Read the current SiYuanMemo review/browser context and attached user materials.',
        parameters: objectParameters({
          includeFullText: { type: 'boolean', description: 'Whether to include full selected block text.' },
        }),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
  },
  {
    name: 'ReadBlock',
    title: '读取块内容',
    group: 'siyuan-read',
    description: '按块 ID 读取思源块标准 Markdown。',
    definition: {
      type: 'function',
      function: {
        name: 'ReadBlock',
        description: 'Read a SiYuan block by block id and return standard Markdown.',
        parameters: objectParameters({
          blockId: { type: 'string', description: 'SiYuan block id.' },
        }, ['blockId']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
  },
  {
    name: 'SearchBlocks',
    title: '搜索思源块',
    group: 'siyuan-read',
    description: '用关键词在 blocks 表中检索相关块，返回少量摘要。',
    definition: {
      type: 'function',
      function: {
        name: 'SearchBlocks',
        description: 'Search SiYuan blocks by keyword. Use it for recall and locating relevant notes.',
        parameters: objectParameters({
          query: { type: 'string', description: 'Keyword to search in block content or markdown.' },
          limit: { type: 'number', description: 'Max result count, default 8, max 20.' },
        }, ['query']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
  },
  {
    name: 'GetReviewState',
    title: '读取复习状态',
    group: 'review-read',
    description: '读取当前复习卡片、队列进度和 reveal 状态。',
    definition: {
      type: 'function',
      function: {
        name: 'GetReviewState',
        description: 'Read the current review card and queue progress snapshot.',
        parameters: objectParameters({}),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
  },
  {
    name: 'FetchWebPage',
    title: '抓取网页',
    group: 'web',
    description: '抓取给定 URL 的文本内容，用于网页上下文阅读。',
    definition: {
      type: 'function',
      function: {
        name: 'FetchWebPage',
        description: 'Fetch a URL and return readable page text.',
        parameters: objectParameters({
          url: { type: 'string', description: 'The URL to fetch.' },
          maxChars: { type: 'number', description: 'Max characters to return, default 8000.' },
        }, ['url']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'SearchWeb',
    title: '搜索网页',
    group: 'web',
    description: '通过已配置的搜索后端进行网页搜索。未配置后端时不会注入模型。',
    definition: {
      type: 'function',
      function: {
        name: 'SearchWeb',
        description: 'Search the web through the configured backend.',
        parameters: objectParameters({
          query: { type: 'string', description: 'Search query.' },
          limit: { type: 'number', description: 'Max result count, default 5.' },
        }, ['query']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: false,
  },
  {
    name: 'ListVars',
    title: '列出变量缓存',
    group: 'vars',
    description: '列出本会话工具结果缓存。',
    definition: {
      type: 'function',
      function: {
        name: 'ListVars',
        description: 'List cached tool result variables in this session.',
        parameters: objectParameters({}),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'ReadVar',
    title: '读取变量缓存',
    group: 'vars',
    description: '读取本会话某个长结果变量。',
    definition: {
      type: 'function',
      function: {
        name: 'ReadVar',
        description: 'Read a cached variable by id or name.',
        parameters: objectParameters({
          idOrName: { type: 'string', description: 'Variable id or name.' },
        }, ['idOrName']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'StageFlashcardDraft',
    title: '暂存候选卡',
    group: 'flashcard-write',
    description: '把候选问答卡暂存为待确认写入动作。执行前必须审批。',
    definition: {
      type: 'function',
      function: {
        name: 'StageFlashcardDraft',
        description: 'Stage candidate flashcards. This is a write-intent tool and requires explicit user approval.',
        parameters: objectParameters({
          cards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                answer: { type: 'string' },
                kind: { type: 'string' },
              },
              required: ['question', 'answer'],
              additionalProperties: false,
            },
          },
        }, ['cards']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: false,
  },
];

function cloneDescriptor(descriptor: AIChatToolDescriptor): AIChatToolDescriptor {
  return {
    ...descriptor,
    definition: {
      ...descriptor.definition,
      function: {
        ...descriptor.definition.function,
        parameters: { ...descriptor.definition.function.parameters },
      },
    },
  };
}

export class AIChatToolRegistry {
  list(settings?: AISettings): AIChatToolDescriptor[] {
    const groupDefaults = settings?.toolPolicies.groupDefaults;
    const webSearchEnabled = settings?.webSearch.backend && settings.webSearch.backend !== 'none';
    return TOOL_DESCRIPTORS
      .filter((descriptor) => {
        if (descriptor.name === 'SearchWeb' && !webSearchEnabled) {
          return false;
        }
        if (!groupDefaults) {
          return descriptor.enabledByDefault;
        }
        return groupDefaults[descriptor.group] !== false
          && (descriptor.enabledByDefault || descriptor.group === 'flashcard-write');
      })
      .map((descriptor) => {
        const executionOverride = settings?.toolPolicies.executionPolicies[descriptor.name];
        const resultOverride = settings?.toolPolicies.resultApprovalPolicies[descriptor.name];
        return {
          ...cloneDescriptor(descriptor),
          executionPolicy: executionOverride || descriptor.executionPolicy,
          resultApprovalPolicy: resultOverride || descriptor.resultApprovalPolicy,
        };
      });
  }

  listForGroups(groups: AIChatToolGroupKey[], settings?: AISettings): AIChatToolDescriptor[] {
    const allowed = new Set(groups);
    allowed.add('vars');
    return this.list(settings).filter((descriptor) => allowed.has(descriptor.group));
  }

  get(name: string, settings?: AISettings): AIChatToolDescriptor | null {
    const normalized = String(name || '').trim();
    return this.list(settings).find((descriptor) => descriptor.name === normalized) || null;
  }
}
