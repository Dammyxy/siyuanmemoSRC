export type ReviewRatingValue = 1 | 2 | 3 | 4;

type RatingKeyAliases = Record<ReviewRatingValue, readonly string[]>;

export const RATING_KEY_ALIASES: RatingKeyAliases = {
  1: ['1', 'j', 'a'],
  2: ['2', 'k', 's'],
  3: ['3', 'l', 'd'],
  4: ['4', ';', 'f'],
};

export const SPACE_ENTER_KEYS = new Set([' ', 'space', 'spacebar', 'enter']);
export const SKIP_KEYS = new Set(['0', 'x']);
export const BACK_KEYS = new Set(['p', 'q']);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeTokens(tokens: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of tokens) {
    const normalized = raw.trim();
    if (!normalized) continue;
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(normalized);
  }
  return result;
}

export function resolveRatingByKey(key: string): ReviewRatingValue | null {
  const normalized = normalizeKey(key);
  for (const [rating, aliases] of Object.entries(RATING_KEY_ALIASES) as Array<[`${ReviewRatingValue}`, readonly string[]]>) {
    if (aliases.includes(normalized)) {
      return Number(rating) as ReviewRatingValue;
    }
  }
  return null;
}

export function getRatingAliases(rating: ReviewRatingValue): readonly string[] {
  return RATING_KEY_ALIASES[rating];
}

export function buildRatingAriaLabel(
  rating: ReviewRatingValue,
  primaryKb?: string,
  options?: {
    includeSpaceEnterForGood?: boolean;
  }
): string {
  const tokens: string[] = [String(rating)];
  if (primaryKb && primaryKb.trim()) {
    tokens.push(primaryKb.trim());
  }
  tokens.push(...getRatingAliases(rating));

  if (options?.includeSpaceEnterForGood && rating === 3) {
    tokens.push('Space', 'Enter');
  }

  return dedupeTokens(tokens).join(' / ');
}
