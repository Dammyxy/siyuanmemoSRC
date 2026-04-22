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
  const templateID = typeof meta?.templateID === 'string' ? meta.templateID : '';
  const clozeRenderMode = meta?.clozeRenderMode;
  if (templateID === 'builtin-multi-cloze' && clozeRenderMode === 'inline-formula-cloze') {
    return 'quick-inline-formula';
  }

  if (
    profile === 'quick-default'
    && templateID === 'builtin-multi-cloze'
  ) {
    return null;
  }

  if (typeof profile === 'string' && SUPPORTED_RENDER_PROFILES.has(profile as SupportedRenderProfile)) {
    return profile as SupportedRenderProfile;
  }

  // Backward compatibility: old cards only carried clozeRenderMode.
  if (clozeRenderMode === 'inline-formula-cloze') {
    return 'quick-inline-formula';
  }

  return null;
}
