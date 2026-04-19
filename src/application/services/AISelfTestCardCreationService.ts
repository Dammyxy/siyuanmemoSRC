import type { AIChatToolRuntimeContext } from '@/application/services/AIChatToolExecutorService';
import type { AIFlashcardToolService } from '@/application/services/AIFlashcardToolService';
import { renderSelfTestCandidateDraftMarkdown, summarizeSelfTestCandidateCard } from '@/application/services/AISelfTestDraftSupport';
import type {
  AIConceptCoachCandidateCard,
  AIConceptCoachSelfTestCreationMode,
  AIWorkbenchSelfTestCardCreationItemResult,
  AIWorkbenchSelfTestCardCreationResult,
  AIWorkbenchSelfTestCardTargetInput,
} from '@/types/ai';

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

type SupportedFlashcardTools = Pick<
  AIFlashcardToolService,
  | 'createInlineCards'
  | 'createCdfDraftCards'
  | 'createNativeHeadingCards'
  | 'createNativeListItemCards'
  | 'createNativeMarkCards'
  | 'createNativeSuperBlockCards'
>;

type FlashcardToolResultItem = {
  status?: unknown;
  mode?: unknown;
  summary?: unknown;
  draftMarkdown?: unknown;
  insertedRootBlockId?: unknown;
  sourceBlockIds?: unknown;
  xiuyuanId?: unknown;
  cardIds?: unknown;
  warnings?: unknown;
  error?: unknown;
};

type FlashcardToolResult = {
  target?: unknown;
  items?: unknown;
  createdCount?: unknown;
  skippedCount?: unknown;
  failedCount?: unknown;
};

export class AISelfTestCardCreationService {
  constructor(
    private readonly deps: {
      flashcardTools: SupportedFlashcardTools;
      getRuntimeContext: () => AIChatToolRuntimeContext;
    },
  ) {}

  async createFromCandidates(
    target: AIWorkbenchSelfTestCardTargetInput,
    candidates: AIConceptCoachCandidateCard[],
    mode: AIConceptCoachSelfTestCreationMode = 'list-item',
  ): Promise<AIWorkbenchSelfTestCardCreationResult> {
    const selected = candidates.filter((candidate) => (
      candidate.selected !== false
      && normalizeString(renderSelfTestCandidateDraftMarkdown(candidate, mode))
    ));
    if (selected.length === 0) {
      throw new Error('请先勾选至少一张包含有效制卡草稿的自测卡片。');
    }

    const runtime = this.deps.getRuntimeContext();
    const items = selected.map((candidate) => ({
      summary: summarizeSelfTestCandidateCard(candidate),
      draftMarkdown: renderSelfTestCandidateDraftMarkdown(candidate, mode),
    }));
    const args = {
      targetMode: target.mode,
      notebookId: target.notebookId,
      notebookName: target.notebookName || target.notebookId,
      targetBlockId: target.targetBlockId || undefined,
      targetLabel: target.targetLabel || undefined,
      items,
    } satisfies Record<string, unknown>;

    let result: FlashcardToolResult;
    switch (mode) {
      case 'list-item':
        result = await this.deps.flashcardTools.createNativeListItemCards(args, runtime) as FlashcardToolResult;
        break;
      case 'mark':
        result = await this.deps.flashcardTools.createNativeMarkCards(args, runtime) as FlashcardToolResult;
        break;
      case 'heading':
        result = await this.deps.flashcardTools.createNativeHeadingCards(args, runtime) as FlashcardToolResult;
        break;
      case 'super-block':
        result = await this.deps.flashcardTools.createNativeSuperBlockCards(args, runtime) as FlashcardToolResult;
        break;
      case 'multi-mark':
        result = await this.deps.flashcardTools.createInlineCards({
          ...args,
          mode: 'multi-cloze',
          items: selected.map((candidate) => ({
            content: renderSelfTestCandidateDraftMarkdown(candidate, mode),
          })),
        }, runtime) as FlashcardToolResult;
        break;
      case 'cdf-multiline':
        result = await this.deps.flashcardTools.createCdfDraftCards(args, runtime) as FlashcardToolResult;
        break;
      default:
        throw new Error(`暂不支持的自测制卡模式：${mode}`);
    }

    const itemResults = this.mapToolResults(selected, mode, result.items);
    const createdCardIds = itemResults.flatMap((item) => item.cardIds);
    const insertedRootBlockIds = itemResults
      .map((item) => item.insertedRootBlockId)
      .filter((value): value is string => Boolean(value));
    const markdown = selected
      .map((candidate) => normalizeString(renderSelfTestCandidateDraftMarkdown(candidate, mode)))
      .filter(Boolean)
      .join('\n\n');

    return {
      target: (result.target || target) as AIWorkbenchSelfTestCardCreationResult['target'],
      targetBlockId: normalizeString((result.target as { targetBlockId?: unknown } | undefined)?.targetBlockId)
        || normalizeString(target.targetBlockId)
        || normalizeString((result.target as { targetLabel?: unknown } | undefined)?.targetLabel),
      targetLabel: normalizeString((result.target as { targetLabel?: unknown } | undefined)?.targetLabel)
        || normalizeString(target.targetLabel)
        || normalizeString(target.targetBlockId),
      markdown,
      itemResults,
      insertedRootBlockIds,
      createdCardIds,
      createdCount: Number(result.createdCount) || itemResults.filter((item) => item.status === 'created').length,
      skippedCount: Number(result.skippedCount) || itemResults.filter((item) => item.status === 'skipped').length,
      failedCount: Number(result.failedCount) || itemResults.filter((item) => item.status === 'failed').length,
    };
  }

  private mapToolResults(
    selected: AIConceptCoachCandidateCard[],
    mode: AIConceptCoachSelfTestCreationMode,
    rawItems: unknown,
  ): AIWorkbenchSelfTestCardCreationItemResult[] {
    const items = Array.isArray(rawItems) ? rawItems as FlashcardToolResultItem[] : [];
    return selected.map((candidate, index) => {
      const raw = items[index] || {};
      return {
        candidateId: candidate.id,
        mode,
        summary: normalizeString(raw.summary) || summarizeSelfTestCandidateCard(candidate),
        draftMarkdown: normalizeString(raw.draftMarkdown) || renderSelfTestCandidateDraftMarkdown(candidate, mode),
        question: candidate.prompt || candidate.legacyQuestion || candidate.question,
        answer: candidate.answer || candidate.legacyAnswer,
        status: normalizeString(raw.status) === 'created'
          ? 'created'
          : normalizeString(raw.status) === 'skipped'
            ? 'skipped'
            : 'failed',
        insertedRootBlockId: normalizeString(raw.insertedRootBlockId) || null,
        sourceBlockIds: Array.isArray(raw.sourceBlockIds)
          ? raw.sourceBlockIds.map((value) => normalizeString(value)).filter(Boolean)
          : [],
        questionBlockId: null,
        answerBlockId: null,
        xiuyuanId: normalizeString(raw.xiuyuanId) || null,
        cardIds: Array.isArray(raw.cardIds)
          ? raw.cardIds.map((value) => normalizeString(value)).filter(Boolean)
          : [],
        warnings: Array.isArray(raw.warnings)
          ? raw.warnings.map((value) => normalizeString(value)).filter(Boolean)
          : [],
        error: normalizeString(raw.error) || null,
      };
    });
  }
}
