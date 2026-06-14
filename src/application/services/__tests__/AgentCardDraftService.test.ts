import { describe, expect, it, vi } from 'vitest';
import {
  AgentCardDraftService,
  AGENT_CARD_DRAFT_DEFAULT_COUNT,
  AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE,
  AGENT_CARD_DRAFT_MAX_SOURCE_BLOCKS,
  AGENT_CARD_DRAFT_MAX_COUNT,
} from '../AgentCardDraftService';
import { DEFAULT_AI_SETTINGS, type AISettings } from '@/types/settings';

function enabledAISettings(overrides: Partial<AISettings> = {}): AISettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'https://api.example.test/v1',
    model: 'model-a',
    defaultModelId: 'model-a',
    providers: [{
      ...DEFAULT_AI_SETTINGS.providers[0],
      id: 'provider-a',
      name: 'Provider A',
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'test-key',
      models: [{ id: 'model-a', capabilities: { jsonObject: true } }],
    }],
    ...overrides,
  };
}

function createService(options: {
  content?: string;
  aiSettings?: AISettings;
  blockText?: (blockId: string) => string;
} = {}) {
  const chat = vi.fn(async () => ({
    content: options.content ?? JSON.stringify({
      candidates: [{
        type: 'qa',
        front: 'What is spaced repetition?',
        back: 'A review method that spaces retrieval over time.',
        validationWarnings: ['needs user review'],
      }],
    }),
    raw: {},
  }));
  const siyuanPort = {
    getBlockText: vi.fn(async (blockId: string) => options.blockText?.(blockId) ?? `Markdown for ${blockId}`),
  };
  const service = new AgentCardDraftService({
    getAISettings: () => options.aiSettings ?? enabledAISettings(),
    llmPort: { chat },
    siyuanPort,
    idFactory: (seed, index) => `draft-${seed}-${index}`,
    now: () => 10,
  });
  return { chat, service, siyuanPort };
}

function lastPromptPayload(chat: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const request = chat.mock.calls.at(-1)?.[0] as { messages: Array<{ role: string; content: string }> };
  const userMessage = request.messages.find((message) => message.role === 'user');
  return JSON.parse(userMessage?.content || '{}') as Record<string, unknown>;
}

describe('AgentCardDraftService', () => {
  it('generates preview candidates from explicit source content through the configured LLM', async () => {
    const { chat, service, siyuanPort } = createService();

    const result = await service.draft({
      sourceContent: 'Spaced repetition strengthens memory by reviewing before forgetting.',
      sourceBlockId: 'block-source',
      sourceDocId: 'doc-source',
      title: 'Memory',
      count: 3,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        persisted: false,
        defaultCount: AGENT_CARD_DRAFT_DEFAULT_COUNT,
        maxCount: AGENT_CARD_DRAFT_MAX_COUNT,
        supportedTypes: ['qa', 'cloze', 'concept', 'descriptor'],
        candidates: [{
          draftId: 'draft-block-source-0',
          type: 'qa',
          front: 'What is spaced repetition?',
          back: 'A review method that spaces retrieval over time.',
          persisted: false,
          sourceRefs: [{
            blockId: 'block-source',
            docId: 'doc-source',
            title: 'Memory',
          }],
          validationWarnings: ['needs user review'],
        }],
      },
      meta: {
        returnedItemCount: 1,
        totalItemCount: 1,
        followUpAction: 'memo_card action=save selectedDraftIds=[...] drafts=[...]',
      },
    });
    expect(siyuanPort.getBlockText).not.toHaveBeenCalled();
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'test-key',
      model: 'model-a',
      responseFormat: 'json_object',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
    }));
  });

  it('reads only requested sourceBlockId through the SiYuan read port', async () => {
    const { chat, service, siyuanPort } = createService();

    await expect(service.draft({
      sourceBlockId: 'block-a',
      count: 1,
    })).resolves.toMatchObject({
      ok: true,
      data: {
        sourceSummary: {
          sourceRefs: [{ blockId: 'block-a' }],
        },
      },
    });

    expect(siyuanPort.getBlockText).toHaveBeenCalledTimes(1);
    expect(siyuanPort.getBlockText).toHaveBeenCalledWith('block-a');
    const payload = lastPromptPayload(chat);
    expect(payload.sources).toEqual([
      expect.objectContaining({
        id: 'block-a',
        text: 'Markdown for block-a',
      }),
    ]);
  });

  it('uses focused and selected editor block ids without broad workspace scans', async () => {
    const { chat, service, siyuanPort } = createService();

    await expect(service.draft({
      editorContext: {
        focusedBlockID: 'block-focused',
        selectedBlockIDs: ['block-selected-1', 'block-selected-2'],
        activeDocId: 'doc-a',
        activeDocTitle: 'Doc A',
      },
      count: 1,
    })).resolves.toMatchObject({
      ok: true,
      data: {
        sourceSummary: {
          sourceCount: 3,
        },
      },
    });

    expect(siyuanPort.getBlockText).toHaveBeenCalledTimes(3);
    expect(siyuanPort.getBlockText.mock.calls.map(([blockId]) => blockId)).toEqual([
      'block-focused',
      'block-selected-1',
      'block-selected-2',
    ]);
    const payload = lastPromptPayload(chat);
    expect(JSON.stringify(payload)).not.toContain('workspace');
  });

  it('rejects missing source before calling AI', async () => {
    const { chat, service, siyuanPort } = createService();

    await expect(service.draft({ count: 1 })).resolves.toMatchObject({
      ok: false,
      status: 'validation-error',
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
    expect(chat).not.toHaveBeenCalled();
    expect(siyuanPort.getBlockText).not.toHaveBeenCalled();
  });

  it('bounds oversized source content before model execution', async () => {
    const { chat, service } = createService();
    const sourceContent = 'A'.repeat(AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE + 100);

    const result = await service.draft({
      sourceContent,
      count: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        sourceSummary: {
          truncated: true,
        },
        warnings: expect.arrayContaining([
          expect.stringContaining('truncated'),
        ]),
      },
    });
    const payload = lastPromptPayload(chat);
    const source = (payload.sources as Array<{ text: string }>)[0];
    expect(source.text).toHaveLength(AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE);
  });

  it('limits selected block reads before model execution', async () => {
    const { service, siyuanPort } = createService();
    const selectedBlockIDs = Array.from({ length: AGENT_CARD_DRAFT_MAX_SOURCE_BLOCKS + 3 }, (_, index) => `block-${index}`);

    const result = await service.draft({
      editorContext: { selectedBlockIDs },
      count: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        warnings: expect.arrayContaining([
          expect.stringContaining(`${AGENT_CARD_DRAFT_MAX_SOURCE_BLOCKS} blocks`),
        ]),
      },
    });
    expect(siyuanPort.getBlockText).toHaveBeenCalledTimes(AGENT_CARD_DRAFT_MAX_SOURCE_BLOCKS);
  });

  it('returns unavailable instead of heuristic candidates when AI settings are disabled', async () => {
    const { chat, service } = createService({
      aiSettings: enabledAISettings({ enabled: false }),
    });

    await expect(service.draft({
      sourceContent: 'This source would previously have produced local heuristic candidates.',
    })).resolves.toMatchObject({
      ok: false,
      status: 'unavailable',
      error: {
        code: 'AGENT_API_UNAVAILABLE',
      },
    });
    expect(chat).not.toHaveBeenCalled();
  });

  it('omits unsupported or incomplete candidates and reports validation warnings', async () => {
    const { service } = createService({
      content: JSON.stringify({
        candidates: [
          { type: 'image', front: 'Bad', back: 'Bad' },
          { type: 'qa', front: '', back: 'No front' },
          { type: 'cloze', front: 'SiYuanMemo uses {{c1::spaced repetition}}.', back: 'spaced repetition' },
          { type: 'concept', front: 'Memory consolidation', back: 'Stabilizing memories over time.' },
        ],
      }),
    });

    const result = await service.draft({
      sourceContent: 'Memory consolidation benefits from retrieval and spacing.',
      count: 5,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        candidates: [
          { draftId: 'draft-explicit-source-0', type: 'cloze' },
          { draftId: 'draft-explicit-source-1', type: 'concept' },
        ],
        warnings: expect.arrayContaining([
          expect.stringContaining('unsupported type'),
          expect.stringContaining('requires non-empty front and back'),
        ]),
      },
    });
  });

  it('returns validation errors for malformed AI JSON', async () => {
    const { service } = createService({ content: 'not-json' });

    await expect(service.draft({
      sourceContent: 'Valid source.',
    })).resolves.toMatchObject({
      ok: false,
      status: 'validation-error',
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });
});
