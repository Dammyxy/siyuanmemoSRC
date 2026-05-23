import type { AISiyuanBlockRow } from '@/application/ports/AISiyuanPort';
import type {
  AIWorkbenchSelfTestCardTargetInput,
  AIWorkbenchSelfTestCardTargetMemory,
} from '@/types/ai';

export type AIFlashcardResolvedWriteTarget = {
  memory: AIWorkbenchSelfTestCardTargetMemory;
  targetBlockId: string;
  writeMode: 'append' | 'after';
};

export interface AIFlashcardTargetRuntimeDeps {
  loadDefaultTarget: () => Promise<AIWorkbenchSelfTestCardTargetMemory | null>;
  saveDefaultTarget: (target: AIWorkbenchSelfTestCardTargetMemory) => Promise<AIWorkbenchSelfTestCardTargetMemory | null>;
  ensureTodayDailyNote: (notebookId: string) => Promise<string>;
  loadTargetBlock: (blockId: string) => Promise<AISiyuanBlockRow>;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function parseTargetInput(args: Record<string, unknown>): AIWorkbenchSelfTestCardTargetInput | null {
  const targetMode = normalizeString(args.targetMode);
  if (!targetMode || targetMode === 'default') {
    return null;
  }
  return {
    mode: targetMode === 'block' ? 'block' : 'daily-note',
    notebookId: normalizeString(args.notebookId),
    notebookName: normalizeString(args.notebookName),
    targetBlockId: normalizeString(args.targetBlockId) || null,
    targetLabel: normalizeString(args.targetLabel),
  };
}

export class AIFlashcardTargetRuntime {
  constructor(private readonly deps: AIFlashcardTargetRuntimeDeps) {}

  async resolveWriteTarget(args: Record<string, unknown>): Promise<AIFlashcardResolvedWriteTarget> {
    const override = parseTargetInput(args);
    if (override) {
      return this.resolveTargetFromInput(override);
    }
    const memory = await this.deps.loadDefaultTarget();
    if (!memory) {
      throw new Error('请先在 AI 工作台设置默认制卡位置，或在工具参数里显式指定 targetMode。');
    }
    return this.resolveTargetFromInput(memory);
  }

  async resolveTargetFromInput(
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
  ): Promise<AIFlashcardResolvedWriteTarget> {
    const memory = this.normalizeTargetMemory(target, Date.now());
    if (!memory) {
      throw new Error('制卡目标不完整。');
    }
    if (memory.mode === 'daily-note') {
      const dailyNoteId = await this.deps.ensureTodayDailyNote(memory.notebookId);
      return {
        memory: {
          ...memory,
          targetBlockId: null,
          targetLabel: memory.targetLabel || `${memory.notebookName} · 今日日记`,
        },
        targetBlockId: dailyNoteId,
        writeMode: 'append',
      };
    }
    if (!memory.targetBlockId) {
      throw new Error('block 模式必须提供 targetBlockId。');
    }
    const targetBlock = await this.deps.loadTargetBlock(memory.targetBlockId);
    return {
      memory: {
        ...memory,
        notebookId: normalizeString(targetBlock.box) || memory.notebookId,
        targetLabel: memory.targetLabel || normalizeString(targetBlock.hpath) || normalizeString(targetBlock.content) || memory.targetBlockId,
      },
      targetBlockId: memory.targetBlockId,
      writeMode: this.isAppendableTarget(targetBlock) ? 'append' : 'after',
    };
  }

  normalizeTargetMemory(
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
      || (mode === 'daily-note' ? `${notebookName} · 今日日记` : `${notebookName} · ${targetBlockId}`);
    return {
      mode,
      notebookId,
      notebookName,
      targetBlockId: mode === 'block' ? targetBlockId : null,
      targetLabel,
      updatedAt,
    };
  }

  async persistSuccessfulTarget(target: AIFlashcardResolvedWriteTarget, results: unknown[]): Promise<void> {
    if (!results.some((item) => normalizeString((item as { status?: unknown }).status) === 'created')) {
      return;
    }
    await this.deps.saveDefaultTarget(target.memory);
  }

  private isAppendableTarget(block: AISiyuanBlockRow): boolean {
    const type = normalizeString(block.type);
    return type === 'd' || type === 'h' || type === 'l' || type === 'i' || type === 's';
  }
}
