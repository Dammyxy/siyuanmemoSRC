import type { AISiyuanBlockRow, AISiyuanPort } from '@/application/ports/AISiyuanPort';
import { AIChatApprovalService } from '@/application/services/AIChatApprovalService';
import type { AIChatToolRegistry } from '@/application/services/AIChatToolRegistry';
import type { AIChatVarStoreService } from '@/application/services/AIChatVarStoreService';
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

export interface AIChatToolExecutionOutcome {
  result: AIChatToolExecutionResult;
  approval?: AIChatApprovalRequest;
}

function normalizeString(value: unknown): string {
  return String(value || '').trim();
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

function stringifyData(value: unknown, limit = 12000): string {
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value || '');
    }
  }
  const normalized = text.trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}\n\n...[truncated]`;
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

export class AIChatToolExecutorService {
  private readonly approvalService = new AIChatApprovalService();

  constructor(
    private readonly deps: {
      registry: AIChatToolRegistry;
      varStore: AIChatVarStoreService;
      siyuanPort: AISiyuanPort;
      getAISettings: () => AISettings;
    },
  ) {}

  getEnabledToolDefinitions(groups: AIChatToolGroupKey[]): AIChatToolDescriptor['definition'][] {
    const settings = this.deps.getAISettings();
    return this.deps.registry
      .listForGroups(groups, settings)
      .map((descriptor) => descriptor.definition);
  }

  async executeToolCall(
    toolCall: AIChatToolCall,
    runtime: AIChatToolRuntimeContext,
  ): Promise<AIChatToolExecutionOutcome> {
    const settings = this.deps.getAISettings();
    const descriptor = this.deps.registry.get(toolCall.name, settings);
    const args = toolCall.arguments || {};
    if (!descriptor) {
      return {
        result: this.buildResult(toolCall, {
          status: 'error',
          group: 'vars',
          finalText: `Tool ${toolCall.name} is not enabled or not found.`,
          error: `Tool ${toolCall.name} is not enabled or not found.`,
          args,
        }),
      };
    }

    if (descriptor.executionPolicy === 'ask-always') {
      const approval = this.approvalService.createRequest({
        toolCallId: toolCall.id,
        descriptor,
        args,
      });
      return {
        approval,
        result: this.buildResult(toolCall, {
          status: 'approval-required',
          group: descriptor.group,
          finalText: `Tool ${descriptor.name} requires user approval before execution.`,
          args,
        }),
      };
    }

    try {
      const data = await this.executeDescriptor(descriptor, args, runtime);
      const finalText = stringifyData(data);
      const varRef = finalText.length > 5000
        ? this.deps.varStore.write(`${descriptor.name} result`, data, descriptor.description).id
        : undefined;
      return {
        result: this.buildResult(toolCall, {
          status: 'success',
          group: descriptor.group,
          data,
          finalText: varRef
            ? `${finalText.slice(0, 5000)}\n\n完整结果已缓存为 ${varRef}，可用 ReadVar 读取。`
            : finalText,
          varRef,
          args,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        result: this.buildResult(toolCall, {
          status: 'error',
          group: descriptor.group,
          finalText: message,
          error: message,
          args,
        }),
      };
    }
  }

  private buildResult(
    toolCall: AIChatToolCall,
    input: {
      status: AIChatToolExecutionResult['status'];
      group: AIChatToolExecutionResult['group'];
      args: Record<string, unknown>;
      finalText: string;
      data?: unknown;
      error?: string;
      varRef?: string;
    },
  ): AIChatToolExecutionResult {
    return {
      status: input.status,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      group: input.group,
      args: { ...input.args },
      data: input.data,
      finalText: input.finalText,
      error: input.error,
      varRef: input.varRef,
      createdAt: Date.now(),
    };
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
      case 'SearchBlocks':
        return this.searchBlocks(args);
      case 'GetReviewState':
        return this.getReviewState(runtime);
      case 'FetchWebPage':
        return this.fetchWebPage(args);
      case 'SearchWeb':
        return this.searchWeb(args);
      case 'ListVars':
        return this.deps.varStore.list().map(({ id, name, description, preview, updatedAt }) => ({
          id,
          name,
          description,
          preview,
          updatedAt,
        }));
      case 'ReadVar': {
        const entry = this.deps.varStore.read(normalizeString(args.idOrName));
        if (!entry) {
          throw new Error('Variable not found.');
        }
        return entry.value;
      }
      default:
        throw new Error(`Tool ${descriptor.name} is not implemented.`);
    }
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
    return { blockId, markdown };
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
