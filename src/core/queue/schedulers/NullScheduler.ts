import type { IScheduler } from '../abstraction/types';

export class NullScheduler<TCard, TGrade = number> implements IScheduler<TCard, TGrade> {
  async schedule(card: TCard, _grade: TGrade): Promise<TCard> {
    return card;
  }
}

