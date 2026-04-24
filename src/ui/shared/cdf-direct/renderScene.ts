import type {
  CdfDirectRenderable,
  CdfDirectMask,
  CdfDirectRow,
  CdfDirectScene,
  CdfRelationArrow,
  CdfRelationProjection,
} from '@/core/card/common/application/cdfDirectScene';
import {
  createCdfDirectRenderable,
  normalizeCdfDirectLabel,
  projectCdfRelation,
  stripCdfDirectMarkers,
} from '@/core/card/common/application/cdfDirectScene';
import { renderReviewMarkdown } from '@/core/card/common/application/reviewMarkdownRender';

export { normalizeCdfDirectLabel, projectCdfRelation, stripCdfDirectMarkers };
export type { CdfRelationArrow, CdfRelationProjection };

interface CdfEditorRow {
  key: string;
  level?: 0 | 1 | 2;
  layout: 'standalone' | 'inline' | 'stacked';
  standaloneContent?: CdfDirectRenderable;
  leftContent?: CdfDirectRenderable;
  rightContent?: CdfDirectRenderable;
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
  return renderReviewMarkdown(markdown).html;
}

export function createCdfDirectMarkdown(
  markdown: string,
  options?: {
    forceRenderKind?: 'fragment' | 'block-flow';
  },
): CdfDirectRenderable {
  const rendered = renderReviewMarkdown(markdown, {
    forceRenderKind: options?.forceRenderKind,
  });
  return createCdfDirectRenderable(rendered.html, rendered.renderKind);
}

export function createCdfEllipsisHtml(): string {
  return '<span class="cdf-editor__ellipsis">...</span>';
}

function renderEditorContent(
  content: CdfDirectRenderable | undefined,
  extraClass: string,
): string {
  if (!content || content.html.trim().length === 0) {
    return '';
  }

  return `<div class="${extraClass} cdf-editor__render-kind--${content.renderKind}">${content.html}</div>`;
}

function buildCdfEditorContentHtml(rows: CdfEditorRow[]): string {
  const renderedRows = rows
    .filter((row) => {
      if (typeof row.standaloneContent?.html === 'string' && row.standaloneContent.html.trim().length > 0) {
        return true;
      }
      return typeof row.leftContent?.html === 'string' && row.leftContent.html.trim().length > 0;
    })
    .map((row) => {
      const level = row.level ?? 0;
      const emphasis = row.emphasize ?? 'normal';
      const rowClasses = [
        'cdf-editor__row',
        `cdf-editor__row--level-${level}`,
        `cdf-editor__row--${emphasis}`,
        `cdf-editor__row--${row.layout}`,
      ].join(' ');

      const standalone = renderEditorContent(
        row.standaloneContent,
        'cdf-editor__standalone',
      );

      const left = renderEditorContent(
        row.leftContent,
        `cdf-editor__segment cdf-editor__segment--left${row.ellipsisSide === 'left' ? ' cdf-editor__segment--ellipsis' : ''}`,
      );
      const inlineArrow = row.arrow
        ? `<span class="cdf-editor__arrow" aria-hidden="true">${escapeHtml(row.arrow)}</span>`
        : '';
      const right = renderEditorContent(
        row.rightContent,
        `cdf-editor__segment cdf-editor__segment--right${row.ellipsisSide === 'right' ? ' cdf-editor__segment--ellipsis' : ''}`,
      );
      const stackedArrow = row.arrow
        ? `<div class="cdf-editor__stack-arrow"><span class="cdf-editor__arrow" aria-hidden="true">${escapeHtml(row.arrow)}</span></div>`
        : '';
      const relationContent = row.layout === 'stacked'
        ? `
          <div class="cdf-editor__stack">
            ${left}
            ${stackedArrow}
            ${right}
          </div>
        `
        : `${left}${inlineArrow}${right}`;

      return `
        <div class="${rowClasses}" data-row-key="${escapeHtml(row.key)}">
          <span class="cdf-editor__bullet" aria-hidden="true"></span>
          <div class="cdf-editor__node">
            ${standalone || relationContent}
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
  const ellipsisContent = createCdfDirectRenderable(createCdfEllipsisHtml(), 'fragment');
  const level = row.level ?? 0;
  const emphasize = row.emphasize ?? 'normal';

  switch (row.kind) {
    case 'concept':
    case 'standalone':
      return {
        key: row.key,
        level,
        layout: 'standalone',
        emphasize,
        standaloneContent: rowMask?.segment === 'whole' ? ellipsisContent : row.content,
      };
    case 'group':
      if (rowMask?.segment === 'whole') {
        return {
          key: row.key,
          level,
          layout: 'standalone',
          emphasize,
          standaloneContent: ellipsisContent,
        };
      }
      return {
        key: row.key,
        level,
        layout: row.label.renderKind === 'block-flow' ? 'stacked' : 'inline',
        emphasize,
        leftContent: row.label,
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
          layout: 'standalone',
          emphasize,
          standaloneContent: ellipsisContent,
        };
      }
      const leftContent = maskLeft ? ellipsisContent : row.left;
      const rightContent = maskRight ? ellipsisContent : row.right;
      return {
        key: row.key,
        level,
        layout: leftContent.renderKind === 'block-flow' || rightContent.renderKind === 'block-flow'
          ? 'stacked'
          : 'inline',
        emphasize,
        leftContent,
        rightContent,
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
