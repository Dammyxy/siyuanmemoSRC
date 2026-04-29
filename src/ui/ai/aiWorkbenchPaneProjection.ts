import {
  resolveSelfTestCandidateDraftMarkdown,
  summarizeSelfTestCandidateCard,
} from '@/application/services/AISelfTestDraftSupport';
import { formatConceptCoachPerspectiveSectionMarkdown } from '@/application/services/AIWorkbenchResultFormatter';
import type {
  AIAttachedContextItem,
  AICdfAnchor,
  AICdfAnchorResolution,
  AICdfDescriptorGroup,
  AICdfStructure,
  AIChatApprovalRequest,
  AIConceptCoachCandidateCard,
  AIConceptCoachIntegratedUnderstanding,
  AIConceptCoachNormalizationDiagnostic,
  AIConceptCoachPerspectives,
  AIConceptCoachRealWorldTriggers,
  AIConceptCoachSelfTestCards,
  AIConceptCoachSelfTestCreationMode,
  AIExplainResult,
  AIUserSkillStructuredCard,
  AIUserSkillStructuredKeyValue,
  AIWorkbenchApprovalMessage,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchAssistantTextMessage,
  AIWorkbenchCdfCreationResult,
  AIWorkbenchMessage,
  AIWorkbenchRenderEntry,
  AIWorkbenchSelfTestCardCreationResult,
  AIWorkbenchSelfTestCardTargetMemory,
  AIWorkbenchToolLogMessage,
} from '@/types/ai';

export type AssistantSection =
  | { key: string; title: string; kind: 'text'; text: string }
  | { key: string; title: string; kind: 'list'; items: string[] }
  | { key: string; title: string; kind: 'cards'; cards: AIUserSkillStructuredCard[] }
  | { key: string; title: string; kind: 'keyValue'; keyValues: AIUserSkillStructuredKeyValue[] };

export interface AIWorkbenchPaneProjectionLabels {
  aiBusyWait: string;
  aiStructuredEmptyResult: string;
  aiStructuredPartialResult: string;
  aiWorkbench: string;
  anchorNotSelectedHint: string;
  approval: string;
  branches: string;
  capabilities: string;
  cardIdeas: string;
  candidateDraft: string;
  causality: string;
  characters: string;
  conceptPendingResolve: string;
  conceptResolutionStale: string;
  conceptResolutionStaleHint: string;
  conceptUnresolved: string;
  connections: string;
  contrasts: string;
  createSelectedCards: string;
  creatingCards: string;
  essence: string;
  itemsUnit: string;
  missingSections: string;
  noResolvedConcepts: string;
  notWhat: string;
  partsAndWhole: string;
  rawShape: string;
  realWorldTriggers: string;
  resolvedFromContext: string;
  resolvedFromNotebook: string;
  resolvedManually: string;
  round: string;
  rounds: string;
  selectCandidateFirst: string;
  selectCdfFieldsFirst: string;
  selectConceptFirst: string;
  setSelfTestTargetFirst: string;
  setTargetFirst: string;
  significance: string;
  steps: string;
  toolCalls: string;
  toolCallsLabel: string;
  toolRuntime: string;
  traits: string;
  triggers: string;
  versions: string;
  viewDetails: string;
  whatItTests: string;
  whyItsTricky: string;
  workingDefinition: string;
  you: string;
}

export interface AIWorkbenchMessageMetaProjection {
  versionCount: number;
  branchCount: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeLooseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  const normalized = String(value || '').trim();
  return normalized ? [normalized] : [];
}

export function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

export function tryParseStructuredJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveLegacyExplainResult(message: AIWorkbenchAssistantResultMessage): AIExplainResult | null {
  if (message.explainResult && (
    message.explainResult.workingDefinition
    || message.explainResult.whatItTests
    || message.explainResult.whyItsTricky
    || message.explainResult.connections.length > 0
    || message.explainResult.triggers.length > 0
    || message.explainResult.cardIdeas.length > 0
  )) {
    return message.explainResult;
  }
  const raw = tryParseStructuredJson(message.rawContent);
  if (!raw) {
    return message.explainResult || null;
  }
  return {
    workingDefinition: typeof raw.workingDefinition === 'string' ? raw.workingDefinition.trim() : (typeof raw.workDefinition === 'string' ? raw.workDefinition.trim() : ''),
    whatItTests: typeof raw.whatItTests === 'string' ? raw.whatItTests.trim() : (typeof raw.testPoint === 'string' ? raw.testPoint.trim() : ''),
    whyItsTricky: typeof raw.whyItsTricky === 'string' ? raw.whyItsTricky.trim() : (typeof raw.confusionBoundary === 'string' ? raw.confusionBoundary.trim() : ''),
    connections: normalizeLooseStringList(raw.connections ?? raw.knowledgeNetwork),
    triggers: normalizeLooseStringList(raw.triggers ?? raw.recognizeNextTime ?? raw.recallTrigger),
    cardIdeas: normalizeLooseStringList(raw.cardIdeas),
    rawContent: message.rawContent,
  };
}

export function previewText(value: string | null | undefined, limit = 180): string {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

export function sectionsFromPerspectives(
  value: AIConceptCoachPerspectives,
  labels: AIWorkbenchPaneProjectionLabels,
): AssistantSection[] {
  return [
    { key: 'traits', title: value.traits.title || labels.traits, kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.traits) },
    { key: 'contrasts', title: value.contrasts.title || labels.contrasts, kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.contrasts) },
    { key: 'partsAndWhole', title: value.partsAndWhole.title || labels.partsAndWhole, kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.partsAndWhole) },
    { key: 'causality', title: value.causality.title || labels.causality, kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.causality) },
    { key: 'significance', title: value.significance.title || labels.significance, kind: 'text' as const, text: formatConceptCoachPerspectiveSectionMarkdown(value.significance) },
  ];
}

export function missingSectionLabel(
  tabId: AIWorkbenchAssistantResultMessage['tabId'],
  key: string,
  labels: AIWorkbenchPaneProjectionLabels,
): string {
  if (tabId === 'perspectives') {
    switch (key) {
      case 'traits':
        return labels.traits;
      case 'contrasts':
        return labels.contrasts;
      case 'partsAndWhole':
        return labels.partsAndWhole;
      case 'causality':
        return labels.causality;
      case 'significance':
        return labels.significance;
      default:
        return key;
    }
  }
  if (tabId === 'integrated-understanding') {
    switch (key) {
      case 'essence':
        return labels.essence;
      case 'notWhat':
        return labels.notWhat;
      case 'capabilities':
        return labels.capabilities;
      default:
        return key;
    }
  }
  return key;
}

export function buildAssistantResultNotice(
  message: AIWorkbenchMessage,
  labels: AIWorkbenchPaneProjectionLabels,
): { status: AIConceptCoachNormalizationDiagnostic['status']; text: string } | null {
  if (message.kind !== 'assistant-result' || !message.normalizationDiagnostic) {
    return null;
  }
  const diagnostic = message.normalizationDiagnostic;
  if (diagnostic.status === 'full') {
    return null;
  }
  const missing = diagnostic.missingSections
    .map((key) => missingSectionLabel(message.tabId, key, labels))
    .filter(Boolean)
    .join('、');

  if (diagnostic.status === 'empty') {
    const detail = missing
      ? `${labels.missingSections}：${missing}。`
      : '';
    const shape = diagnostic.rawShape && diagnostic.rawShape !== 'persisted-result'
      ? `${labels.rawShape}：${diagnostic.rawShape}。`
      : '';
    return {
      status: diagnostic.status,
      text: `${labels.aiStructuredEmptyResult}${detail}${shape}`.trim(),
    };
  }

  return {
    status: diagnostic.status,
    text: `${labels.aiStructuredPartialResult}${missing ? ` ${labels.missingSections}：${missing}。` : ''}`.trim(),
  };
}

export function buildAssistantSections(
  message: AIWorkbenchMessage,
  labels: AIWorkbenchPaneProjectionLabels,
): AssistantSection[] {
  if (message.kind !== 'assistant-result') {
    return [];
  }
  const genericSections = message.genericSectionResult
    ? [message.genericSectionResult]
    : message.genericStructuredResult?.sections.filter((section) => section.id === message.tabId) || [];
  if (genericSections.length > 0) {
    return genericSections
      .map((section): AssistantSection | null => {
        if (section.renderer === 'markdown') {
          return section.text.trim()
            ? { key: section.id, title: section.title, kind: 'text', text: section.text }
            : null;
        }
        if (section.renderer === 'list') {
          return section.items.length > 0
            ? { key: section.id, title: section.title, kind: 'list', items: section.items }
            : null;
        }
        if (section.renderer === 'cards') {
          return section.cards.length > 0
            ? { key: section.id, title: section.title, kind: 'cards', cards: section.cards }
            : null;
        }
        return section.keyValues.length > 0
          ? { key: section.id, title: section.title, kind: 'keyValue', keyValues: section.keyValues }
          : null;
      })
      .filter((section): section is AssistantSection => Boolean(section));
  }
  const legacyResult = !message.conceptCoachResult && !message.tabResult
    ? resolveLegacyExplainResult(message)
    : null;
  if (legacyResult) {
    return [
      { key: 'workingDefinition', title: labels.workingDefinition, kind: 'text' as const, text: legacyResult.workingDefinition },
      { key: 'whatItTests', title: labels.whatItTests, kind: 'text' as const, text: legacyResult.whatItTests },
      { key: 'whyItsTricky', title: labels.whyItsTricky, kind: 'text' as const, text: legacyResult.whyItsTricky },
      { key: 'connections', title: labels.connections, kind: 'list' as const, items: legacyResult.connections },
      { key: 'triggers', title: labels.triggers, kind: 'list' as const, items: legacyResult.triggers },
      { key: 'cardIdeas', title: labels.cardIdeas, kind: 'list' as const, items: legacyResult.cardIdeas },
    ].filter((section) => section.kind === 'text' ? section.text.trim().length > 0 : section.items.length > 0);
  }
  if (message.tabId === 'working-definition') {
    const text = typeof message.tabResult === 'string'
      ? message.tabResult
      : message.conceptCoachResult?.workingDefinition || '';
    return [{ key: 'workingDefinition', title: labels.workingDefinition, kind: 'text', text }].filter((section) => section.text.trim());
  }
  if (message.tabId === 'perspectives') {
    return sectionsFromPerspectives((message.tabResult || message.conceptCoachResult?.perspectives) as AIConceptCoachPerspectives, labels)
      .filter((section) => section.kind === 'text' ? section.text.trim().length > 0 : section.items.length > 0);
  }
  if (message.tabId === 'integrated-understanding') {
    const value = (message.tabResult || message.conceptCoachResult?.integratedUnderstanding) as AIConceptCoachIntegratedUnderstanding | null;
    return value ? [
      { key: 'essence', title: labels.essence, kind: 'text' as const, text: normalizeText(value.essence) },
      { key: 'notWhat', title: labels.notWhat, kind: 'list' as const, items: normalizeLooseStringList(value.notWhat) },
      { key: 'capabilities', title: labels.capabilities, kind: 'list' as const, items: normalizeLooseStringList(value.capabilities) },
    ].filter((section) => section.kind === 'text' ? section.text.length > 0 : section.items.length > 0) : [];
  }
  if (message.tabId === 'real-world-triggers') {
    const value = (message.tabResult || message.conceptCoachResult?.realWorldTriggers) as AIConceptCoachRealWorldTriggers | null;
    return value ? [{ key: 'triggers', title: labels.realWorldTriggers, kind: 'list', items: normalizeLooseStringList(value.triggers) }] : [];
  }
  return [];
}

export function getSelfTestCandidateCards(message: AIWorkbenchAssistantResultMessage): AIConceptCoachCandidateCard[] {
  const value = (message.tabResult || message.conceptCoachResult?.selfTestCards) as AIConceptCoachSelfTestCards | null;
  return Array.isArray(value?.cards) ? value.cards : [];
}

export function getSelfTestCandidateDraftMarkdown(
  card: AIConceptCoachCandidateCard,
  mode: AIConceptCoachSelfTestCreationMode,
): string {
  return resolveSelfTestCandidateDraftMarkdown(card, mode, { allowFallback: true });
}

export function getSelfTestCandidateSummary(
  card: AIConceptCoachCandidateCard,
  labels: AIWorkbenchPaneProjectionLabels,
): string {
  return summarizeSelfTestCandidateCard(card) || labels.candidateDraft;
}

export function countSelectedSelfTestCandidates(message: AIWorkbenchAssistantResultMessage): number {
  return getSelfTestCandidateCards(message).filter((card) => card.selected !== false).length;
}

export function countValidSelectedSelfTestCandidates(
  message: AIWorkbenchAssistantResultMessage,
  mode: AIConceptCoachSelfTestCreationMode,
): number {
  return getSelfTestCandidateCards(message).filter((card) => (
    card.selected !== false
    && normalizeText(getSelfTestCandidateDraftMarkdown(card, mode)).length > 0
  )).length;
}

export function formatSelectedCardsLabel(
  selectedCount: number,
  busy: boolean,
  labels: AIWorkbenchPaneProjectionLabels,
): string {
  if (busy) {
    return labels.creatingCards;
  }
  return `${labels.createSelectedCards} · ${selectedCount} ${labels.itemsUnit}`;
}

export function resolveSelfTestCardCreationDisabledReason(input: {
  message: AIWorkbenchAssistantResultMessage;
  mode: AIConceptCoachSelfTestCreationMode;
  isLoading: boolean;
  creationBusy: boolean;
  modeDraftBusy: boolean;
  target: AIWorkbenchSelfTestCardTargetMemory | null;
  labels: AIWorkbenchPaneProjectionLabels;
}): string | null {
  if (input.isLoading || input.creationBusy || input.modeDraftBusy) {
    return input.labels.aiBusyWait;
  }
  if (countValidSelectedSelfTestCandidates(input.message, input.mode) === 0) {
    return input.labels.selectCandidateFirst;
  }
  if (!input.target) {
    return input.labels.setSelfTestTargetFirst;
  }
  return null;
}

export function getRawCdfStructure(message: AIWorkbenchAssistantResultMessage): AICdfStructure {
  const value = (message.tabResult || message.conceptCoachResult?.cdfStructure) as AICdfStructure | null;
  return value?.anchors ? value : { anchors: [] };
}

export function mergeCdfPreviewIntoStructure(base: AICdfStructure, preview: AICdfStructure | null | undefined): AICdfStructure {
  if (!preview?.anchors?.length) {
    return base;
  }
  const previewById = new Map(preview.anchors.map((anchor) => [anchor.id, anchor] as const));
  return {
    anchors: base.anchors.map((anchor) => {
      const resolved = previewById.get(anchor.id);
      if (!resolved) {
        return anchor;
      }
      return {
        ...anchor,
        resolution: resolved.resolution,
        warnings: resolved.warnings || anchor.warnings || [],
      };
    }),
  };
}

export function getCdfStructureForMessage(
  message: AIWorkbenchAssistantResultMessage,
  preview: AICdfStructure | null | undefined,
): AICdfStructure {
  return mergeCdfPreviewIntoStructure(getRawCdfStructure(message), preview);
}

export function getCdfAnchors(
  message: AIWorkbenchAssistantResultMessage,
  preview: AICdfStructure | null | undefined,
): AICdfAnchor[] {
  return getCdfStructureForMessage(message, preview).anchors || [];
}

export function isCdfResolutionStaleForTarget(
  resolution: AICdfAnchorResolution | null | undefined,
  target: AIWorkbenchSelfTestCardTargetMemory | null,
): boolean {
  if (!resolution || !target) {
    return false;
  }
  if (resolution.status !== 'resolved-notebook' && resolution.status !== 'resolved-manual') {
    return false;
  }
  const resolutionNotebookId = normalizeText(resolution.notebookId);
  if (!resolutionNotebookId) {
    return false;
  }
  return resolutionNotebookId !== normalizeText(target.notebookId);
}

export function hasUsableCdfResolution(
  anchor: AICdfAnchor,
  target: AIWorkbenchSelfTestCardTargetMemory | null,
): boolean {
  if (!anchor.resolution || isCdfResolutionStaleForTarget(anchor.resolution, target)) {
    return false;
  }
  return anchor.resolution.status === 'resolved-context'
    || anchor.resolution.status === 'resolved-notebook'
    || anchor.resolution.status === 'resolved-manual';
}

export function countSelectedCdfAnchors(anchors: AICdfAnchor[]): number {
  return anchors.filter((anchor) => anchor.selected !== false).length;
}

export function countSelectedCdfDefinitions(anchors: AICdfAnchor[]): number {
  return anchors.reduce((total, anchor) => total + anchor.definitionCandidates.filter((definition) => (
    anchor.selected !== false && definition.selected !== false && normalizeText(definition.text).length > 0
  )).length, 0);
}

export function hasSelectedCdfDefinition(anchor: AICdfAnchor): boolean {
  return anchor.definitionCandidates.some((definition) => (
    definition.selected !== false && normalizeText(definition.text).length > 0
  ));
}

export function countSelectedCdfDescriptorItemsInGroup(group: AICdfDescriptorGroup): number {
  return group.items.filter((item) => item.selected !== false && normalizeText(item.text).length > 0).length;
}

export function getCdfDescriptorGroupMode(group: AICdfDescriptorGroup): ';;' | ';;;' {
  return countSelectedCdfDescriptorItemsInGroup(group) > 1 ? ';;;' : ';;';
}

export function countSelectedCdfDescriptors(anchors: AICdfAnchor[]): number {
  return anchors.reduce((total, anchor) => total + anchor.descriptorGroups.reduce((groupTotal, group) => (
    anchor.selected !== false && group.selected !== false
      ? groupTotal + countSelectedCdfDescriptorItemsInGroup(group)
      : groupTotal
  ), 0), 0);
}

export function getCdfResolutionLabel(
  anchor: AICdfAnchor,
  target: AIWorkbenchSelfTestCardTargetMemory | null,
  labels: AIWorkbenchPaneProjectionLabels,
): string {
  if (isCdfResolutionStaleForTarget(anchor.resolution, target)) {
    return labels.conceptResolutionStale;
  }
  switch (anchor.resolution?.status) {
    case 'resolved-context':
      return labels.resolvedFromContext;
    case 'resolved-notebook':
      return labels.resolvedFromNotebook;
    case 'resolved-manual':
      return labels.resolvedManually;
    case 'unresolved':
      return labels.conceptUnresolved;
    default:
      return target
        ? labels.conceptPendingResolve
        : labels.setTargetFirst;
  }
}

export function getCdfResolutionReason(
  anchor: AICdfAnchor,
  target: AIWorkbenchSelfTestCardTargetMemory | null,
  labels: AIWorkbenchPaneProjectionLabels,
): string {
  if (isCdfResolutionStaleForTarget(anchor.resolution, target)) {
    return labels.conceptResolutionStaleHint;
  }
  return normalizeText(anchor.resolution?.reason);
}

export function getCdfAnchorCreationHint(
  anchor: AICdfAnchor,
  target: AIWorkbenchSelfTestCardTargetMemory | null,
  labels: AIWorkbenchPaneProjectionLabels,
): string | null {
  if (anchor.selected === false) {
    return labels.anchorNotSelectedHint;
  }
  if (!anchor.resolution) {
    return target ? null : labels.setTargetFirst;
  }
  if (isCdfResolutionStaleForTarget(anchor.resolution, target) || anchor.resolution.status === 'unresolved') {
    return null;
  }
  const selectedDefinitions = anchor.definitionCandidates.filter((definition) => definition.selected !== false && normalizeText(definition.text).length > 0).length;
  const selectedDescriptors = anchor.descriptorGroups.reduce((total, group) => (
    group.selected === false
      ? total
      : total + group.items.filter((item) => item.selected !== false && normalizeText(item.text).length > 0).length
  ), 0);
  if (selectedDefinitions === 0 && selectedDescriptors === 0) {
    return labels.selectCdfFieldsFirst;
  }
  return null;
}

export function canCreateCdfConceptDocument(
  anchor: AICdfAnchor,
  target: AIWorkbenchSelfTestCardTargetMemory | null,
): boolean {
  if (!target || !anchor.resolution) {
    return false;
  }
  return anchor.resolution.status === 'unresolved' || isCdfResolutionStaleForTarget(anchor.resolution, target);
}

export function resolveCdfCardCreationDisabledReason(input: {
  anchors: AICdfAnchor[];
  target: AIWorkbenchSelfTestCardTargetMemory | null;
  isLoading: boolean;
  creationBusy: boolean;
  previewBusy: boolean;
  labels: AIWorkbenchPaneProjectionLabels;
}): string | null {
  if (input.isLoading || input.creationBusy || input.previewBusy) {
    return input.labels.aiBusyWait;
  }
  if (!input.target) {
    return input.labels.setSelfTestTargetFirst;
  }
  const selectedAnchors = input.anchors.filter((anchor) => anchor.selected !== false);
  if (selectedAnchors.length === 0) {
    return input.labels.selectConceptFirst;
  }
  if (selectedAnchors.every((anchor) => !hasUsableCdfResolution(anchor, input.target))) {
    return input.labels.noResolvedConcepts;
  }
  if (!selectedAnchors.some((anchor) => getCdfAnchorCreationHint(anchor, input.target, input.labels) === null)) {
    return input.labels.selectCdfFieldsFirst;
  }
  return null;
}

export function getMessageSpeaker(message: AIWorkbenchMessage, labels: AIWorkbenchPaneProjectionLabels): string {
  if (message.kind === 'user') {
    return labels.you;
  }
  if (message.kind === 'tool-log') {
    return labels.toolRuntime;
  }
  if (message.kind === 'approval') {
    return labels.approval;
  }
  return labels.aiWorkbench;
}

export function getMessageContextItems(message: AIWorkbenchMessage): AIAttachedContextItem[] {
  if (message.kind === 'separator') {
    return [];
  }
  if ('attachedContexts' in message) {
    return message.attachedContexts;
  }
  if ('appliedContexts' in message) {
    return message.appliedContexts;
  }
  return [];
}

export function isFailedAssistantMessage(message: AIWorkbenchMessage): message is AIWorkbenchAssistantTextMessage {
  return message.kind === 'assistant-text' && Boolean(message.failureDiagnostic);
}

export function getVisibleSupplementalMessages(entry: AIWorkbenchRenderEntry): AIWorkbenchMessage[] {
  return entry.supplementalMessages.filter((message) => (
    message.kind !== 'approval' || message.request.status !== 'pending'
  ));
}

export function getEntryToolLogs(entry: AIWorkbenchRenderEntry): AIWorkbenchToolLogMessage[] {
  return getVisibleSupplementalMessages(entry).filter((message): message is AIWorkbenchToolLogMessage => message.kind === 'tool-log');
}

export function getEntryApprovalHistory(entry: AIWorkbenchRenderEntry): AIWorkbenchApprovalMessage[] {
  return getVisibleSupplementalMessages(entry).filter((message): message is AIWorkbenchApprovalMessage => message.kind === 'approval');
}

export function getEntryReasoningContent(entry: AIWorkbenchRenderEntry): string | null {
  const message = entry.primaryMessage;
  if (message.kind !== 'assistant-text' && message.kind !== 'assistant-result') {
    return null;
  }
  return message.reasoningContent || null;
}

export function getEntryDiagnostics(entry: AIWorkbenchRenderEntry): string[] {
  const message = entry.primaryMessage;
  if (message.kind !== 'assistant-text' && message.kind !== 'assistant-result') {
    return [];
  }
  return message.diagnostics || [];
}

export function entryHasProjectionDetails(entry: AIWorkbenchRenderEntry): boolean {
  return getVisibleSupplementalMessages(entry).length > 0
    || Boolean(getEntryReasoningContent(entry))
    || getEntryDiagnostics(entry).length > 0;
}

export function getEntryDetailsLabel(
  entry: AIWorkbenchRenderEntry,
  labels: AIWorkbenchPaneProjectionLabels,
): string {
  const toolLogs = getEntryToolLogs(entry);
  if (toolLogs.length > 0) {
    const rounds = Math.max(...toolLogs.map((detail) => detail.roundIndex || 0), 0);
    const duration = toolLogs.reduce((total, detail) => total + (detail.durationMs || 0), 0);
    const summary = [`${labels.toolCallsLabel}（${toolLogs.length} ${labels.toolCalls}${rounds > 0 ? ` · ${rounds} ${labels.rounds}` : ''}）`];
    if (duration > 0) {
      summary.push(`${(duration / 1000).toFixed(duration >= 10000 ? 0 : 1)}s`);
    }
    return summary.join(' · ');
  }
  if (entry.stepCount > 0 || getEntryApprovalHistory(entry).length > 0) {
    return `${entry.stepCount} ${labels.steps}`;
  }
  return labels.viewDetails;
}

export function getToolLogMeta(detail: AIWorkbenchToolLogMessage, labels: AIWorkbenchPaneProjectionLabels): string {
  const parts = [detail.status];
  if (detail.roundIndex) {
    parts.push(`${labels.round} ${detail.roundIndex}`);
  }
  if (detail.durationMs) {
    parts.push(`${detail.durationMs}ms`);
  }
  if (detail.llmUsage?.totalTokens) {
    parts.push(`${detail.llmUsage.totalTokens} tokens`);
  }
  return parts.join(' · ');
}

export function getApprovalArgsText(request: AIChatApprovalRequest): string {
  return request.argsText || JSON.stringify(request.args, null, 2);
}

export function getMessageFooterMeta(
  message: AIWorkbenchMessage,
  meta: AIWorkbenchMessageMetaProjection | null,
  labels: AIWorkbenchPaneProjectionLabels,
): string {
  const parts: string[] = [];
  if ((meta?.versionCount || 0) > 1) {
    parts.push(`${meta?.versionCount} ${labels.versions}`);
  }
  if ((meta?.branchCount || 0) > 0) {
    parts.push(`${meta?.branchCount} ${labels.branches}`);
  }
  if (message.kind === 'assistant-text' && message.content) {
    parts.push(`${message.content.length} ${labels.characters}`);
  }
  return parts.join(' · ');
}

export function getSelfTestCreationFailureItems(result: AIWorkbenchSelfTestCardCreationResult | null): AIWorkbenchSelfTestCardCreationResult['itemResults'] {
  return result?.itemResults.filter((item) => item.status === 'failed') || [];
}

export function getCdfCreationOutcomeSummary(
  result: AIWorkbenchCdfCreationResult,
  labels: Pick<AIWorkbenchPaneProjectionLabels, 'itemsUnit'> & {
    createdItems: string;
    failedItems: string;
    skippedItems: string;
  },
): string {
  const parts: string[] = [];
  if (result.createdCount > 0) {
    parts.push(`${result.createdCount} ${labels.createdItems}`);
  }
  if (result.failedCount > 0) {
    parts.push(`${result.failedCount} ${labels.failedItems}`);
  }
  if (result.skippedCount > 0) {
    parts.push(`${result.skippedCount} ${labels.skippedItems}`);
  }
  return parts.join(' · ');
}
