import type { AISiyuanBlockRow, AISiyuanPort } from '@/application/ports/AISiyuanPort';
import type {
  AICandidateDraftLocation,
  AIDraftSessionLocation,
  AIMakeCardMode,
} from '@/types/ai';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AIDailyNoteDraftService');

const AI_DRAFT_ROOT_TITLE = 'SiYuanMemo AI 制卡';

export const ATTR_AI_KIND = 'custom-fsrs-ai-kind';
export const ATTR_AI_SESSION_ID = 'custom-fsrs-ai-session-id';
export const ATTR_AI_CANDIDATE_ID = 'custom-fsrs-ai-candidate-id';
export const ATTR_AI_TEMPLATE_ID = 'custom-fsrs-ai-template-id';
export const ATTR_AI_FIELD_NAME = 'custom-fsrs-ai-field-name';
export const ATTR_AI_SOURCE_BLOCK_IDS = 'custom-fsrs-ai-source-block-ids';
export const ATTR_AI_STATUS = 'custom-fsrs-ai-status';

export const AI_DRAFT_BLOCK_ATTR_KEYS = Object.freeze([
  ATTR_AI_KIND,
  ATTR_AI_SESSION_ID,
  ATTR_AI_CANDIDATE_ID,
  ATTR_AI_TEMPLATE_ID,
  ATTR_AI_FIELD_NAME,
  ATTR_AI_SOURCE_BLOCK_IDS,
  ATTR_AI_STATUS,
]);

type AIDraftBlockKind = 'root' | 'session' | 'source-refs' | 'candidate' | 'field';

export interface AIDailyNoteDraftCandidateInput {
  candidateId: string;
  title: string;
  templateId: string;
  sourceBlockIds: string[];
  fieldValues: Record<string, string>;
  fieldOrder: string[];
  existingLocation?: AICandidateDraftLocation | null;
}

export interface AIDailyNoteDraftSaveBatchInput {
  mode: AIMakeCardMode;
  candidates: AIDailyNoteDraftCandidateInput[];
  existingSession?: AIDraftSessionLocation | null;
  authoritativeCandidateIds?: string[];
  authoritativeSourceBlockIds?: string[];
}

export interface AIDailyNoteDraftCandidateSaveSuccess {
  candidateId: string;
  location: AICandidateDraftLocation;
}

export interface AIDailyNoteDraftCandidateSaveFailure {
  candidateId: string;
  error: Error;
}

export interface AIDailyNoteDraftSaveBatchResult {
  notebook: string;
  dailyNoteDocId: string;
  rootBlockId: string;
  sessionBlockId: string;
  sourceRefsBlockId: string | null;
  sessionId: string;
  savedAt: number;
  session: AIDraftSessionLocation;
  deletedCandidateIds: string[];
  saved: AIDailyNoteDraftCandidateSaveSuccess[];
  failed: AIDailyNoteDraftCandidateSaveFailure[];
}

type CandidateBlockRow = AISiyuanBlockRow & {
  candidateId?: string;
  status?: string;
};

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(
    ids
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  ));
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function modeLabel(mode: AIMakeCardMode): string {
  switch (mode) {
    case 'cloze':
      return '挖空候选';
    case 'concept-descriptor':
      return '概念 / 描述符候选';
    default:
      return '问答候选';
  }
}

function serializeSourceBlockIds(sourceBlockIds: string[]): string {
  return JSON.stringify(uniqueIds(sourceBlockIds));
}

function sanitizeHeadingText(value: string, fallback: string): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function createSessionId(savedAt: number): string {
  return `ai-draft-${savedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class AIDailyNoteDraftService {
  constructor(private readonly siyuanPort: AISiyuanPort) {}

  async saveCandidates(input: AIDailyNoteDraftSaveBatchInput): Promise<AIDailyNoteDraftSaveBatchResult> {
    const candidates = input.candidates.filter((candidate) => candidate.fieldOrder.length > 0);
    const hasAuthoritySnapshot = Array.isArray(input.authoritativeCandidateIds);
    if (candidates.length === 0 && !hasAuthoritySnapshot) {
      throw new Error('当前没有可写入 Daily Note 的候选卡。');
    }

    const savedAt = Date.now();
    const desiredSourceBlockIds = this.resolveDesiredSourceBlockIds(input, candidates);
    const notebook = normalizeString(input.existingSession?.notebook)
      || await this.resolveNotebook(desiredSourceBlockIds);
    const dailyNoteDocId = normalizeString(input.existingSession?.dailyNoteDocId)
      || await this.siyuanPort.ensureTodayDailyNote(notebook);
    const rootBlockId = await this.ensureRootBlock(dailyNoteDocId);
    const session = await this.ensureSession({
      existingSession: input.existingSession || null,
      notebook,
      dailyNoteDocId,
      rootBlockId,
      mode: input.mode,
      savedAt,
      sourceBlockIds: desiredSourceBlockIds,
    });
    const sourceRefsBlockId = await this.ensureSourceRefsBlock({
      parentId: session.sessionBlockId,
      existingBlockId: session.sourceRefsBlockId,
      sessionId: session.sessionId,
      sourceBlockIds: desiredSourceBlockIds,
    });
    const finalSession: AIDraftSessionLocation = {
      ...session,
      sourceRefsBlockId,
      sourceBlockIds: desiredSourceBlockIds,
      savedAt,
    };

    const saved: AIDailyNoteDraftCandidateSaveSuccess[] = [];
    const failed: AIDailyNoteDraftCandidateSaveFailure[] = [];

    for (const candidate of candidates) {
      try {
        saved.push({
          candidateId: candidate.candidateId,
          location: await this.upsertCandidateDraft({
            session: finalSession,
            candidate,
          }),
        });
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        logger.warn('Failed to save AI draft candidate to daily note:', {
          candidateId: candidate.candidateId,
          error: normalized,
        });
        failed.push({
          candidateId: candidate.candidateId,
          error: normalized,
        });
      }
    }

    const deletedCandidateIds = hasAuthoritySnapshot
      ? await this.deleteMissingSessionCandidates(finalSession, input.authoritativeCandidateIds || [])
      : [];

    return {
      notebook,
      dailyNoteDocId,
      rootBlockId,
      sessionBlockId: finalSession.sessionBlockId,
      sourceRefsBlockId,
      sessionId: finalSession.sessionId,
      savedAt,
      session: finalSession,
      deletedCandidateIds,
      saved,
      failed,
    };
  }

  async markDraftStatus(location: AICandidateDraftLocation, status: 'saved' | 'creating' | 'created' | 'error'): Promise<void> {
    const attrs = {
      [ATTR_AI_STATUS]: status,
    };
    await this.siyuanPort.setBlockAttrs(location.candidateBlockId, attrs);
    const fieldIds = uniqueIds(Object.values(location.fieldBlockIds));
    for (const fieldBlockId of fieldIds) {
      await this.siyuanPort.setBlockAttrs(fieldBlockId, attrs);
    }
  }

  private resolveDesiredSourceBlockIds(
    input: AIDailyNoteDraftSaveBatchInput,
    candidates: AIDailyNoteDraftCandidateInput[],
  ): string[] {
    if (Array.isArray(input.authoritativeSourceBlockIds)) {
      return uniqueIds(input.authoritativeSourceBlockIds);
    }

    return uniqueIds([
      ...(input.existingSession?.sourceBlockIds || []),
      ...candidates.flatMap((candidate) => candidate.sourceBlockIds),
    ]);
  }

  private async ensureSession(input: {
    existingSession: AIDraftSessionLocation | null;
    notebook: string;
    dailyNoteDocId: string;
    rootBlockId: string;
    mode: AIMakeCardMode;
    savedAt: number;
    sourceBlockIds: string[];
  }): Promise<AIDraftSessionLocation> {
    if (input.existingSession) {
      await this.siyuanPort.updateBlockMarkdown(
        input.existingSession.sessionBlockId,
        `### ${formatTimestamp(input.savedAt)} · ${modeLabel(input.mode)}`,
      );
      await this.setDraftAttrs(input.existingSession.sessionBlockId, {
        [ATTR_AI_KIND]: 'session',
        [ATTR_AI_SESSION_ID]: input.existingSession.sessionId,
        [ATTR_AI_SOURCE_BLOCK_IDS]: serializeSourceBlockIds(input.sourceBlockIds),
        [ATTR_AI_STATUS]: 'saved',
      });
      return {
        ...input.existingSession,
        notebook: input.notebook,
        dailyNoteDocId: input.dailyNoteDocId,
        rootBlockId: input.rootBlockId,
        sourceBlockIds: input.sourceBlockIds,
        savedAt: input.savedAt,
      };
    }

    const sessionId = createSessionId(input.savedAt);
    const sessionBlockId = await this.siyuanPort.appendBlockUnderParent(
      `### ${formatTimestamp(input.savedAt)} · ${modeLabel(input.mode)}`,
      input.rootBlockId,
    );
    await this.setDraftAttrs(sessionBlockId, {
      [ATTR_AI_KIND]: 'session',
      [ATTR_AI_SESSION_ID]: sessionId,
      [ATTR_AI_SOURCE_BLOCK_IDS]: serializeSourceBlockIds(input.sourceBlockIds),
      [ATTR_AI_STATUS]: 'saved',
    });
    return {
      notebook: input.notebook,
      dailyNoteDocId: input.dailyNoteDocId,
      rootBlockId: input.rootBlockId,
      sessionBlockId,
      sourceRefsBlockId: null,
      sourceBlockIds: input.sourceBlockIds,
      sessionId,
      savedAt: input.savedAt,
    };
  }

  private async ensureSourceRefsBlock(input: {
    parentId: string;
    existingBlockId: string | null;
    sessionId: string;
    sourceBlockIds: string[];
  }): Promise<string | null> {
    const normalizedSourceBlockIds = uniqueIds(input.sourceBlockIds);
    const existingBlockId = normalizeString(input.existingBlockId) || null;

    if (normalizedSourceBlockIds.length === 0) {
      if (existingBlockId) {
        await this.siyuanPort.deleteBlock(existingBlockId);
      }
      return null;
    }

    const refsMarkdown = `来源：${normalizedSourceBlockIds.map((blockId) => `((${blockId}))`).join(' ')}`;
    const sourceRefsBlockId = existingBlockId
      ? await this.siyuanPort.updateBlockMarkdown(existingBlockId, refsMarkdown)
      : await this.siyuanPort.appendBlockUnderParent(refsMarkdown, input.parentId);
    await this.setDraftAttrs(sourceRefsBlockId, {
      [ATTR_AI_KIND]: 'source-refs',
      [ATTR_AI_SESSION_ID]: input.sessionId,
      [ATTR_AI_SOURCE_BLOCK_IDS]: serializeSourceBlockIds(normalizedSourceBlockIds),
      [ATTR_AI_STATUS]: 'saved',
    });
    return sourceRefsBlockId;
  }

  private async upsertCandidateDraft(input: {
    session: AIDraftSessionLocation;
    candidate: AIDailyNoteDraftCandidateInput;
  }): Promise<AICandidateDraftLocation> {
    const { candidate, session } = input;
    const existingLocation = candidate.existingLocation || await this.findExistingSessionCandidateLocation(
      session,
      candidate.candidateId,
    );
    const resolvedFieldEntries = candidate.fieldOrder.map((fieldName) => {
      const rawValue = String(candidate.fieldValues[fieldName] || '').trim();
      if (!rawValue) {
        throw new Error(`字段 ${fieldName} 为空，无法保存到 Daily Note。`);
      }
      return [fieldName, rawValue] as const;
    });
    const candidateMarkdown = `#### ${sanitizeHeadingText(candidate.title, '未命名候选')}`;
    const candidateBlockId = normalizeString(existingLocation?.candidateBlockId)
      ? await this.siyuanPort.updateBlockMarkdown(existingLocation!.candidateBlockId, candidateMarkdown)
      : await this.siyuanPort.appendBlockUnderParent(candidateMarkdown, session.sessionBlockId);
    await this.setDraftAttrs(candidateBlockId, {
      [ATTR_AI_KIND]: 'candidate',
      [ATTR_AI_SESSION_ID]: session.sessionId,
      [ATTR_AI_CANDIDATE_ID]: candidate.candidateId,
      [ATTR_AI_TEMPLATE_ID]: candidate.templateId,
      [ATTR_AI_SOURCE_BLOCK_IDS]: serializeSourceBlockIds(candidate.sourceBlockIds),
      [ATTR_AI_STATUS]: 'saved',
    });

    const existingFieldBlockIds = existingLocation?.fieldBlockIds || {};
    const fieldBlockIds: Record<string, string> = {};
    for (const [fieldName, rawValue] of resolvedFieldEntries) {
      const existingFieldBlockId = normalizeString(existingFieldBlockIds[fieldName]);
      const fieldBlockId = existingFieldBlockId
        ? await this.siyuanPort.updateBlockMarkdown(existingFieldBlockId, rawValue)
        : await this.siyuanPort.appendBlockUnderParent(rawValue, candidateBlockId);
      fieldBlockIds[fieldName] = fieldBlockId;
      await this.setDraftAttrs(fieldBlockId, {
        [ATTR_AI_KIND]: 'field',
        [ATTR_AI_SESSION_ID]: session.sessionId,
        [ATTR_AI_CANDIDATE_ID]: candidate.candidateId,
        [ATTR_AI_TEMPLATE_ID]: candidate.templateId,
        [ATTR_AI_FIELD_NAME]: fieldName,
        [ATTR_AI_SOURCE_BLOCK_IDS]: serializeSourceBlockIds(candidate.sourceBlockIds),
        [ATTR_AI_STATUS]: 'saved',
      });
    }

    for (const [fieldName, fieldBlockId] of Object.entries(existingFieldBlockIds)) {
      if (!fieldBlockIds[fieldName] && normalizeString(fieldBlockId)) {
        await this.siyuanPort.deleteBlock(fieldBlockId);
      }
    }

    return {
      ...session,
      candidateBlockId,
      fieldBlockIds,
      sourceBlockIds: uniqueIds(candidate.sourceBlockIds),
    };
  }

  private async findExistingSessionCandidateLocation(
    session: AIDraftSessionLocation,
    candidateId: string,
  ): Promise<AICandidateDraftLocation | null> {
    const normalizedCandidateId = normalizeString(candidateId);
    if (!normalizedCandidateId) {
      return null;
    }

    const candidateRows = await this.siyuanPort.sql<AISiyuanBlockRow>(`
      SELECT b.id
      FROM blocks b
      INNER JOIN attributes a_kind
        ON a_kind.block_id = b.id
       AND a_kind.name = '${ATTR_AI_KIND}'
       AND a_kind.value = 'candidate'
      INNER JOIN attributes a_candidate
        ON a_candidate.block_id = b.id
       AND a_candidate.name = '${ATTR_AI_CANDIDATE_ID}'
       AND a_candidate.value = '${escapeSql(normalizedCandidateId)}'
      WHERE b.parent_id = '${escapeSql(session.sessionBlockId)}'
      LIMIT 1
    `);

    const candidateBlockId = normalizeString(candidateRows[0]?.id);
    if (!candidateBlockId) {
      return null;
    }

    const fieldRows = await this.siyuanPort.sql<AISiyuanBlockRow & { fieldName?: string }>(`
      SELECT
        b.id,
        a_field.value AS fieldName
      FROM blocks b
      INNER JOIN attributes a_kind
        ON a_kind.block_id = b.id
       AND a_kind.name = '${ATTR_AI_KIND}'
       AND a_kind.value = 'field'
      LEFT JOIN attributes a_field
        ON a_field.block_id = b.id
       AND a_field.name = '${ATTR_AI_FIELD_NAME}'
      WHERE b.parent_id = '${escapeSql(candidateBlockId)}'
    `);

    const fieldBlockIds = Object.fromEntries(
      fieldRows
        .map((row) => [normalizeString(row.fieldName), normalizeString(row.id)] as const)
        .filter(([fieldName, blockId]) => fieldName.length > 0 && blockId.length > 0),
    );

    return {
      ...session,
      candidateBlockId,
      fieldBlockIds,
      sourceBlockIds: [...session.sourceBlockIds],
    };
  }

  private async resolveNotebook(sourceBlockIds: string[]): Promise<string> {
    const normalizedSourceBlockIds = uniqueIds(sourceBlockIds);
    if (normalizedSourceBlockIds.length === 0) {
      throw new Error('当前上下文没有来源块，无法定位 Daily Note。');
    }

    const escapedIds = normalizedSourceBlockIds.map((id) => `'${escapeSql(id)}'`).join(',');
    const rows = await this.siyuanPort.sql<AISiyuanBlockRow>(`
      SELECT id, box
      FROM blocks
      WHERE id IN (${escapedIds})
      LIMIT ${normalizedSourceBlockIds.length}
    `);
    const byId = new Map(rows.map((row) => [normalizeString(row.id), row] as const));
    for (const sourceBlockId of normalizedSourceBlockIds) {
      const row = byId.get(sourceBlockId);
      const notebook = normalizeString(row?.box);
      if (notebook.length > 0) {
        return notebook;
      }
    }
    throw new Error('无法从来源块解析所属笔记本，无法定位 Daily Note。');
  }

  private async ensureRootBlock(dailyNoteDocId: string): Promise<string> {
    const existing = await this.findDirectChildByKind(dailyNoteDocId, 'root');
    if (existing) {
      const title = normalizeString(existing.content);
      if (title !== AI_DRAFT_ROOT_TITLE) {
        await this.siyuanPort.updateBlockMarkdown(existing.id, `## ${AI_DRAFT_ROOT_TITLE}`);
      }
      return existing.id;
    }

    const rootBlockId = await this.siyuanPort.appendBlockUnderParent(`## ${AI_DRAFT_ROOT_TITLE}`, dailyNoteDocId);
    await this.setDraftAttrs(rootBlockId, {
      [ATTR_AI_KIND]: 'root',
      [ATTR_AI_STATUS]: 'saved',
    });
    return rootBlockId;
  }

  private async deleteMissingSessionCandidates(
    session: AIDraftSessionLocation,
    authoritativeCandidateIds: string[],
  ): Promise<string[]> {
    const allowedCandidateIds = new Set(uniqueIds(authoritativeCandidateIds));
    const rows = await this.siyuanPort.sql<CandidateBlockRow>(`
      SELECT
        b.id,
        a_candidate.value AS candidateId,
        a_status.value AS status
      FROM blocks b
      INNER JOIN attributes a_kind
        ON a_kind.block_id = b.id
       AND a_kind.name = '${ATTR_AI_KIND}'
       AND a_kind.value = 'candidate'
      LEFT JOIN attributes a_candidate
        ON a_candidate.block_id = b.id
       AND a_candidate.name = '${ATTR_AI_CANDIDATE_ID}'
      LEFT JOIN attributes a_status
        ON a_status.block_id = b.id
       AND a_status.name = '${ATTR_AI_STATUS}'
      WHERE b.parent_id = '${escapeSql(session.sessionBlockId)}'
    `);

    const deletedCandidateIds: string[] = [];
    for (const row of rows) {
      const candidateId = normalizeString(row.candidateId);
      const status = normalizeString(row.status);
      if (!candidateId || allowedCandidateIds.has(candidateId) || status === 'created') {
        continue;
      }
      await this.siyuanPort.deleteBlock(normalizeString(row.id));
      deletedCandidateIds.push(candidateId);
    }
    return deletedCandidateIds;
  }

  private async findDirectChildByKind(parentId: string, kind: AIDraftBlockKind): Promise<{ id: string; content: string } | null> {
    const rows = await this.siyuanPort.sql<AISiyuanBlockRow>(`
      SELECT b.id, b.content
      FROM blocks b
      INNER JOIN attributes a0
        ON a0.block_id = b.id
       AND a0.name = '${ATTR_AI_KIND}'
       AND a0.value = '${kind}'
      WHERE b.parent_id = '${escapeSql(parentId)}'
      LIMIT 1
    `);
    const id = normalizeString(rows[0]?.id);
    if (!id) {
      return null;
    }
    return {
      id,
      content: normalizeString(rows[0]?.content),
    };
  }

  private async setDraftAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    const normalized = Object.fromEntries(
      Object.entries(attrs)
        .map(([key, value]) => [key, String(value || '').trim()])
        .filter(([, value]) => value.length > 0),
    );
    await this.siyuanPort.setBlockAttrs(blockId, normalized);
  }
}
