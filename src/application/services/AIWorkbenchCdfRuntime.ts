import type { AISiyuanPort } from '@/application/ports/AISiyuanPort';
import type { AIFlashcardToolService } from '@/application/services/AIFlashcardToolService';
import {
  buildAiWorkbenchSectionMarkdown,
  formatConceptCoachAssistantResultMarkdown,
  getConceptCoachTabTitle,
} from '@/application/services/AIWorkbenchResultFormatter';
import {
  cloneConceptCoachResult,
  deriveTabNormalizationDiagnostic,
  emptyCdfStructure,
  explainResultFromConceptCoach,
  normalizeCdfStructure,
} from '@/application/services/AIWorkbenchResultNormalization';
import {
  normalizeSelfTestCardTargetMemory,
  type SelfTestCardWriteTarget,
} from '@/application/services/AIWorkbenchSelfTestRuntime';
import type {
  AICdfStructure,
  AIConceptCoachResult,
  AIConceptCoachSelfTestCreationMode,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchCdfCreationResult,
  AIWorkbenchConceptDocumentSearchResult,
  AIWorkbenchContextSnapshot,
  AIWorkbenchSendToSiyuanResult,
  AIWorkbenchSelfTestCardTargetInput,
  AIWorkbenchSelfTestCardTargetMemory,
} from '@/types/ai';

const CDF_UNRESOLVED_WARNING = '未解析到现有概念文档，当前概念只保留为草稿，无法直接建卡。';

type CdfSessionStore = {
  saveSelfTestCardTargetMemory(memory: AIWorkbenchSelfTestCardTargetMemory): Promise<AIWorkbenchSelfTestCardTargetMemory>;
};

export type AIWorkbenchCdfRuntimeDeps = {
  getContext: () => AIWorkbenchContextSnapshot | null;
  getContextSignature: () => string | null;
  flashcardTools: Pick<
    AIFlashcardToolService,
    | 'previewSemanticCdfStructure'
    | 'createSemanticCdfCards'
    | 'searchConceptDocumentsInNotebook'
    | 'createOrReuseConceptDocumentInNotebook'
  >;
  siyuanPort: Pick<AISiyuanPort, 'appendBlockUnderParentDetailed' | 'insertBlockAfterDetailed'>;
  getSessionStore: () => CdfSessionStore;
  getSelfTestCreationMode: () => AIConceptCoachSelfTestCreationMode;
  getConceptCoachResultMessage: (messageId: string, tabId?: string) => AIWorkbenchAssistantResultMessage | null;
  findLatestConceptCoachResultForContext: (signature: string | null) => AIConceptCoachResult | null;
  setScopedConceptCoachResult: (result: AIConceptCoachResult, signature: string | null) => void;
  addNodeVersion: (
    messageId: string,
    updater: (message: AIWorkbenchAssistantResultMessage) => AIWorkbenchAssistantResultMessage,
  ) => AIWorkbenchAssistantResultMessage | null;
  syncDerivedStateFromThreads: () => void;
  persistCurrentSession: () => Promise<void>;
  resolveSelfTestCardWriteTarget: (target: AIWorkbenchSelfTestCardTargetInput) => Promise<SelfTestCardWriteTarget>;
  recordArenaCreate: (input: {
    qualityLabel: 'strong' | 'usable';
    metadata: Record<string, unknown>;
  }) => Promise<void>;
};

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function cloneCdfStructure(value: AICdfStructure | null): AICdfStructure {
  return value ? JSON.parse(JSON.stringify(value)) as AICdfStructure : emptyCdfStructure();
}

export class AIWorkbenchCdfRuntime {
  constructor(private readonly deps: AIWorkbenchCdfRuntimeDeps) {}

  getCdfStructureForMessage(messageId: string): AICdfStructure {
    const message = this.getCdfResultMessage(messageId);
    if (!message) {
      return emptyCdfStructure();
    }
    return cloneCdfStructure((message.tabResult || message.conceptCoachResult?.cdfStructure) as AICdfStructure | null);
  }

  setAnchorSelected(messageId: string, anchorId: string, selected: boolean): Promise<void> {
    return this.updateAndPersist(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? { ...anchor, selected }
          : anchor
      )),
    }));
  }

  setDefinitionSelected(
    messageId: string,
    anchorId: string,
    definitionId: string,
    selected: boolean,
  ): Promise<void> {
    return this.updateAndPersist(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            definitionCandidates: anchor.definitionCandidates.map((definition) => (
              selected
                ? { ...definition, selected: definition.id === definitionId }
                : definition.id === definitionId
                  ? { ...definition, selected: false }
                  : definition
            )),
          }
          : anchor
      )),
    }));
  }

  clearDefinitionSelection(messageId: string, anchorId: string): Promise<void> {
    return this.updateAndPersist(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            definitionCandidates: anchor.definitionCandidates.map((definition) => ({
              ...definition,
              selected: false,
            })),
          }
          : anchor
      )),
    }));
  }

  setDescriptorGroupSelected(
    messageId: string,
    anchorId: string,
    groupId: string,
    selected: boolean,
  ): Promise<void> {
    return this.updateAndPersist(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            descriptorGroups: anchor.descriptorGroups.map((group) => (
              group.id === groupId ? { ...group, selected } : group
            )),
          }
          : anchor
      )),
    }));
  }

  setDescriptorItemSelected(
    messageId: string,
    anchorId: string,
    groupId: string,
    itemId: string,
    selected: boolean,
  ): Promise<void> {
    return this.updateAndPersist(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            descriptorGroups: anchor.descriptorGroups.map((group) => (
              group.id === groupId
                ? {
                  ...group,
                  items: group.items.map((item) => (
                    item.id === itemId ? { ...item, selected } : item
                  )),
                }
                : group
            )),
          }
          : anchor
      )),
    }));
  }

  previewStructure(
    messageId: string,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    options?: {
      forceResolve?: boolean;
    },
  ): Promise<AICdfStructure> {
    return this.deps.flashcardTools.previewSemanticCdfStructure(
      this.getCdfStructureForMessage(messageId),
      target,
      {
        context: this.deps.getContext(),
        attachedContexts: [],
      },
      options,
    );
  }

  async createCardsFromSelectedAnchors(
    target: AIWorkbenchSelfTestCardTargetInput,
    messageId: string,
  ): Promise<AIWorkbenchCdfCreationResult> {
    const result = await this.deps.flashcardTools.createSemanticCdfCards(
      this.getCdfStructureForMessage(messageId),
      target,
      {
        context: this.deps.getContext(),
        attachedContexts: [],
      },
    );
    if (result.createdCount > 0) {
      await this.deps.getSessionStore().saveSelfTestCardTargetMemory(result.target);
    }
    await this.deps.recordArenaCreate({
      qualityLabel: result.createdCount > 0 ? 'strong' : 'usable',
      metadata: {
        messageId,
        createdCount: result.createdCount,
        createdDefinitionCount: result.createdDefinitionCount,
        createdDescriptorCount: result.createdDescriptorCount,
        targetLabel: result.targetLabel,
      },
    });
    return result;
  }

  formatAssistantResultMarkdown(messageId: string): string {
    const message = this.deps.getConceptCoachResultMessage(messageId);
    if (!message) {
      return '';
    }
    return formatConceptCoachAssistantResultMarkdown(message, {
      selfTestCreationMode: this.deps.getSelfTestCreationMode(),
    });
  }

  async sendAssistantResultToSiyuan(
    target: AIWorkbenchSelfTestCardTargetInput,
    messageId: string,
  ): Promise<AIWorkbenchSendToSiyuanResult> {
    const message = this.deps.getConceptCoachResultMessage(messageId);
    if (!message) {
      throw new Error('当前消息不支持发送到思源。');
    }
    const resolvedTarget = await this.deps.resolveSelfTestCardWriteTarget(target);
    const sectionTitle = getConceptCoachTabTitle(message.tabId);
    const bodyMarkdown = this.formatAssistantResultMarkdown(messageId);
    if (!bodyMarkdown) {
      throw new Error('当前阶段没有可发送到思源的内容。');
    }
    const markdown = buildAiWorkbenchSectionMarkdown(sectionTitle, bodyMarkdown, Date.now());
    const mutation = resolvedTarget.writeMode === 'append'
      ? await this.deps.siyuanPort.appendBlockUnderParentDetailed(markdown, resolvedTarget.targetBlockId)
      : await this.deps.siyuanPort.insertBlockAfterDetailed(markdown, resolvedTarget.targetBlockId);
    const insertedRootBlockId = normalizeString(mutation.doOperations[0]?.id) || null;
    await this.deps.getSessionStore().saveSelfTestCardTargetMemory(resolvedTarget.memory);
    await this.deps.recordArenaCreate({
      qualityLabel: insertedRootBlockId ? 'strong' : 'usable',
      metadata: {
        messageId,
        insertedRootBlockId,
        targetLabel: resolvedTarget.memory.targetLabel,
        sectionTitle,
      },
    });
    return {
      target: resolvedTarget.memory,
      targetBlockId: resolvedTarget.targetBlockId,
      targetLabel: resolvedTarget.memory.targetLabel,
      sectionTitle,
      markdown,
      insertedRootBlockId,
    };
  }

  searchConceptDocuments(
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    query: string,
    limit?: number,
  ): Promise<AIWorkbenchConceptDocumentSearchResult[]> {
    return this.deps.flashcardTools.searchConceptDocumentsInNotebook(target, query, limit);
  }

  async setAnchorManualResolution(
    messageId: string,
    anchorId: string,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    document: AIWorkbenchConceptDocumentSearchResult,
  ): Promise<void> {
    const memory = normalizeSelfTestCardTargetMemory(target, Date.now());
    if (!memory?.notebookId) {
      throw new Error('设置概念文档前请先选择目标笔记本。');
    }
    const updated = this.applyAnchorManualResolution(messageId, anchorId, memory, document, '手动选择概念文档。');
    if (!updated) {
      throw new Error('未找到要更新的 CDF 概念锚点。');
    }
    await this.deps.persistCurrentSession();
  }

  async createAndBindConceptDocument(
    messageId: string,
    anchorId: string,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
  ): Promise<void> {
    const memory = normalizeSelfTestCardTargetMemory(target, Date.now());
    if (!memory?.notebookId) {
      throw new Error('新建概念文档前请先选择目标笔记本。');
    }
    const message = this.deps.getConceptCoachResultMessage(messageId);
    if (!message) {
      throw new Error('未找到要更新的 CDF 结果消息。');
    }
    const structure = this.getCdfStructureForMessage(messageId);
    const anchor = structure?.anchors.find((item) => item.id === anchorId);
    if (!anchor) {
      throw new Error('未找到要新建概念文档的 CDF 概念锚点。');
    }
    const created = await this.deps.flashcardTools.createOrReuseConceptDocumentInNotebook(memory, anchor.conceptName);
    const updated = this.applyAnchorManualResolution(
      messageId,
      anchorId,
      memory,
      created.document,
      created.reused ? '已复用现有概念文档。' : '已新建概念文档并手动绑定。',
    );
    if (!updated) {
      throw new Error('未找到要更新的 CDF 概念锚点。');
    }
    await this.deps.persistCurrentSession();
  }

  async restoreAnchorAutoResolution(messageId: string, anchorId: string): Promise<void> {
    const updated = this.updateCdfResultMessage(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            resolution: null,
            warnings: (anchor.warnings || []).filter((warning) => warning !== CDF_UNRESOLVED_WARNING),
          }
          : anchor
      )),
    }));
    if (!updated) {
      throw new Error('未找到要恢复自动解析的 CDF 概念锚点。');
    }
    await this.deps.persistCurrentSession();
  }

  private getCdfResultMessage(messageId: string): AIWorkbenchAssistantResultMessage | null {
    return this.deps.getConceptCoachResultMessage(messageId, 'cdf-structure');
  }

  private async updateAndPersist(
    messageId: string,
    updater: (current: AICdfStructure) => AICdfStructure,
  ): Promise<void> {
    const updated = this.updateCdfResultMessage(messageId, updater);
    if (!updated) {
      return;
    }
    await this.deps.persistCurrentSession();
  }

  private updateCdfResultMessage(
    messageId: string,
    updater: (current: AICdfStructure) => AICdfStructure,
  ): AICdfStructure | null {
    const message = this.getCdfResultMessage(messageId);
    if (!message) {
      return null;
    }
    const currentResult = this.deps.findLatestConceptCoachResultForContext(this.deps.getContextSignature());
    if (!currentResult) {
      return null;
    }
    const nextCdfStructure = normalizeCdfStructure(updater(this.getCdfStructureForMessage(messageId)));
    const nextResult: AIConceptCoachResult = {
      ...cloneConceptCoachResult(currentResult),
      cdfStructure: nextCdfStructure,
    };
    this.deps.setScopedConceptCoachResult(nextResult, this.deps.getContextSignature());
    this.deps.addNodeVersion(messageId, (current) => ({
      ...current,
      contextSignature: this.deps.getContextSignature(),
      conceptCoachResult: cloneConceptCoachResult(nextResult),
      tabResult: nextCdfStructure,
      normalizationDiagnostic: deriveTabNormalizationDiagnostic('cdf-structure', nextCdfStructure, 'edited-result'),
      explainResult: explainResultFromConceptCoach(nextResult),
      rawContent: JSON.stringify({ cdfStructure: nextCdfStructure }, null, 2),
    } satisfies AIWorkbenchAssistantResultMessage));
    this.deps.syncDerivedStateFromThreads();
    return nextCdfStructure;
  }

  private applyAnchorManualResolution(
    messageId: string,
    anchorId: string,
    memory: AIWorkbenchSelfTestCardTargetMemory,
    document: AIWorkbenchConceptDocumentSearchResult,
    reason: string,
  ): boolean {
    return Boolean(this.updateCdfResultMessage(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            resolution: {
              status: 'resolved-manual',
              conceptBlockId: normalizeString(document.id) || null,
              conceptTitle: normalizeString(document.title) || anchor.conceptName,
              reason,
              notebookId: memory.notebookId,
            },
            warnings: (anchor.warnings || []).filter((warning) => warning !== CDF_UNRESOLVED_WARNING),
          }
          : anchor
      )),
    })));
  }
}
