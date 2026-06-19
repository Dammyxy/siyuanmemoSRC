import type { ReviewMarkdownRenderKind } from './reviewMarkdownRender';

export type RichContentSourceKind =
  | 'quick'
  | 'concept'
  | 'concept-definition'
  | 'descriptor'
  | 'multi-cloze'
  | 'cdf-direct'
  | 'xiuyuan-list-template'
  | 'raw-html'
  | 'unknown';

export type RichContentAtomKind =
  | 'block-ref'
  | 'siyuan-link'
  | 'external-link'
  | 'asset'
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'file'
  | 'math'
  | 'code';

export type RichContentDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface RichContentSourceMeta {
  id?: string;
  kind: RichContentSourceKind;
  field?: string;
}

export interface RichContentAtom {
  id: string;
  kind: RichContentAtomKind;
  target?: string;
  label?: string;
  language?: string;
  source?: 'html' | 'markdown';
}

export interface RichContentDiagnostic {
  code: string;
  severity: RichContentDiagnosticSeverity;
  message: string;
  target?: string;
}

export interface RichContentResult {
  html: string;
  atoms: RichContentAtom[];
  diagnostics: RichContentDiagnostic[];
  source: RichContentSourceMeta;
  renderKind: ReviewMarkdownRenderKind | 'html';
}

export function createEmptyRichContent(source: RichContentSourceMeta): RichContentResult {
  return {
    html: '',
    atoms: [],
    diagnostics: [],
    source,
    renderKind: 'fragment',
  };
}

