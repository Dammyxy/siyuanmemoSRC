import type { ProgressiveSiyuanPort } from '@/application/ports/ProgressiveSiyuanPort';
import {
  resolveProgressiveSourceContext,
  type ProgressiveSourceRootKind,
  type ProgressiveTopicContext,
} from '@/application/services/ProgressiveSourceContextResolver';
import {
  resolveTopicDerivedSourceEligibility,
  type TopicDerivedSourceEligibility,
} from '@/application/services/TopicDerivedSourceEligibility';
import type { ProgressiveExcerptBlockSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type {
  TopicDerivedItemArtifact,
} from '@/application/services/TopicDerivedItemService';
import { TopicDerivedItemService } from '@/application/services/TopicDerivedItemService';
import { UnifiedPostCreationPlanner } from '@/core/card/post-creation/UnifiedPostCreationPlanner';
import type { CreationDecision } from '@/core/card/post-creation/contracts';
import { createLogger } from '@/utils/logger';
import {
  MARK_DATA_TYPE_SELECTOR,
  createTokenizedMarkHtml,
  hasDataTypeToken,
  removeDataTypeToken,
  splitDataTypeTokens,
  unwrapMarkTokenElements,
} from '@/utils/markDataType';

export interface SelectionTopicContinuationInput {
  sourceBlockId: string;
  sourceBlockIds?: string[];
  topicContainerId?: string;
  topicContainerIds?: string[];
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
  highlightTargetCount: number;
  available: boolean;
  sourceEligibility?: TopicDerivedSourceEligibility;
}

export interface CurrentBlockTopicContinuationInput {
  sourceBlockId: string;
  contentDom?: string;
  rootId?: string;
}

export interface CurrentBlockTopicContinuationPreparation {
  rootId?: string;
  topicContext: ProgressiveTopicContext | null;
  markCount: number;
  available: boolean;
  sourceEligibility?: TopicDerivedSourceEligibility;
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

type TopicTitleRow = {
  content?: string;
  markdown?: string;
};

type PreparedBlockMarkContinuation = {
  plannerContent: string;
  artifactContentDom: string;
  answerFingerprint: string;
  previewText: string;
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

const logger = createLogger('SelectionTopicContinuationService');

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

function normalizeTopicTitle(value: string): string {
  return normalizeInlineWhitespace(value).slice(0, 80).trim();
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
  const hasMarkToken = hasDataTypeToken(dataType, 'mark');
  const hasBlockRefToken = hasDataTypeToken(dataType, 'block-ref');
  if (hasMarkToken && hasBlockRefToken) {
    const blockId = String(node.getAttribute('data-id') || '').trim();
    return blockId ? `==((${blockId}))==` : `==${normalizeInlineWhitespace(node.textContent || '')}==`;
  }

  if (hasMarkToken) {
    return `==${extractPlannerTextFromChildren(node)}==`;
  }

  if (hasBlockRefToken) {
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
  unwrapMarkTokenElements(root);
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

function extractPlannerTextFromFragmentNode(
  fragment: DocumentFragment,
  options?: { trim?: boolean },
): string {
  const raw = Array.from(fragment.childNodes)
    .map((child) => extractPlannerTextFromNode(child))
    .join('')
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ');

  return options?.trim === false
    ? raw
    : normalizeInlineWhitespace(raw);
}

function countTokenizedMarkTargets(html: string | undefined): number {
  const blockElement = getFragmentBlockElement(html);
  if (!blockElement) {
    return 0;
  }

  const contentRoot = resolveBlockContentRoot(blockElement);
  return contentRoot.querySelectorAll(MARK_DATA_TYPE_SELECTOR).length;
}

function flattenMarkElement(markElement: HTMLElement): void {
  const nextDataType = removeDataTypeToken(markElement.getAttribute('data-type'), 'mark');
  const remainingTokens = splitDataTypeTokens(nextDataType);
  const shouldUnwrap = remainingTokens.length === 0
    || (remainingTokens.length === 1 && remainingTokens[0] === 'text');

  if (!shouldUnwrap) {
    markElement.setAttribute('data-type', nextDataType);
    return;
  }

  const parent = markElement.parentNode;
  if (!parent) {
    return;
  }

  while (markElement.firstChild) {
    parent.insertBefore(markElement.firstChild, markElement);
  }
  parent.removeChild(markElement);
}

function extractPlannerTextInsideMarkElement(markElement: HTMLElement): string {
  const dataType = String(markElement.getAttribute('data-type') || '').trim();
  if (hasDataTypeToken(dataType, 'block-ref')) {
    const blockId = String(markElement.getAttribute('data-id') || '').trim();
    if (blockId) {
      return `((${blockId}))`;
    }
  }

  return normalizeInlineWhitespace(extractPlannerTextFromChildren(markElement));
}

function cloneBlockWithSingleTargetMark(
  blockHtml: string | undefined,
  targetIndex: number,
): PreparedBlockMarkContinuation | null {
  const blockElement = getFragmentBlockElement(blockHtml);
  if (!blockElement) {
    return null;
  }

  const contentRoot = resolveBlockContentRoot(blockElement);
  const markElements = Array.from(contentRoot.querySelectorAll<HTMLElement>(MARK_DATA_TYPE_SELECTOR));
  const targetMark = markElements[targetIndex];
  if (!targetMark) {
    return null;
  }

  markElements.forEach((markElement, index) => {
    if (index !== targetIndex) {
      flattenMarkElement(markElement);
    }
  });

  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(contentRoot);
  beforeRange.setEndBefore(targetMark);
  const beforeText = normalizeInlineWhitespace(
    extractPlannerTextFromFragmentNode(beforeRange.cloneContents()),
  );

  const afterRange = document.createRange();
  afterRange.selectNodeContents(contentRoot);
  afterRange.setStartAfter(targetMark);
  const afterText = normalizeInlineWhitespace(
    extractPlannerTextFromFragmentNode(afterRange.cloneContents()),
  );

  const targetPlannerText = extractPlannerTextInsideMarkElement(targetMark);
  const previewText = normalizeInlineWhitespace(extractVisibleTextFromNode(targetMark));
  if (!targetPlannerText || !previewText) {
    return null;
  }

  const beforeTail = beforeText.slice(-32);
  const afterHead = afterText.slice(0, 32);
  const answerFingerprint = `${beforeTail}::${targetPlannerText}::${afterHead}`;

  const normalizedPlannerContent = normalizeInlineWhitespace(
    extractPlannerTextFromChildren(contentRoot),
  );
  if (!normalizedPlannerContent) {
    return null;
  }

  return {
    plannerContent: normalizedPlannerContent,
    artifactContentDom: blockElement.outerHTML.trim(),
    answerFingerprint,
    previewText,
  };
}

function buildCurrentBlockMarkContinuations(
  sourceBlockId: string,
  blockHtml: string | undefined,
): PreparedBlockMarkContinuation[] {
  const normalizedSourceBlockId = String(sourceBlockId || '').trim();
  if (!normalizedSourceBlockId) {
    return [];
  }

  const markCount = countTokenizedMarkTargets(blockHtml);
  if (markCount === 0) {
    return [];
  }

  const candidates: PreparedBlockMarkContinuation[] = [];
  const seenFingerprints = new Set<string>();
  for (let index = 0; index < markCount; index += 1) {
    const candidate = cloneBlockWithSingleTargetMark(blockHtml, index);
    if (!candidate) {
      continue;
    }

    const answerFingerprint = `${normalizedSourceBlockId}::${DIRECT_CLOZE_DECISION.id}::${candidate.answerFingerprint}`;
    if (seenFingerprints.has(answerFingerprint)) {
      continue;
    }
    seenFingerprints.add(answerFingerprint);
    candidates.push({
      ...candidate,
      answerFingerprint,
    });
  }

  return candidates;
}

function buildManualMarkInnerHtml(innerHtml: string): string {
  return createTokenizedMarkHtml(innerHtml);
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
    const highlightTargetCount = countTokenizedMarkTargets(input.contentDom);
    if (!sourceBlockId || !normalizedContent) {
      return {
        rootId,
        topicContext: null,
        normalizedContent,
        plannerContent: '',
        artifactContentDom: '',
        decisions: [],
        mode: null,
        highlightTargetCount,
        available: false,
      };
    }

    const sourceEligibility = resolveTopicDerivedSourceEligibility({
      blockId: sourceBlockId,
      rootId,
      topicContainerId: input.topicContainerId,
      topicContainerIds: input.topicContainerIds,
      cardLookup: this.cardService,
    });
    const topicContext = sourceEligibility.topicContext;
    if (!topicContext) {
      this.logRejectedTopicContainerCandidates(input, rootId, sourceBlockId);
      return {
        rootId,
        topicContext: null,
        normalizedContent,
        plannerContent: '',
        artifactContentDom: '',
        decisions: [],
        mode: null,
        highlightTargetCount,
        available: false,
        sourceEligibility,
      };
    }

    if (!sourceEligibility.eligible) {
      return {
        rootId,
        topicContext,
        normalizedContent,
        plannerContent: '',
        artifactContentDom: '',
        decisions: [],
        mode: null,
        highlightTargetCount,
        available: false,
        sourceEligibility,
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
        highlightTargetCount,
        available: true,
        sourceEligibility,
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
        highlightTargetCount,
        available: false,
        sourceEligibility,
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
        highlightTargetCount,
        available: false,
        sourceEligibility,
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
      highlightTargetCount,
      available: true,
      sourceEligibility,
    };
  }

  prepareCurrentBlockMarks(input: CurrentBlockTopicContinuationInput): CurrentBlockTopicContinuationPreparation {
    const sourceBlockId = String(input.sourceBlockId || '').trim();
    const rootId = String(input.rootId || '').trim() || undefined;
    const contentDom = String(input.contentDom || '').trim();
    const markCount = countTokenizedMarkTargets(contentDom);
    if (!sourceBlockId || !contentDom) {
      return {
        rootId,
        topicContext: null,
        markCount,
        available: false,
      };
    }

    const sourceEligibility = resolveTopicDerivedSourceEligibility({
      blockId: sourceBlockId,
      rootId,
      cardLookup: this.cardService,
    });

    return {
      rootId,
      topicContext: sourceEligibility.topicContext,
      markCount,
      available: Boolean(sourceEligibility.eligible && markCount > 0),
      sourceEligibility,
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
      topicContainerId: input.topicContainerId,
      topicContainerIds: input.topicContainerIds,
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
    const parentTopicTitle = await this.resolveTopicTitle(sourceContext.topicContext || prepared.topicContext);

    return this.topicDerivedItemService.createFromTopicSource({
      sourceBlockId,
      sourceDocId: sourceContext.sourceDocId || prepared.topicContext.sourceDocId,
      parentTopicCardId,
      ...(parentTopicTitle ? { parentTopicTitle } : {}),
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

  async createFromCurrentBlockMarks(
    input: CurrentBlockTopicContinuationInput,
    preparation?: CurrentBlockTopicContinuationPreparation,
  ): Promise<SelectionTopicContinuationResult> {
    const sourceBlockId = String(input.sourceBlockId || '').trim();
    const contentDom = String(input.contentDom || '').trim();
    const prepared = preparation || this.prepareCurrentBlockMarks(input);
    if (!sourceBlockId || !contentDom || !prepared.available || !prepared.topicContext) {
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
    const parentTopicTitle = await this.resolveTopicTitle(sourceContext.topicContext || prepared.topicContext);

    const candidates = buildCurrentBlockMarkContinuations(sourceBlockId, contentDom);
    if (candidates.length === 0) {
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
      ...(parentTopicTitle ? { parentTopicTitle } : {}),
      parentExcerptId: sourceContext.parentExcerptId,
      sourceRootKind: sourceContext.rootKind as ProgressiveSourceRootKind,
      plannerContent: candidates[0]?.plannerContent || '',
      artifactContentDom: candidates[0]?.artifactContentDom,
      mode: 'manual-cloze',
      decisions: [DIRECT_CLOZE_DECISION],
      manualClozeCandidates: candidates,
    });
  }

  private async resolveTopicTitle(topicContext: ProgressiveTopicContext): Promise<string | undefined> {
    const topicBlockId = String(topicContext.topicBlockId || '').trim();
    if (!topicBlockId) {
      return undefined;
    }

    if (topicContext.scope === 'doc-root') {
      const docInfo = await this.siyuanApi.getDocInfo(topicBlockId);
      const hpathTail = String(docInfo.hpath || '')
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
        .pop() || '';
      return normalizeTopicTitle(docInfo.name || hpathTail) || undefined;
    }

    const rows = await this.siyuanApi.sql<TopicTitleRow>(`
      SELECT content, markdown
      FROM blocks
      WHERE id = '${this.escapeSql(topicBlockId)}'
      LIMIT 1
    `);
    const row = rows[0] || {};
    return normalizeTopicTitle(row.content || row.markdown || '') || undefined;
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

  private logRejectedTopicContainerCandidates(
    input: SelectionTopicContinuationInput,
    rootId: string | undefined,
    sourceBlockId: string,
  ): void {
    const candidates = [
      ...(
        Array.isArray(input.topicContainerIds)
          ? input.topicContainerIds.map((id) => String(id || '').trim())
          : []
      ),
      String(input.topicContainerId || '').trim(),
    ].filter((id, index, values) => id && id !== sourceBlockId && id !== rootId && values.indexOf(id) === index);
    if (candidates.length === 0) {
      return;
    }

    logger.warn('Rejected non-document Topic Container candidates for shortcut item creation', {
      sourceBlockId,
      rootId: rootId || null,
      topicContainerIds: candidates,
      reason: 'no-topic-card-identity',
    });
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}
