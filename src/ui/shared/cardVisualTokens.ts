export type CardVisualKind = 'item' | 'descriptor' | 'topic' | 'concept' | 'cloze';

export type HeaderVisualTone =
  | CardVisualKind
  | 'neutral'
  | 'progress'
  | 'success'
  | 'warning';

type PriorityVisualTone = 'critical' | 'high' | 'medium' | 'low' | 'muted' | 'unknown';

export interface PriorityVisualToken {
  tone: PriorityVisualTone;
  color: string;
  background: string;
  border: string;
}

const CARD_VISUAL_COLORS: Record<CardVisualKind, string> = {
  topic: 'var(--b3-theme-info)',
  item: 'var(--b3-theme-success)',
  concept: 'var(--b3-theme-primary)',
  descriptor: 'var(--b3-theme-secondary)',
  cloze: 'var(--b3-theme-warning)',
};

const HEADER_TONE_COLORS: Record<Exclude<HeaderVisualTone, CardVisualKind>, string> = {
  neutral: 'var(--b3-theme-on-surface-light)',
  progress: 'var(--b3-theme-primary)',
  success: 'var(--b3-theme-success)',
  warning: 'var(--b3-theme-warning)',
};

function makeTint(color: string, strength = 14): string {
  return `color-mix(in srgb, ${color} ${strength}%, transparent)`;
}

export function getCardVisualColor(kind: string | null | undefined): string {
  const key = String(kind || '').trim() as CardVisualKind;
  return CARD_VISUAL_COLORS[key] || CARD_VISUAL_COLORS.item;
}

export function getHeaderToneColor(tone: string | null | undefined): string {
  const key = String(tone || '').trim() as HeaderVisualTone;
  if (key in CARD_VISUAL_COLORS) {
    return CARD_VISUAL_COLORS[key as CardVisualKind];
  }

  return HEADER_TONE_COLORS[key as Exclude<HeaderVisualTone, CardVisualKind>]
    || HEADER_TONE_COLORS.neutral;
}

export function getPriorityVisualToken(priority: number | null | undefined): PriorityVisualToken {
  if (!Number.isFinite(priority)) {
    const color = HEADER_TONE_COLORS.neutral;
    return {
      tone: 'unknown',
      color,
      background: makeTint(color, 12),
      border: makeTint(color, 30),
    };
  }

  if (priority <= 9) {
    const color = 'var(--b3-card-error-color)';
    return {
      tone: 'critical',
      color,
      background: makeTint(color, 14),
      border: makeTint(color, 34),
    };
  }

  if (priority <= 24) {
    const color = 'var(--b3-card-warning-color)';
    return {
      tone: 'high',
      color,
      background: makeTint(color, 14),
      border: makeTint(color, 34),
    };
  }

  if (priority <= 49) {
    const color = 'var(--b3-theme-primary)';
    return {
      tone: 'medium',
      color,
      background: makeTint(color, 14),
      border: makeTint(color, 34),
    };
  }

  if (priority <= 74) {
    const color = 'var(--b3-theme-info)';
    return {
      tone: 'low',
      color,
      background: makeTint(color, 14),
      border: makeTint(color, 34),
    };
  }

  const color = HEADER_TONE_COLORS.neutral;
  return {
    tone: 'muted',
    color,
    background: makeTint(color, 12),
    border: makeTint(color, 30),
  };
}
