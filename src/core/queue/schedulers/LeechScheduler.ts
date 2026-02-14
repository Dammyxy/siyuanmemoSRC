import type { IScheduler } from '../abstraction/types';

export class LeechScheduler<TCard, TGrade = number> implements IScheduler<TCard, TGrade> {
  private readonly base: IScheduler<TCard, TGrade>;
  private readonly isLeech: (card: TCard) => boolean;
  private readonly onLeech: (card: TCard, grade: TGrade) => Promise<TCard>;

  constructor(options: {
    base: IScheduler<TCard, TGrade>;
    isLeech: (card: TCard) => boolean;
    onLeech: (card: TCard, grade: TGrade) => Promise<TCard>;
  }) {
    this.base = options.base;
    this.isLeech = options.isLeech;
    this.onLeech = options.onLeech;
  }

  async schedule(card: TCard, grade: TGrade): Promise<TCard> {
    if (this.isLeech(card)) {
      return await this.onLeech(card, grade);
    }
    return await this.base.schedule(card, grade);
  }
}

