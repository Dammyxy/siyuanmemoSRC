import type {
  NativeRiffImportScheduleSnapshot,
  NativeRiffImportSourceCard,
  NativeRiffImportSourcePort,
} from '@/application/ports/NativeRiffImportSourcePort';
import { BUILTIN_DECK_ID, getRiffCards } from '@/core/siyuan/riff';
import { normalizeBlockId } from '@/core/siyuan/riff/normalizers';

type NativeRiffImportRawSchedule = Readonly<{
  id?: string;
  deckID?: string;
  due?: string;
  reps?: number;
  lapses?: number;
  state?: number;
  lastReview?: string;
  stability?: number;
  difficulty?: number;
}>;

export type NativeRiffImportRawCard = Readonly<{
  id?: string;
  blockID?: string;
  blockId?: string;
  content?: string;
  riffCardID?: string;
  riffCardId?: string;
  riffCard?: NativeRiffImportRawSchedule;
}>;

export type NativeRiffImportReadRiffCards = (
  deckId: string,
  options: { includeNew: true },
) => Promise<readonly NativeRiffImportRawCard[]>;

export class NativeRiffImportSourceAdapter implements NativeRiffImportSourcePort {
  private readonly deckId: string;
  private readonly readRiffCards: NativeRiffImportReadRiffCards;
  private readonly readSourceMarkdown?: (blockId: string) => Promise<string | null>;

  constructor(options: {
    deckId?: string;
    readRiffCards?: NativeRiffImportReadRiffCards;
    readSourceMarkdown?: (blockId: string) => Promise<string | null>;
  } = {}) {
    this.deckId = options.deckId ?? BUILTIN_DECK_ID;
    this.readRiffCards = options.readRiffCards ?? (async (deckId, readOptions) => (
      getRiffCards(deckId, readOptions)
    ));
    this.readSourceMarkdown = options.readSourceMarkdown;
  }

  async listImportCandidates(): Promise<readonly NativeRiffImportSourceCard[]> {
    const cards = await this.readRiffCards(this.deckId, {
      includeNew: true,
    });
    const candidates: NativeRiffImportSourceCard[] = [];

    for (const card of cards) {
      const blockId = String(normalizeBlockId(card) || '').trim();
      const nativeCardId = readString(card.riffCard?.id)
        || readString(card.riffCardID)
        || readString(card.riffCardId);
      if (!blockId || !nativeCardId) {
        continue;
      }

      const schedule = toScheduleSnapshot(card.riffCard);
      const sourceMarkdown = this.readSourceMarkdown
        ? await this.readSourceMarkdown(blockId)
        : typeof card.content === 'string' ? card.content : '';
      candidates.push({
        nativeCardId,
        deckId: readString(card.riffCard?.deckID) || this.deckId,
        blockId,
        sourceMarkdown: sourceMarkdown ?? '',
        ...(schedule ? { schedule } : {}),
      });
    }

    return candidates;
  }
}

function toScheduleSnapshot(
  schedule: NativeRiffImportRawSchedule | undefined,
): NativeRiffImportScheduleSnapshot | undefined {
  if (!schedule) {
    return undefined;
  }

  return {
    due: readString(schedule.due),
    state: Number(schedule.state),
    stability: Number(schedule.stability),
    difficulty: Number(schedule.difficulty),
    reps: Number(schedule.reps),
    lapses: Number(schedule.lapses),
    ...(readString(schedule.lastReview)
      ? { lastReview: readString(schedule.lastReview) }
      : {}),
  };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
