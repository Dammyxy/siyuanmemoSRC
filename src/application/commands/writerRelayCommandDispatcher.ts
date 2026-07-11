import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';

export interface WriterRelayCommand {
  method: string;
  params?: unknown;
}

export interface WriterRelayDispatchHooks {
  onKernelTransactionIngested?: () => void;
  executeAgentTool?: (request: Record<string, unknown>) => Promise<unknown>;
}

export async function executeWriterRelayCommand(
  srsBackendClient: SrsBackendClient,
  command: WriterRelayCommand,
  hooks: WriterRelayDispatchHooks = {},
): Promise<unknown> {
  if (command.method === 'review.feedback') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: review.feedback relay requires params object');
    }
    return srsBackendClient.reviewFeedback(command.params as {
      cardId: string;
      rating: 1 | 2 | 3 | 4;
      queueType?: string;
      queueMode?: string;
      commitPolicy?: string;
      sessionId?: string;
      reviewedAt?: number;
      scheduler?: {
        defaultScheduler?: 'fsrs-v6' | 'a-factor-v2';
        fsrsParams?: Record<string, unknown>;
      };
    });
  }
  if (command.method === 'domainSync.status') {
    if (command.params !== undefined && (!command.params || typeof command.params !== 'object')) {
      throw new Error('INVALID_REQUEST: domainSync.status relay requires params object');
    }
    return srsBackendClient.domainSyncStatus((command.params ?? {}) as Parameters<SrsBackendClient['domainSyncStatus']>[0]);
  }
  if (command.method === 'domainSync.repair.preview') {
    if (command.params !== undefined && (!command.params || typeof command.params !== 'object')) {
      throw new Error('INVALID_REQUEST: domainSync.repair.preview relay requires params object');
    }
    return srsBackendClient.domainSyncRepairPreview((command.params ?? {}) as Parameters<SrsBackendClient['domainSyncRepairPreview']>[0]);
  }
  if (command.method === 'domainSync.repair.apply') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: domainSync.repair.apply relay requires params object');
    }
    return srsBackendClient.domainSyncRepairApply(command.params as {
      planId: string;
      idempotencyKey: string;
      confirmedAt: number;
      confirmedBy?: string | null;
      confirmationText?: string | null;
    });
  }
  if (command.method === 'domainSync.conflictSources.cleanupCandidates') {
    if (command.params !== undefined && (!command.params || typeof command.params !== 'object')) {
      throw new Error('INVALID_REQUEST: domainSync.conflictSources.cleanupCandidates relay requires params object');
    }
    return srsBackendClient.domainSyncConflictSourceCleanupCandidates();
  }
  if (command.method === 'domainSync.conflictSources.cleanup') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: domainSync.conflictSources.cleanup relay requires params object');
    }
    return srsBackendClient.domainSyncConflictSourcesCleanup(command.params as Parameters<SrsBackendClient['domainSyncConflictSourcesCleanup']>[0]);
  }
  if (command.method === 'browser.sourceExistence.applySweepHost') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: browser.sourceExistence.applySweepHost relay requires params object');
    }
    const params = command.params as {
      request?: {
        blockIds?: string[];
        limit?: number;
        staleBefore?: number;
        includeKnownMissing?: boolean;
        force?: boolean;
      };
      checkedAt?: number;
    };
    return srsBackendClient.browserSourceExistenceApplySweepHost(
      params.request ?? {},
      Number(params.checkedAt || Date.now()),
    );
  }
  if (command.method === 'browser.sourceExistence.update') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: browser.sourceExistence.update relay requires params object');
    }
    const params = command.params as {
      updates?: Array<{
        cardId?: string;
        blockId: string;
        exists: boolean;
      }>;
      checkedAt?: number;
    };
    return srsBackendClient.browserSourceExistenceUpdate(
      Array.isArray(params.updates) ? params.updates : [],
      Number(params.checkedAt || Date.now()),
    );
  }
  if (command.method === 'browser.sourceExistence.applySweep') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: browser.sourceExistence.applySweep relay requires params object');
    }
    const params = command.params as {
      request?: {
        blockIds?: string[];
        limit?: number;
        staleBefore?: number;
        includeKnownMissing?: boolean;
        force?: boolean;
      };
      existingBlockIds?: string[];
      checkedAt?: number;
    };
    return srsBackendClient.browserSourceExistenceApplySweep(
      params.request ?? {},
      Array.isArray(params.existingBlockIds) ? params.existingBlockIds : [],
      Number(params.checkedAt || Date.now()),
    );
  }
  if (command.method === 'kernel.transaction.ingest') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: kernel.transaction.ingest relay requires params object');
    }
    const result = await srsBackendClient.ingestKernelTransactions(command.params as {
      source?: 'kernel-sidecar' | 'ws-main';
      transactions?: unknown[];
      receivedAt?: number;
      idempotencyKey?: string;
    });
    hooks.onKernelTransactionIngested?.();
    return result;
  }
  if (command.method === 'kernel.transaction.dequeue') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: kernel.transaction.dequeue relay requires params object');
    }
    return srsBackendClient.dequeueKernelTransactions(command.params as {
      maxActions?: number;
    });
  }
  if (command.method === 'kernel.transaction.requeue') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: kernel.transaction.requeue relay requires params object');
    }
    return srsBackendClient.requeueKernelTransactions(command.params as {
      actions?: Array<{
        type: 'auto-card-candidates';
        operations?: Array<{
          action: 'insert' | 'update' | 'delete';
          blockId: string;
        }>;
        source: 'kernel-sidecar' | 'ws-main';
        receivedAt: number;
        idempotencyKey: string;
      }>;
    });
  }
  if (command.method === 'queue.projection.replace') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: queue.projection.replace relay requires params object');
    }
    return srsBackendClient.queueProjectionReplace(command.params as {
      queueType: string;
      policyHash: string;
      generation?: number | null;
      reason?: string | null;
      rows: Array<Record<string, unknown>>;
      metadata?: Record<string, unknown> | null;
    });
  }
  if (command.method === 'neural-roam.advance') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: neural-roam.advance relay requires params object');
    }
    return srsBackendClient.neuralRoamAdvance(command.params as {
      queueType: 'neural-roam';
      sessionId?: string | null;
      currentItem?: Record<string, unknown> | null;
      feedback?: {
        action: 'rate' | 'skip' | 'custom';
        rating?: 1 | 2 | 3 | 4;
        customActionId?: string | null;
      } | null;
      projectionGeneration?: number | null;
      policyHash?: string | null;
      reviewedAt?: number | null;
      idempotencyKey?: string | null;
    });
  }
  if (command.method === 'neural-roam.viewState') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: neural-roam.viewState relay requires params object');
    }
    return srsBackendClient.neuralRoamViewState(command.params as {
      queueType: 'neural-roam';
      routeId?: string | null;
      sessionId?: string | null;
    });
  }
  if (command.method === 'neural-roam.command') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: neural-roam.command relay requires params object');
    }
    return srsBackendClient.neuralRoamCommand(command.params as never);
  }
  if (command.method === 'autocard.decision.resolve') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: autocard.decision.resolve relay requires params object');
    }
    return srsBackendClient.resolveAutoCardDecision(command.params as {
      blockId: string;
      content: string;
      blockType?: string;
      resolvedCardType?: 'topic' | 'item';
      source?: 'symbol-listener' | 'doc-oneclick-scan';
      hasParentTopicCard?: boolean;
      settings?: {
        enabledSymbols?: {
          basic?: boolean;
          concept?: boolean;
          descriptor?: boolean;
          cloze?: boolean;
          multiLine?: boolean;
        };
        topicDerivation?: {
          enabled?: boolean;
        };
      };
    });
  }
  if (command.method === 'autocard.execute') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: autocard.execute relay requires params object');
    }
    return srsBackendClient.executeAutoCard(command.params as {
      envelope: {
        kind: 'planner-decision' | 'topic-derived';
      };
    });
  }
  if (command.method === 'private.command.execute') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: private.command.execute relay requires params object');
    }
    return srsBackendClient.privateCommand(command.params as {
      requestId: string;
      method: 'private.command.execute';
      callerIntent: string;
      idempotencyKey: string;
      capabilityResult?: {
        available: boolean;
        reason: string | null;
        kernelSidecarAvailable: boolean;
        backendWorkerAvailable: boolean;
        writerAvailable: boolean;
        methodAllowed: boolean;
      };
      params?: Record<string, unknown>;
      auditContext?: Record<string, unknown>;
    });
  }
  if (command.method === 'semantic.command.execute') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: semantic.command.execute relay requires params object');
    }
    return srsBackendClient.semanticCommand(command.params as {
      requestId: string;
      method: 'semantic.command.execute';
      callerIntent: string;
      idempotencyKey: string;
      command: Record<string, unknown>;
    });
  }
  if (command.method === 'card.schedule.batchUpdate') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: card.schedule.batchUpdate relay requires params object');
    }
    return srsBackendClient.cardScheduleBatchUpdate(
      command.params as Parameters<SrsBackendClient['cardScheduleBatchUpdate']>[0],
    );
  }
  if (command.method === 'card.crud.batchMutate') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: card.crud.batchMutate relay requires params object');
    }
    return srsBackendClient.cardCrudBatchMutate(
      command.params as Parameters<SrsBackendClient['cardCrudBatchMutate']>[0],
    );
  }
  if (command.method === 'storage.maintenance.applyBatch') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: storage.maintenance.applyBatch relay requires params object');
    }
    return srsBackendClient.applyStorageMaintenanceBatch(
      command.params as Parameters<SrsBackendClient['applyStorageMaintenanceBatch']>[0],
    );
  }
  if (command.method === 'storage.maintenance.status') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: storage.maintenance.status relay requires params object');
    }
    return srsBackendClient.storageMaintenanceStatus(
      command.params as Parameters<SrsBackendClient['storageMaintenanceStatus']>[0],
    );
  }
  if (command.method === 'queue.state.loadAll') {
    return srsBackendClient.queueStateLoadAll();
  }
  if (command.method === 'queue.state.batchMutate') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: queue.state.batchMutate relay requires params object');
    }
    return srsBackendClient.queueStateBatchMutate(
      command.params as Parameters<SrsBackendClient['queueStateBatchMutate']>[0],
    );
  }
  if (command.method === 'agent.tool.execute') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: agent.tool.execute relay requires params object');
    }
    if (!hooks.executeAgentTool) {
      throw new Error('BACKEND_UNAVAILABLE: agent.tool.execute application hook unavailable');
    }
    return hooks.executeAgentTool(command.params as Record<string, unknown>);
  }
  if (command.method === 'hotspot.command.submit') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: hotspot.command.submit relay requires params object');
    }
    return srsBackendClient.submitHotspotCommand(command.params as Parameters<SrsBackendClient['submitHotspotCommand']>[0]);
  }
  if (command.method === 'progressive.command.execute') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: progressive.command.execute relay requires params object');
    }
    return srsBackendClient.executeProgressiveCommand(command.params as Parameters<SrsBackendClient['executeProgressiveCommand']>[0]);
  }
  if (command.method === 'topic-derived.command.execute') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: topic-derived.command.execute relay requires params object');
    }
    return srsBackendClient.executeTopicDerivedCommand(command.params as Parameters<SrsBackendClient['executeTopicDerivedCommand']>[0]);
  }
  if (command.method === 'review.sourceRefresh.execute') {
    if (!command.params || typeof command.params !== 'object') {
      throw new Error('INVALID_REQUEST: review.sourceRefresh.execute relay requires params object');
    }
    return srsBackendClient.executeReviewSourceRefresh(command.params as Parameters<SrsBackendClient['executeReviewSourceRefresh']>[0]);
  }
  throw new Error(`BACKEND_UNAVAILABLE: unsupported writer relay method ${String(command.method || '')}`);
}
