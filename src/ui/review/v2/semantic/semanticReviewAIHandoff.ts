import type {
  BackendSemanticEdgeExplanation,
  BackendSemanticLaterEntry,
  BackendSemanticNode,
  BackendSemanticSessionSnapshot,
} from '../../../../../packages/contracts/src/backend-rpc';
import type { AIAttachedContextItem } from '@/types/ai';

export interface SemanticPathAnalysisPayload {
  session: BackendSemanticSessionSnapshot;
  currentNode: BackendSemanticNode | null;
  activePathNodes: BackendSemanticNode[];
  edgeExplanations: BackendSemanticEdgeExplanation[];
  later: BackendSemanticLaterEntry[];
}

function nodeTitle(node: BackendSemanticNode | null | undefined): string {
  return String(node?.presentation?.displayTitle || node?.title || node?.nodeId || '').trim();
}

function nodeSummary(node: BackendSemanticNode | null | undefined): string {
  return String(node?.presentation?.summary || node?.preview || '').trim();
}

function nodeBlockId(node: BackendSemanticNode | null | undefined): string {
  return String(node?.presentation?.sourceBlockId || node?.location?.blockId || '').trim();
}

export function buildSemanticPathAnalysisText(payload: SemanticPathAnalysisPayload): string {
  const pathLines = payload.activePathNodes.map((node, index) => {
    const title = nodeTitle(node) || `Node ${index + 1}`;
    const summary = nodeSummary(node);
    return `${index + 1}. ${title}${summary ? ` - ${summary}` : ''}`;
  });
  const edgeLines = payload.edgeExplanations.map((edge, index) => (
    `${index + 1}. ${edge.fromNodeId} -> ${edge.toNodeId} [${edge.lens}]: ${edge.primaryExplanation || edge.reasonTags.join(', ')}`
  ));
  const laterLines = payload.later.map((entry, index) => `${index + 1}. ${entry.nodeId}`);
  return [
    `Semantic session: ${payload.session.sessionId}`,
    `Current node: ${nodeTitle(payload.currentNode) || payload.session.currentNodeId}`,
    '',
    'Active path:',
    ...(pathLines.length > 0 ? pathLines : ['(empty)']),
    '',
    'Edge explanations:',
    ...(edgeLines.length > 0 ? edgeLines : ['(empty)']),
    '',
    'Later:',
    ...(laterLines.length > 0 ? laterLines : ['(empty)']),
  ].join('\n');
}

export function buildSemanticPathAnalysisPrompt(payload: SemanticPathAnalysisPayload): string {
  return [
    'Analyze this Semantic Exploration path.',
    'Return concise suggestions for missing concepts, weak relations, or useful real notes/cards to bind.',
    'Do not invent path nodes. Treat any new idea as a suggestion that must be bound or materialized before it can enter the path.',
    '',
    buildSemanticPathAnalysisText(payload),
  ].join('\n');
}

export function buildSemanticPathAnalysisContext(payload: SemanticPathAnalysisPayload): AIAttachedContextItem {
  const content = buildSemanticPathAnalysisText(payload);
  const currentBlockId = nodeBlockId(payload.currentNode);
  const pathBlockIds = payload.activePathNodes.map(nodeBlockId).filter(Boolean);
  return {
    id: `semantic-path:${payload.session.sessionId}:${payload.session.currentNodeId}`,
    providerKey: 'manual-text',
    title: `Semantic path ${nodeTitle(payload.currentNode) || payload.session.currentNodeId}`,
    summary: `Active path nodes: ${payload.activePathNodes.length}; later: ${payload.later.length}`,
    preview: content.slice(0, 500),
    content,
    blockIds: Array.from(new Set([currentBlockId, ...pathBlockIds].filter(Boolean))),
    createdAt: Date.now(),
  };
}

export function buildSemanticSuggestionSummary(payload: SemanticPathAnalysisPayload): string {
  const current = nodeTitle(payload.currentNode) || payload.session.currentNodeId;
  return `AI path analysis suggestion for ${current}`;
}
