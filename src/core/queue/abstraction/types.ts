export interface IScheduler<TCard, TGrade = number> {
  schedule(card: TCard, grade: TGrade): Promise<TCard>;
}

export interface ISequencer<TItem> {
  next(): Promise<TItem | null>;
}

export interface IQueueTrait {
  id: string;
}

export interface IMutableTrait<TItem> extends IQueueTrait {
  id: 'mutable';
  insertAt(items: TItem[], index: number): Promise<void>;
}

export interface IInterceptiveTrait<TItem> extends IQueueTrait {
  id: 'interceptive';
  beforeNext?(context: { candidate: TItem | null }): Promise<TItem | null>;
}

export interface IPrioritizableTrait<TItem> extends IQueueTrait {
  id: 'prioritizable';
  setPriority(item: TItem, priority: number): Promise<boolean>;
}

export interface IRemovableTrait<TItem> extends IQueueTrait {
  id: 'removable';
  removeItems(items: TItem[]): Promise<number>;
}

export interface IAutoSortableTrait extends IQueueTrait {
  id: 'auto-sortable';
  sort(): Promise<void>;
}
