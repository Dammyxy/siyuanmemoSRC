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
    addRiffCards: vi.fn(),
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

  it('supports ApplyBlockDiff dry runs without writing back to SiYuan', async () => {
    const settings = createSettings();
    settings.toolPolicies.groupDefaults['siyuan-write'] = true;
    const siyuanPort = createSiyuanPort();
    siyuanPort.copyStdMarkdown.mockResolvedValue('alpha beta gamma');
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore: new AIChatVarStoreService(),
      siyuanPort: siyuanPort as never,
      getAISettings: () => settings,
    });

    const result = await executor.executeToolCall({
      id: 'tool-call-diff',
      name: 'ApplyBlockDiff',
      arguments: {
        blockId: 'block-1',
        searchReplaceDiff: ['<<<<<<< SEARCH', 'beta', '=======', 'delta', '>>>>>>> REPLACE'].join('\n'),
        dryRun: true,
      },
    }, {
      context: null,
      attachedContexts: [],
    }, {
      approvals: { requestApproval: vi.fn(async () => ({ approved: true })) },
    });

    expect(result.status).toBe('success');
    expect(result.data).toMatchObject({
      blockId: 'block-1',
      dryRun: true,
      nextMarkdown: 'alpha delta gamma',
    });
    expect(siyuanPort.updateBlockMarkdown).not.toHaveBeenCalled();
  });

  it('fails closed for production write tools when backend AI job authority is unavailable', async () => {
    const settings = createSettings();
    settings.toolPolicies.groupDefaults['siyuan-write'] = true;
    const siyuanPort = createSiyuanPort();
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValue({
      doOperations: [{ id: 'inserted-block-1' }],
    });
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore: new AIChatVarStoreService(),
      siyuanPort: siyuanPort as never,
      getAISettings: () => settings,
    });

    const result = await executor.executeToolCall({
      id: 'tool-call-append',
      name: 'AppendContent',
      arguments: {
        parentBlockId: 'target-block',
        markdown: 'new content',
      },
    }, {
      context: null,
      attachedContexts: [],
    }, {
      approvals: { requestApproval: vi.fn(async () => ({ approved: true })) },
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('AI_TOOL_JOB_UNAVAILABLE');
    expect(siyuanPort.appendBlockUnderParentDetailed).not.toHaveBeenCalled();
  });

  it('executes production write tools only after backend AI job approval succeeds', async () => {
    const settings = createSettings();
    settings.toolPolicies.groupDefaults['siyuan-write'] = true;
    const siyuanPort = createSiyuanPort();
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValue({
      doOperations: [{ id: 'inserted-block-1' }],
    });
    const aiToolJobClient = {
      executeAiToolJob: vi.fn(async () => ({
        status: 'waiting-for-user-approval',
        jobId: 'job-tool-call-append',
        sessionId: 'ai-tool-session:standalone',
        commandId: 'ai-tool-command:tool-call-append',
        phase: 'approval-wait',
        progress: { state: 'waiting-for-user-approval', currentStep: 'approval-wait', percent: 0 },
        diagnostics: {
          diagnosticEventId: 'diag-1',
          family: 'ai.tool-job',
          commandId: 'ai-tool-command:tool-call-append',
          timing: { submittedAt: 1, deadlineAt: null, completedAt: null },
        },
      })),
      submitAiToolJobApproval: vi.fn(async () => ({
        status: 'completed',
        jobId: 'job-tool-call-append',
        sessionId: 'ai-tool-session:standalone',
        commandId: 'ai-tool-command:tool-call-append',
        phase: 'terminal',
        progress: { state: 'succeeded', currentStep: 'approval-decision', percent: 100 },
        diagnostics: {
          diagnosticEventId: 'diag-2',
          family: 'ai.tool-job',
          commandId: 'ai-tool-command:tool-call-append',
          timing: { submittedAt: 1, deadlineAt: null, completedAt: 2 },
        },
      })),
    };
    const requestApproval = vi.fn(async () => ({ approved: true }));
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore: new AIChatVarStoreService(),
      siyuanPort: siyuanPort as never,
      aiToolJobClient,
      getAISettings: () => settings,
    });

    const result = await executor.executeToolCall({
      id: 'tool-call-append',
      name: 'AppendContent',
      arguments: {
        parentBlockId: 'target-block',
        markdown: 'new content',
      },
    }, {
      context: null,
      attachedContexts: [],
    }, {
      approvals: { requestApproval },
    });

    expect(result.status).toBe('success');
    expect(aiToolJobClient.executeAiToolJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'ai-tool-job:tool-call-append',
      commandId: 'ai-tool-command:tool-call-append',
      toolName: 'AppendContent',
      requiresApproval: true,
      approvalState: 'pending',
      writeIntent: expect.objectContaining({
        kind: 'markdown-insertion',
        targetBlockId: 'target-block',
      }),
    }));
    expect(aiToolJobClient.submitAiToolJobApproval).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'approved',
    }));
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(siyuanPort.appendBlockUnderParentDetailed).toHaveBeenCalledTimes(1);
  });

  it('does not execute writes when backend AI job reports writer unavailable', async () => {
    const settings = createSettings();
    settings.toolPolicies.groupDefaults['siyuan-write'] = true;
    const siyuanPort = createSiyuanPort();
    const aiToolJobClient = {
      executeAiToolJob: vi.fn(async () => ({
        status: 'unavailable',
        jobId: 'ai-tool-job:tool-call-append',
        sessionId: 'ai-tool-session:standalone',
        commandId: 'ai-tool-command:tool-call-append',
        phase: 'write-preparation',
        unavailableClass: 'WRITER_UNAVAILABLE',
        reason: 'writer unavailable',
        progress: { state: 'failed', currentStep: 'write-preparation', percent: 0 },
        diagnostics: {
          diagnosticEventId: 'diag-writer',
          family: 'ai.tool-job',
          commandId: 'ai-tool-command:tool-call-append',
          timing: { submittedAt: 1, deadlineAt: null, completedAt: 2 },
          errorCategory: 'WRITER_UNAVAILABLE',
        },
      })),
      submitAiToolJobApproval: vi.fn(),
    };
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore: new AIChatVarStoreService(),
      siyuanPort: siyuanPort as never,
      aiToolJobClient,
      getAISettings: () => settings,
    });

    const result = await executor.executeToolCall({
      id: 'tool-call-append',
      name: 'AppendContent',
      arguments: {
        parentBlockId: 'target-block',
        markdown: 'new content',
      },
    }, {
      context: null,
      attachedContexts: [],
    }, {
      approvals: { requestApproval: vi.fn(async () => ({ approved: true })) },
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('WRITER_UNAVAILABLE');
    expect(aiToolJobClient.submitAiToolJobApproval).not.toHaveBeenCalled();
    expect(siyuanPort.appendBlockUnderParentDetailed).not.toHaveBeenCalled();
  });

  it('does not execute writes when backend AI job provider execution fails', async () => {
    const settings = createSettings();
    settings.toolPolicies.groupDefaults['siyuan-write'] = true;
    const siyuanPort = createSiyuanPort();
    const aiToolJobClient = {
      executeAiToolJob: vi.fn(async () => {
        throw new Error('provider failed before write preparation');
      }),
      submitAiToolJobApproval: vi.fn(),
    };
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore: new AIChatVarStoreService(),
      siyuanPort: siyuanPort as never,
      aiToolJobClient,
      getAISettings: () => settings,
    });

    const result = await executor.executeToolCall({
      id: 'tool-call-append-provider-failure',
      name: 'AppendContent',
      arguments: {
        parentBlockId: 'target-block',
        markdown: 'new content',
      },
    }, {
      context: null,
      attachedContexts: [],
    }, {
      approvals: { requestApproval: vi.fn(async () => ({ approved: true })) },
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('provider failed before write preparation');
    expect(aiToolJobClient.submitAiToolJobApproval).not.toHaveBeenCalled();
    expect(siyuanPort.appendBlockUnderParentDetailed).not.toHaveBeenCalled();
  });

  it('does not execute writes when backend AI job reports kernel sidecar unavailable', async () => {
    const settings = createSettings();
    settings.toolPolicies.groupDefaults['siyuan-write'] = true;
    const siyuanPort = createSiyuanPort();
    const aiToolJobClient = {
      executeAiToolJob: vi.fn(async () => ({
        status: 'unavailable',
        jobId: 'ai-tool-job:tool-call-append-kernel',
        sessionId: 'ai-tool-session:standalone',
        commandId: 'ai-tool-command:tool-call-append-kernel',
        phase: 'provider-execution',
        unavailableClass: 'KERNEL_SIDECAR_UNAVAILABLE',
        reason: 'kernel stream unavailable',
        progress: { state: 'failed', currentStep: 'provider-execution', percent: 0 },
        diagnostics: {
          diagnosticEventId: 'diag-kernel',
          family: 'ai.tool-job',
          commandId: 'ai-tool-command:tool-call-append-kernel',
          timing: { submittedAt: 1, deadlineAt: null, completedAt: 2 },
          errorCategory: 'KERNEL_SIDECAR_UNAVAILABLE',
        },
      })),
      submitAiToolJobApproval: vi.fn(),
    };
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore: new AIChatVarStoreService(),
      siyuanPort: siyuanPort as never,
      aiToolJobClient,
      getAISettings: () => settings,
    });

    const result = await executor.executeToolCall({
      id: 'tool-call-append-kernel',
      name: 'AppendContent',
      arguments: {
        parentBlockId: 'target-block',
        markdown: 'new content',
      },
    }, {
      context: null,
      attachedContexts: [],
    }, {
      approvals: { requestApproval: vi.fn(async () => ({ approved: true })) },
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('KERNEL_SIDECAR_UNAVAILABLE');
    expect(aiToolJobClient.submitAiToolJobApproval).not.toHaveBeenCalled();
    expect(siyuanPort.appendBlockUnderParentDetailed).not.toHaveBeenCalled();
  });

  it('delegates DecideStudyAction to flashcard tools when the study-decision group is enabled', async () => {
    const settings = createSettings();
    settings.toolPolicies.groupDefaults['study-decision'] = true;
    const siyuanPort = createSiyuanPort();
    const flashcardTools = {
      decideStudyAction: vi.fn(async () => ({
        action: 'answer-directly',
        recommendedTool: null,
        cardFamily: null,
        reason: '先解释。',
        missingInfo: [],
        approvalRequired: false,
      })),
    };
    const executor = new AIChatToolExecutorService({
      registry: new AIChatToolRegistry(),
      varStore: new AIChatVarStoreService(),
      siyuanPort: siyuanPort as never,
      flashcardTools: flashcardTools as never,
      getAISettings: () => settings,
    });

    const result = await executor.executeToolCall({
      id: 'tool-call-decision',
      name: 'DecideStudyAction',
      arguments: {
        request: '先帮我解释这段内容',
      },
    }, {
      context: null,
      attachedContexts: [],
    });

    expect(result.status).toBe('success');
    expect(flashcardTools.decideStudyAction).toHaveBeenCalledWith({
      request: '先帮我解释这段内容',
    }, {
      context: null,
      attachedContexts: [],
    });
  });
});
