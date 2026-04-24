import type {
  CdfDirectMask,
  CdfDirectRow,
  CdfDirectScene,
  CdfRelationArrow,
  CdfRelationProjection,
} from '@/core/card/common/application/cdfDirectScene';
import {
  normalizeCdfDirectLabel,
  projectCdfRelation,
  stripCdfDirectMarkers,
} from '@/core/card/common/application/cdfDirectScene';
import { renderMarkdownToHtml } from '@/ui/shared/rich-content';

export { normalizeCdfDirectLabel, projectCdfRelation, stripCdfDirectMarkers };
export type { CdfRelationArrow, CdfRelationProjection };

interface CdfEditorRow {
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

export function renderCdfDirectMarkdown(markdown: string): string {
  const cleaned = stripCdfDirectMarkers(markdown);
  return cleaned ? renderMarkdownToHtml(cleaned) : '';
}

export function createCdfEllipsisHtml(): string {
  return '<span class="cdf-editor__ellipsis">...</span>';
}

function buildCdfEditorContentHtml(rows: CdfEditorRow[]): string {
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

function resolveRowMask(
  row: CdfDirectRow,
  frontMask: CdfDirectMask | null | undefined,
  showAnswer: boolean,
): CdfDirectMask | null {
  if (showAnswer || !frontMask || frontMask.rowKey !== row.key) {
    return null;
  }
  return frontMask;
}

function toEditorRow(
  row: CdfDirectRow,
  rowMask: CdfDirectMask | null,
): CdfEditorRow {
  const ellipsisHtml = createCdfEllipsisHtml();
  const level = row.level ?? 0;
  const emphasize = row.emphasize ?? 'normal';

  switch (row.kind) {
    case 'concept':
    case 'standalone':
      return {
        key: row.key,
        level,
        emphasize,
        standaloneHtml: rowMask?.segment === 'whole' ? ellipsisHtml : row.html,
      };
    case 'group':
      if (rowMask?.segment === 'whole') {
        return {
          key: row.key,
          level,
          emphasize,
          standaloneHtml: ellipsisHtml,
        };
      }
      return {
        key: row.key,
        level,
        emphasize,
        leftHtml: row.labelHtml,
        arrow: '↓',
      };
    case 'relation': {
      const maskLeft = rowMask?.segment === 'left';
      const maskRight = rowMask?.segment === 'right';
      const maskWhole = rowMask?.segment === 'whole';
      if (maskWhole) {
        return {
          key: row.key,
          level,
          emphasize,
          standaloneHtml: ellipsisHtml,
        };
      }
      return {
        key: row.key,
        level,
        emphasize,
        leftHtml: maskLeft ? ellipsisHtml : row.leftHtml,
        rightHtml: maskRight ? ellipsisHtml : row.rightHtml,
        arrow: row.arrow,
        ellipsisSide: maskLeft ? 'left' : maskRight ? 'right' : null,
      };
    }
  }
}

export function renderCdfDirectScene(
  scene: CdfDirectScene,
  options?: {
    showAnswer?: boolean;
  },
): string {
  const showAnswer = options?.showAnswer === true;
  const rows = scene.rows.map((row) => toEditorRow(row, resolveRowMask(row, scene.frontMask, showAnswer)));
  return buildCdfEditorContentHtml(rows);
}
