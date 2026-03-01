export type CdfTailMarker = 'concept' | 'descriptor';

export type CdfMultilineTemplateId =
  | 'builtin-list-concept-multiline'
  | 'builtin-list-descriptor-multiline';

const FW_COLON = '\uFF1A';
const FW_SEMICOLON = '\uFF1B';
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u2060]/g;
const CONCEPT_TAIL_RE = new RegExp(`(?::::|${FW_COLON}{3})\\s*$`);
const DESCRIPTOR_TAIL_RE = new RegExp(`(?:;;;|${FW_SEMICOLON}{3})\\s*$`);

function normalizeMarkerSource(content: string): string {
  return (content || '')
    .replace(/\{:[^}]*\}/g, '')
    .replace(ZERO_WIDTH_RE, '')
    .trim();
}

export function resolveCdfTailMarker(content: string): CdfTailMarker | null {
  const normalized = normalizeMarkerSource(content);
  if (CONCEPT_TAIL_RE.test(normalized)) {
    return 'concept';
  }
  if (DESCRIPTOR_TAIL_RE.test(normalized)) {
    return 'descriptor';
  }
  return null;
}

export function resolveCdfTailMarkerFromSources(
  sources: Array<string | null | undefined>
): CdfTailMarker | null {
  for (const source of sources) {
    const marker = resolveCdfTailMarker(source || '');
    if (marker) {
      return marker;
    }
  }
  return null;
}

export function hasExpectedCdfTailMarker(
  content: string,
  templateId: CdfMultilineTemplateId
): boolean {
  const marker = resolveCdfTailMarker(content);
  if (templateId === 'builtin-list-concept-multiline') {
    return marker === 'concept';
  }
  return marker === 'descriptor';
}

export function hasExpectedCdfTailMarkerFromSources(
  sources: Array<string | null | undefined>,
  templateId: CdfMultilineTemplateId
): boolean {
  const marker = resolveCdfTailMarkerFromSources(sources);
  if (templateId === 'builtin-list-concept-multiline') {
    return marker === 'concept';
  }
  return marker === 'descriptor';
}
