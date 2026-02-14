import type { IScheduler } from '../abstraction/types';

export class RiffScheduler<TCard, TGrade = number> implements IScheduler<TCard, TGrade> {
  private readonly scheduleFn: (card: TCard, grade: TGrade) => Promise<TCard>;

  constructor(scheduleFn: (card: TCard, grade: TGrade) => Promise<TCard>) {
    this.scheduleFn = scheduleFn;
  }

  async schedule(card: TCard, grade: TGrade): Promise<TCard> {
    return await this.scheduleFn(card, grade);
  }
}

