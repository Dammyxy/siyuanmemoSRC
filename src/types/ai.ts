import type { FSRSCard } from '@/types/card';
import type {
  NeuralRoamBatchSnapshot,
  ReviewQueueProgressSnapshot,
} from '@/types/unified-data-source';

export const AI_CONCEPT_COACH_SKILL_ID = 'concept-coach' as const;
export const AI_GENERAL_CHAT_SKILL_ID = 'general-chat' as const;
export const AI_GENERAL_CHAT_TAB_ID = 'chat' as const;

export const AI_CHAT_SKILL_IDS = [
  AI_GENERAL_CHAT_SKILL_ID,
  AI_CONCEPT_COACH_SKILL_ID,
] as const;

export const AI_CONCEPT_COACH_TAB_IDS = [
  'working-definition',
  'perspectives',
  'integrated-understanding',
  'self-test-cards',
  'real-world-triggers',
] as const;

export type AIBuiltinSkillId = typeof AI_CHAT_SKILL_IDS[number];
export type AIUserSkillId = `user:${string}`;
export type AISkillId = AIBuiltinSkillId | AIUserSkillId;
export type AIConceptCoachTabId = typeof AI_CONCEPT_COACH_TAB_IDS[number];
export type AIGeneralChatTabId = typeof AI_GENERAL_CHAT_TAB_ID;
export type AIUserSkillTabId = `user:${string}`;
export type AISkillTabId = AIConceptCoachTabId | AIGeneralChatTabId | AIUserSkillTabId;
export type AIWorkbenchLegacyView = 'explain' | 'make-cards' | 'tutor';
export type AIWorkbenchOpenView = AISkillId | AIWorkbenchLegacyView;
export type AIWorkbenchSource = 'review' | 'browser' | 'template-dialog' | 'standalone';
export type AIWorkbenchSurface = 'standalone-dialog' | 'review-dialog-sidecar' | 'review-tab-companion';
export type AIFollowUpRole = 'user' | 'assistant';
export type AIWorkbenchUserMessagePurpose = 'initial-run' | 'initial-explain' | 'follow-up';
export type AIWorkbenchMessageKind = 'user' | 'assistant-text' | 'assistant-result' | 'tool-log' | 'approval';
export type AIWorkbenchRunMode = 'full-run' | 'tab-rerun' | 'follow-up' | 'chat' | 'tool-chain';
export type AIContextProviderKey = 'manual-text' | 'selected-content' | 'block-refs' | 'current-document';
export type AIConceptCoachCardKind = '辨析' | '因果' | '应用' | '反例' | '触发' | '定义' | '边界' | '其他';
export type AIConceptCoachNormalizationStatus = 'full' | 'partial' | 'empty';
export type AIChatMessageRenderer = 'text' | 'concept-coach-result' | 'tool-timeline' | 'approval-card';
export type AIChatToolGroupKey =
  | 'context-read'
  | 'siyuan-read'
  | 'review-read'
  | 'flashcard-write'
  | 'web'
  | 'vars';
export type AIChatToolExecutionPolicy = 'auto' | 'ask-once' | 'ask-always';
export type AIChatToolResultApprovalPolicy = 'never' | 'on-error' | 'always';
export type AIChatToolExecutionStatus = 'success' | 'error' | 'approval-required' | 'execution-rejected' | 'result-rejected';
export type AIChatApprovalStatus = 'pending' | 'approved' | 'rejected';
export type AIGenericStructuredRendererKind = 'markdown' | 'list' | 'cards' | 'keyValue';
export type AIChatStructuredRendererKind = 'concept-coach' | AIGenericStructuredRendererKind;

export interface AIWorkbenchRunStatus {
  mode: AIWorkbenchRunMode;
  skillId: AISkillId;
  tabIds: AISkillTabId[];
  activeTabId: AISkillTabId;
  title: string;
  description: string;
  startedAt: number;
}

export interface AIWorkbenchFailureDiagnostic {
  content: string;
}

export interface AIConceptCoachNormalizationDiagnostic {
  status: AIConceptCoachNormalizationStatus;
  missingSections: string[];
  rawShape: string;
}

// Backward-compatible type name for older call sites while the runtime moves to skills.
export type AITaskType = AISkillId;

export interface AIChatSkillSurfaceHints {
  compactTitle?: string;
  hideTabs?: boolean;
  composerRows?: number;
}

export interface AIChatSkillDescriptor {
  id: AISkillId;
  title: string;
  brief: string;
  mode: 'chat' | 'structured';
  systemPromptTemplate: string;
  defaultToolGroups: AIChatToolGroupKey[];
  composerPreset: string;
  primaryActionLabel: string;
  supportsStructuredResult: boolean;
  surfaceHints?: AIChatSkillSurfaceHints;
}

export interface AIChatToolFunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIChatToolDefinition {
  type: 'function';
  function: AIChatToolFunctionDefinition;
}

export interface AIChatToolDescriptor {
  name: string;
  title: string;
  group: AIChatToolGroupKey;
  description: string;
  definition: AIChatToolDefinition;
  executionPolicy: AIChatToolExecutionPolicy;
  resultApprovalPolicy: AIChatToolResultApprovalPolicy;
  sessionScope: 'session' | 'context' | 'global';
  enabledByDefault: boolean;
}

export interface AIChatToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIChatToolExecutionResult {
  status: AIChatToolExecutionStatus;
  toolCallId: string;
  toolName: string;
  group: AIChatToolGroupKey;
  args: Record<string, unknown>;
  data?: unknown;
  finalText: string;
  error?: string;
  varRef?: string;
  createdAt: number;
}

export interface AIChatApprovalRequest {
  id: string;
  toolCallId: string;
  toolName: string;
  group: AIChatToolGroupKey;
  title: string;
  description: string;
  args: Record<string, unknown>;
  status: AIChatApprovalStatus;
  createdAt: number;
  resolvedAt?: number;
  rejectReason?: string;
}

export interface AIChatNormalizationDiagnostic {
  status: AIConceptCoachNormalizationStatus;
  missingSections: string[];
  rawShape: string;
  renderer: AIChatStructuredRendererKind;
}

export interface AIUserSkillSurfaceHints {
  compactTitle?: string;
  hideTabs?: boolean;
  composerRows?: number;
}

export interface AIUserSkillSectionDefinition {
  id: string;
  title: string;
  emptyHint: string;
  runPrompt: string;
  followUpPrompt: string;
  responseKey: string;
  renderer: AIGenericStructuredRendererKind;
  required: boolean;
}

export interface AIUserSkillDefinition {
  id: string;
  title: string;
  brief: string;
  enabled: boolean;
  mode: 'chat' | 'structured';
  systemPromptTemplate: string;
  composerPreset: string;
  primaryActionLabel: string;
  defaultToolGroups: AIChatToolGroupKey[];
  sections: AIUserSkillSectionDefinition[];
  surfaceHints?: AIUserSkillSurfaceHints;
  version: number;
}

export interface AIUserSkillStructuredCard {
  id: string;
  question: string;
  answer: string;
  kind?: string;
  selected?: boolean;
}

export interface AIUserSkillStructuredKeyValue {
  key: string;
  value: string;
}

export interface AIUserSkillStructuredSectionResult {
  id: AISkillTabId;
  responseKey: string;
  title: string;
  renderer: AIGenericStructuredRendererKind;
  value: unknown;
  text: string;
  items: string[];
  cards: AIUserSkillStructuredCard[];
  keyValues: AIUserSkillStructuredKeyValue[];
}

export interface AIUserSkillStructuredResult {
  skillId: AISkillId;
  sections: AIUserSkillStructuredSectionResult[];
  rawContent: string;
}

export interface AIChatVarEntry {
  id: string;
  name: string;
  description: string;
  value: unknown;
  preview: string;
  createdAt: number;
  updatedAt: number;
}

export interface AIChatRuntimeDiagnostic {
  type: 'provider' | 'tool' | 'normalization' | 'transport' | 'approval';
  message: string;
  detail?: string;
  createdAt: number;
}

export interface AIAttachedContextItem {
  id: string;
  providerKey: AIContextProviderKey;
  title: string;
  summary: string;
  preview: string;
  content: string;
  blockIds: string[];
  createdAt: number;
}

export interface AIComposerContextState {
  items: AIAttachedContextItem[];
}

export interface AIBlockContext {
  blockId: string;
  text: string;
  markdown?: string;
  type?: string;
  parentId?: string | null;
  rootId?: string | null;
  hPath?: string | null;
}

export interface AIReviewCardContext {
  cardId: string;
  blockId: string;
  cardType: string;
  revealed: boolean;
  hasAnswerFace: boolean;
  explainRequiresReveal: boolean;
  reviewActionLabel: string;
  roleDescription: string;
  sourceBlockIds: string[];
  frontText: string;
  backText: string;
  sourceText: string;
}

export interface AIWorkbenchContextSnapshot {
  source: AIWorkbenchSource;
  selectedBlockIds: string[];
  blocks: AIBlockContext[];
  queueType?: string | null;
  queueProgress?: ReviewQueueProgressSnapshot | null;
  currentCard: AIReviewCardContext | null;
  currentCardRaw?: FSRSCard | null;
  neuralBatch: NeuralRoamBatchSnapshot | null;
}

export interface ReviewAIContextSnapshot extends AIWorkbenchContextSnapshot {
  source: 'review';
  reviewSessionId: string;
}

export interface AIConceptCoachPerspectiveSection {
  title: string;
  keyPoints: string[];
  easyMisjudgments?: string[];
  examples?: string[];
  comparisons?: Array<{
    concept: string;
    similarity: string;
    difference: string;
    clue?: string;
  }>;
  subConcepts?: string[];
  parentConcepts?: string[];
  metaphor?: string;
  reasons?: string[];
  applicableScenarios?: string[];
  nonApplicableScenarios?: string[];
  commonMisuse?: string;
  importance?: string;
  behaviorChange?: string;
  triggerScenario?: string;
}

export interface AIConceptCoachPerspectives {
  traits: AIConceptCoachPerspectiveSection;
  contrasts: AIConceptCoachPerspectiveSection;
  partsAndWhole: AIConceptCoachPerspectiveSection;
  causality: AIConceptCoachPerspectiveSection;
  significance: AIConceptCoachPerspectiveSection;
}

export interface AIConceptCoachIntegratedUnderstanding {
  essence: string;
  notWhat: string[];
  capabilities: string[];
}

export interface AIConceptCoachCandidateCard {
  id: string;
  question: string;
  answer: string;
  kind: AIConceptCoachCardKind;
  selected: boolean;
}

export interface AIConceptCoachSelfTestCards {
  cards: AIConceptCoachCandidateCard[];
}

export interface AIConceptCoachRealWorldTriggers {
  triggers: string[];
}

export interface AIConceptCoachResult {
  workingDefinition: string;
  perspectives: AIConceptCoachPerspectives;
  integratedUnderstanding: AIConceptCoachIntegratedUnderstanding;
  selfTestCards: AIConceptCoachSelfTestCards;
  realWorldTriggers: AIConceptCoachRealWorldTriggers;
  rawContent: string;
}

export type AIConceptCoachTabResult =
  | string
  | AIConceptCoachPerspectives
  | AIConceptCoachIntegratedUnderstanding
  | AIConceptCoachSelfTestCards
  | AIConceptCoachRealWorldTriggers;

// Legacy explain shape is kept only for old persisted records and narrow compatibility helpers.
export interface AIExplainResult {
  workingDefinition: string;
  whatItTests: string;
  whyItsTricky: string;
  connections: string[];
  triggers: string[];
  cardIdeas: string[];
  rawContent: string;
}

export interface AIFollowUpEntry {
  id: string;
  skillId: AISkillId;
  tabId: AISkillTabId;
  role: AIFollowUpRole;
  content: string;
  createdAt: number;
}

export interface AIWorkbenchUserMessage {
  id: string;
  skillId: AISkillId;
  tabId: AISkillTabId;
  view?: AIWorkbenchOpenView;
  kind: 'user';
  purpose?: AIWorkbenchUserMessagePurpose;
  content: string;
  createdAt: number;
  editedFromMessageId: string | null;
  attachedContexts: AIAttachedContextItem[];
}

export interface AIWorkbenchAssistantTextMessage {
  id: string;
  skillId: AISkillId;
  tabId: AISkillTabId;
  view?: AIWorkbenchOpenView;
  kind: 'assistant-text';
  content: string;
  createdAt: number;
  sourceContent: string | null;
  appliedContexts: AIAttachedContextItem[];
}

export interface AIWorkbenchAssistantResultMessage {
  id: string;
  skillId: AISkillId;
  tabId: AISkillTabId;
  view?: AIWorkbenchOpenView;
  kind: 'assistant-result';
  createdAt: number;
  rawContent: string;
  conceptCoachResult: AIConceptCoachResult | null;
  tabResult: AIConceptCoachTabResult | null;
  genericStructuredResult?: AIUserSkillStructuredResult | null;
  genericSectionResult?: AIUserSkillStructuredSectionResult | null;
  normalizationDiagnostic?: AIConceptCoachNormalizationDiagnostic | AIChatNormalizationDiagnostic | null;
  explainResult?: AIExplainResult | null;
  appliedContexts: AIAttachedContextItem[];
}

export interface AIWorkbenchToolLogMessage {
  id: string;
  skillId: AISkillId;
  tabId: AISkillTabId;
  view?: AIWorkbenchOpenView;
  kind: 'tool-log';
  createdAt: number;
  toolCallId: string;
  toolName: string;
  group: AIChatToolGroupKey;
  status: AIChatToolExecutionStatus;
  content: string;
  error: string | null;
  varRef?: string | null;
}

export interface AIWorkbenchApprovalMessage {
  id: string;
  skillId: AISkillId;
  tabId: AISkillTabId;
  view?: AIWorkbenchOpenView;
  kind: 'approval';
  createdAt: number;
  request: AIChatApprovalRequest;
}

export type AIWorkbenchMessage =
  | AIWorkbenchUserMessage
  | AIWorkbenchAssistantTextMessage
  | AIWorkbenchAssistantResultMessage
  | AIWorkbenchToolLogMessage
  | AIWorkbenchApprovalMessage;

export interface AIWorkbenchThreadRecord {
  skillId: AISkillId;
  tabId: AISkillTabId;
  messages: AIWorkbenchMessage[];
  resultContextSignature: string | null;
  stale: boolean;
  staleReason: string | null;
}

export type AIWorkbenchSkillThreads = Record<string, AIWorkbenchThreadRecord>;
export type AIWorkbenchThreads = Record<string, AIWorkbenchSkillThreads>;

export interface AIWorkbenchSessionSummary {
  id: string;
  title: string;
  source: AIWorkbenchSource;
  sourceReviewSessionId: string | null;
  surface: AIWorkbenchSurface;
  contextSignature: string | null;
  createdAt: number;
  updatedAt: number;
  activeSkillId: AISkillId;
  activeTabId: AISkillTabId;
  activeSkills: AISkillId[];
  messageCount: number;
  lastActiveView?: AIWorkbenchOpenView;
  activeViews?: AIWorkbenchOpenView[];
}

export interface AIWorkbenchSessionRecord extends AIWorkbenchSessionSummary {
  schemaVersion?: number;
  context: AIWorkbenchContextSnapshot | null;
  messages?: AIWorkbenchMessage[];
  threads: AIWorkbenchThreads;
  skillResults: Record<string, AIConceptCoachResult | null>;
  genericSkillResults?: Record<string, AIUserSkillStructuredResult | null>;
  vars?: AIChatVarEntry[];
  diagnostics?: AIChatRuntimeDiagnostic[];
  legacyExplainMessages?: AIWorkbenchMessage[];
}

export interface AIViewSessionState {
  resultContextSignature: string | null;
  stale: boolean;
  staleReason: string | null;
  followUps: AIFollowUpEntry[];
}

export type AIWorkbenchSkillViewState = Record<string, AIViewSessionState>;
export type AIWorkbenchViewState = Record<string, AIWorkbenchSkillViewState>;

export interface ReviewAISessionState {
  sessionId: string | null;
  surface: AIWorkbenchSurface;
  sourceReviewSessionId: string | null;
  contextSignature: string | null;
  messages: AIWorkbenchMessage[];
  viewState: AIWorkbenchViewState;
}

export interface AIWorkbenchOpenOptions {
  view?: AIWorkbenchOpenView;
  skillId?: AISkillId;
  tabId?: AISkillTabId;
  source?: AIWorkbenchSource;
  surface?: AIWorkbenchSurface;
  autoRun?: boolean;
  sessionId?: string;
  sourceReviewSessionId?: string | null;
  selectedBlockIds?: string[];
  queueType?: string | null;
  queueProgress?: ReviewQueueProgressSnapshot | null;
  currentCard?: FSRSCard | null;
  currentBlockId?: string | null;
  revealed?: boolean;
  neuralBatch?: NeuralRoamBatchSnapshot | null;
}

export interface AIWorkbenchState extends ReviewAISessionState {
  activeSkillId: AISkillId;
  activeTabId: AISkillTabId;
  activeView?: AIWorkbenchOpenView;
  context: AIWorkbenchContextSnapshot | null;
  liveContext: AIWorkbenchContextSnapshot | null;
  contextIsHistorical: boolean;
  isLoading: boolean;
  runStatus: AIWorkbenchRunStatus | null;
  error: string | null;
  failureDiagnostic: AIWorkbenchFailureDiagnostic | null;
  skillResults: Record<string, AIConceptCoachResult | null>;
  genericSkillResults: Record<string, AIUserSkillStructuredResult | null>;
  explainResult: AIExplainResult | null;
  sessionTitle: string;
  sessionHistory: AIWorkbenchSessionSummary[];
  threads: AIWorkbenchThreads;
  pendingApprovals: AIChatApprovalRequest[];
  toolTimeline: AIChatToolExecutionResult[];
  vars: AIChatVarEntry[];
  diagnostics: AIChatRuntimeDiagnostic[];
  historyPanelOpen: boolean;
  contextPanelOpen: boolean;
  composerContexts: AIComposerContextState;
  composerEditorOpen: boolean;
  editingMessageId: string | null;
  editingMessageKind: AIWorkbenchMessageKind | null;
  legacyNotice: string | null;
}
