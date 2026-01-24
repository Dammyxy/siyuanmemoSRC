import type { ReviewSessionState, ReviewSessionStateContext } from './types';

export class StandardReviewState implements ReviewSessionState {
  private readonly ctx: ReviewSessionStateContext;

  constructor(ctx: ReviewSessionStateContext) {
    this.ctx = ctx;
  }

  getTopBarTitle(): string {
    return '';
  }

  getTopAreaComponent(): any {
    return null;
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
    await this.ctx.rateStandard(rating);
  }

  async onSkip(): Promise<void> {
    await this.ctx.skipStandard();
  }

  async undo(): Promise<void> {
    await this.ctx.undoStandard();
  }
}

