import { describe, expect, it, vi } from 'vitest';
import {
  AIDailyNoteDraftService,
  ATTR_AI_CANDIDATE_ID,
  ATTR_AI_FIELD_NAME,
  ATTR_AI_KIND,
  ATTR_AI_SESSION_ID,
  ATTR_AI_SOURCE_BLOCK_IDS,
  ATTR_AI_STATUS,
  ATTR_AI_TEMPLATE_ID,
} from '@/application/services/AIDailyNoteDraftService';

function createPort(options?: {
  sql?: ReturnType<typeof vi.fn>;
  ensureTodayDailyNote?: ReturnType<typeof vi.fn>;
  appendBlockUnderParent?: ReturnType<typeof vi.fn>;
  updateBlockMarkdown?: ReturnType<typeof vi.fn>;
  deleteBlock?: ReturnType<typeof vi.fn>;
  setBlockAttrs?: ReturnType<typeof vi.fn>;
}) {
  return {
    sql: options?.sql || vi.fn(async () => []),
    getBlockText: vi.fn(),
    copyStdMarkdown: vi.fn(),
    ensureTodayDailyNote: options?.ensureTodayDailyNote || vi.fn(async () => 'daily-doc-1'),
    setBlockAttrs: options?.setBlockAttrs || vi.fn(),
    getNotebookConf: vi.fn(),
    renderTemplate: vi.fn(),
    createDocWithMarkdown: vi.fn(),
    insertBlockAfter: vi.fn(),
    appendBlockUnderParent: options?.appendBlockUnderParent || vi.fn(),
    updateBlockMarkdown: options?.updateBlockMarkdown || vi.fn(async (blockId: string) => blockId),
    deleteBlock: options?.deleteBlock || vi.fn(),
  };
}

describe('AIDailyNoteDraftService', () => {
  it('uses today daily note lookup, reuses the root block, and normalizes the SiYuanMemo root title', async () => {
    const sql = vi.fn(async (stmt: string) => {
      if (stmt.includes('SELECT id, box') && stmt.includes('source-1')) {
        return [{ id: 'source-1', box: 'box-1' }];
      }
      if (stmt.includes("a0.name = 'custom-fsrs-ai-kind'") && stmt.includes("a0.value = 'root'")) {
        return [{ id: 'root-block-1', content: 'SiYuan Memo AI 制卡' }];
      }
      return [];
    });
    const ensureTodayDailyNote = vi.fn(async () => 'daily-doc-1');
    const appendBlockUnderParent = vi.fn()
      .mockResolvedValueOnce('session-block-1')
      .mockResolvedValueOnce('refs-block-1')
      .mockResolvedValueOnce('candidate-block-1')
      .mockResolvedValueOnce('field-front-1')
      .mockResolvedValueOnce('field-back-1');
    const updateBlockMarkdown = vi.fn(async (blockId: string) => blockId);
    const setBlockAttrs = vi.fn();
    const service = new AIDailyNoteDraftService(createPort({
      sql,
      ensureTodayDailyNote,
      appendBlockUnderParent,
      updateBlockMarkdown,
      setBlockAttrs,
    }));

    const result = await service.saveCandidates({
      mode: 'qa',
      candidates: [
        {
          candidateId: 'candidate-1',
          title: '候选 1',
          templateId: 'builtin-basic-qa',
          sourceBlockIds: ['source-1', 'source-2'],
          fieldValues: {
            front: 'Front body',
            back: 'Back body',
          },
          fieldOrder: ['front', 'back'],
        },
      ],
    });

    expect(ensureTodayDailyNote).toHaveBeenCalledWith('box-1');
    expect(updateBlockMarkdown).toHaveBeenCalledWith('root-block-1', '## SiYuanMemo AI 制卡');
    expect(result.dailyNoteDocId).toBe('daily-doc-1');
    expect(result.rootBlockId).toBe('root-block-1');
    expect(result.session.sessionBlockId).toBe('session-block-1');
    expect(result.session.sourceBlockIds).toEqual(['source-1', 'source-2']);
    expect(appendBlockUnderParent).toHaveBeenNthCalledWith(1, expect.stringContaining('### '), 'root-block-1');
    expect(appendBlockUnderParent).toHaveBeenNthCalledWith(2, '来源：((source-1)) ((source-2))', 'session-block-1');
    expect(appendBlockUnderParent).toHaveBeenNthCalledWith(3, '#### 候选 1', 'session-block-1');
    expect(appendBlockUnderParent).toHaveBeenNthCalledWith(4, 'Front body', 'candidate-block-1');
    expect(appendBlockUnderParent).toHaveBeenNthCalledWith(5, 'Back body', 'candidate-block-1');
    expect(setBlockAttrs).toHaveBeenCalledWith('candidate-block-1', expect.objectContaining({
      [ATTR_AI_KIND]: 'candidate',
      [ATTR_AI_CANDIDATE_ID]: 'candidate-1',
      [ATTR_AI_TEMPLATE_ID]: 'builtin-basic-qa',
      [ATTR_AI_SOURCE_BLOCK_IDS]: JSON.stringify(['source-1', 'source-2']),
      [ATTR_AI_STATUS]: 'saved',
    }));
  });

  it('reuses the current session, upserts existing candidate blocks, and deletes discarded or stale draft blocks', async () => {
    const sql = vi.fn(async (stmt: string) => {
      if (stmt.includes("a0.name = 'custom-fsrs-ai-kind'") && stmt.includes("a0.value = 'root'")) {
        return [{ id: 'root-block-1', content: 'SiYuanMemo AI 制卡' }];
      }
      if (stmt.includes("WHERE b.parent_id = 'session-block-1'")) {
        return [
          { id: 'candidate-block-1', candidateId: 'candidate-1', status: 'saved' },
          { id: 'candidate-block-removed', candidateId: 'candidate-removed', status: 'saved' },
        ];
      }
      return [];
    });
    const updateBlockMarkdown = vi.fn(async (blockId: string) => blockId);
    const appendBlockUnderParent = vi.fn().mockResolvedValueOnce('field-hint-1');
    const deleteBlock = vi.fn();
    const setBlockAttrs = vi.fn();
    const service = new AIDailyNoteDraftService(createPort({
      sql,
      appendBlockUnderParent,
      updateBlockMarkdown,
      deleteBlock,
      setBlockAttrs,
    }));

    const result = await service.saveCandidates({
      mode: 'qa',
      existingSession: {
        notebook: 'box-1',
        dailyNoteDocId: 'daily-doc-1',
        rootBlockId: 'root-block-1',
        sessionBlockId: 'session-block-1',
        sourceRefsBlockId: 'refs-block-1',
        sourceBlockIds: ['source-1', 'source-old'],
        sessionId: 'session-id-1',
        savedAt: 1,
      },
      authoritativeCandidateIds: ['candidate-1'],
      authoritativeSourceBlockIds: ['source-1'],
      candidates: [
        {
          candidateId: 'candidate-1',
          title: '候选 1（改）',
          templateId: 'builtin-basic-qa',
          sourceBlockIds: ['source-1'],
          fieldValues: {
            front: 'Front body updated',
            hint: 'Hint body',
          },
          fieldOrder: ['front', 'hint'],
          existingLocation: {
            notebook: 'box-1',
            dailyNoteDocId: 'daily-doc-1',
            rootBlockId: 'root-block-1',
            sessionBlockId: 'session-block-1',
            sourceRefsBlockId: 'refs-block-1',
            sourceBlockIds: ['source-1'],
            sessionId: 'session-id-1',
            savedAt: 1,
            candidateBlockId: 'candidate-block-1',
            fieldBlockIds: {
              front: 'field-front-1',
              back: 'field-back-1',
              extra: 'field-extra-1',
            },
          },
        },
      ],
    });

    expect(result.session.sessionBlockId).toBe('session-block-1');
    expect(result.session.sourceRefsBlockId).toBe('refs-block-1');
    expect(result.session.sourceBlockIds).toEqual(['source-1']);
    expect(updateBlockMarkdown).toHaveBeenCalledWith('session-block-1', expect.stringContaining('### '));
    expect(updateBlockMarkdown).toHaveBeenCalledWith('refs-block-1', '来源：((source-1))');
    expect(updateBlockMarkdown).toHaveBeenCalledWith('candidate-block-1', '#### 候选 1（改）');
    expect(updateBlockMarkdown).toHaveBeenCalledWith('field-front-1', 'Front body updated');
    expect(appendBlockUnderParent).toHaveBeenCalledWith('Hint body', 'candidate-block-1');
    expect(deleteBlock).toHaveBeenCalledWith('field-back-1');
    expect(deleteBlock).toHaveBeenCalledWith('field-extra-1');
    expect(deleteBlock).toHaveBeenCalledWith('candidate-block-removed');
    expect(result.deletedCandidateIds).toEqual(['candidate-removed']);
    expect(result.saved[0]?.location.fieldBlockIds).toEqual({
      front: 'field-front-1',
      hint: 'field-hint-1',
    });
    expect(setBlockAttrs).toHaveBeenCalledWith('field-hint-1', expect.objectContaining({
      [ATTR_AI_KIND]: 'field',
      [ATTR_AI_SESSION_ID]: 'session-id-1',
      [ATTR_AI_CANDIDATE_ID]: 'candidate-1',
      [ATTR_AI_FIELD_NAME]: 'hint',
      [ATTR_AI_TEMPLATE_ID]: 'builtin-basic-qa',
      [ATTR_AI_STATUS]: 'saved',
    }));
  });

  it('validates required field content before creating candidate blocks so failed saves do not leave half-written drafts', async () => {
    const sql = vi.fn(async (stmt: string) => {
      if (stmt.includes('SELECT id, box') && stmt.includes('source-1')) {
        return [{ id: 'source-1', box: 'box-1' }];
      }
      if (stmt.includes("a0.name = 'custom-fsrs-ai-kind'") && stmt.includes("a0.value = 'root'")) {
        return [{ id: 'root-block-1', content: 'SiYuanMemo AI 制卡' }];
      }
      return [];
    });
    const appendBlockUnderParent = vi.fn()
      .mockResolvedValueOnce('session-block-1')
      .mockResolvedValueOnce('refs-block-1');
    const service = new AIDailyNoteDraftService(createPort({
      sql,
      appendBlockUnderParent,
    }));

    const result = await service.saveCandidates({
      mode: 'qa',
      candidates: [
        {
          candidateId: 'candidate-1',
          title: '候选 1',
          templateId: 'builtin-basic-qa',
          sourceBlockIds: ['source-1'],
          fieldValues: {
            question: 'Question only',
          },
          fieldOrder: ['question', 'answer'],
        },
      ],
    });

    expect(result.saved).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.error.message).toContain('字段 answer 为空');
    expect(appendBlockUnderParent).toHaveBeenCalledTimes(2);
    expect(appendBlockUnderParent).not.toHaveBeenCalledWith('#### 候选 1', 'session-block-1');
  });

  it('reuses an existing session candidate block on retry when the previous save created the heading but not the location snapshot', async () => {
    const sql = vi.fn(async (stmt: string) => {
      if (stmt.includes("a0.name = 'custom-fsrs-ai-kind'") && stmt.includes("a0.value = 'root'")) {
        return [{ id: 'root-block-1', content: 'SiYuanMemo AI 制卡' }];
      }
      if (stmt.includes("a_candidate.name = 'custom-fsrs-ai-candidate-id'")) {
        return [{ id: 'candidate-block-1' }];
      }
      if (stmt.includes("a_field.name = 'custom-fsrs-ai-field-name'")) {
        return [];
      }
      return [];
    });
    const updateBlockMarkdown = vi.fn(async (blockId: string) => blockId);
    const appendBlockUnderParent = vi.fn()
      .mockResolvedValueOnce('field-question-1')
      .mockResolvedValueOnce('field-answer-1');
    const service = new AIDailyNoteDraftService(createPort({
      sql,
      appendBlockUnderParent,
      updateBlockMarkdown,
    }));

    const result = await service.saveCandidates({
      mode: 'qa',
      existingSession: {
        notebook: 'box-1',
        dailyNoteDocId: 'daily-doc-1',
        rootBlockId: 'root-block-1',
        sessionBlockId: 'session-block-1',
        sourceRefsBlockId: 'refs-block-1',
        sourceBlockIds: ['source-1'],
        sessionId: 'session-id-1',
        savedAt: 1,
      },
      candidates: [
        {
          candidateId: 'candidate-1',
          title: '候选 1',
          templateId: 'builtin-basic-qa',
          sourceBlockIds: ['source-1'],
          fieldValues: {
            question: 'Question body',
            answer: 'Answer body',
          },
          fieldOrder: ['question', 'answer'],
          existingLocation: null,
        },
      ],
    });

    expect(updateBlockMarkdown).toHaveBeenCalledWith('candidate-block-1', '#### 候选 1');
    expect(appendBlockUnderParent).toHaveBeenNthCalledWith(1, 'Question body', 'candidate-block-1');
    expect(appendBlockUnderParent).toHaveBeenNthCalledWith(2, 'Answer body', 'candidate-block-1');
    expect(result.saved[0]?.location.candidateBlockId).toBe('candidate-block-1');
    expect(result.saved[0]?.location.fieldBlockIds).toEqual({
      question: 'field-question-1',
      answer: 'field-answer-1',
    });
  });
});
