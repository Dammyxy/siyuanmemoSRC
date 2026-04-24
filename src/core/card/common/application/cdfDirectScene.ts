import type { ReviewMarkdownRenderKind } from './reviewMarkdownRender';

const TRAILING_BLOCK_ATTR_PATTERN = /\s*\{:[^{}]*\}\s*$/s;
const CDF_MULTILINE_MARKER_RE = /\s*(:::\s*|;;;\s*|：：：\s*|；；；\s*)(?=(?:<\/[^>]+>|\s*$))/g;
const CDF_INLINE_MARKER_RE = /\s*(;<>|；《》|;<|；《|;;|；；|::|：：|:>|：》|:<|：《)\s*/g;
const HTML_TAG_RE = /<[^>]+>/g;

export type CdfRelationArrow = '→' | '←' | '↔';
export type CdfDirectArrow = CdfRelationArrow | '↓';
export type CdfDirectRowLevel = 0 | 1 | 2;
export type CdfDirectRowEmphasis = 'primary' | 'normal';

export interface CdfDirectMask {
  rowKey: string;
  segment: 'whole' | 'left' | 'right';
}

export interface CdfDirectPathSegment {
  kind: 'concept' | 'group';
  label: string;
  blockId?: string;
}

export interface CdfRelationProjection {
  matched: boolean;
  left: string;
  right: string;
  arrow: CdfRelationArrow;
}

interface CdfDirectBaseRow {
  key: string;
  level?: CdfDirectRowLevel;
  emphasize?: CdfDirectRowEmphasis;
}

export interface CdfDirectRenderable {
  html: string;
  renderKind: ReviewMarkdownRenderKind;
}

export interface CdfDirectConceptRow extends CdfDirectBaseRow {
  kind: 'concept';
  content: CdfDirectRenderable;
}

export interface CdfDirectGroupRow extends CdfDirectBaseRow {
  kind: 'group';
  label: CdfDirectRenderable;
}

export interface CdfDirectRelationRow extends CdfDirectBaseRow {
  kind: 'relation';
  left: CdfDirectRenderable;
  right: CdfDirectRenderable;
  arrow: CdfRelationArrow;
}

export interface CdfDirectStandaloneRow extends CdfDirectBaseRow {
  kind: 'standalone';
  content: CdfDirectRenderable;
}

export type CdfDirectRow =
  | CdfDirectConceptRow
  | CdfDirectGroupRow
  | CdfDirectRelationRow
  | CdfDirectStandaloneRow;

export interface CdfDirectScene {
  rows: CdfDirectRow[];
  frontMask?: CdfDirectMask | null;
}

export function createCdfDirectRenderable(
  html: string,
  renderKind: ReviewMarkdownRenderKind = 'fragment',
): CdfDirectRenderable {
  return {
    html,
    renderKind,
  };
}

export function stripCdfDirectMarkers(source: string): string {
  return String(source || '')
    .replace(TRAILING_BLOCK_ATTR_PATTERN, '')
    .replace(CDF_MULTILINE_MARKER_RE, '')
    .replace(CDF_INLINE_MARKER_RE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeCdfDirectLabel(source: string): string {
  return stripCdfDirectMarkers(source)
    .replace(HTML_TAG_RE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function resolveArrowProjection(
  source: string,
  pattern: RegExp,
  arrow: CdfRelationArrow,
): CdfRelationProjection | null {
  const match = source.match(pattern);
  if (!match) {
    return null;
  }

  return {
    matched: true,
    left: (match[1] || '').trim(),
    right: (match[2] || '').trim(),
    arrow,
  };
}

export function projectCdfRelation(
  source: string,
  fallbackArrow: CdfRelationArrow = '→',
): CdfRelationProjection {
  const normalized = normalizeCdfDirectLabel(source);
  if (!normalized) {
    return {
      matched: false,
      left: '',
      right: '',
      arrow: fallbackArrow,
    };
  }

  const projections = [
    resolveArrowProjection(normalized, /^(.*?)\s*(?:;<>|；《》|↔)\s*(.+)$/s, '↔'),
    resolveArrowProjection(normalized, /^(.*?)\s*(?:;<|；《|←)\s*(.+)$/s, '←'),
    resolveArrowProjection(normalized, /^(.*?)\s*(?:;;|；；|->|→)\s*(.+)$/s, '→'),
    resolveArrowProjection(normalized, /^(.*?)\s*(?:::|：：)\s*(.+)$/s, '↔'),
    resolveArrowProjection(normalized, /^(.*?)\s*(?::>|：》)\s*(.+)$/s, '→'),
    resolveArrowProjection(normalized, /^(.*?)\s*(?::<|：《)\s*(.+)$/s, '←'),
  ];

  const resolved = projections.find((item) => item && item.left.length > 0 && item.right.length > 0);
  if (resolved) {
    return resolved;
  }

  return {
    matched: false,
    left: '',
    right: normalized,
    arrow: fallbackArrow,
  };
}

function isCdfDirectPathSegment(value: unknown): value is CdfDirectPathSegment {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CdfDirectPathSegment>;
  return (candidate.kind === 'concept' || candidate.kind === 'group')
    && typeof candidate.label === 'string'
    && candidate.label.trim().length > 0
    && (candidate.blockId === undefined || typeof candidate.blockId === 'string');
}

export function isCdfDirectPathSegmentArray(value: unknown): value is CdfDirectPathSegment[] {
  return Array.isArray(value) && value.every(isCdfDirectPathSegment);
}
