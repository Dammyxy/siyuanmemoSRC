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
}

export class AutoCardExecutionRuntime {
  constructor(private readonly deps: AutoCardExecutionRuntimeDeps) {}

  async execute(envelope: AutoCardExecutionEnvelope): Promise<boolean> {
    if (envelope.kind === 'planner-decision') {
      return this.deps.executePlannerDecision({
        blockId: envelope.blockId,
        content: envelope.content,
        decision: envelope.decision,
        source: envelope.source,
        docRootId: envelope.docRootId,
      });
    }

    const derivedResult = await this.deps.createTopicDerivedItem(envelope.input);
    if (derivedResult.created > 0) {
      await this.deps.pushMsg(
        `已在当前 Topic 下新增 ${derivedResult.created} 个 Item${derivedResult.skipped > 0 ? `，跳过 ${derivedResult.skipped} 个重复项` : ''}`
      );
    }
    return derivedResult.created > 0;
  }
}
