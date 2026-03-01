import type { FSRSCard } from '@/types/card';

export type SupportedRenderProfile =
  | 'quick-default'
  | 'quick-inline-formula'
  | 'concept-definition'
  | 'descriptor'
  | 'concept'
  | 'list-progressive'
  | 'list-summary'
  | 'cdf-multiline';

const SUPPORTED_RENDER_PROFILES = new Set<SupportedRenderProfile>([
  'quick-default',
  'quick-inline-formula',
  'concept-definition',
  'descriptor',
  'concept',
  'list-progressive',
  'list-summary',
  'cdf-multiline',
]);

export function resolveRenderProfile(card: FSRSCard | null | undefined): SupportedRenderProfile | null {
  const meta = card?.meta as Record<string, unknown> | undefined;
  const profile = meta?.renderProfile;
  if (typeof profile === 'string' && SUPPORTED_RENDER_PROFILES.has(profile as SupportedRenderProfile)) {
    return profile as SupportedRenderProfile;
  }

  // Backward compatibility: old cards only carried clozeRenderMode.
  const clozeRenderMode = meta?.clozeRenderMode;
  if (clozeRenderMode === 'inline-formula-cloze') {
    return 'quick-inline-formula';
  }
  if (clozeRenderMode === 'default') {
    return 'quick-default';
  }

  return null;
}

