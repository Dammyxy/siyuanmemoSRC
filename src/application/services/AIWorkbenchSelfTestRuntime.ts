import type { AISiyuanBlockRow } from '@/application/ports/AISiyuanPort';
import type { LLMMessage } from '@/application/ports/LLMPort';
import { getSelfTestModeDescriptor } from '@/application/services/AIPromptContractRegistry';
import {
  isPluginSelfTestCreationMode,
  resolveSelfTestCandidateDraftMarkdown,
} from '@/application/services/AISelfTestDraftSupport';
import type {
  AIConceptCoachCandidateCard,
  AIConceptCoachSelfTestCreationMode,
  AIWorkbenchContextSnapshot,
  AIWorkbenchSelfTestCardTargetInput,
  AIWorkbenchSelfTestCardTargetMemory,
} from '@/types/ai';
import type { AISettings } from '@/types/settings';

export type SelfTestCardWriteTarget = {
  memory: AIWorkbenchSelfTestCardTargetMemory;
  targetBlockId: string;
  writeMode: 'append' | 'after';
};

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function truncateText(value: string, limit = 140): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ');
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeSelfTestCardTargetMemory(
  target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
  updatedAt: number,
): AIWorkbenchSelfTestCardTargetMemory | null {
  const mode = target.mode === 'block' ? 'block' : 'daily-note';
  const notebookId = normalizeString(target.notebookId);
  if (!notebookId) {
    return null;
  }
  const targetBlockId = normalizeString(target.targetBlockId) || null;
  if (mode === 'block' && !targetBlockId) {
    return null;
  }
  const notebookName = normalizeString(target.notebookName) || notebookId;
  const targetLabel = normalizeString(target.targetLabel)
    || (mode === 'daily-note'
      ? `${notebookName} · 今日日记`
      : `${notebookName} · ${targetBlockId}`);
  return {
    mode,
    notebookId,
    notebookName,
    targetBlockId: mode === 'block' ? targetBlockId : null,
    targetLabel,
    updatedAt,
  };
}

export function isAppendableSelfTestTarget(block: Pick<AISiyuanBlockRow, 'type'>): boolean {
  const type = normalizeString(block.type);
  return type === 'd' || type === 'h' || type === 'l' || type === 'i' || type === 's';
}

export function selectSelfTestCardCandidates(
  cards: AIConceptCoachCandidateCard[],
  creationMode: AIConceptCoachSelfTestCreationMode,
): AIConceptCoachCandidateCard[] {
  return cards.filter((card) => (
    card.selected !== false
    && normalizeString(resolveSelfTestCandidateDraftMarkdown(card, creationMode, {
      allowFallback: !isPluginSelfTestCreationMode(creationMode),
    }))
  ));
}

export function listSelfTestCardsPendingDrafts(
  cards: AIConceptCoachCandidateCard[],
  mode: AIConceptCoachSelfTestCreationMode,
  cardIds?: string[],
): AIConceptCoachCandidateCard[] {
  const requestedIds = new Set((cardIds || []).map((id) => normalizeString(id)).filter(Boolean));
  return cards.filter((card) => (
    (requestedIds.size === 0 || requestedIds.has(card.id))
    && !normalizeString(resolveSelfTestCandidateDraftMarkdown(card, mode, { allowFallback: false }))
  ));
}

export function buildModeDraftGenerationMessages(
  settings: AISettings,
  mode: AIConceptCoachSelfTestCreationMode,
  cards: AIConceptCoachCandidateCard[],
  context: AIWorkbenchContextSnapshot | null,
): LLMMessage[] {
  const descriptor = getSelfTestModeDescriptor(mode);
  const payload = {
    language: settings.defaultOutputLanguage,
    mode: {
      id: descriptor.mode,
      label: descriptor.label,
      summary: descriptor.summary,
    },
    context: {
      source: context?.source || 'standalone',
      queueType: context?.queueType || null,
      queueProgress: context?.queueProgress || null,
      currentCard: context?.currentCard
        ? {
          frontText: context.currentCard.frontText,
          backText: context.currentCard.backText,
          sourceText: context.currentCard.sourceText,
        }
        : null,
      selectedBlocks: (context?.blocks || []).map((block) => ({
        blockId: block.blockId,
        type: block.type,
        hPath: block.hPath,
        text: truncateText(block.text, 320),
      })),
    },
    cards: cards.map((card) => ({
      id: card.id,
      kind: card.kind,
      summary: card.summary,
      prompt: card.prompt,
      answer: card.answer,
      details: card.details,
      clozeTargets: card.clozeTargets,
    })),
  };
  const modeRules = [
    '当前系统只保留原生自测模式，这个插件模式草稿生成功能已停用。',
    '如果调用到这里，说明存在旧路径残留；请直接返回空 cards 数组，不要尝试生成任何 draftMarkdown。',
  ];
  return [
    {
      role: 'system',
      content: [
        '你是 SiyuanMemo 的插件制卡转换器。',
        '只返回合法 JSON，不要附带 Markdown 代码块，也不要输出解释文本。',
        'JSON 顶层字段固定为 cards，格式固定为 {"cards":[{"id":"card-id","draftMarkdown":"..."}]}。',
        '每张卡都必须回填原始 id，draftMarkdown 必须忠实表达 canonical prompt / answer / details / clozeTargets，不要凭空扩写材料里没有的知识。',
        ...modeRules,
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(payload, null, 2),
    },
  ];
}

export function extractModeDraftsFromPayload(
  payload: unknown,
  cards: AIConceptCoachCandidateCard[],
): Record<string, string> {
  const requestedIds = new Set(cards.map((card) => card.id));
  const rawEntries = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.cards)
      ? payload.cards
      : [];
  const drafts: Record<string, string> = {};
  for (const rawEntry of rawEntries) {
    if (!isRecord(rawEntry)) {
      continue;
    }
    const id = normalizeString(rawEntry.id);
    const draftMarkdown = normalizeString(rawEntry.draftMarkdown ?? rawEntry.content ?? rawEntry.markdown);
    if (!id || !draftMarkdown || !requestedIds.has(id)) {
      continue;
    }
    drafts[id] = draftMarkdown;
  }
  return drafts;
}
