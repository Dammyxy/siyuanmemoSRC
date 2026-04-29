import {
  createEmptyConversationTree,
  createEmptyThreadRecord,
  createInitialThreads,
} from '@/application/services/AIWorkbenchSessionRuntime';
import type {
  AISkillId,
  AISkillTabId,
  AIWorkbenchApprovalMessage,
  AIWorkbenchConversationTree,
  AIWorkbenchMessage,
  AIWorkbenchNodeScope,
  AIWorkbenchRenderEntry,
  AIWorkbenchState,
  AIWorkbenchTreeNode,
} from '@/types/ai';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
} from '@/types/ai';

export type AIWorkbenchConversationTreeRuntimeDeps = {
  state: AIWorkbenchState;
  normalizeSkillForCurrentSettings: (skillId: AISkillId, fallback: AISkillId) => AISkillId;
  normalizeTabForCurrentSettings: (tabId: AISkillTabId, skillId: AISkillId) => AISkillTabId;
  isContextScopedConceptTab: (skillId: AISkillId, tabId: AISkillTabId) => boolean;
};

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTreeViewKey(skillId: AISkillId, tabId: AISkillTabId): string {
  return `${skillId}::${tabId}`;
}

function cloneMessagePayload<T extends AIWorkbenchMessage>(message: T): T {
  return JSON.parse(JSON.stringify(message)) as T;
}

function getMessageNodeKind(message: AIWorkbenchMessage): AIWorkbenchTreeNode['kind'] {
  return message.kind === 'separator' ? 'separator' : 'message';
}

function traceTreePath(tree: AIWorkbenchConversationTree | undefined, leafId: string | null | undefined): string[] {
  if (!tree || !leafId || !tree.nodes[leafId]) {
    return [];
  }
  const path: string[] = [];
  let currentId: string | null = leafId;
  while (currentId && tree.nodes[currentId]) {
    path.unshift(currentId);
    currentId = tree.nodes[currentId].parentId;
  }
  return path;
}

function getSkillTabIds(skillId: AISkillId, fallbackTabId: AISkillTabId): AISkillTabId[] {
  if (skillId === AI_GENERAL_CHAT_SKILL_ID) {
    return [AI_GENERAL_CHAT_TAB_ID];
  }
  if (skillId === AI_CONCEPT_COACH_SKILL_ID) {
    return [...AI_CONCEPT_COACH_TAB_IDS];
  }
  return [fallbackTabId];
}

export class AIWorkbenchConversationTreeRuntime {
  constructor(private readonly deps: AIWorkbenchConversationTreeRuntimeDeps) {}

  private get state(): AIWorkbenchState {
    return this.deps.state;
  }

  ensureTreeState(): AIWorkbenchConversationTree {
    this.state.tree = this.state.tree || createEmptyConversationTree();
    this.state.tree.activeLeafNodeIds = this.state.tree.activeLeafNodeIds || {};
    return this.state.tree;
  }

  getTreeNode(nodeId: string): AIWorkbenchTreeNode | null {
    const normalizedId = normalizeString(nodeId);
    if (!normalizedId) {
      return null;
    }
    return this.ensureTreeState().nodes[normalizedId] || null;
  }

  getActiveNodeVersion(node: AIWorkbenchTreeNode) {
    return node.versions.find((version) => version.id === node.activeVersionId)
      || node.versions[node.versions.length - 1]
      || null;
  }

  getNodeMessage(node: AIWorkbenchTreeNode): AIWorkbenchMessage | null {
    const version = this.getActiveNodeVersion(node);
    if (!version) {
      return null;
    }
    return cloneMessagePayload({
      ...version.message,
      id: node.id,
      skillId: node.skillId,
      tabId: node.tabId,
    });
  }

  resolveViewLeafId(skillId: AISkillId, tabId: AISkillTabId): string | null {
    const tree = this.ensureTreeState();
    const exactKey = createTreeViewKey(skillId, tabId);
    if (tree.activeLeafNodeIds?.[exactKey]) {
      return tree.activeLeafNodeIds[exactKey] || null;
    }
    const fallbackNode = Object.values(tree.nodes)
      .filter((node) => this.shouldIncludeNodeInView(node, skillId, tabId))
      .sort((left, right) => left.createdAt - right.createdAt)
      .at(-1);
    return fallbackNode?.id || tree.activeLeafNodeId || tree.rootNodeId || null;
  }

  syncTreeLeafWithActiveView(): void {
    const leafId = this.resolveViewLeafId(this.state.activeSkillId, this.state.activeTabId);
    this.ensureTreeState().activeLeafNodeId = leafId;
  }

  shouldIncludeNodeInView(node: AIWorkbenchTreeNode, skillId: AISkillId, tabId: AISkillTabId): boolean {
    if (node.skillId !== skillId) {
      return false;
    }
    if (skillId === AI_GENERAL_CHAT_SKILL_ID) {
      return true;
    }
    return node.scope === 'skill' || node.tabId === tabId;
  }

  getProjectedMessagesForView(skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchMessage[] {
    const tree = this.ensureTreeState();
    const path = traceTreePath(tree, this.resolveViewLeafId(skillId, tabId));
    const messages = path
      .map((nodeId) => tree.nodes[nodeId])
      .filter((node): node is AIWorkbenchTreeNode => Boolean(node))
      .filter((node) => this.shouldIncludeNodeInView(node, skillId, tabId))
      .map((node) => this.getNodeMessage(node))
      .filter((message): message is AIWorkbenchMessage => Boolean(message));
    if (!this.deps.isContextScopedConceptTab(skillId, tabId)) {
      return messages;
    }
    const currentSignature = normalizeString(this.state.contextSignature);
    if (!currentSignature) {
      return messages;
    }
    return messages.filter((message) => normalizeString(message.contextSignature) === currentSignature);
  }

  getModelContextMessagesForView(skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchMessage[] {
    const tree = this.ensureTreeState();
    const pathNodes = traceTreePath(tree, this.resolveViewLeafId(skillId, tabId))
      .map((nodeId) => tree.nodes[nodeId])
      .filter((node): node is AIWorkbenchTreeNode => Boolean(node))
      .filter((node) => this.shouldIncludeNodeInView(node, skillId, tabId));
    const lastSeparatorIndex = [...pathNodes]
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => node.kind === 'separator')
      .at(-1)?.index ?? -1;
    const selectedNodeIds = new Set<string>();
    const nodesForContext = [
      ...pathNodes.slice(0, lastSeparatorIndex + 1).filter((node) => node.pinned),
      ...pathNodes.slice(lastSeparatorIndex + 1),
    ]
      .filter((node) => node.kind === 'message' && !node.hidden)
      .filter((node) => {
        if (selectedNodeIds.has(node.id)) {
          return false;
        }
        selectedNodeIds.add(node.id);
        return true;
      });
    return nodesForContext
      .map((node) => this.getNodeMessage(node))
      .filter((message): message is AIWorkbenchMessage => Boolean(message));
  }

  rebuildProjectedThreads(): void {
    const previous = this.state.threads;
    const next = createInitialThreads();
    const knownEntries = new Map<string, { skillId: AISkillId; tabId: AISkillTabId }>();

    for (const [skillId, skillThreads] of Object.entries(previous)) {
      for (const tabId of Object.keys(skillThreads || {})) {
        knownEntries.set(createTreeViewKey(skillId as AISkillId, tabId as AISkillTabId), {
          skillId: skillId as AISkillId,
          tabId: tabId as AISkillTabId,
        });
      }
    }
    for (const node of Object.values(this.ensureTreeState().nodes)) {
      knownEntries.set(createTreeViewKey(node.skillId, node.tabId), {
        skillId: node.skillId,
        tabId: node.tabId,
      });
      if (node.scope === 'skill') {
        for (const tabId of getSkillTabIds(node.skillId, node.tabId)) {
          knownEntries.set(createTreeViewKey(node.skillId, tabId), {
            skillId: node.skillId,
            tabId,
          });
        }
      }
    }

    for (const { skillId, tabId } of knownEntries.values()) {
      next[skillId] = next[skillId] || {};
      const previousThread = previous[skillId]?.[tabId] || createEmptyThreadRecord(skillId, tabId);
      const messages = this.getProjectedMessagesForView(skillId, tabId);
      const latestContextSignature = [...messages]
        .reverse()
        .map((message) => normalizeString(message.contextSignature))
        .find(Boolean) || null;
      next[skillId][tabId] = {
        ...previousThread,
        skillId,
        tabId,
        messages,
        resultContextSignature: latestContextSignature,
        stale: Boolean(
          this.deps.isContextScopedConceptTab(skillId, tabId)
          && latestContextSignature
          && this.state.contextSignature
          && latestContextSignature !== this.state.contextSignature,
        ),
        staleReason: this.deps.isContextScopedConceptTab(skillId, tabId)
          && latestContextSignature
          && this.state.contextSignature
          && latestContextSignature !== this.state.contextSignature
          ? '当前上下文已变化，请重新运行这个阶段以获得最新结果。'
          : null,
      };
    }

    this.state.threads = next;
  }

  appendNodeMessage(
    tabId: AISkillTabId,
    message: AIWorkbenchMessage,
    options?: {
      scope?: AIWorkbenchNodeScope;
      parentNodeId?: string | null;
      activateView?: boolean;
      updateTabIds?: AISkillTabId[];
    },
  ): AIWorkbenchTreeNode {
    const skillId = this.deps.normalizeSkillForCurrentSettings(message.skillId || this.state.activeSkillId, this.state.activeSkillId);
    const normalizedTabId = this.deps.normalizeTabForCurrentSettings(tabId, skillId);
    const tree = this.ensureTreeState();
    const scope = options?.scope || (skillId === AI_GENERAL_CHAT_SKILL_ID ? 'skill' : 'tab');
    const payload = cloneMessagePayload({
      ...message,
      id: normalizeString(message.id) || createEntryId('ai-msg'),
      skillId,
      tabId: normalizedTabId,
      view: message.view || skillId,
      contextSignature: this.deps.isContextScopedConceptTab(skillId, normalizedTabId)
        ? normalizeString(message.contextSignature) || this.state.contextSignature
        : normalizeString(message.contextSignature) || null,
    } as AIWorkbenchMessage);
    const parentNodeId = options?.parentNodeId === undefined
      ? this.resolveViewLeafId(skillId, normalizedTabId)
      : options.parentNodeId;
    const versionId = `${payload.id}::v${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const node: AIWorkbenchTreeNode = {
      id: payload.id,
      kind: getMessageNodeKind(payload),
      skillId,
      tabId: normalizedTabId,
      scope,
      parentId: parentNodeId || null,
      childIds: [],
      createdAt: payload.createdAt,
      hidden: false,
      pinned: false,
      status: 'ready',
      activeVersionId: versionId,
      versions: [{
        id: versionId,
        createdAt: Date.now(),
        message: payload,
      }],
    };
    tree.nodes[node.id] = node;
    if (!tree.rootNodeId) {
      tree.rootNodeId = node.id;
    }
    if (node.parentId && tree.nodes[node.parentId] && !tree.nodes[node.parentId].childIds.includes(node.id)) {
      tree.nodes[node.parentId].childIds.push(node.id);
    }
    const updateTabIds = options?.updateTabIds || (scope === 'skill' ? getSkillTabIds(skillId, normalizedTabId) : [normalizedTabId]);
    for (const affectedTabId of updateTabIds) {
      tree.activeLeafNodeIds![createTreeViewKey(skillId, affectedTabId)] = node.id;
    }
    if (options?.activateView !== false) {
      tree.activeLeafNodeId = node.id;
    }
    this.rebuildProjectedThreads();
    return node;
  }

  addNodeVersion(
    messageId: string,
    updater: (message: AIWorkbenchMessage) => AIWorkbenchMessage,
    options?: { status?: AIWorkbenchTreeNode['status'] },
  ): AIWorkbenchMessage | null {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return null;
    }
    const currentMessage = this.getNodeMessage(node);
    if (!currentMessage) {
      return null;
    }
    const nextMessage = cloneMessagePayload(updater(currentMessage));
    nextMessage.id = node.id;
    nextMessage.skillId = node.skillId;
    nextMessage.tabId = node.tabId;
    const versionId = `${node.id}::v${node.versions.length + 1}`;
    node.versions.push({
      id: versionId,
      createdAt: Date.now(),
      message: nextMessage,
    });
    node.activeVersionId = versionId;
    if (options?.status) {
      node.status = options.status;
    }
    this.rebuildProjectedThreads();
    return nextMessage;
  }

  patchActiveNodeMessage(
    messageId: string,
    updater: (message: AIWorkbenchMessage) => AIWorkbenchMessage,
    options?: { status?: AIWorkbenchTreeNode['status'] },
  ): AIWorkbenchMessage | null {
    const node = this.getTreeNode(messageId);
    const version = node ? this.getActiveNodeVersion(node) : null;
    if (!node || !version) {
      return null;
    }
    const nextMessage = cloneMessagePayload(updater(version.message));
    nextMessage.id = node.id;
    nextMessage.skillId = node.skillId;
    nextMessage.tabId = node.tabId;
    version.message = nextMessage;
    if (options?.status) {
      node.status = options.status;
    }
    this.rebuildProjectedThreads();
    return nextMessage;
  }

  static isRenderablePrimaryMessage(message: AIWorkbenchMessage): boolean {
    if (message.kind === 'tool-log' || message.kind === 'approval') {
      return false;
    }
    if (message.kind === 'assistant-text' && message.presentation === 'supplemental') {
      return false;
    }
    return true;
  }

  static isSupplementalMessage(messages: AIWorkbenchMessage[], index: number): boolean {
    const message = messages[index];
    if (!message) {
      return false;
    }
    if (message.kind === 'tool-log' || message.kind === 'approval') {
      return true;
    }
    if (message.kind !== 'assistant-text') {
      return false;
    }
    if (message.presentation === 'supplemental') {
      return true;
    }
    const nextMessage = messages[index + 1] || null;
    return Boolean(nextMessage && (nextMessage.kind === 'tool-log' || nextMessage.kind === 'approval'));
  }

  static createRenderEntry(
    primaryMessage: AIWorkbenchMessage,
    supplementalMessages: AIWorkbenchMessage[],
  ): AIWorkbenchRenderEntry {
    const nextSupplementalMessages = supplementalMessages.filter((message) => message.id !== primaryMessage.id);
    return {
      key: `${primaryMessage.id}::render`,
      primaryMessage,
      supplementalMessages: nextSupplementalMessages,
      stepCount: nextSupplementalMessages.length,
      pendingApproval: nextSupplementalMessages.find((message): message is AIWorkbenchApprovalMessage => (
        message.kind === 'approval' && message.request.status === 'pending'
      )) || null,
    };
  }
}
