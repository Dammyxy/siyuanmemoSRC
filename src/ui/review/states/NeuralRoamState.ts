import type { ReviewSessionState, ReviewSessionStateContext } from './types';
import NeuralRoamTopArea from '../components/NeuralRoamTopArea.vue';

export class NeuralRoamState implements ReviewSessionState {
  private readonly ctx: ReviewSessionStateContext;

  constructor(ctx: ReviewSessionStateContext) {
    this.ctx = ctx;
  }

  getTopBarTitle(): string {
    return this.ctx.practiceModeLabel.value || '';
  }

  getTopAreaComponent(): any {
    return NeuralRoamTopArea;
  }

  getOverlayComponent(): any {
    return null;
  }

  shouldShowAnswerBtn(): boolean {
    return this.ctx.hideAnswer.value === true;
  }

  shouldShowRatingBtns(): boolean {
    return this.ctx.hideAnswer.value === false;
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
