import { stripSiyuanBlockAttributeArtifacts } from '@/core/card/common/utils/stripSiyuanBlockAttributeArtifacts';
import { splitBySymbol } from '@/core/card/quick-card/domain/strategies/utils';

export type RiffSymbolRenderRepairStatus =
  | 'not-applicable'
  | 'repair-required'
  | 'source-unavailable'
  | 'invalid-source';

export interface RiffSymbolRenderRepairEvidence {
  source: 'live-source';
  path: 'sourceContent';
  value: string;
}

export interface RiffSymbolRenderRepairPatch {
  metaPatch?: Record<string, unknown>;
  metaDelete?: string[];
}

export interface RiffSymbolRenderRepairResult {
  status: RiffSymbolRenderRepairStatus;
  symbolType: string;
  evidence: RiffSymbolRenderRepairEvidence[];
  repairPatch: RiffSymbolRenderRepairPatch | null;
  diagnostics: string[];
}

export interface RiffSymbolRenderRepairInput {
  cardType: string | null | undefined;
  meta: Record<string, unknown> | null | undefined;
  sourceContent?: string | null;
}

const SUPPORTED_BINARY_SYMBOLS = [
  '>>>',
  '》》》',
  '>>',
  '》》',
  '<<',
  '《《',
  '<>',
  '《》',
  '::',
  '：：',
  ';;',
  '；；',
] as const;

const NOT_APPLICABLE: RiffSymbolRenderRepairResult = {
  status: 'not-applicable',
  symbolType: '',
  evidence: [],
  repairPatch: null,
  diagnostics: [],
};

export function resolveRiffSymbolRenderRepair(
  input: RiffSymbolRenderRepairInput,
): RiffSymbolRenderRepairResult {
  const meta = isRecord(input.meta) ? input.meta : {};
  if (!isRiffManagedItem(input.cardType, meta)) {
    return NOT_APPLICABLE;
  }

  const sourceContent = normalizeSourceContent(input.sourceContent);
  if (!sourceContent) {
    return hasProjectedSymbolHint(meta)
      ? {
        status: 'source-unavailable',
        symbolType: '',
        evidence: [],
        repairPatch: null,
        diagnostics: ['riff-symbol-live-source-missing'],
      }
      : NOT_APPLICABLE;
  }

  const detected = detectSupportedBinarySymbol(sourceContent);
  if (!detected) {
    return NOT_APPLICABLE;
  }

  const [left, right] = splitBySymbol(sourceContent, detected);
  if (!left || !right) {
    return {
      status: 'invalid-source',
      symbolType: detected,
      evidence: [],
      repairPatch: null,
      diagnostics: ['riff-symbol-source-grammar-invalid'],
    };
  }

  const metaPatch: Record<string, unknown> = {};
  const metaDelete: string[] = [];
  if (meta.symbolDetected !== true) {
    metaPatch.symbolDetected = true;
  }
  if (readString(meta.cardSource) !== 'quick-symbol') {
    metaPatch.cardSource = 'quick-symbol';
  }
  if (readString(meta.symbolType) !== detected) {
    metaPatch.symbolType = detected;
  }
  if (readString(meta.quickDetectReason) !== 'symbol-rule') {
    metaPatch.quickDetectReason = 'symbol-rule';
  }
  if (meta.forceProtyleRender === true) {
    metaDelete.push('forceProtyleRender');
  }

  return {
    status: 'repair-required',
    symbolType: detected,
    evidence: [{
      source: 'live-source',
      path: 'sourceContent',
      value: detected,
    }],
    repairPatch: Object.keys(metaPatch).length > 0 || metaDelete.length > 0
      ? {
        ...(Object.keys(metaPatch).length > 0 ? { metaPatch } : {}),
        ...(metaDelete.length > 0 ? { metaDelete } : {}),
      }
      : null,
    diagnostics: [],
  };
}

function isRiffManagedItem(cardType: string | null | undefined, meta: Record<string, unknown>): boolean {
  return cardType === 'item'
    && readString(meta.templateID) === 'builtin-riff-sync'
    && readString(meta.ownership) === 'riff-managed'
    && readString(meta.source) === 'riff-sync';
}

function detectSupportedBinarySymbol(sourceContent: string): string {
  return SUPPORTED_BINARY_SYMBOLS.find(symbol => sourceContent.includes(symbol)) ?? '';
}

function hasProjectedSymbolHint(meta: Record<string, unknown>): boolean {
  const faces = Array.isArray(meta.faces) ? meta.faces : [];
  return faces.some((face) => {
    if (!isRecord(face)) {
      return false;
    }
    const question = decodeBasicHtmlEntities(readString(face.question));
    return SUPPORTED_BINARY_SYMBOLS.some(symbol => question.includes(symbol));
  });
}

function normalizeSourceContent(value: string | null | undefined): string {
  return stripSiyuanBlockAttributeArtifacts(decodeBasicHtmlEntities(readString(value)));
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&gt;|&#62;|&#x3e;/giu, '>')
    .replace(/&lt;|&#60;|&#x3c;/giu, '<')
    .replace(/&amp;|&#38;|&#x26;/giu, '&');
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
