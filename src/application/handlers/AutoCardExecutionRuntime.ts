import type { CreationDecision } from '@/core/card/post-creation/contracts';

export type AutoCardExecutionSource = 'symbol-listener' | 'doc-oneclick-scan';

export interface AutoCardTopicDerivedCreateInput {
  sourceBlockId: string;
  sourceDocId: string;
  parentTopicCardId: string;
  parentExcerptId?: string;
  sourceRootKind?: 'ordinary-doc' | 'piece' | 'excerpt-doc' | 'excerpt-block' | 'topic-doc';
  plannerContent: string;
  artifactContentDom?: string;
  mode?: 'planner-derived' | 'manual-cloze';
  answerFingerprint?: string;
  previewText?: string;
  decisions: CreationDecision[];
  storageMode?: 'workbench' | 'source-child';
}

export type AutoCardExecutionEnvelope =
  | {
    kind: 'planner-decision';
    blockId: string;
    content: string;
    decision: CreationDecision;
    source: AutoCardExecutionSource;
    docRootId?: string;
  }
  | {
    kind: 'topic-derived';
    input: AutoCardTopicDerivedCreateInput;
  };

export interface AutoCardExecutionResult {
  executed: boolean;
  created: number;
  skipped: number;
  failed?: number;
}

interface AutoCardExecutionRuntimeDeps {
  executePlannerDecision: (input: {
    blockId: string;
    content: string;
    decision: CreationDecision;
    source: AutoCardExecutionSource;
    docRootId?: string;
  }) => Promise<boolean>;
  createTopicDerivedItem: (input: AutoCardTopicDerivedCreateInput) => Promise<{
    created: number;
    skipped: number;
  }>;
  pushMsg: (message: string) => Promise<void>;
  executeViaBackend?: (envelope: AutoCardExecutionEnvelope) => Promise<AutoCardExecutionResult>;
}

export class AutoCardExecutionRuntime {
  constructor(private readonly deps: AutoCardExecutionRuntimeDeps) {}

  async execute(envelope: AutoCardExecutionEnvelope): Promise<boolean> {
    const result = await this.executeWithResult(envelope);
    return result.executed;
  }

  async executeWithResult(envelope: AutoCardExecutionEnvelope): Promise<AutoCardExecutionResult> {
    if (this.deps.executeViaBackend) {
      const backendResult = await this.deps.executeViaBackend(envelope);
      return {
        executed: backendResult.executed === true,
        created: Math.max(0, Math.floor(Number(backendResult.created || 0))),
        skipped: Math.max(0, Math.floor(Number(backendResult.skipped || 0))),
        failed: Math.max(0, Math.floor(Number(backendResult.failed || 0))) || undefined,
      };
    }
    return this.executeLocalWithResult(envelope);
  }

  async executeLocalWithResult(envelope: AutoCardExecutionEnvelope): Promise<AutoCardExecutionResult> {
    if (envelope.kind === 'planner-decision') {
      const executed = await this.deps.executePlannerDecision({
        blockId: envelope.blockId,
        content: envelope.content,
        decision: envelope.decision,
        source: envelope.source,
        docRootId: envelope.docRootId,
      });
      return {
        executed,
        created: executed ? 1 : 0,
        skipped: executed ? 0 : 1,
      };
    }

    const derivedResult = await this.deps.createTopicDerivedItem(envelope.input);
    if (derivedResult.created > 0) {
      await this.deps.pushMsg(
        `已在当前 Topic 下新增 ${derivedResult.created} 个 Item${derivedResult.skipped > 0 ? `，跳过 ${derivedResult.skipped} 个重复项` : ''}`
      );
    }
    return {
      executed: derivedResult.created > 0,
      created: Math.max(0, Math.floor(Number(derivedResult.created || 0))),
      skipped: Math.max(0, Math.floor(Number(derivedResult.skipped || 0))),
    };
  }
}
