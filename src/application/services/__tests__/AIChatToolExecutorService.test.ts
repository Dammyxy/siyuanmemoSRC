import { describe, expect, it, vi } from 'vitest';
import { AIChatToolExecutorService } from '@/application/services/AIChatToolExecutorService';
import { AIChatToolRegistry } from '@/application/services/AIChatToolRegistry';
import { AIChatVarStoreService } from '@/application/services/AIChatVarStoreService';
import { DEFAULT_AI_SETTINGS, type AISettings } from '@/types/settings';

function createSettings(): AISettings {
  return JSON.parse(JSON.stringify(DEFAULT_AI_SETTINGS)) as AISettings;
}

function createSiyuanPort() {
  return {
    listNotebooks: vi.fn(),
    sql: vi.fn(async () => []),
    getBlockText: vi.fn(async () => ''),
    getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
    copyStdMarkdown: vi.fn(async () => ''),
    ensureTodayDailyNote: vi.fn(async () => 'daily-doc-1'),
    setBlockAttrs: vi.fn(),
    getNotebookConf: vi.fn(),
    renderTemplate: vi.fn(),
    createDocWithMarkdown: vi.fn(),
    insertBlockAfter: vi.fn(),
    insertBlockAfterDetailed: vi.fn(),
    appendBlockUnderParent: vi.fn(),
    appendBlockUnderParentDetailed: vi.fn(),
    updateBlockMarkdown: vi.fn(),
    deleteBlock: vi.fn(),
  };
}

describe('AIChatToolExecutorService', () => {
  it('caches ask-once execution approvals per tool and args', async () => {
    const settings = createSettings();
    settings.toolPolicies.toolDefaults.QueryBlocksSql = true;
    const siyuanPort = createSiyuanPort();
    siyuanPort.sql.mockResolvedValue([{ id: 'block-1' }]);
    const requestApproval = vi.fn(async () => ({ approved: true }));
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore: new AIChatVarStoreService(),
      siyuanPort: siyuanPort as never,
      getAISettings: () => settings,
    });

    const toolCall = {
      id: 'tool-call-1',
      name: 'QueryBlocksSql',
      arguments: {
        sql: 'SELECT id FROM blocks',
        limit: 5,
      },
    };

    const first = await executor.executeToolCall(toolCall, { context: null, attachedContexts: [] }, {
      approvals: { requestApproval },
    });
    const second = await executor.executeToolCall({ ...toolCall, id: 'tool-call-2' }, { context: null, attachedContexts: [] }, {
      approvals: { requestApproval },
    });

    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(siyuanPort.sql).toHaveBeenCalledTimes(2);
  });

  it('supports result approvals and returns result-rejected when the user blocks the result', async () => {
    const settings = createSettings();
    settings.toolPolicies.resultApprovalPolicies.ReadBlock = 'always';
    const siyuanPort = createSiyuanPort();
    siyuanPort.copyStdMarkdown.mockResolvedValue('# Block Content');
    const requestApproval = vi.fn(async () => ({ approved: false, rejectReason: '结果先别继续发给模型。' }));
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore: new AIChatVarStoreService(),
      siyuanPort: siyuanPort as never,
      getAISettings: () => settings,
    });

    const result = await executor.executeToolCall({
      id: 'tool-call-read',
      name: 'ReadBlock',
      arguments: {
        blockId: 'block-1',
      },
    }, {
      context: null,
      attachedContexts: [],
    }, {
      approvals: { requestApproval },
    });

    expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({
      type: 'result',
      toolName: 'ReadBlock',
      resultText: expect.stringContaining('# Block Content'),
    }));
    expect(result.status).toBe('result-rejected');
    expect(result.error).toBe('结果先别继续发给模型。');
  });

  it('resolves $VAR_REF placeholders before executing a tool call', async () => {
    const settings = createSettings();
    const siyuanPort = createSiyuanPort();
    siyuanPort.copyStdMarkdown.mockResolvedValue('resolved');
    const varStore = new AIChatVarStoreService();
    varStore.write('target-block', 'block-from-var');
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore,
      siyuanPort: siyuanPort as never,
      getAISettings: () => settings,
    });

    const result = await executor.executeToolCall({
      id: 'tool-call-var',
      name: 'ReadBlock',
      arguments: {
        blockId: '$VAR_REF{{target-block}}',
      },
    }, {
      context: null,
      attachedContexts: [],
    });

    expect(result.status).toBe('success');
    expect(siyuanPort.copyStdMarkdown).toHaveBeenCalledWith('block-from-var');
  });
});
