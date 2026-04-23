import { renderMarkdownToHtml } from '@/ui/shared/rich-content';

const TRAILING_BLOCK_ATTR_PATTERN = /\s*\{:[^{}]*\}\s*$/s;
const CDF_MULTILINE_MARKER_RE = /\s*(:::\s*|;;;\s*|：：：\s*|；；；\s*)(?=(?:<\/[^>]+>|\s*$))/g;
const CDF_INLINE_MARKER_RE = /\s*(;<>|；《》|;<|；《|;;|；；|::|：：|:>|：》|:<|：《)\s*/g;
const HTML_TAG_RE = /<[^>]+>/g;

export type CdfRelationArrow = '→' | '←' | '↔';

export interface CdfRelationProjection {
  matched: boolean;
  left: string;
  right: string;
  arrow: CdfRelationArrow;
}

export interface CdfEditorRow {
  key: string;
  level?: 0 | 1 | 2;
  standaloneHtml?: string;
  leftHtml?: string;
  rightHtml?: string;
  arrow?: string;
  emphasize?: 'primary' | 'normal';
  ellipsisSide?: 'left' | 'right' | null;
}

function escapeHtml(source: string): string {
  return String(source || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

export function renderCdfDirectMarkdown(markdown: string): string {
  const cleaned = stripCdfDirectMarkers(markdown);
  return cleaned ? renderMarkdownToHtml(cleaned) : '';
}

export function stripCdfDirectHtmlMarkers(html: string): string {
  return stripCdfDirectMarkers(html);
}

function normalizeRelationSource(source: string): string {
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
  const normalized = normalizeRelationSource(source);
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

export function createCdfEllipsisHtml(): string {
  return '<span class="cdf-editor__ellipsis">...</span>';
}

export function buildCdfEditorContentHtml(rows: CdfEditorRow[]): string {
  const renderedRows = rows
    .filter((row) => {
      if (typeof row.standaloneHtml === 'string' && row.standaloneHtml.trim().length > 0) {
        return true;
      }
      return typeof row.leftHtml === 'string' && row.leftHtml.trim().length > 0;
    })
    .map((row) => {
      const level = row.level ?? 0;
      const emphasis = row.emphasize ?? 'normal';
      const rowClasses = [
        'cdf-editor__row',
        `cdf-editor__row--level-${level}`,
        `cdf-editor__row--${emphasis}`,
      ].join(' ');

      const standalone = typeof row.standaloneHtml === 'string' && row.standaloneHtml.trim().length > 0
        ? `<div class="cdf-editor__standalone">${row.standaloneHtml}</div>`
        : '';

      const left = row.leftHtml
        ? `<div class="cdf-editor__segment cdf-editor__segment--left${row.ellipsisSide === 'left' ? ' cdf-editor__segment--ellipsis' : ''}">${row.leftHtml}</div>`
        : '';
      const arrow = row.arrow
        ? `<span class="cdf-editor__arrow" aria-hidden="true">${escapeHtml(row.arrow)}</span>`
        : '';
      const right = row.rightHtml
        ? `<div class="cdf-editor__segment cdf-editor__segment--right${row.ellipsisSide === 'right' ? ' cdf-editor__segment--ellipsis' : ''}">${row.rightHtml}</div>`
        : '';

      return `
        <div class="${rowClasses}" data-row-key="${escapeHtml(row.key)}">
          <span class="cdf-editor__bullet" aria-hidden="true"></span>
          <div class="cdf-editor__node">
            ${standalone || `${left}${arrow}${right}`}
          </div>
        </div>
      `;
    });

  return `<div class="cdf-editor">${renderedRows.join('')}</div>`;
}
