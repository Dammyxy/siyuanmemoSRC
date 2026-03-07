import type { IQueueCommand } from '../abstraction/Command';
import type { IPrioritizableTrait } from '../abstraction/types';
import type { QueueItem } from '../types';

export type SetPriorityCommandContext<TItem extends QueueItem> = {
  trait: IPrioritizableTrait<TItem>;
  items: TItem[];
  priority: number;
};

export class SetPriorityCommand<TItem extends QueueItem> implements IQueueCommand<SetPriorityCommandContext<TItem>> {
  id = 'set-priority';
  label = 'Set Priority';
  icon = 'iconMark';

  async execute(context: SetPriorityCommandContext<TItem>): Promise<void> {
    const items = Array.isArray(context?.items) ? context.items : [];
    const p = Math.max(0, Math.min(100, Math.floor(Number(context?.priority))));
    for (const it of items) {
      await context.trait.setPriority(it, p);
    }
  }
}

