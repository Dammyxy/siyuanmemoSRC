import type { AISiyuanBlockRow, AISiyuanPort } from '@/application/ports/AISiyuanPort';
import type { LLMUsage } from '@/application/ports/LLMPort';
import type { AIFlashcardToolService } from '@/application/services/AIFlashcardToolService';
import type { AIChatToolRegistry } from '@/application/services/AIChatToolRegistry';
import type { AIChatVarStoreService } from '@/application/services/AIChatVarStoreService';
import {
  AIChatApprovalService,
  type AIChatApprovalResolution,
} from '@/application/services/AIChatApprovalService';
import type {
  AIChatApprovalRequest,
  AIChatToolCall,
  AIChatToolDescriptor,
  AIChatToolExecutionResult,
  AIChatToolGroupKey,
  AIWorkbenchContextSnapshot,
} from '@/types/ai';
import type { AISettings } from '@/types/settings';

export interface AIChatToolRuntimeContext {
  context: AIWorkbenchContextSnapshot | null;
  attachedContexts: Array<{ title: string; summary: string; content: string; blockIds: string[] }>;
}

export interface AIChatToolApprovalCallbacks {
  requestApproval: (request: AIChatApprovalRequest) => Promise<AIChatApprovalResolution>;
}

export interface AIChatToolExecutionInput {
  roundIndex?: number;
  llmUsage?: LLMUsage;
  approvals?: AIChatToolApprovalCallbacks;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(max, numeric);
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stringifyData(value: unknown, limit = 12000): string {
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
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}\n\n...[truncated]`;
}

function truncateForLlm(text: string, limit = 5000): string {
  const normalized = String(text ?? '').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}\n\n...[truncated]`;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashApproval(descriptor: AIChatToolDescriptor, args: Record<string, unknown>): string {
  return `${descriptor.name}:${stableStringify(args)}`;
}

export class AIChatToolExecutorService {
  private readonly approvalService = new AIChatApprovalService();
  private readonly executionApprovalMemory = new Map<string, AIChatApprovalResolution>();

  constructor(
    private readonly deps: {
      registry: AIChatToolRegistry;
      varStore: AIChatVarStoreService;
      siyuanPort: AISiyuanPort;
      flashcardTools?: AIFlashcardToolService;
      getAISettings: () => AISettings;
    },
  ) {}

  getEnabledToolDefinitions(groups: AIChatToolGroupKey[]): AIChatToolDescriptor['definition'][] {
    const settings = this.deps.getAISettings();
    return this.deps.registry
      .listForGroups(groups, settings)
      .map((descriptor) => descriptor.definition);
  }

  buildToolRules(groups: AIChatToolGroupKey[]): string {
    return this.deps.registry.buildToolRules(groups, this.deps.getAISettings());
  }

  async executeToolCall(
    toolCall: AIChatToolCall,
    runtime: AIChatToolRuntimeContext,
    input?: AIChatToolExecutionInput,
  ): Promise<AIChatToolExecutionResult> {
    const settings = this.deps.getAISettings();
    const descriptor = this.deps.registry.get(toolCall.name, settings);
    const rawArgs = toolCall.arguments || {};
    const args = this.resolveVarReferences(rawArgs);
    const argsText = descriptor?.compressArgs?.(args) || stringifyData(args, 1600);
    const argsVarRef = argsText.length > 900
      ? this.deps.varStore.write(`${toolCall.name} args`, args, `${toolCall.name} tool args`).id
      : undefined;
    const startAt = Date.now();

    if (!descriptor) {
      return this.buildResult(toolCall, {
        status: 'error',
        group: 'vars',
        args,
        argsText,
        argsVarRef,
        finalText: `Tool ${toolCall.name} is not enabled or not found.`,
        resultText: `Tool ${toolCall.name} is not enabled or not found.`,
        error: `Tool ${toolCall.name} is not enabled or not found.`,
        durationMs: 0,
        roundIndex: input?.roundIndex,
        llmUsage: input?.llmUsage,
      });
    }

    const executionApproval = await this.maybeRequestExecutionApproval(
      descriptor,
      toolCall,
      args,
      argsText,
      argsVarRef,
      input?.approvals,
    );
    if (executionApproval) {
      return this.buildResult(toolCall, {
        status: executionApproval.approved ? 'success' : 'execution-rejected',
        group: descriptor.group,
        args,
        argsText,
        argsVarRef,
        finalText: executionApproval.approved ? '' : executionApproval.rejectReason || '用户拒绝执行。',
        resultText: executionApproval.approved ? '' : executionApproval.rejectReason || '用户拒绝执行。',
        error: executionApproval.approved ? undefined : executionApproval.rejectReason || '用户拒绝执行。',
        durationMs: Date.now() - startAt,
        roundIndex: input?.roundIndex,
        llmUsage: input?.llmUsage,
      });
    }

    try {
      const data = await this.executeDescriptor(descriptor, args, runtime);
      const formattedText = descriptor.formatForLLM
        ? descriptor.formatForLLM(data, args)
        : stringifyData(data);
      const finalTextBase = descriptor.truncateForLLM
        ? descriptor.truncateForLLM(formattedText, args)
        : truncateForLlm(formattedText);
      const resultPreview = descriptor.compressResult?.({
        status: 'success',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        group: descriptor.group,
        args,
        argsText,
        formattedText,
        finalText: finalTextBase,
        resultText: finalTextBase,
        createdAt: Date.now(),
      }) || truncateForLlm(formattedText, 1200);
      const varRef = formattedText.length > 5000
        ? this.deps.varStore.write(`${descriptor.name} result`, data, descriptor.description).id
        : undefined;
      const successResult = this.buildResult(toolCall, {
        status: 'success',
        group: descriptor.group,
        args,
        data,
        argsText,
        argsVarRef,
        formattedText,
        finalText: varRef
          ? `${finalTextBase}\n\n完整结果已缓存为 ${varRef}，可用 ReadVar 读取。`
          : finalTextBase,
        resultText: resultPreview,
        varRef,
        durationMs: Date.now() - startAt,
        roundIndex: input?.roundIndex,
        llmUsage: input?.llmUsage,
      });
      return this.maybeRequestResultApproval(descriptor, toolCall, successResult, input?.approvals);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureResult = this.buildResult(toolCall, {
        status: 'error',
        group: descriptor.group,
        args,
        argsText,
        argsVarRef,
        finalText: message,
        resultText: message,
        error: message,
        durationMs: Date.now() - startAt,
        roundIndex: input?.roundIndex,
        llmUsage: input?.llmUsage,
      });
      return this.maybeRequestResultApproval(descriptor, toolCall, failureResult, input?.approvals);
    }
  }

  private async maybeRequestExecutionApproval(
    descriptor: AIChatToolDescriptor,
    toolCall: AIChatToolCall,
    args: Record<string, unknown>,
    argsText: string,
    argsVarRef: string | undefined,
    approvals: AIChatToolApprovalCallbacks | undefined,
  ): Promise<AIChatApprovalResolution | null> {
    if (descriptor.executionPolicy === 'auto') {
      return null;
    }
    const memoryKey = hashApproval(descriptor, args);
    if (descriptor.executionPolicy === 'ask-once' && this.executionApprovalMemory.has(memoryKey)) {
      const cached = this.executionApprovalMemory.get(memoryKey)!;
      return cached.approved ? null : cached;
    }
    if (!approvals?.requestApproval) {
      return { approved: false, rejectReason: '当前会话未提供审批通道。' };
    }
    const request = this.approvalService.createRequest({
      type: 'execution',
      toolCallId: toolCall.id,
      descriptor,
      args,
      argsText,
      argsVarRef,
      runGroupId: null,
      skillId: null,
      tabId: null,
    });
    const resolution = await approvals.requestApproval(request);
    if (descriptor.executionPolicy === 'ask-once') {
      this.executionApprovalMemory.set(memoryKey, resolution);
    }
    return resolution.approved ? null : resolution;
  }

  private async maybeRequestResultApproval(
    descriptor: AIChatToolDescriptor,
    toolCall: AIChatToolCall,
    result: AIChatToolExecutionResult,
    approvals: AIChatToolApprovalCallbacks | undefined,
  ): Promise<AIChatToolExecutionResult> {
    const shouldAsk = descriptor.resultApprovalPolicy === 'always'
      || (descriptor.resultApprovalPolicy === 'on-error' && result.status === 'error');
    if (!shouldAsk) {
      return result;
    }
    if (!approvals?.requestApproval) {
      return {
        ...result,
        status: 'result-rejected',
        error: '当前会话未提供结果审批通道。',
        finalText: '工具结果需要审批，但当前会话没有审批通道。',
        resultText: '工具结果需要审批，但当前会话没有审批通道。',
      };
    }
    const request = this.approvalService.createRequest({
      type: 'result',
      toolCallId: toolCall.id,
      descriptor,
      args: result.args,
      argsText: result.argsText,
      argsVarRef: result.argsVarRef,
      resultText: result.resultText || result.finalText,
      resultStatus: result.status,
      resultVarRef: result.varRef,
      runGroupId: null,
      skillId: null,
      tabId: null,
    });
    const resolution = await approvals.requestApproval(request);
    if (resolution.approved) {
      return result;
    }
    return {
      ...result,
      status: 'result-rejected',
      error: resolution.rejectReason || '用户拒绝将该结果继续发送给模型。',
      finalText: resolution.rejectReason || '用户拒绝将该结果继续发送给模型。',
      resultText: resolution.rejectReason || '用户拒绝将该结果继续发送给模型。',
    };
  }

  private buildResult(
    toolCall: AIChatToolCall,
    input: {
      status: AIChatToolExecutionResult['status'];
      group: AIChatToolExecutionResult['group'];
      args: Record<string, unknown>;
      finalText: string;
      resultText: string;
      data?: unknown;
      argsText?: string;
      formattedText?: string;
      error?: string;
      argsVarRef?: string;
      varRef?: string;
      durationMs?: number;
      roundIndex?: number;
      llmUsage?: LLMUsage;
    },
  ): AIChatToolExecutionResult {
    return {
      status: input.status,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      group: input.group,
      args: { ...input.args },
      data: input.data,
      argsText: input.argsText,
      formattedText: input.formattedText,
      finalText: input.finalText,
      resultText: input.resultText,
      error: input.error,
      argsVarRef: input.argsVarRef,
      varRef: input.varRef,
      durationMs: input.durationMs,
      roundIndex: input.roundIndex,
      llmUsage: input.llmUsage,
      createdAt: Date.now(),
    };
  }

  private resolveVarReferences(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.replace(/\$VAR_REF\{\{([^}:]+)(?::(\d+))?(?::(\d+))?\}\}/g, (_matched, name, start, length) => {
        const entry = this.deps.varStore.read(String(name || '').trim());
        if (!entry) {
          return '';
        }
        const text = typeof entry.value === 'string' ? entry.value : stringifyData(entry.value, 50000);
        const begin = Number(start ?? 0) || 0;
        if (length === undefined) {
          return text.slice(begin);
        }
        const size = Number(length) || 0;
        return size > 0 ? text.slice(begin, begin + size) : text.slice(begin);
      });
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.resolveVarReferences(entry));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        this.resolveVarReferences(entry),
      ]));
    }
    return value;
  }

  private async executeDescriptor(
    descriptor: AIChatToolDescriptor,
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    switch (descriptor.name) {
      case 'GetCurrentContext':
        return this.getCurrentContext(args, runtime);
      case 'ReadBlock':
        return this.readBlock(args);
      case 'ReadBlocks':
        return this.readBlocks(args);
      case 'SearchBlocks':
        return this.searchBlocks(args);
      case 'GetBlockAttrs':
        return this.getBlockAttrs(args);
      case 'QueryBlocksSql':
        return this.queryBlocksSql(args);
      case 'GetReviewState':
        return this.getReviewState(runtime);
      case 'FetchWebPage':
        return this.fetchWebPage(args);
      case 'SearchWeb':
        return this.searchWeb(args);
      case 'ListVars':
        return this.deps.varStore.list().map(({ id, name, description, preview, value, updatedAt }) => ({
          id,
          name,
          description,
          preview,
          charLength: stringifyData(value, 50000).length,
          updatedAt,
        }));
      case 'ReadVar': {
        const entry = this.deps.varStore.read(normalizeString(args.idOrName));
        if (!entry) {
          throw new Error('Variable not found.');
        }
        const text = typeof entry.value === 'string' ? entry.value : stringifyData(entry.value, 50000);
        const start = Math.max(0, Math.floor(Number(args.start) || 0));
        const length = Math.floor(Number(args.length) || 0);
        return length > 0
          ? text.slice(start, start + length)
          : text.slice(start);
      }
      case 'CreatePairCards':
        return this.requireFlashcardTools().createPairCards(args, runtime);
      case 'CreateInlineCards':
        return this.requireFlashcardTools().createInlineCards(args, runtime);
      case 'CreateNativeListItemCards':
        return this.requireFlashcardTools().createNativeListItemCards(args, runtime);
      case 'CreateNativeMarkCards':
        return this.requireFlashcardTools().createNativeMarkCards(args, runtime);
      case 'CreateNativeHeadingCards':
        return this.requireFlashcardTools().createNativeHeadingCards(args, runtime);
      case 'CreateNativeSuperBlockCards':
        return this.requireFlashcardTools().createNativeSuperBlockCards(args, runtime);
      case 'CreateConceptDefinitionCards':
        return this.requireFlashcardTools().createConceptDefinitionCards(args, runtime);
      case 'CreateDescriptorCards':
        return this.requireFlashcardTools().createDescriptorCards(args, runtime);
      case 'CreateListCards':
        return this.requireFlashcardTools().createListCards(args, runtime);
      case 'CreateCdfMultilineCards':
        return this.requireFlashcardTools().createCdfMultilineCards(args, runtime);
      case 'StageFlashcardDraft':
        return {
          staged: true,
          cards: Array.isArray(args.cards) ? args.cards : [],
        };
      default:
        throw new Error(`Tool ${descriptor.name} is not implemented.`);
    }
  }

  private requireFlashcardTools(): AIFlashcardToolService {
    if (!this.deps.flashcardTools) {
      throw new Error('AI flashcard tools are not initialized.');
    }
    return this.deps.flashcardTools;
  }

  private getCurrentContext(args: Record<string, unknown>, runtime: AIChatToolRuntimeContext): unknown {
    const includeFullText = args.includeFullText === true;
    const context = runtime.context;
    return {
      source: context?.source || 'standalone',
      queueType: context?.queueType || null,
      queueProgress: context?.queueProgress || null,
      currentCard: context?.currentCard || null,
      selectedBlocks: (context?.blocks || []).map((block) => ({
        blockId: block.blockId,
        type: block.type,
        hPath: block.hPath,
        text: includeFullText ? block.text : block.text.slice(0, 600),
      })),
      attachedContexts: runtime.attachedContexts.map((item) => ({
        title: item.title,
        summary: item.summary,
        blockIds: item.blockIds,
        content: includeFullText ? item.content : item.content.slice(0, 800),
      })),
    };
  }

  private async readBlock(args: Record<string, unknown>): Promise<unknown> {
    const blockId = normalizeString(args.blockId);
    if (!blockId) {
      throw new Error('blockId is required.');
    }
    const markdown = await this.deps.siyuanPort.copyStdMarkdown(blockId);
    const includeKramdown = args.includeKramdown === true;
    return {
      blockId,
      markdown,
      ...(includeKramdown ? { kramdown: (await this.deps.siyuanPort.getBlockKramdown(blockId)).kramdown } : {}),
    };
  }

  private async readBlocks(args: Record<string, unknown>): Promise<unknown> {
    const blockIds = uniqueIds(Array.isArray(args.blockIds) ? args.blockIds as string[] : []);
    if (blockIds.length === 0) {
      throw new Error('blockIds is required.');
    }
    const limitedIds = blockIds.slice(0, 12);
    const includeKramdown = args.includeKramdown === true;
    const blocks = [];
    for (const blockId of limitedIds) {
      const markdown = await this.deps.siyuanPort.copyStdMarkdown(blockId);
      blocks.push({
        blockId,
        markdown,
        ...(includeKramdown ? { kramdown: (await this.deps.siyuanPort.getBlockKramdown(blockId)).kramdown } : {}),
      });
    }
    return blocks;
  }

  private async searchBlocks(args: Record<string, unknown>): Promise<unknown> {
    const query = normalizeString(args.query);
    if (!query) {
      throw new Error('query is required.');
    }
    const limit = clampLimit(args.limit, 8, 20);
    const rows = await this.deps.siyuanPort.sql<AISiyuanBlockRow>(`
      SELECT id, parent_id, root_id, type, content, markdown, hpath, box, path
      FROM blocks
      WHERE content LIKE '%${escapeSql(query)}%'
         OR markdown LIKE '%${escapeSql(query)}%'
      ORDER BY updated DESC
      LIMIT ${limit}
    `);
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      hPath: row.hpath,
      content: normalizeString(row.markdown || row.content).slice(0, 800),
    }));
  }

  private async getBlockAttrs(args: Record<string, unknown>): Promise<unknown> {
    const blockId = normalizeString(args.blockId);
    if (!blockId) {
      throw new Error('blockId is required.');
    }
    const rows = await this.deps.siyuanPort.sql<{ name?: string; value?: string }>(`
      SELECT name, value
      FROM attributes
      WHERE block_id = '${escapeSql(blockId)}'
      ORDER BY name ASC
    `);
    return Object.fromEntries(rows
      .map((row) => [normalizeString(row.name), normalizeString(row.value)] as const)
      .filter(([name]) => Boolean(name)));
  }

  private async queryBlocksSql(args: Record<string, unknown>): Promise<unknown> {
    const sql = normalizeString(args.sql);
    if (!sql) {
      throw new Error('sql is required.');
    }
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (!/^select\b/i.test(normalized)) {
      throw new Error('只允许执行 SELECT 查询。');
    }
    if (/[;]|--|\/\*/.test(normalized) || /\b(insert|update|delete|drop|alter|attach|pragma|create|replace)\b/i.test(normalized)) {
      throw new Error('SQL 含有不允许的语句或分隔符。');
    }
    if (!/\b(from)\s+(blocks|attributes)\b/i.test(normalized)) {
      throw new Error('SQL 仅允许读取 blocks 或 attributes 表。');
    }
    const limit = clampLimit(args.limit, 20, 50);
    const finalSql = /\blimit\s+\d+\b/i.test(normalized) ? normalized : `${normalized} LIMIT ${limit}`;
    return this.deps.siyuanPort.sql(finalSql);
  }

  private getReviewState(runtime: AIChatToolRuntimeContext): unknown {
    const context = runtime.context;
    return {
      source: context?.source || 'standalone',
      queueType: context?.queueType || null,
      queueProgress: context?.queueProgress || null,
      currentCard: context?.currentCard || null,
      neuralBatch: context?.neuralBatch || null,
    };
  }

  private async fetchWebPage(args: Record<string, unknown>): Promise<unknown> {
    const url = normalizeString(args.url);
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('A valid http(s) URL is required.');
    }
    const maxChars = clampLimit(args.maxChars, 8000, 20000);
    const response = await fetch(url);
    const html = await response.text();
    const text = stripHtmlToText(html).slice(0, maxChars);
    return {
      url,
      status: response.status,
      title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '',
      text,
    };
  }

  private async searchWeb(args: Record<string, unknown>): Promise<unknown> {
    const settings = this.deps.getAISettings().webSearch;
    const query = normalizeString(args.query);
    if (!query) {
      throw new Error('query is required.');
    }
    if (settings.backend === 'none' || !settings.apiKey) {
      throw new Error('Web search backend is not configured.');
    }
    const limit = clampLimit(args.limit, 5, 10);
    if (settings.backend === 'tavily') {
      const response = await fetch(settings.baseUrl || 'https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: settings.apiKey, query, max_results: limit }),
      });
      return response.json();
    }
    if (settings.backend === 'bocha') {
      const response = await fetch(settings.baseUrl || 'https://api.bochaai.com/v1/web-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({ query, count: limit }),
      });
      return response.json();
    }
    const params = new URLSearchParams({
      key: settings.apiKey,
      cx: settings.googleCseId || '',
      q: query,
      num: String(limit),
    });
    const response = await fetch(`${settings.baseUrl || 'https://www.googleapis.com/customsearch/v1'}?${params.toString()}`);
    return response.json();
  }
}
