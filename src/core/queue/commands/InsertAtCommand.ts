import type { IQueueCommand } from '../abstraction/Command';
import type { IMutableTrait } from '../abstraction/types';

export type InsertAtCommandContext<TItem> = {
  trait: IMutableTrait<TItem>;
  items: TItem[];
  index: number;
};

export class InsertAtCommand<TItem> implements IQueueCommand<InsertAtCommandContext<TItem>> {
  id = 'insert-at';
  label = 'Insert at';

  async execute(context: InsertAtCommandContext<TItem>): Promise<void> {
    const items = Array.isArray(context?.items) ? context.items : [];
    const index = Math.max(0, Math.floor(Number(context?.index ?? 0)));
    await context.trait.insertAt(items, index);
  }
}

