import type { IQueueCommand } from '../abstraction/Command';
import type { IAutoSortableTrait } from '../abstraction/types';

export type AutoSortCommandContext = {
  trait: IAutoSortableTrait;
};

export class AutoSortCommand implements IQueueCommand<AutoSortCommandContext> {
  id = 'auto-sort';
  label = 'Auto Sort';
  icon = 'iconSort';

  async execute(context: AutoSortCommandContext): Promise<void> {
    await context.trait.sort();
  }
}

