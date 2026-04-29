import { describe, expect, it, vi } from 'vitest';
import {
  AIWorkbenchCdfRuntime,
  type AIWorkbenchCdfRuntimeDeps,
} from '@/application/services/AIWorkbenchCdfRuntime';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  type AICdfStructure,
  type AIConceptCoachPerspectiveSection,
  type AIConceptCoachResult,
  type AIWorkbenchAssistantResultMessage,
  type AIWorkbenchSelfTestCardTargetMemory,
} from '@/types/ai';

const CDF_UNRESOLVED_WARNING = '未解析到现有概念文档，当前概念只保留为草稿，无法直接建卡。';

function perspective(title: string): AIConceptCoachPerspectiveSection {
  return {
    title,
    keyPoints: [`${title} point`],
  };
}

function cdfStructure(): AICdfStructure {
  return {
    anchors: [{
      id: 'anchor-1',
      conceptName: 'Gravity',
      selected: true,
      definitionCandidates: [
        { id: 'def-1', text: 'Definition one', selected: true },
        { id: 'def-2', text: 'Definition two', selected: false },
      ],
      descriptorGroups: [{
        id: 'group-1',
        title: 'Properties',
        selected: true,
        items: [{ id: 'item-1', text: 'attraction', selected: true }],
      }],
      resolution: { status: 'unresolved', conceptBlockId: null, conceptTitle: 'Gravity', reason: null },
      warnings: [CDF_UNRESOLVED_WARNING, 'Keep me'],
    }],
  };
}

function conceptCoachResult(structure: AICdfStructure = cdfStructure()): AIConceptCoachResult {
  return {
    workingDefinition: 'Gravity is attraction between masses.',
    perspectives: {
      traits: perspective('特性和倾向'),
      contrasts: perspective('边界和反差'),
      partsAndWhole: perspective('局部和整体'),
      causality: perspective('因果链路'),
      significance: perspective('意义和使用'),
    },
    integratedUnderstanding: {
      essence: 'Gravity bends trajectories.',
      notWhat: ['not magnetism'],
      capabilities: ['explains falling'],
    },
    selfTestCards: {
      creationMode: 'list-item',
      cards: [],
    },
    cdfStructure: structure,
    realWorldTriggers: {
      triggers: ['falling object'],
    },
    rawContent: '{}',
  };
}

function resultMessage(
  result: AIConceptCoachResult,
  overrides: Partial<AIWorkbenchAssistantResultMessage> = {},
): AIWorkbenchAssistantResultMessage {
  return {
    id: 'msg-1',
    skillId: AI_CONCEPT_COACH_SKILL_ID,
    tabId: 'cdf-structure',
    contextSignature: 'ctx-1',
    kind: 'assistant-result',
    createdAt: 1,
    rawContent: JSON.stringify({ cdfStructure: result.cdfStructure }, null, 2),
    conceptCoachResult: result,
    tabResult: result.cdfStructure,
    appliedContexts: [],
    ...overrides,
  };
}

function targetMemory(): AIWorkbenchSelfTestCardTargetMemory {
  return {
    mode: 'block',
    notebookId: 'notebook-1',
    notebookName: 'Notebook',
    targetBlockId: 'target-block-1',
    targetLabel: 'Target block',
    updatedAt: 1,
  };
}

function createRuntime(options?: {
  result?: AIConceptCoachResult;
  message?: AIWorkbenchAssistantResultMessage;
  resolveTarget?: AIWorkbenchCdfRuntimeDeps['resolveSelfTestCardWriteTarget'];
}) {
  let result = options?.result || conceptCoachResult();
  let message = options?.message || resultMessage(result);
  const sessionStore = {
    saveSelfTestCardTargetMemory: vi.fn(async (memory: AIWorkbenchSelfTestCardTargetMemory) => memory),
  };
  const deps: AIWorkbenchCdfRuntimeDeps = {
    getContext: () => null,
    getContextSignature: () => 'ctx-1',
    flashcardTools: {
      previewSemanticCdfStructure: vi.fn(async (structure: AICdfStructure) => structure) as never,
      createSemanticCdfCards: vi.fn() as never,
      searchConceptDocumentsInNotebook: vi.fn() as never,
      createOrReuseConceptDocumentInNotebook: vi.fn() as never,
    },
    siyuanPort: {
      appendBlockUnderParentDetailed: vi.fn(async () => ({ doOperations: [{ id: 'appended-1' }] })),
      insertBlockAfterDetailed: vi.fn(async () => ({ doOperations: [{ id: 'inserted-1' }] })),
    },
    getSessionStore: () => sessionStore,
    getSelfTestCreationMode: () => 'list-item',
    getConceptCoachResultMessage: (_messageId, tabId) => {
      if (tabId && message.tabId !== tabId) {
        return null;
      }
      return message;
    },
    findLatestConceptCoachResultForContext: () => result,
    setScopedConceptCoachResult: vi.fn((next: AIConceptCoachResult) => {
      result = next;
    }),
    addNodeVersion: vi.fn((_messageId, updater) => {
      message = updater(message);
      return message;
    }),
    syncDerivedStateFromThreads: vi.fn(),
    persistCurrentSession: vi.fn(async () => undefined),
    resolveSelfTestCardWriteTarget: options?.resolveTarget || vi.fn(async () => ({
      memory: targetMemory(),
      targetBlockId: 'target-block-1',
      writeMode: 'append',
    })),
    recordArenaCreate: vi.fn(async () => undefined),
  };

  return {
    runtime: new AIWorkbenchCdfRuntime(deps),
    deps,
    sessionStore,
    get result() {
      return result;
    },
    get message() {
      return message;
    },
  };
}

describe('AIWorkbenchCdfRuntime', () => {
  it('updates CDF message versions and persists manual anchor resolution', async () => {
    const harness = createRuntime();

    await harness.runtime.setDefinitionSelected('msg-1', 'anchor-1', 'def-2', true);

    expect(harness.result.cdfStructure.anchors[0].definitionCandidates).toEqual([
      expect.objectContaining({ id: 'def-1', selected: false }),
      expect.objectContaining({ id: 'def-2', selected: true }),
    ]);
    expect(harness.message.tabResult).toEqual(harness.result.cdfStructure);
    expect(harness.deps.addNodeVersion).toHaveBeenCalledTimes(1);
    expect(harness.deps.syncDerivedStateFromThreads).toHaveBeenCalledTimes(1);
    expect(harness.deps.persistCurrentSession).toHaveBeenCalledTimes(1);

    await harness.runtime.setAnchorManualResolution('msg-1', 'anchor-1', targetMemory(), {
      id: 'concept-block-1',
      title: 'Gravity concept',
      hPath: '/Physics/Gravity',
      notebookId: 'notebook-1',
      notebookName: 'Notebook',
    });

    expect(harness.result.cdfStructure.anchors[0].resolution).toMatchObject({
      status: 'resolved-manual',
      conceptBlockId: 'concept-block-1',
      conceptTitle: 'Gravity concept',
      notebookId: 'notebook-1',
    });
    expect(harness.result.cdfStructure.anchors[0].warnings).toEqual(['Keep me']);
    expect(harness.deps.persistCurrentSession).toHaveBeenCalledTimes(2);
  });

  it('sends assistant result markdown with the resolved Siyuan write mode and saves target memory', async () => {
    const memory = targetMemory();
    const resolveTarget = vi.fn(async () => ({
      memory,
      targetBlockId: 'target-block-1',
      writeMode: 'after' as const,
    }));
    const result = conceptCoachResult();
    const harness = createRuntime({
      result,
      message: resultMessage(result, {
        tabId: 'working-definition',
        tabResult: result.workingDefinition,
      }),
      resolveTarget,
    });

    const sent = await harness.runtime.sendAssistantResultToSiyuan({
      mode: 'block',
      notebookId: 'notebook-1',
      targetBlockId: 'target-block-1',
    }, 'msg-1');

    expect(resolveTarget).toHaveBeenCalledWith(expect.objectContaining({ mode: 'block' }));
    expect(harness.deps.siyuanPort.insertBlockAfterDetailed).toHaveBeenCalledWith(
      expect.stringContaining('## AI 工作台 · 工作定义 · '),
      'target-block-1',
    );
    expect(harness.deps.siyuanPort.appendBlockUnderParentDetailed).not.toHaveBeenCalled();
    expect(sent).toMatchObject({
      target: memory,
      targetBlockId: 'target-block-1',
      targetLabel: 'Target block',
      sectionTitle: '工作定义',
      insertedRootBlockId: 'inserted-1',
    });
    expect(sent.markdown).toContain('Gravity is attraction between masses.');
    expect(harness.sessionStore.saveSelfTestCardTargetMemory).toHaveBeenCalledWith(memory);
    expect(harness.deps.recordArenaCreate).toHaveBeenCalledWith({
      qualityLabel: 'strong',
      metadata: expect.objectContaining({
        messageId: 'msg-1',
        insertedRootBlockId: 'inserted-1',
        sectionTitle: '工作定义',
      }),
    });
  });
});
