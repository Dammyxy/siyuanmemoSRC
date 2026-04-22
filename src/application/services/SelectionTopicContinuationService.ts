import type { ProgressiveSiyuanPort } from '@/application/ports/ProgressiveSiyuanPort';
import {
  resolveProgressiveSourceContext,
  resolveProgressiveTopicContext,
  type ProgressiveSourceRootKind,
  type ProgressiveTopicContext,
} from '@/application/services/ProgressiveSourceContextResolver';
import type { ProgressiveExcerptBlockSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type {
  TopicDerivedItemArtifact,
} from '@/application/services/TopicDerivedItemService';
import { TopicDerivedItemService } from '@/application/services/TopicDerivedItemService';
import { UnifiedPostCreationPlanner } from '@/core/card/post-creation/UnifiedPostCreationPlanner';
import type { CreationDecision } from '@/core/card/post-creation/contracts';

export interface SelectionTopicContinuationInput {
  sourceBlockId: string;
  sourceBlockIds?: string[];
  selectedText: string;
  contentDom?: string;
  blockSelections?: ProgressiveExcerptBlockSelectionSnapshot[];
  rootId?: string;
  origin?: 'editor' | 'review' | 'block-menu';
}

export type SelectionTopicContinuationMode = 'planner-derived' | 'manual-cloze';

export interface SelectionTopicContinuationPreparation {
  rootId?: string;
  topicContext: ProgressiveTopicContext | null;
  normalizedContent: string;
  plannerContent: string;
  artifactContentDom: string;
  answerFingerprint?: string;
  decisions: CreationDecision[];
  mode: SelectionTopicContinuationMode | null;
  available: boolean;
}

export interface SelectionTopicContinuationResult {
  created: number;
  skipped: number;
  items: TopicDerivedItemArtifact[];
}

type BlockInfoRow = {
  root_id?: string;
  type?: string;
};

const DIRECT_CLOZE_DECISION: CreationDecision = {
  id: 'ManualSelectionClozeRule',
  family: 'cloze',
  templateId: 'builtin-multi-cloze',
  cardType: 'item',
  mode: 'multi-face',
  executorKind: 'quick-cloze',
  priority: 1000,
};

function isProgressiveTopicDecision(decision: CreationDecision): boolean {
  return (
    decision.family === 'basic'
    || decision.family === 'cloze'
    || decision.family === 'concept-definition'
    || decision.family === 'descriptor'
  );
}

function normalizeInlineWhitespace(value: string): string {
  return value
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPlannerTextFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  if (node.classList.contains('protyle-attr')) {
    return '';
  }

  if (node.tagName === 'BR') {
    return '\n';
  }

  const dataType = String(node.getAttribute('data-type') || '').trim();
  if (dataType === 'mark') {
    return `==${extractPlannerTextFromChildren(node)}==`;
  }

  if (dataType === 'block-ref') {
    const blockId = String(node.getAttribute('data-id') || '').trim();
    return blockId ? `((${blockId}))` : normalizeInlineWhitespace(node.textContent || '');
  }

  const dataHref = String(node.getAttribute('data-href') || '').trim();
  const blockHrefMatch = dataHref.match(/^siyuan:\/\/blocks\/([^/?#]+)$/u);
  if (blockHrefMatch?.[1]) {
    return `((${blockHrefMatch[1]}))`;
  }

  return extractPlannerTextFromChildren(node);
}

function extractPlannerTextFromChildren(node: Node): string {
  return Array.from(node.childNodes)
    .map((child) => extractPlannerTextFromNode(child))
    .join('');
}

function normalizeSelectionContent(selectedText: string, contentDom?: string): string {
  const normalizedText = normalizeInlineWhitespace(String(selectedText || ''));
  const providedContentDom = String(contentDom || '').trim();
  if (!providedContentDom) {
    return normalizedText;
  }

  const template = document.createElement('template');
  template.innerHTML = providedContentDom;
  const lines = Array.from(template.content.childNodes)
    .map((child) => normalizeInlineWhitespace(extractPlannerTextFromNode(child)))
    .filter((line) => line.length > 0);
  const normalizedDomText = lines.join('\n').trim();
  return normalizedDomText || normalizedText;
}

function extractFragmentPlannerText(
  html: string | undefined,
  options?: { trim?: boolean },
): string {
  const normalizedHtml = String(html || '').trim();
  if (!normalizedHtml) {
    return '';
  }

  const template = document.createElement('template');
  template.innerHTML = normalizedHtml;
  const raw = Array.from(template.content.childNodes)
    .map((child) => extractPlannerTextFromNode(child))
    .join('')
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ');

  return options?.trim === false
    ? raw
    : normalizeInlineWhitespace(raw);
}

function getFragmentBlockElement(html: string | undefined): HTMLElement | null {
  const normalizedHtml = String(html || '').trim();
  if (!normalizedHtml) {
    return null;
  }

  const template = document.createElement('template');
  template.innerHTML = normalizedHtml;
  return template.content.firstElementChild instanceof HTMLElement
    ? template.content.firstElementChild
    : null;
}

function resolveBlockContentRoot(blockElement: HTMLElement): HTMLElement {
  return blockElement.querySelector<HTMLElement>('[contenteditable="true"]') || blockElement;
}

function unwrapMarkElements(root: ParentNode): void {
  for (const mark of Array.from(root.querySelectorAll<HTMLElement>('[data-type="mark"]'))) {
    const parent = mark.parentNode;
    if (!parent) {
      continue;
    }
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  }
}

function extractEditableInnerHtml(
  html: string | undefined,
  options?: { flattenMarks?: boolean },
): string {
  const blockElement = getFragmentBlockElement(html);
  if (!blockElement) {
    return '';
  }

  const contentRoot = resolveBlockContentRoot(blockElement);
  if (options?.flattenMarks) {
    unwrapMarkElements(contentRoot);
  }
  return contentRoot.innerHTML;
}

function extractVisibleTextFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  if (node.classList.contains('protyle-attr')) {
    return '';
  }

  if (node.tagName === 'BR') {
    return '\n';
  }

  return Array.from(node.childNodes)
    .map((child) => extractVisibleTextFromNode(child))
    .join('');
}

function extractVisibleTextFromFragment(
  html: string | undefined,
  options?: { trim?: boolean },
): string {
  const blockElement = getFragmentBlockElement(html);
  if (!blockElement) {
    return '';
  }

  const contentRoot = resolveBlockContentRoot(blockElement);
  const raw = extractVisibleTextFromNode(contentRoot)
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ');

  return options?.trim === false
    ? raw
    : normalizeInlineWhitespace(raw);
}

function buildManualMarkInnerHtml(innerHtml: string): string {
  return `<span data-type="mark">${innerHtml}</span>`;
}

function buildManualClozePlannerContent(
  normalizedSelectionContent: string,
  contentDom?: string,
  blockSelections?: ProgressiveExcerptBlockSelectionSnapshot[],
): string {
  const normalizedSelection = normalizeInlineWhitespace(normalizedSelectionContent);
  if (!normalizedSelection) {
    return '';
  }

  if (!Array.isArray(blockSelections) || blockSelections.length !== 1) {
    return `==${normalizedSelection}==`;
  }

  const [selection] = blockSelections;
  if (!selection) {
    return `==${normalizedSelection}==`;
  }

  if (selection.mode === 'full-block') {
    const fullText = extractFragmentPlannerText(selection.excerptHtml, { trim: false }) || normalizedSelection;
    return normalizeInlineWhitespace(`==${fullText}==`);
  }

  const beforeText = extractFragmentPlannerText(selection.beforeHtml, { trim: false });
  const excerptText = extractFragmentPlannerText(selection.excerptHtml, { trim: false }) || normalizedSelection;
  const afterText = extractFragmentPlannerText(selection.afterHtml, { trim: false });
  const combined = normalizeInlineWhitespace(`${beforeText}==${excerptText}==${afterText}`);
  if (combined) {
    return combined;
  }

  const normalizedDomSelection = normalizeSelectionContent(normalizedSelection, contentDom);
  return `==${normalizedDomSelection || normalizedSelection}==`;
}

function buildManualClozeArtifactDom(
  blockSelections?: ProgressiveExcerptBlockSelectionSnapshot[],
): string {
  if (!Array.isArray(blockSelections) || blockSelections.length !== 1) {
    return '';
  }

  const [selection] = blockSelections;
  if (!selection) {
    return '';
  }

  const blockElement = getFragmentBlockElement(
    selection.excerptHtml || selection.beforeHtml || selection.afterHtml,
  );
  if (!blockElement) {
    return '';
  }

  const contentRoot = resolveBlockContentRoot(blockElement);
  if (selection.mode === 'full-block') {
    const targetInnerHtml = extractEditableInnerHtml(selection.excerptHtml, { flattenMarks: true });
    if (!targetInnerHtml) {
      return '';
    }
    contentRoot.innerHTML = buildManualMarkInnerHtml(targetInnerHtml);
    return blockElement.outerHTML.trim();
  }

  const beforeInnerHtml = extractEditableInnerHtml(selection.beforeHtml, { flattenMarks: true });
  const targetInnerHtml = extractEditableInnerHtml(selection.excerptHtml, { flattenMarks: true });
  const afterInnerHtml = extractEditableInnerHtml(selection.afterHtml, { flattenMarks: true });
  if (!targetInnerHtml) {
    return '';
  }

  contentRoot.innerHTML = `${beforeInnerHtml}${buildManualMarkInnerHtml(targetInnerHtml)}${afterInnerHtml}`;
  return blockElement.outerHTML.trim();
}

function buildManualAnswerFingerprint(
  sourceBlockId: string,
  normalizedSelectionContent: string,
  blockSelections?: ProgressiveExcerptBlockSelectionSnapshot[],
): string {
  const normalizedSourceBlockId = String(sourceBlockId || '').trim();
  const normalizedSelection = normalizeInlineWhitespace(normalizedSelectionContent);
  if (!normalizedSourceBlockId || !normalizedSelection) {
    return '';
  }

  const [selection] = Array.isArray(blockSelections) ? blockSelections : [];
  const beforeText = normalizeInlineWhitespace(extractVisibleTextFromFragment(selection?.beforeHtml));
  const afterText = normalizeInlineWhitespace(extractVisibleTextFromFragment(selection?.afterHtml));
  const beforeTail = beforeText.slice(-32);
  const afterHead = afterText.slice(0, 32);
  return `${normalizedSourceBlockId}::${DIRECT_CLOZE_DECISION.id}::${beforeTail}::${normalizedSelection}::${afterHead}`;
}

export class SelectionTopicContinuationService {
  private readonly planner = new UnifiedPostCreationPlanner();

  constructor(
    private readonly siyuanApi: ProgressiveSiyuanPort,
    private readonly cardService: CardApplicationService,
    private readonly topicDerivedItemService: TopicDerivedItemService,
  ) {}

  prepareSelection(input: SelectionTopicContinuationInput): SelectionTopicContinuationPreparation {
    const sourceBlockId = String(input.sourceBlockId || '').trim();
    const rootId = String(input.rootId || '').trim() || undefined;
    const normalizedContent = normalizeSelectionContent(input.selectedText, input.contentDom);
    if (!sourceBlockId || !normalizedContent) {
      return {
        rootId,
        topicContext: null,
        normalizedContent,
        plannerContent: '',
        artifactContentDom: '',
        decisions: [],
        mode: null,
        available: false,
      };
    }

    const topicContext = resolveProgressiveTopicContext({
      blockId: sourceBlockId,
      rootId,
      cardLookup: this.cardService,
    });
    if (!topicContext) {
      return {
        rootId,
        topicContext: null,
        normalizedContent,
        plannerContent: '',
        artifactContentDom: '',
        decisions: [],
        mode: null,
        available: false,
      };
    }

    const plan = this.planner.plan({
      blockId: sourceBlockId,
      content: normalizedContent,
      source: 'block-menu-manual',
      blockType: 'p',
      resolvedCardType: 'item',
    });
    const decisions = plan.decisions.filter((decision) => isProgressiveTopicDecision(decision));
    if (decisions.length > 0) {
      return {
        rootId,
        topicContext,
        normalizedContent,
        plannerContent: normalizedContent,
        artifactContentDom: '',
        decisions,
        mode: 'planner-derived',
        available: true,
      };
    }

    if (!Array.isArray(input.blockSelections) || input.blockSelections.length !== 1) {
      return {
        rootId,
        topicContext,
        normalizedContent,
        plannerContent: '',
        artifactContentDom: '',
        decisions: [],
        mode: null,
        available: false,
      };
    }

    const plannerContent = buildManualClozePlannerContent(
      normalizedContent,
      input.contentDom,
      input.blockSelections,
    );
    const artifactContentDom = buildManualClozeArtifactDom(input.blockSelections);
    const answerFingerprint = buildManualAnswerFingerprint(
      sourceBlockId,
      normalizedContent,
      input.blockSelections,
    );
    if (!plannerContent || !artifactContentDom || !answerFingerprint) {
      return {
        rootId,
        topicContext,
        normalizedContent,
        plannerContent: '',
        artifactContentDom: '',
        decisions: [],
        mode: null,
        available: false,
      };
    }

    return {
      rootId,
      topicContext,
      normalizedContent,
      plannerContent,
      artifactContentDom,
      answerFingerprint,
      decisions: [DIRECT_CLOZE_DECISION],
      mode: 'manual-cloze',
      available: true,
    };
  }

  async createFromSelection(
    input: SelectionTopicContinuationInput,
    preparation?: SelectionTopicContinuationPreparation,
  ): Promise<SelectionTopicContinuationResult> {
    const sourceBlockId = String(input.sourceBlockId || '').trim();
    const prepared = preparation || this.prepareSelection(input);
    if (!sourceBlockId || !prepared.available || !prepared.topicContext) {
      return {
        created: 0,
        skipped: 0,
        items: [],
      };
    }

    const blockInfo = await this.resolveBlockInfo(sourceBlockId);
    const resolvedRootId = prepared.rootId || String(input.rootId || '').trim() || blockInfo.rootId || sourceBlockId;
    const sourceContext = await resolveProgressiveSourceContext({
      blockId: sourceBlockId,
      rootId: resolvedRootId,
      cardLookup: this.cardService,
      attrLookup: this.siyuanApi,
    });
    const parentTopicCardId = sourceContext.parentTopicCardId || prepared.topicContext.topicCardId;
    if (!parentTopicCardId) {
      return {
        created: 0,
        skipped: 0,
        items: [],
      };
    }

    return this.topicDerivedItemService.createFromTopicSource({
      sourceBlockId,
      sourceDocId: sourceContext.sourceDocId || prepared.topicContext.sourceDocId,
      parentTopicCardId,
      parentExcerptId: sourceContext.parentExcerptId,
      sourceRootKind: sourceContext.rootKind as ProgressiveSourceRootKind,
      plannerContent: prepared.plannerContent,
      artifactContentDom: prepared.artifactContentDom || undefined,
      mode: prepared.mode || undefined,
      answerFingerprint: prepared.answerFingerprint,
      previewText: prepared.normalizedContent,
      decisions: prepared.decisions,
    });
  }

  private async resolveBlockInfo(blockId: string): Promise<{ rootId: string; blockType: string }> {
    const rows = await this.siyuanApi.sql<BlockInfoRow>(`
      SELECT root_id, type
      FROM blocks
      WHERE id = '${this.escapeSql(blockId)}'
      LIMIT 1
    `);
    const row = rows[0] || {};
    return {
      rootId: String(row.root_id || '').trim(),
      blockType: String(row.type || '').trim(),
    };
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}
