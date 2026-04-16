import { describe, expect, it, vi } from 'vitest';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import { DEFAULT_AI_SETTINGS, type AISettings } from '@/types/settings';

type TestBlockContent = {
  content: string;
};

const contentMap = new Map<string, TestBlockContent>([
  ['source-1', { content: 'Source A' }],
]);

function createAISettings(userSkills: unknown[]): AISettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    enabled: true,
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    model: 'test-model',
    defaultModelId: 'test-model',
    userSkills: userSkills as AISettings['userSkills'],
  };
}

function createService(options: {
  aiSettings: AISettings;
  llmChat: ReturnType<typeof vi.fn>;
}) {
  return new AIWorkbenchService({
    getAISettings: () => options.aiSettings,
    cardContentQueryService: {
      getBlockContentsWithType: vi.fn(async (blockIds: string[]) => new Map(
        blockIds.map((id) => [id, contentMap.get(id) || { content: '' }]),
      )),
    } as never,
    siyuanPort: {
      sql: vi.fn(async () => [{
        id: 'source-1',
        parent_id: null,
        root_id: 'root-1',
        type: 'p',
        subtype: '',
        content: 'Source A',
        markdown: 'Source A',
        hpath: '/doc/source-1',
      }]),
      getBlockText: vi.fn(async (blockId: string) => contentMap.get(blockId)?.content || ''),
      copyStdMarkdown: vi.fn(async () => ''),
      ensureTodayDailyNote: vi.fn(async () => 'daily-doc-1'),
      setBlockAttrs: vi.fn(),
      getNotebookConf: vi.fn(),
      renderTemplate: vi.fn(),
      createDocWithMarkdown: vi.fn(),
      insertBlockAfter: vi.fn(),
      appendBlockUnderParent: vi.fn(),
      updateBlockMarkdown: vi.fn(async (blockId: string) => blockId),
      deleteBlock: vi.fn(),
    } as never,
    llmPort: {
      chat: options.llmChat,
    },
  });
}

describe('AIWorkbenchService user skills', () => {
  it('runs a user chat skill on the shared chat runtime', async () => {
    const llmChat = vi.fn(async () => ({
      content: 'Custom chat reply',
      toolCalls: [],
    }));
    const service = createService({
      aiSettings: createAISettings([{
        id: 'coach',
        title: 'Coach',
        brief: 'Chat helper',
        enabled: true,
        mode: 'chat',
        systemPromptTemplate: 'You are a coach.',
        composerPreset: 'Start coach chat',
        primaryActionLabel: 'Chat',
        defaultToolGroups: ['context-read', 'vars'],
        sections: [],
        surfaceHints: {
          hideTabs: true,
          composerRows: 5,
          compactTitle: '',
        },
        version: 1,
      }]),
      llmChat,
    });

    await service.open({
      source: 'standalone',
      skillId: 'user:coach',
      selectedBlockIds: ['source-1'],
    });
    await service.runActiveSkill();

    expect(service.state.activeSkillId).toBe('user:coach');
    expect(service.state.threads['user:coach'].chat.messages.map((message) => message.kind)).toEqual([
      'user',
      'assistant-text',
    ]);
    expect(llmChat).toHaveBeenCalledOnce();
  });

  it('recovers partial structured results for a user structured skill', async () => {
    const llmChat = vi.fn(async () => ({
      content: JSON.stringify({
        summary: ['Point A', 'Point B'],
        cues: {
          cue1: 'Remember A',
        },
      }),
    }));
    const service = createService({
      aiSettings: createAISettings([{
        id: 'outline',
        title: 'Outline',
        brief: 'Structured helper',
        enabled: true,
        mode: 'structured',
        systemPromptTemplate: 'Return structured JSON.',
        composerPreset: 'Run outline',
        primaryActionLabel: 'Run',
        defaultToolGroups: ['context-read'],
        sections: [
          {
            id: 'summary',
            title: 'Summary',
            emptyHint: 'No summary',
            runPrompt: 'Generate summary list.',
            followUpPrompt: 'Answer based on summary.',
            responseKey: 'summary',
            renderer: 'list',
            required: true,
          },
          {
            id: 'cues',
            title: 'Cues',
            emptyHint: 'No cues',
            runPrompt: 'Generate cue map.',
            followUpPrompt: 'Answer based on cues.',
            responseKey: 'cues',
            renderer: 'keyValue',
            required: true,
          },
          {
            id: 'missing',
            title: 'Missing',
            emptyHint: 'No missing section',
            runPrompt: 'Generate another section.',
            followUpPrompt: 'Answer based on missing section.',
            responseKey: 'missing',
            renderer: 'markdown',
            required: true,
          },
        ],
        surfaceHints: {
          hideTabs: false,
          composerRows: 4,
          compactTitle: '',
        },
        version: 1,
      }]),
      llmChat,
    });

    await service.open({
      source: 'standalone',
      skillId: 'user:outline',
      selectedBlockIds: ['source-1'],
    });
    await service.runActiveSkill();

    const result = service.state.genericSkillResults['user:outline'];
    expect(result?.sections).toEqual([
      expect.objectContaining({
        id: 'user:outline:summary',
        items: ['Point A', 'Point B'],
      }),
      expect.objectContaining({
        id: 'user:outline:cues',
        keyValues: [{ key: 'cue1', value: 'Remember A' }],
      }),
      expect.objectContaining({
        id: 'user:outline:missing',
      }),
    ]);
    expect(service.state.threads['user:outline']['user:outline:summary'].messages.at(-1)).toMatchObject({
      kind: 'assistant-result',
    });
    expect(service.state.threads['user:outline']['user:outline:summary'].messages.at(-1)).toMatchObject({
      normalizationDiagnostic: expect.objectContaining({
        status: 'partial',
        missingSections: ['Missing'],
      }),
    });
  });
});
