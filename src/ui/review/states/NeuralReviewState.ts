import type { ReviewSessionState, ReviewSessionStateContext } from './types';
import { NeuralTopArea } from '../components/NeuralTopArea';

export class NeuralReviewState implements ReviewSessionState {
  private readonly ctx: ReviewSessionStateContext;

  constructor(ctx: ReviewSessionStateContext) {
    this.ctx = ctx;
  }

  getTopBarTitle(): string {
    return this.ctx.practiceModeLabel.value || '';
  }

  getTopAreaComponent(): any {
    return NeuralTopArea;
  }

  getOverlayComponent(): any {
    return null;
  }

  shouldShowAnswerBtn(): boolean {
    if (this.ctx.isTopicMode.value) return false;
    return this.ctx.totalCards.value > 0 && this.ctx.hideAnswer.value;
  }

  shouldShowRatingBtns(): boolean {
    if (this.ctx.isTopicMode.value) return false;
    return this.ctx.totalCards.value > 0 && !this.ctx.hideAnswer.value;
  }

  async onRating(rating: 1 | 2 | 3 | 4): Promise<void> {
    await this.ctx.rateDrill(rating);
  }

  async onSkip(): Promise<void> {
    await this.ctx.skipDrill();
  }

  async undo(): Promise<void> {
    await this.ctx.undoDrill();
  }
}

