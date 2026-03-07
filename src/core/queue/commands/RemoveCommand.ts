import type { IQueueCommand } from '../abstraction/Command';
import type { IRemovableTrait } from '../abstraction/types';
import type { QueueItem } from '../types';

export type RemoveCommandContext<TItem extends QueueItem> = {
  trait: IRemovableTrait<TItem>;
  items: TItem[];
};

export class RemoveCommand<TItem extends QueueItem> implements IQueueCommand<RemoveCommandContext<TItem>> {
  id = 'remove';
  label = 'Remove';
  icon = 'iconTrashcan';
  danger = true;

  async execute(context: RemoveCommandContext<TItem>): Promise<void> {
    const items = Array.isArray(context?.items) ? context.items : [];
    await context.trait.remove(items);
  }
}

