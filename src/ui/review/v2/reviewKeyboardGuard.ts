export type ReviewForwardedHotkeyDetail =
  | string
  | {
      key: string;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      shiftKey?: boolean;
      repeat?: boolean;
    };

type ReviewModifierState = Pick<
  Exclude<ReviewForwardedHotkeyDetail, string>,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
>;

export const REVIEW_MODIFIED_HOTKEY_WINDOW_MS = 120;

export function normalizeReviewKeyboardKey(value: string): string {
  return value.toLowerCase();
}

export function hasReviewKeyboardModifier(input: {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  return Boolean(input.ctrlKey || input.metaKey || input.altKey || input.shiftKey);
}

export function getForwardedReviewHotkey(detail: unknown): string | null {
  if (typeof detail === 'string') {
    return normalizeReviewKeyboardKey(detail);
  }
  if (!detail || typeof detail !== 'object') {
    return null;
  }

  const candidate = detail as Partial<Exclude<ReviewForwardedHotkeyDetail, string>>;
  if (typeof candidate.key !== 'string' || hasReviewKeyboardModifier(candidate)) {
    return null;
  }

  return normalizeReviewKeyboardKey(candidate.key);
}

export function rememberModifiedReviewHotkey(
  recentModifiedHotkeys: Map<string, number>,
  detail: ReviewModifierState,
  now = Date.now()
): void {
  if (!detail.key || !hasReviewKeyboardModifier(detail)) {
    return;
  }

  recentModifiedHotkeys.set(normalizeReviewKeyboardKey(detail.key), now);
}

export function consumeRecentlyModifiedReviewHotkey(
  recentModifiedHotkeys: Map<string, number>,
  key: string,
  now = Date.now(),
  windowMs = REVIEW_MODIFIED_HOTKEY_WINDOW_MS
): boolean {
  const normalizedKey = normalizeReviewKeyboardKey(key);
  const recordedAt = recentModifiedHotkeys.get(normalizedKey);
  if (typeof recordedAt !== 'number') {
    return false;
  }

  recentModifiedHotkeys.delete(normalizedKey);
  return now - recordedAt <= windowMs;
}
