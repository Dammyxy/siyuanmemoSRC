import type { IQueueCommand } from '../abstraction/Command';
import type { IRemovableTrait } from '../abstraction/types';

export type RemoveItemsCommandContext<TItem> = {
  trait: IRemovableTrait<TItem>;
  items: TItem[];
};

export class RemoveItemsCommand<TItem> implements IQueueCommand<RemoveItemsCommandContext<TItem>> {
  id = 'remove-items';
  label = 'Remove';
  icon = 'iconTrashcan';
  danger = true;

  async execute(context: RemoveItemsCommandContext<TItem>): Promise<void> {
    const items = Array.isArray(context?.items) ? context.items : [];
    await context.trait.removeItems(items);
  }
}

