export type NativeRiffImportScheduleSnapshot = Readonly<{
  due: string;
  state: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReview?: string;
}>;

export type NativeRiffImportSourceCard = Readonly<{
  nativeCardId: string;
  deckId: string;
  blockId: string;
  sourceMarkdown: string;
  schedule?: NativeRiffImportScheduleSnapshot;
}>;

export interface NativeRiffImportSourcePort {
  listImportCandidates(): Promise<readonly NativeRiffImportSourceCard[]>;
}
