import type { FSRSCard } from '@/types/card';
import type { ConfiguredCaptureStorageMode } from './settings';
import type {
  NeuralRoamBatchSnapshot,
  ReviewQueueProgressSnapshot,
} from '@/types/unified-data-source';

export type AITaskType = 'tutor' | 'explain' | 'make-cards';
export type AIMakeCardMode = 'qa' | 'cloze' | 'concept-descriptor' | 'cdf';
export type AIWorkbenchSource = 'review' | 'browser' | 'template-dialog' | 'standalone';
export type AIWorkbenchSurface = 'standalone-dialog' | 'review-dialog-sidecar' | 'review-tab-companion';
export type AIFollowUpRole = 'user' | 'assistant';
export type AICandidateDraftState = 'unsaved' | 'saving' | 'saved' | 'dirty' | 'creating' | 'created' | 'error';
export type AICandidateDraftErrorOperation = 'save' | 'create';
export type AIWorkbenchMessageKind = 'user' | 'assistant-text' | 'assistant-result' | 'candidate-board';
export type AIContextProviderKey = 'manual-text' | 'selected-content' | 'block-refs' | 'current-document';

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

export interface AIDraftSessionLocation {
  notebook: string;
  storageMode: ConfiguredCaptureStorageMode;
  containerDocId: string;
  containerBlockId: string;
  sessionBlockId: string;
  sourceRefsBlockId: string | null;
  sourceBlockIds: string[];
  sessionId: string;
  savedAt: number;
}

export interface AICandidateDraftLocation extends AIDraftSessionLocation {
  candidateBlockId: string;
  fieldBlockIds: Record<string, string>;
}

export interface AICardCandidate {
  id: string;
  templateId: string;
  title: string;
  preview: string;
  fieldMapping: Record<string, string>;
  sourceBlockIds: string[];
  rationale: string;
  confidence: number;
  discarded?: boolean;
  draftState: AICandidateDraftState;
  draftError: string | null;
  draftErrorOperation: AICandidateDraftErrorOperation | null;
  draftLocation: AICandidateDraftLocation | null;
}

export interface AITutorResult {
  blindSpots: string[];
  patterns: string[];
  nextLines: string[];
  cardIdeas: string[];
  batchSummary: string | null;
  rawContent: string;
}

export interface AIExplainResult {
  workingDefinition: string;
  whatItTests: string;
  whyItsTricky: string;
  connections: string[];
  triggers: string[];
  cardIdeas: string[];
  rawContent: string;
}

export interface AIMakeCardsResult {
  mode: AIMakeCardMode;
  candidates: AICardCandidate[];
  draftSession: AIDraftSessionLocation | null;
  rawContent: string;
}

export interface AIFollowUpEntry {
  id: string;
  view: AITaskType;
  role: AIFollowUpRole;
  content: string;
  createdAt: number;
}

export interface AIWorkbenchUserMessage {
  id: string;
  view: AITaskType;
  kind: 'user';
  content: string;
  createdAt: number;
  editedFromMessageId: string | null;
  attachedContexts: AIAttachedContextItem[];
}

export interface AIWorkbenchAssistantTextMessage {
  id: string;
  view: AITaskType;
  kind: 'assistant-text';
  content: string;
  createdAt: number;
  sourceContent: string | null;
  appliedContexts: AIAttachedContextItem[];
}

export interface AIWorkbenchAssistantResultMessage {
  id: string;
  view: Extract<AITaskType, 'tutor' | 'explain'>;
  kind: 'assistant-result';
  createdAt: number;
  rawContent: string;
  tutorResult: AITutorResult | null;
  explainResult: AIExplainResult | null;
  appliedContexts: AIAttachedContextItem[];
}

export interface AIWorkbenchCandidateBoardMessage {
  id: string;
  view: 'make-cards';
  kind: 'candidate-board';
  createdAt: number;
  mode: AIMakeCardMode;
  result: AIMakeCardsResult;
  appliedContexts: AIAttachedContextItem[];
}

export type AIWorkbenchMessage =
  | AIWorkbenchUserMessage
  | AIWorkbenchAssistantTextMessage
  | AIWorkbenchAssistantResultMessage
  | AIWorkbenchCandidateBoardMessage;

export interface AIWorkbenchThreadRecord {
  view: AITaskType;
  messages: AIWorkbenchMessage[];
  resultContextSignature: string | null;
  stale: boolean;
  staleReason: string | null;
}

export interface AIWorkbenchSessionSummary {
  id: string;
  title: string;
  source: AIWorkbenchSource;
  sourceReviewSessionId: string | null;
  surface: AIWorkbenchSurface;
  contextSignature: string | null;
  createdAt: number;
  updatedAt: number;
  lastActiveView: AITaskType;
  activeViews: AITaskType[];
  messageCount: number;
}

export interface AIWorkbenchSessionRecord extends AIWorkbenchSessionSummary {
  context: AIWorkbenchContextSnapshot | null;
  makeCardMode: AIMakeCardMode;
  requestBatchSummary: boolean;
  threads: Record<AITaskType, AIWorkbenchThreadRecord>;
}

export interface AIViewSessionState {
  resultContextSignature: string | null;
  stale: boolean;
  staleReason: string | null;
  followUps: AIFollowUpEntry[];
}

export interface ReviewAISessionState {
  sessionId: string | null;
  surface: AIWorkbenchSurface;
  sourceReviewSessionId: string | null;
  contextSignature: string | null;
  viewState: Record<AITaskType, AIViewSessionState>;
}

export interface AIWorkbenchOpenOptions {
  view?: AITaskType;
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
  makeCardMode?: AIMakeCardMode;
}

export interface AIWorkbenchState extends ReviewAISessionState {
  activeView: AITaskType;
  context: AIWorkbenchContextSnapshot | null;
  liveContext: AIWorkbenchContextSnapshot | null;
  contextIsHistorical: boolean;
  isLoading: boolean;
  error: string | null;
  tutorResult: AITutorResult | null;
  explainResult: AIExplainResult | null;
  makeCardsResult: AIMakeCardsResult | null;
  makeCardMode: AIMakeCardMode;
  requestBatchSummary: boolean;
  sessionTitle: string;
  sessionHistory: AIWorkbenchSessionSummary[];
  threads: Record<AITaskType, AIWorkbenchThreadRecord>;
  historyPanelOpen: boolean;
  contextPanelOpen: boolean;
  composerContexts: AIComposerContextState;
  composerEditorOpen: boolean;
  editingMessageId: string | null;
  editingMessageKind: AIWorkbenchMessageKind | null;
}
