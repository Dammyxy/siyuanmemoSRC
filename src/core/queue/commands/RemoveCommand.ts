import type { IQueueCommand } from '../abstraction/Command';
import type { IRemovableTrait } from '../abstraction/types';

export type RemoveCommandContext<TItem> = {
  trait: IRemovableTrait<TItem>;
  items: TItem[];
};

export class RemoveCommand<TItem> implements IQueueCommand<RemoveCommandContext<TItem>> {
  id = 'remove';
  label = 'Remove';
  icon = 'iconTrashcan';
  danger = true;

  async execute(context: RemoveCommandContext<TItem>): Promise<void> {
    const items = Array.isArray(context?.items) ? context.items : [];
    await context.trait.remove(items);
  }
}

