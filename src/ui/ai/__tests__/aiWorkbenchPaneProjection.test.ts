import { describe, expect, it } from 'vitest';
import {
  buildAssistantResultNotice,
  buildAssistantSections,
  canCreateCdfConceptDocument,
  countSelectedCdfAnchors,
  countSelectedCdfDefinitions,
  countSelectedCdfDescriptors,
  countSelectedCdfDescriptorItemsInGroup,
  countSelectedSelfTestCandidates,
  countValidSelectedSelfTestCandidates,
  entryHasProjectionDetails,
  formatSelectedCardsLabel,
  getCdfAnchorCreationHint,
  getCdfAnchors,
  getCdfDescriptorGroupMode,
  getCdfResolutionLabel,
  getEntryDetailsLabel,
  getMessageContextItems,
  getMessageFooterMeta,
  getSelfTestCandidateCards,
  getToolLogMeta,
  getVisibleSupplementalMessages,
  isCdfResolutionStaleForTarget,
  resolveCdfCardCreationDisabledReason,
  resolveLegacyExplainResult,
  resolveSelfTestCardCreationDisabledReason,
  type AIWorkbenchPaneProjectionLabels,
} from '../aiWorkbenchPaneProjection';
import type {
  AIAttachedContextItem,
  AICdfStructure,
  AIConceptCoachCandidateCard,
  AIConceptCoachCardKind,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchMessage,
  AIWorkbenchRenderEntry,
  AIWorkbenchSelfTestCardTargetMemory,
} from '@/types/ai';

const labels: AIWorkbenchPaneProjectionLabels = {
  aiBusyWait: 'Busy',
  aiStructuredEmptyResult: 'Empty result.',
  aiStructuredPartialResult: 'Partial result.',
  aiWorkbench: 'AI',
  anchorNotSelectedHint: 'Anchor not selected.',
  approval: 'Approval',
  branches: 'branches',
  capabilities: 'Capabilities',
  cardIdeas: 'Card ideas',
  candidateDraft: 'Candidate draft',
  causality: 'Causality',
  characters: 'chars',
  conceptPendingResolve: 'Pending resolve',
  conceptResolutionStale: 'Stale resolution',
  conceptResolutionStaleHint: 'Resolution belongs to old target.',
  conceptUnresolved: 'Unresolved',
  connections: 'Connections',
  contrasts: 'Contrasts',
  createSelectedCards: 'Create selected',
  creatingCards: 'Creating...',
  essence: 'Essence',
  itemsUnit: 'items',
  missingSections: 'Missing',
  noResolvedConcepts: 'No resolved concepts.',
  notWhat: 'Not what',
  partsAndWhole: 'Parts and whole',
  rawShape: 'Raw shape',
  realWorldTriggers: 'Real-world triggers',
  resolvedFromContext: 'Resolved from context',
  resolvedFromNotebook: 'Resolved from notebook',
  resolvedManually: 'Resolved manually',
  round: 'Round',
  rounds: 'rounds',
  selectCandidateFirst: 'Select candidate first.',
  selectCdfFieldsFirst: 'Select CDF fields first.',
  selectConceptFirst: 'Select concept first.',
  setSelfTestTargetFirst: 'Set self-test target first.',
  setTargetFirst: 'Set target first',
  significance: 'Significance',
  steps: 'steps',
  toolCalls: 'calls',
  toolCallsLabel: 'Tool calls',
  toolRuntime: 'Tool runtime',
  traits: 'Traits',
  triggers: 'Triggers',
  versions: 'versions',
  viewDetails: 'View details',
  whatItTests: 'What it tests',
  whyItsTricky: 'Why tricky',
  workingDefinition: 'Working definition',
  you: 'You',
};

function assistantResultMessage(
  overrides: Partial<AIWorkbenchAssistantResultMessage> = {},
): AIWorkbenchAssistantResultMessage {
  return {
    id: 'msg-1',
    skillId: 'concept-coach',
    tabId: 'self-test-cards',
    kind: 'assistant-result',
    createdAt: 1,
    rawContent: '{}',
    conceptCoachResult: null,
    tabResult: null,
    appliedContexts: [],
    ...overrides,
  };
}

function targetMemory(overrides: Partial<AIWorkbenchSelfTestCardTargetMemory> = {}): AIWorkbenchSelfTestCardTargetMemory {
  return {
    mode: 'daily-note',
    notebookId: 'nb-current',
    notebookName: 'Notebook',
    targetBlockId: null,
    targetLabel: 'Notebook / today',
    updatedAt: 1,
    ...overrides,
  };
}

function candidate(overrides: Partial<AIConceptCoachCandidateCard> = {}): AIConceptCoachCandidateCard {
  return {
    id: 'card-1',
    kind: 'definition' as unknown as AIConceptCoachCardKind,
    selected: true,
    summary: 'gravity',
    prompt: 'What is gravity?',
    answer: 'attraction',
    details: [],
    clozeTargets: [],
    ...overrides,
  };
}

describe('aiWorkbenchPaneProjection', () => {
  it('projects assistant notices and legacy structured sections', () => {
    const message = assistantResultMessage({
      tabId: 'working-definition',
      rawContent: JSON.stringify({
        workDefinition: ' local rule ',
        knowledgeNetwork: ['queue'],
        recallTrigger: 'during review',
        cardIdeas: 'ask boundary',
      }),
    });

    expect(resolveLegacyExplainResult(message)?.workingDefinition).toBe('local rule');
    expect(buildAssistantSections(message, labels).map((section) => section.key)).toEqual([
      'workingDefinition',
      'connections',
      'triggers',
      'cardIdeas',
    ]);

    const notice = buildAssistantResultNotice(assistantResultMessage({
      tabId: 'integrated-understanding',
      normalizationDiagnostic: {
        status: 'partial',
        missingSections: ['essence'],
        rawShape: 'object',
      },
    }), labels);

    expect(notice?.status).toBe('partial');
    expect(notice?.text).toContain('Missing');
    expect(notice?.text).toContain('Essence');
  });

  it('projects self-test candidates and creation disabled reasons', () => {
    const message = assistantResultMessage({
      tabId: 'self-test-cards',
      tabResult: {
        creationMode: 'list-item',
        cards: [
          candidate({ id: 'card-1', selected: true }),
          candidate({ id: 'card-2', selected: false, prompt: 'Hidden?', answer: 'No' }),
        ],
      },
    });

    expect(getSelfTestCandidateCards(message)).toHaveLength(2);
    expect(countSelectedSelfTestCandidates(message)).toBe(1);
    expect(countValidSelectedSelfTestCandidates(message, 'list-item')).toBe(1);
    expect(formatSelectedCardsLabel(1, false, labels)).toBe('Create selected · 1 items');
    expect(formatSelectedCardsLabel(1, true, labels)).toBe('Creating...');

    expect(resolveSelfTestCardCreationDisabledReason({
      message,
      mode: 'list-item',
      isLoading: false,
      creationBusy: false,
      modeDraftBusy: false,
      target: null,
      labels,
    })).toBe('Set self-test target first.');

    expect(resolveSelfTestCardCreationDisabledReason({
      message,
      mode: 'list-item',
      isLoading: false,
      creationBusy: true,
      modeDraftBusy: false,
      target: targetMemory(),
      labels,
    })).toBe('Busy');
  });

  it('projects CDF preview resolution, counts, and creation eligibility', () => {
    const base: AICdfStructure = {
      anchors: [{
        id: 'anchor-1',
        conceptName: 'Gravity',
        selected: true,
        definitionCandidates: [{ id: 'def-1', text: 'Attraction between masses', selected: true }],
        descriptorGroups: [{
          id: 'group-1',
          title: 'Physics',
          selected: true,
          items: [
            { id: 'item-1', text: 'cause->orbit', selected: true },
            { id: 'item-2', text: 'field->curvature', selected: true },
          ],
        }],
      }],
    };
    const stalePreview: AICdfStructure = {
      anchors: [{
        ...base.anchors[0],
        resolution: {
          status: 'resolved-notebook',
          conceptBlockId: 'doc-1',
          conceptTitle: 'Gravity',
          reason: 'title match',
          notebookId: 'nb-old',
        },
      }],
    };
    const message = assistantResultMessage({ tabId: 'cdf-structure', tabResult: base });
    const anchors = getCdfAnchors(message, stalePreview);
    const anchor = anchors[0];

    expect(countSelectedCdfAnchors(anchors)).toBe(1);
    expect(countSelectedCdfDefinitions(anchors)).toBe(1);
    expect(countSelectedCdfDescriptors(anchors)).toBe(2);
    expect(countSelectedCdfDescriptorItemsInGroup(anchor.descriptorGroups[0])).toBe(2);
    expect(getCdfDescriptorGroupMode(anchor.descriptorGroups[0])).toBe(';;;');
    expect(isCdfResolutionStaleForTarget(anchor.resolution, targetMemory())).toBe(true);
    expect(getCdfResolutionLabel(anchor, targetMemory(), labels)).toBe('Stale resolution');
    expect(canCreateCdfConceptDocument(anchor, targetMemory())).toBe(true);
    expect(getCdfAnchorCreationHint(anchor, targetMemory(), labels)).toBeNull();
    expect(resolveCdfCardCreationDisabledReason({
      anchors,
      target: targetMemory(),
      isLoading: false,
      creationBusy: false,
      previewBusy: false,
      labels,
    })).toBe('No resolved concepts.');

    const currentPreview: AICdfStructure = {
      anchors: [{
        ...base.anchors[0],
        resolution: {
          status: 'resolved-manual',
          conceptBlockId: 'doc-2',
          conceptTitle: 'Gravity',
          reason: 'manual',
          notebookId: 'nb-current',
        },
      }],
    };

    expect(resolveCdfCardCreationDisabledReason({
      anchors: getCdfAnchors(message, currentPreview),
      target: targetMemory(),
      isLoading: false,
      creationBusy: false,
      previewBusy: false,
      labels,
    })).toBeNull();
  });

  it('projects compact message details without pending approvals', () => {
    const context: AIAttachedContextItem = {
      id: 'ctx-1',
      providerKey: 'manual-text',
      title: 'Context',
      summary: 'Summary',
      preview: 'Preview',
      content: 'Full context',
      blockIds: [],
      createdAt: 1,
    };
    const userMessage: AIWorkbenchMessage = {
      id: 'user-1',
      skillId: 'general-chat',
      tabId: 'chat',
      kind: 'user',
      purpose: 'follow-up',
      content: 'hello',
      createdAt: 1,
      editedFromMessageId: null,
      attachedContexts: [context],
    };
    const entry: AIWorkbenchRenderEntry = {
      key: 'entry-1',
      primaryMessage: {
        id: 'assistant-1',
        skillId: 'general-chat',
        tabId: 'chat',
        kind: 'assistant-text',
        content: 'reply',
        createdAt: 2,
        sourceContent: null,
        appliedContexts: [],
        reasoningContent: 'thinking',
        diagnostics: ['diag'],
      },
      supplementalMessages: [
        {
          id: 'tool-1',
          skillId: 'general-chat',
          tabId: 'chat',
          kind: 'tool-log',
          createdAt: 3,
          toolCallId: 'call-1',
          toolName: 'ReadBlock',
          group: 'siyuan-read',
          status: 'success',
          content: 'ok',
          error: null,
          durationMs: 2500,
          roundIndex: 2,
          llmUsage: { totalTokens: 8 },
        },
        {
          id: 'approval-pending',
          skillId: 'general-chat',
          tabId: 'chat',
          kind: 'approval',
          createdAt: 4,
          request: {
            id: 'approval-1',
            type: 'execution',
            toolCallId: 'call-2',
            toolName: 'WriteBlock',
            group: 'siyuan-write',
            title: 'Write',
            description: 'Need approval',
            args: {},
            status: 'pending',
            createdAt: 4,
          },
        },
      ],
      stepCount: 2,
      pendingApproval: null,
    };

    expect(getMessageContextItems(userMessage)).toEqual([context]);
    expect(getVisibleSupplementalMessages(entry).map((message) => message.id)).toEqual(['tool-1']);
    expect(entryHasProjectionDetails(entry)).toBe(true);
    expect(getEntryDetailsLabel(entry, labels)).toBe('Tool calls（1 calls · 2 rounds） · 2.5s');
    expect(getToolLogMeta(entry.supplementalMessages[0] as never, labels)).toBe('success · Round 2 · 2500ms · 8 tokens');
    expect(getMessageFooterMeta(entry.primaryMessage, { versionCount: 2, branchCount: 1 }, labels)).toBe('2 versions · 1 branches · 5 chars');
  });
});
