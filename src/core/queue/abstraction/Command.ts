export interface IQueueCommand<TContext> {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
  execute(context: TContext): Promise<void>;
}

export class CommandRegistry<TContext> {
  private readonly commands = new Map<string, IQueueCommand<TContext>>();

  register(command: IQueueCommand<TContext>): void {
    this.commands.set(command.id, command);
  }

  get(id: string): IQueueCommand<TContext> | null {
    return this.commands.get(id) || null;
  }

  list(): IQueueCommand<TContext>[] {
    return Array.from(this.commands.values());
  }
}

