export interface PersistenceAdapter<TSnapshot> {
  load(): Promise<TSnapshot | null>;
  save(snapshot: TSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export interface PersistableQueue<TItem, TSnapshot> {
  snapshot(): TSnapshot;
  restore(snapshot: TSnapshot): void;
  onAfterMutate?(): Promise<void> | void;
}

