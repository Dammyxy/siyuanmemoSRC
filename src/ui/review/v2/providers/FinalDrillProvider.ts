import type { QueueItem } from '../../../../core/queue/types.ts';
import type { QueueProvider } from '../../../../core/extensions/QueueProvider.ts';
import type { QueueStats } from '../../../../core/extensions/types.ts';
import { FinalDrillV2Session } from '../sessions/FinalDrillV2Session.ts';

type FinalDrillQueueLike = ConstructorParameters<typeof FinalDrillV2Session>[0]['queue'];
type StorageLike = ConstructorParameters<typeof FinalDrillV2Session>[0]['storage'];

export class FinalDrillProvider implements QueueProvider<QueueItem> {
  readonly id = 'final-drill';
  readonly displayName: string;
  readonly skipBehavior = 'rotate';

  private readonly session: FinalDrillV2Session;

  constructor(options: { queue: FinalDrillQueueLike; storage?: StorageLike; i18n?: Record<string, string> }) {
    this.displayName = options.i18n?.queueDeliberate || '最终冲刺';
    this.session = new FinalDrillV2Session({
      queue: options.queue,
      storage: options.storage as any,
      i18n: options.i18n,
    });
  }

  async init(): Promise<void> {
    await this.session.init();
  }

  getStrategy(): FinalDrillV2Session {
    return this.session;
  }

  async getDueCards(_options: Record<string, unknown>): Promise<QueueItem[]> {
    return this.session.getAllItems();
  }

  async reviewCard(cardId: string, rating: number): Promise<void> {
    const item = this.findItemByCardId(cardId);
    if (!item) return;
    await this.session.onFeedback(item, { action: 'rate', rating: Math.max(1, Math.min(4, Math.floor(rating))) as 1 | 2 | 3 | 4 });
  }

  async skipReviewCard(cardId: string): Promise<void> {
    const item = this.findItemByCardId(cardId);
    if (!item) return;
    await this.session.onFeedback(item, { action: 'skip' });
  }

  async onCustomAction(actionId: string): Promise<boolean | void> {
    const id = String(actionId || '');
    if (!id) return;
    await this.session.onFeedback(null, { action: 'custom', customActionId: id } as any);
    return false;
  }

  async getStats(_options?: Record<string, unknown>): Promise<QueueStats> {
    const p = this.session.getProgress();
    const remaining = Math.max(0, this.session.getAllItems().length);
    const total = Math.max(0, Number(p.total) || 0);
    const answered = Math.max(0, Number(p.answered) || 0);
    const s = await this.session.getStats();
    return {
      current: answered,
      total: total || Math.max(0, Number(s.size) || 0),
      remaining,
      label: String(s.label || ''),
    };
  }

  getProgress(): { answered: number; correct: number; total: number; durationMs: number } {
    return this.session.getProgress();
  }

  getResumePrompt(): { message: string; data: unknown } | null {
    return this.session.getResumePrompt();
  }

  private findItemByCardId(cardId: string): QueueItem | null {
    const id = String(cardId || '');
    if (!id) return null;
    const items = this.session.getAllItems();
    return (items || []).find((x) => String((x as any)?.cardID || '') === id) || null;
  }
}
