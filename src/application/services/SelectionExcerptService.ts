import type { ProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import {
  applyProgressiveExcerptHighlight,
  prepareProgressiveExcerptHighlight,
  type PreparedProgressiveExcerptHighlight,
} from '@/application/entries/ProgressiveExcerptHighlight';
import type {
  ProgressiveExcerptCreationResult,
  ProgressiveExcerptInput,
  ProgressiveExcerptSourceMaterializationResult,
} from '@/application/services/ProgressiveReadingService';
import { ProgressiveReadingService } from '@/application/services/ProgressiveReadingService';
import type {
  ProgressiveContentPayloadIdentity,
  ProgressiveDisclosureState,
  ProgressiveSourceLineage,
} from '@/core/progressive/progressiveSourceModel';

export type SelectionExcerptActionOrigin = 'editor' | 'block-menu' | 'review';

export interface SelectionExcerptSourceMarkDiagnostic {
  code: 'source-mark-persist-failed';
  message: string;
}

export interface SelectionExcerptSourceMarkResult {
  enabled: boolean;
  colorApplied: boolean;
  diagnostic?: SelectionExcerptSourceMarkDiagnostic;
}

export interface SelectionExcerptPreservationResult {
  incomplete: boolean;
  diagnostics: string[];
}

interface SelectionExcerptActionSourceSemantics {
  sourceLineage?: ProgressiveSourceLineage;
  payloadIdentity?: ProgressiveContentPayloadIdentity;
  disclosureState?: ProgressiveDisclosureState;
}

export interface ExecuteSelectionExcerptActionInput {
  selection: ProgressiveExcerptSelectionSnapshot;
  origin: SelectionExcerptActionOrigin;
  currentCardId?: string;
  sourceMarkingEnabled: boolean;
}

export interface CreatedSelectionExcerptActionResult extends SelectionExcerptActionSourceSemantics {
  kind: 'created';
  excerptEntityId: string;
  excerptEntityType: 'doc' | 'block';
  topicCardId: string;
  sourceBlockId: string;
  sourceBlockIds: string[];
  containerDocId: string;
  recordId: string;
  colorApplied: boolean;
  sourceMark: SelectionExcerptSourceMarkResult;
  preservation: SelectionExcerptPreservationResult;
}

export type SelectionExcerptActionResult = CreatedSelectionExcerptActionResult;

interface ProgressiveExcerptFacade {
  materializeExcerptSource(snapshot: ProgressiveExcerptSelectionSnapshot): Promise<ProgressiveExcerptSourceMaterializationResult>;
  createExcerptFromSelection(input: ProgressiveExcerptInput): Promise<ProgressiveExcerptCreationResult>;
  updateSourceBlockDom(blockId: string, dom: string): Promise<void>;
  recordProgressiveExcerptSourceMarkProvenance?(blockIds: string[]): void;
}

interface SelectionExcerptHighlightAdapter {
  prepareHighlight(snapshot: ProgressiveExcerptSelectionSnapshot): PreparedProgressiveExcerptHighlight | null;
  applyHighlight(
    prepared: PreparedProgressiveExcerptHighlight | null,
    options: { persistDomBlock: (blockId: string, dom: string) => Promise<unknown> },
  ): Promise<boolean>;
}

const DEFAULT_HIGHLIGHT_ADAPTER: SelectionExcerptHighlightAdapter = {
  prepareHighlight: prepareProgressiveExcerptHighlight,
  applyHighlight: applyProgressiveExcerptHighlight,
};

function toProgressiveCreateOrigin(origin: SelectionExcerptActionOrigin): ProgressiveExcerptInput['origin'] {
  return origin === 'review' ? 'review' : 'editor';
}

function hasLikelyInlineReferenceEvidence(value: string): boolean {
  return /\[[^\]]+\]\([^)]+\)/u.test(value)
    || /\(\([0-9]{14}-[0-9a-z]{7}\)\)/u.test(value)
    || /\bassets\/\S+/u.test(value)
    || /\bsiyuan:\/\/\S+/u.test(value)
    || /data-type\s*=/u.test(value);
}

function buildPreservationDiagnostics(contentDom: string | undefined, selectedText: string): SelectionExcerptPreservationResult {
  const incomplete = !String(contentDom || '').trim() && hasLikelyInlineReferenceEvidence(selectedText);
  return {
    incomplete,
    diagnostics: incomplete ? ['missing-dom-preservation-evidence'] : [],
  };
}

function extractSourceSemantics(result: ProgressiveExcerptCreationResult): SelectionExcerptActionSourceSemantics {
  return {
    sourceLineage: result.sourceLineage,
    payloadIdentity: result.payloadIdentity,
    disclosureState: result.disclosureState,
  };
}

export class SelectionExcerptService {
  constructor(
    private readonly progressiveService: ProgressiveReadingService | ProgressiveExcerptFacade,
    private readonly highlightAdapter: SelectionExcerptHighlightAdapter = DEFAULT_HIGHLIGHT_ADAPTER,
  ) {}

  async executeSelectionExcerptAction(input: ExecuteSelectionExcerptActionInput): Promise<SelectionExcerptActionResult> {
    const materialized = await this.progressiveService.materializeExcerptSource(input.selection);
    const preservation = buildPreservationDiagnostics(materialized.contentDom, input.selection.text);
    const preparedHighlight = input.sourceMarkingEnabled
      ? this.prepareSourceMark(materialized.highlightSnapshot)
      : null;
    if (input.sourceMarkingEnabled) {
      this.progressiveService.recordProgressiveExcerptSourceMarkProvenance?.(materialized.sourceBlockIds);
    }

    const result = await this.progressiveService.createExcerptFromSelection({
      sourceBlockId: materialized.sourceBlockId,
      sourceBlockIds: materialized.sourceBlockIds,
      selectedText: input.selection.text,
      contentDom: materialized.contentDom,
      origin: toProgressiveCreateOrigin(input.origin),
      currentCardId: input.currentCardId,
    });
    const sourceMark = await this.applySourceMark(preparedHighlight, input.sourceMarkingEnabled);
    const sourceSemantics = extractSourceSemantics(result);

    return {
      kind: 'created',
      excerptEntityId: result.excerptEntityId,
      excerptEntityType: result.excerptEntityType,
      topicCardId: result.topicCardId,
      sourceBlockId: result.sourceBlockId,
      sourceBlockIds: result.sourceBlockIds,
      containerDocId: result.containerDocId,
      recordId: result.recordId,
      colorApplied: sourceMark.colorApplied,
      sourceMark,
      preservation,
      ...sourceSemantics,
    };
  }

  private prepareSourceMark(snapshot: ProgressiveExcerptSelectionSnapshot): PreparedProgressiveExcerptHighlight {
    try {
      const prepared = this.highlightAdapter.prepareHighlight(snapshot);
      if (!prepared) {
        throw new Error('no source mark target');
      }
      return prepared;
    } catch (error) {
      throw new Error(
        `PROGRESSIVE_EXCERPT_HIGHLIGHT_UNAVAILABLE: failed to prepare progressive excerpt highlight: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async applySourceMark(
    preparedHighlight: PreparedProgressiveExcerptHighlight | null,
    sourceMarkingEnabled: boolean,
  ): Promise<SelectionExcerptSourceMarkResult> {
    if (!sourceMarkingEnabled) {
      return {
        enabled: false,
        colorApplied: false,
      };
    }

    let colorApplied = false;
    try {
      colorApplied = await this.highlightAdapter.applyHighlight(preparedHighlight, {
        persistDomBlock: (blockId, dom) => this.progressiveService.updateSourceBlockDom(blockId, dom),
      });
    } catch {
      colorApplied = false;
    }

    if (colorApplied) {
      return {
        enabled: true,
        colorApplied: true,
      };
    }

    return {
      enabled: true,
      colorApplied: false,
      diagnostic: {
        code: 'source-mark-persist-failed',
        message: '原文标记未写入',
      },
    };
  }
}
