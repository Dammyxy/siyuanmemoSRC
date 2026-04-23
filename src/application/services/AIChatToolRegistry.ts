import type {
  AIChatToolDescriptor,
  AIChatToolGroupDefinition,
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

function previewJson(value: unknown, limit = 220): string {
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value ?? '');
    }
  }
  const normalized = text.trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

function createWriteTargetProperties(): Record<string, unknown> {
  return {
    targetMode: {
      type: 'string',
      enum: ['default', 'daily-note', 'block'],
      description: 'Write target mode. default = reuse the remembered AI self-test target.',
    },
    notebookId: {
      type: 'string',
      description: 'Optional notebook id override when targetMode is daily-note or block.',
    },
    notebookName: {
      type: 'string',
      description: 'Optional notebook name for display only.',
    },
    targetBlockId: {
      type: 'string',
      description: 'Optional target block/document id override when targetMode is block.',
    },
    targetLabel: {
      type: 'string',
      description: 'Optional target label shown in UI and tool results.',
    },
  };
}

export const AI_CHAT_TOOL_GROUPS: AIChatToolGroupDefinition[] = [
  {
    key: 'context-read',
    title: '上下文读取',
    description: '读取当前 AI workbench 上下文、附加材料和会话输入。',
    enabledByDefault: true,
    rulePrompt: '优先先读当前上下文，再决定是否扩展到思源块或网页。',
  },
  {
    key: 'study-decision',
    title: '学习决策',
    description: '只做判断，不直接写入；用于决定当前更适合解释、摘录、继续生成 Item，还是创建哪种文本卡。',
    enabledByDefault: true,
    rulePrompt: '先判断任务目标和当前材料形态，再决定是否需要进入写工具；本组工具本身不执行写入。',
  },
  {
    key: 'siyuan-read',
    title: '思源读取',
    description: '查询 blocks / attributes、读取块 Markdown、定位相关笔记内容。',
    enabledByDefault: true,
    rulePrompt: '只做只读查询；返回结果长时优先使用变量缓存，不要在对话里整段复述。',
  },
  {
    key: 'siyuan-write',
    title: '思源写入',
    description: '追加内容、创建文档或按 SEARCH/REPLACE 更新块内容。所有写入都默认 ask-always。',
    enabledByDefault: false,
    rulePrompt: '写入前先读取最新块内容或目标位置；ApplyBlockDiff 必须按 SEARCH/REPLACE 语法精确修改，并优先先 dryRun。',
  },
  {
    key: 'review-read',
    title: '复习读取',
    description: '读取当前复习卡片、队列进度和 reveal 状态。',
    enabledByDefault: true,
  },
  {
    key: 'web',
    title: '网页工具',
    description: '抓取 URL 内容，或通过已配置后端搜索网页。',
    enabledByDefault: true,
    rulePrompt: '先搜索再抓取；抓取时尽量控制字符数，只保留和当前任务直接相关的内容。',
  },
  {
    key: 'vars',
    title: '变量缓存',
    description: '读取工具长结果缓存，支持后续工具参数直接引用变量。',
    enabledByDefault: true,
    rulePrompt: '当工具返回长文本时，优先通过 ListVars / ReadVar 或 $VAR_REF{{name}} 继续处理。',
  },
  {
    key: 'flashcard-write',
    title: '制卡工具',
    description: '创建 Topic/Item 或文本类卡片，并在需要时调用 Xiuyuan 制卡。所有写入都必须审批。',
    enabledByDefault: false,
    rulePrompt: '任何写入或制卡前都必须得到用户批准；结果中要清楚说明写到了哪里、用了什么模板、创建了哪些卡。',
  },
];

export const AI_CHAT_TOOL_DESCRIPTORS: AIChatToolDescriptor[] = [
  {
    name: 'GetCurrentContext',
    title: '读取当前上下文',
    group: 'context-read',
    description: '读取当前 AI 会话的卡片、选中块、队列和已附加材料摘要。',
    definition: {
      type: 'function',
      function: {
        name: 'GetCurrentContext',
        description: 'Read the current SiYuanMemo review or browser context plus attached materials.',
        parameters: objectParameters({
          includeFullText: { type: 'boolean', description: 'Whether to include fuller selected block text.' },
        }),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
    declaredReturnType: {
      type: '{ source: string; queueType: string | null; currentCard: unknown; selectedBlocks: Array<{ blockId: string; type?: string; hPath?: string; text: string }>; attachedContexts: Array<{ title: string; summary: string; blockIds: string[]; content: string }> }',
    },
    compressArgs: (args) => args.includeFullText === true ? 'includeFullText=true' : 'includeFullText=false',
  },
  {
    name: 'DecideStudyAction',
    title: '判断学习动作',
    group: 'study-decision',
    description: '根据用户请求和当前上下文，判断更适合直接解释、创建摘录 Topic、继续生成 Item，还是创建哪类文本卡。',
    definition: {
      type: 'function',
      function: {
        name: 'DecideStudyAction',
        description: 'Decide whether the current request should be answered directly, turned into an excerpt topic, continued as topic items, or routed to a card-creation tool.',
        parameters: objectParameters({
          request: { type: 'string', description: 'What the user wants right now.' },
          goalHint: {
            type: 'string',
            enum: ['auto', 'understand', 'extract', 'create-card'],
            description: 'Optional goal hint. auto is the default.',
          },
        }, ['request']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
    declaredReturnType: {
      type: '{ action: "answer-directly" | "create-excerpt-topic" | "create-topic-item" | "create-card"; recommendedTool: string | null; cardFamily: string | null; reason: string; missingInfo: string[]; approvalRequired: boolean }',
    },
  },
  {
    name: 'GetBlockInfo',
    title: '读取块元信息',
    group: 'siyuan-read',
    description: '读取某个思源块的基础元信息，适合在真正读取全文前先确认类型、根文档和路径。',
    definition: {
      type: 'function',
      function: {
        name: 'GetBlockInfo',
        description: 'Read one SiYuan block metadata row by id.',
        parameters: objectParameters({
          blockId: { type: 'string', description: 'SiYuan block id.' },
        }, ['blockId']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
    compressArgs: (args) => `blockId=${String(args.blockId || '')}`,
  },
  {
    name: 'GetBlockContent',
    title: '读取块正文',
    group: 'siyuan-read',
    description: '按 sy-f-misc 的内容工具语义读取块正文，返回标准 Markdown，可选附带 Kramdown。',
    definition: {
      type: 'function',
      function: {
        name: 'GetBlockContent',
        description: 'Read one SiYuan block content and return Markdown plus optional Kramdown.',
        parameters: objectParameters({
          blockId: { type: 'string', description: 'SiYuan block id.' },
          includeKramdown: { type: 'boolean', description: 'Whether to include raw Kramdown when available.' },
        }, ['blockId']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
    compressArgs: (args) => `blockId=${String(args.blockId || '')}`,
  },
  {
    name: 'ReadBlock',
    title: '读取块内容',
    group: 'siyuan-read',
    description: '按块 ID 读取思源块标准 Markdown，可选附带 Kramdown。',
    definition: {
      type: 'function',
      function: {
        name: 'ReadBlock',
        description: 'Read one SiYuan block by id and return Markdown.',
        parameters: objectParameters({
          blockId: { type: 'string', description: 'SiYuan block id.' },
          includeKramdown: { type: 'boolean', description: 'Whether to include raw Kramdown when available.' },
        }, ['blockId']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
    compressArgs: (args) => `blockId=${String(args.blockId || '')}`,
  },
  {
    name: 'ReadBlocks',
    title: '批量读取块内容',
    group: 'siyuan-read',
    description: '按多个块 ID 批量读取标准 Markdown，用于一次取回一组相关块。',
    definition: {
      type: 'function',
      function: {
        name: 'ReadBlocks',
        description: 'Read multiple SiYuan blocks in one tool call.',
        parameters: objectParameters({
          blockIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Up to 12 block ids.',
          },
          includeKramdown: { type: 'boolean', description: 'Whether to include raw Kramdown when available.' },
        }, ['blockIds']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'context',
    enabledByDefault: true,
    compressArgs: (args) => `blockIds=${Array.isArray(args.blockIds) ? args.blockIds.length : 0}`,
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
        description: 'Search SiYuan blocks by keyword in content or markdown.',
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
    compressArgs: (args) => `query=${String(args.query || '')}`,
  },
  {
    name: 'GetBlockAttrs',
    title: '读取块属性',
    group: 'siyuan-read',
    description: '读取某个块在 attributes 表中的属性，用于排查绑定、制卡痕迹和自定义标记。',
    definition: {
      type: 'function',
      function: {
        name: 'GetBlockAttrs',
        description: 'Read block attributes from SiYuan attributes table.',
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
    name: 'AppendContent',
    title: '追加内容到父块',
    group: 'siyuan-write',
    description: '向指定父块或文档末尾追加 Markdown 内容。',
    definition: {
      type: 'function',
      function: {
        name: 'AppendContent',
        description: 'Append markdown content under a parent SiYuan block or document.',
        parameters: objectParameters({
          parentBlockId: { type: 'string', description: 'Parent block or document id.' },
          markdown: { type: 'string', description: 'Markdown content to append.' },
        }, ['parentBlockId', 'markdown']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateNewDoc',
    title: '创建新文档',
    group: 'siyuan-write',
    description: '在指定笔记本中创建新文档并写入初始 Markdown。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateNewDoc',
        description: 'Create a new SiYuan document with initial markdown content.',
        parameters: objectParameters({
          notebookId: { type: 'string', description: 'Notebook id.' },
          title: { type: 'string', description: 'Optional document title used to build the path when path is omitted.' },
          path: { type: 'string', description: 'Optional .sy path. If omitted, one is derived from title.' },
          markdown: { type: 'string', description: 'Initial markdown content. Can be empty.' },
        }, ['notebookId']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'ApplyBlockDiff',
    title: '按 diff 更新块内容',
    group: 'siyuan-write',
    description: '按 SEARCH/REPLACE 语法更新块 Markdown；支持 dryRun 预览，不直接执行图片遮挡或几何编辑。',
    definition: {
      type: 'function',
      function: {
        name: 'ApplyBlockDiff',
        description: 'Apply SEARCH/REPLACE diff hunks to a block markdown payload. Read latest content first and prefer dryRun before writing.',
        parameters: objectParameters({
          blockId: { type: 'string', description: 'Target SiYuan block id.' },
          searchReplaceDiff: { type: 'string', description: 'One or more SEARCH/REPLACE hunks.' },
          dryRun: { type: 'boolean', description: 'When true, preview the result without writing.' },
        }, ['blockId', 'searchReplaceDiff']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'QueryBlocksSql',
    title: '执行只读 SQL',
    group: 'siyuan-read',
    description: '在 blocks / attributes 上执行受限只读 SQL，适合做精准排查。',
    definition: {
      type: 'function',
      function: {
        name: 'QueryBlocksSql',
        description: 'Run a read-only SQL query against SiYuan blocks or attributes tables.',
        parameters: objectParameters({
          sql: { type: 'string', description: 'A SELECT SQL statement. Mutations are forbidden.' },
          limit: { type: 'number', description: 'Optional hard cap for returned rows, default 20, max 50.' },
        }, ['sql']),
      },
    },
    executionPolicy: 'ask-once',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
    compressArgs: (args) => previewJson({ sql: args.sql, limit: args.limit }, 160),
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
    executionPolicy: 'ask-once',
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
          limit: { type: 'number', description: 'Max result count, default 5, max 10.' },
        }, ['query']),
      },
    },
    executionPolicy: 'ask-once',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
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
    compressResult: (result) => previewJson(result.data, 160),
  },
  {
    name: 'ReadVar',
    title: '读取变量缓存',
    group: 'vars',
    description: '读取本会话某个长结果变量，可指定字符切片。',
    definition: {
      type: 'function',
      function: {
        name: 'ReadVar',
        description: 'Read a cached variable by id or name, optionally with a character slice.',
        parameters: objectParameters({
          idOrName: { type: 'string', description: 'Variable id or name.' },
          start: { type: 'number', description: 'Optional character start offset.' },
          length: { type: 'number', description: 'Optional character length.' },
        }, ['idOrName']),
      },
    },
    executionPolicy: 'auto',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateExcerptTopic',
    title: '创建摘录 Topic',
    group: 'flashcard-write',
    description: '把当前选中的材料创建为 Topic 摘录，沿用渐进阅读的存放规则和去重逻辑。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateExcerptTopic',
        description: 'Create a progressive excerpt topic from the current selection or provided text.',
        parameters: objectParameters({
          sourceBlockId: { type: 'string', description: 'Optional source block id. Falls back to current context.' },
          sourceBlockIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional source block id list for multi-block selections.',
          },
          selectedText: { type: 'string', description: 'Optional selected text. Falls back to current context block text.' },
          origin: {
            type: 'string',
            enum: ['editor', 'review'],
            description: 'Optional origin override.',
          },
        }),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateTopicItems',
    title: '在 Topic 下继续生成 Item',
    group: 'flashcard-write',
    description: '在已有 Topic 语境下，把当前选中的材料继续生成 Item，沿用当前 Topic derivation 存放规则。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateTopicItems',
        description: 'Create topic-derived items from the current selection or provided text.',
        parameters: objectParameters({
          sourceBlockId: { type: 'string', description: 'Optional source block id. Falls back to current context.' },
          sourceBlockIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional source block id list for multi-block selections.',
          },
          selectedText: { type: 'string', description: 'Optional selected text. Falls back to current context block text.' },
          rootId: { type: 'string', description: 'Optional root block id override when resolving topic context.' },
          origin: {
            type: 'string',
            enum: ['editor', 'review', 'block-menu'],
            description: 'Optional origin override.',
          },
        }),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreatePairCards',
    title: '创建成对卡片',
    group: 'flashcard-write',
    description: '创建基础问答卡或双向卡。工具会先在目标位置生成源块，再调用 Xiuyuan 制卡。',
    definition: {
      type: 'function',
      function: {
        name: 'CreatePairCards',
        description: 'Create paired flashcards from question/answer or term/definition content.',
        parameters: objectParameters({
          mode: {
            type: 'string',
            enum: ['basic-qa', 'bidirectional'],
            description: 'basic-qa = one card; bidirectional = two opposite cards.',
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                front: { type: 'string', description: 'Question or term.' },
                back: { type: 'string', description: 'Answer or definition.' },
              },
              required: ['front', 'back'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['mode', 'items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateInlineCards',
    title: '创建单块卡片',
    group: 'flashcard-write',
    description: '创建单块快速卡、单块双向卡、多挖空卡或简单概念卡。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateInlineCards',
        description: 'Create quick, bidirectional-single, multi-cloze, or simple concept cards from single-block content.',
        parameters: objectParameters({
          mode: {
            type: 'string',
            enum: ['quick', 'bidirectional-single', 'multi-cloze', 'concept'],
            description: 'Card mode for inline content.',
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Single block content. Include markers like >>, <>, == == when needed.' },
                clozeRenderMode: {
                  type: 'string',
                  enum: ['default', 'inline-formula-cloze'],
                  description: 'Optional cloze render mode for multi-cloze cards.',
                },
              },
              required: ['content'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['mode', 'items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateNativeListItemCards',
    title: '创建原生列表项卡',
    group: 'flashcard-write',
    description: '按思源原生列表项块制卡。每条 draftMarkdown 都必须直接从实际列表项开始。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateNativeListItemCards',
        description: 'Create native list-item riff cards from draft markdown.',
        parameters: objectParameters({
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Optional short summary for UI/logging.' },
                draftMarkdown: { type: 'string', description: 'Draft markdown that starts from a real list item, not a container list.' },
              },
              required: ['draftMarkdown'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateNativeMarkCards',
    title: '创建原生标记卡',
    group: 'flashcard-write',
    description: '按思源原生标记制卡。draftMarkdown 必须包含合法 ==标记==。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateNativeMarkCards',
        description: 'Create native mark riff cards from single-block draft markdown with == == markers.',
        parameters: objectParameters({
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Optional short summary for UI/logging.' },
                draftMarkdown: { type: 'string', description: 'Single-block markdown with valid == == markers.' },
              },
              required: ['draftMarkdown'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateNativeHeadingCards',
    title: '创建原生标题卡',
    group: 'flashcard-write',
    description: '按思源原生标题块制卡。draftMarkdown 必须以标题块开头。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateNativeHeadingCards',
        description: 'Create native heading riff cards from heading-rooted draft markdown.',
        parameters: objectParameters({
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Optional short summary for UI/logging.' },
                draftMarkdown: { type: 'string', description: 'Draft markdown rooted at a heading block.' },
              },
              required: ['draftMarkdown'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateNativeSuperBlockCards',
    title: '创建原生超级块卡',
    group: 'flashcard-write',
    description: '按思源原生超级块制卡。draftMarkdown 必须以超级块为根。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateNativeSuperBlockCards',
        description: 'Create native super-block riff cards from super-block-rooted draft markdown.',
        parameters: objectParameters({
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Optional short summary for UI/logging.' },
                draftMarkdown: { type: 'string', description: 'Draft markdown rooted at a super block.' },
              },
              required: ['draftMarkdown'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateConceptDefinitionCards',
    title: '创建概念定义卡',
    group: 'flashcard-write',
    description: '创建概念定义卡，支持双向、仅正向、仅反向三种方向。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateConceptDefinitionCards',
        description: 'Create concept-definition cards with forward, reverse, or both directions.',
        parameters: objectParameters({
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                concept: { type: 'string', description: 'Concept or term.' },
                definition: { type: 'string', description: 'Definition text.' },
                direction: {
                  type: 'string',
                  enum: ['both', 'forward', 'reverse'],
                  description: 'Card direction, default both.',
                },
              },
              required: ['concept', 'definition'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateDescriptorCards',
    title: '创建描述符卡',
    group: 'flashcard-write',
    description: '为概念和描述符批量创建描述符卡，可选顶层定义。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateDescriptorCards',
        description: 'Create concept descriptor cards from a concept, optional definition, and descriptor list.',
        parameters: objectParameters({
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                concept: { type: 'string', description: 'Concept text.' },
                definition: { type: 'string', description: 'Optional top-level definition text.' },
                descriptors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      cue: { type: 'string', description: 'Descriptor cue or label.' },
                      answer: { type: 'string', description: 'Descriptor answer or value.' },
                      direction: {
                        type: 'string',
                        enum: ['forward', 'reverse', 'both'],
                        description: 'Optional direction override for this descriptor.',
                      },
                    },
                    required: ['cue', 'answer'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['concept', 'descriptors'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateListCards',
    title: '创建列表模板卡',
    group: 'flashcard-write',
    description: '创建普通列表模板卡，支持 split-v2 / summary-v1 和 item / descriptor 两种卡型。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateListCards',
        description: 'Create list-template cards from a parent item and child list items.',
        parameters: objectParameters({
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                parent: { type: 'string', description: 'Parent list item text.' },
                children: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Child list item texts.',
                },
                creationMode: {
                  type: 'string',
                  enum: ['split-v2', 'summary-v1'],
                  description: 'List creation mode, default split-v2.',
                },
                cardType: {
                  type: 'string',
                  enum: ['item', 'descriptor'],
                  description: 'Card type, default item.',
                },
              },
              required: ['parent', 'children'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'CreateCdfMultilineCards',
    title: '创建 CDF 多行卡',
    group: 'flashcard-write',
    description: '创建 ::: / ;;; 结构的多行列表卡，并调用对应 Xiuyuan 流程。',
    definition: {
      type: 'function',
      function: {
        name: 'CreateCdfMultilineCards',
        description: 'Create CDF multiline cards for concept or descriptor multiline list structures.',
        parameters: objectParameters({
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mode: {
                  type: 'string',
                  enum: ['concept-multiline', 'descriptor-multiline'],
                  description: 'Concept multiline uses ::: and descriptor multiline uses ;;;.',
                },
                concept: {
                  type: 'string',
                  description: 'Concept text. Required for concept-multiline, recommended for descriptor-multiline.',
                },
                parent: { type: 'string', description: 'Parent multiline group text.' },
                children: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Child list item texts.',
                },
              },
              required: ['mode', 'parent', 'children'],
              additionalProperties: false,
            },
          },
          ...createWriteTargetProperties(),
        }, ['items']),
      },
    },
    executionPolicy: 'ask-always',
    resultApprovalPolicy: 'never',
    sessionScope: 'session',
    enabledByDefault: true,
  },
  {
    name: 'StageFlashcardDraft',
    title: '暂存候选卡',
    group: 'flashcard-write',
    description: '保留的旧制卡草稿工具，执行前仍需要审批。',
    definition: {
      type: 'function',
      function: {
        name: 'StageFlashcardDraft',
        description: 'Legacy staging tool for draft flashcards. Approval required.',
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
  listGroupDefinitions(): AIChatToolGroupDefinition[] {
    return AI_CHAT_TOOL_GROUPS.map((group) => ({ ...group }));
  }

  listAll(settings?: AISettings): AIChatToolDescriptor[] {
    return AI_CHAT_TOOL_DESCRIPTORS
      .filter((descriptor) => {
        if (descriptor.name === 'SearchWeb') {
          return Boolean(settings?.webSearch.backend && settings.webSearch.backend !== 'none');
        }
        return true;
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

  private isGroupEnabled(group: AIChatToolGroupKey, settings?: AISettings): boolean {
    const defaults = settings?.toolPolicies.groupDefaults;
    if (!defaults) {
      return AI_CHAT_TOOL_GROUPS.find((entry) => entry.key === group)?.enabledByDefault !== false;
    }
    return defaults[group] !== false;
  }

  private isToolEnabled(descriptor: AIChatToolDescriptor, settings?: AISettings): boolean {
    const enabled = settings?.toolPolicies.toolDefaults?.[descriptor.name];
    return enabled !== false && (enabled === true || descriptor.enabledByDefault);
  }

  list(settings?: AISettings): AIChatToolDescriptor[] {
    return this.listAll(settings).filter((descriptor) => (
      this.isGroupEnabled(descriptor.group, settings) && this.isToolEnabled(descriptor, settings)
    ));
  }

  listForGroups(groups: AIChatToolGroupKey[], settings?: AISettings): AIChatToolDescriptor[] {
    const allowed = new Set(groups);
    if (allowed.size > 0) {
      allowed.add('vars');
    }
    return this.list(settings).filter((descriptor) => allowed.has(descriptor.group));
  }

  get(name: string, settings?: AISettings): AIChatToolDescriptor | null {
    const normalized = String(name || '').trim();
    return this.list(settings).find((descriptor) => descriptor.name === normalized) || null;
  }

  buildToolRules(groups: AIChatToolGroupKey[], settings?: AISettings): string {
    const enabledDescriptors = this.listForGroups(groups, settings);
    if (enabledDescriptors.length === 0) {
      return '';
    }
    const grouped = new Map<AIChatToolGroupKey, AIChatToolDescriptor[]>();
    for (const descriptor of enabledDescriptors) {
      const bucket = grouped.get(descriptor.group) || [];
      bucket.push(descriptor);
      grouped.set(descriptor.group, bucket);
    }
    const sections = [
      '<tool-rules>',
      '你可以调用工具。不要伪造工具日志，工具调用只能通过正式 tool call 机制完成。',
      '长参数或长结果会被缓存为变量；如需复用，请优先使用 ListVars / ReadVar，或直接在后续工具参数里使用 $VAR_REF{{name}} / $VAR_REF{{name:start:length}}。',
      '工具会按当前策略自动执行或请求审批；写入思源、创建块、制卡相关工具始终需要更严格确认。',
    ];
    for (const group of AI_CHAT_TOOL_GROUPS) {
      const descriptors = grouped.get(group.key);
      if (!descriptors?.length) {
        continue;
      }
      sections.push(`\n[${group.title}] ${group.description}`);
      if (group.rulePrompt) {
        sections.push(group.rulePrompt);
      }
      for (const descriptor of descriptors) {
        sections.push(`- ${descriptor.name}: ${descriptor.description} [执行=${descriptor.executionPolicy}，结果=${descriptor.resultApprovalPolicy}]`);
      }
    }
    sections.push('</tool-rules>');
    return sections.join('\n');
  }
}
