import type {
  KernelCompanionBackgroundWorkHandlerResult,
  KernelCompanionBackgroundWorkRunContext,
  KernelCompanionXiuyuanStartupSyncDiagnostics,
} from '@/application/backgroundWork/KernelCompanionBackgroundWorkRegistry';
import type { SyncResult } from './XiuyuanSyncService.types';
import type { XiuyuanStartupSyncType } from './XiuyuanSyncService';

export type XiuyuanStartupSyncPhase = 'scan' | 'plan' | 'apply' | 'checkpoint';

export interface XiuyuanStartupSyncPhaseResult {
  diagnostics?: Partial<KernelCompanionXiuyuanStartupSyncDiagnostics>;
  result?: SyncResult;
}

export interface XiuyuanStartupSyncLifecycleRequest {
  context: KernelCompanionBackgroundWorkRunContext;
  syncType: XiuyuanStartupSyncType;
  phases: Record<
    XiuyuanStartupSyncPhase,
    () => Promise<XiuyuanStartupSyncPhaseResult | void> | XiuyuanStartupSyncPhaseResult | void
  >;
}

const STARTUP_SYNC_PHASES: XiuyuanStartupSyncPhase[] = [
  'scan',
  'plan',
  'apply',
  'checkpoint',
];

export class XiuyuanStartupSyncLifecycle {
  async run(
    request: XiuyuanStartupSyncLifecycleRequest,
  ): Promise<KernelCompanionBackgroundWorkHandlerResult<KernelCompanionXiuyuanStartupSyncDiagnostics>> {
    const diagnostics: Partial<KernelCompanionXiuyuanStartupSyncDiagnostics> = {
      syncType: request.syncType,
    };
    let latestCompletedPhase: XiuyuanStartupSyncPhase | undefined;

    for (const phase of STARTUP_SYNC_PHASES) {
      if (request.context.isCanceled()) {
        return this.buildCanceledResult(phase, diagnostics, latestCompletedPhase);
      }

      const phaseResult = await request.phases[phase]();
      latestCompletedPhase = phase;
      diagnostics.latestCompletedPhase = phase;

      if (phaseResult?.diagnostics) {
        Object.assign(diagnostics, phaseResult.diagnostics);
      }
      if (phaseResult?.result) {
        Object.assign(diagnostics, this.mapSyncResultDiagnostics(phaseResult.result));
      }
    }

    return {
      diagnostics: {
        ...diagnostics,
        status: 'completed',
        latestCompletedPhase: 'checkpoint',
      },
    };
  }

  private buildCanceledResult(
    nextPhase: XiuyuanStartupSyncPhase,
    diagnostics: Partial<KernelCompanionXiuyuanStartupSyncDiagnostics>,
    latestCompletedPhase: XiuyuanStartupSyncPhase | undefined,
  ): KernelCompanionBackgroundWorkHandlerResult<KernelCompanionXiuyuanStartupSyncDiagnostics> {
    return {
      state: 'canceled',
      reason: `startup-sync-canceled-before-${nextPhase}`,
      diagnostics: {
        ...diagnostics,
        status: 'canceled',
        ...(latestCompletedPhase ? { latestCompletedPhase } : {}),
      },
    };
  }

  private mapSyncResultDiagnostics(
    result: SyncResult,
  ): Partial<KernelCompanionXiuyuanStartupSyncDiagnostics> {
    return {
      addedCount: result.addedCount,
      updatedCount: result.updatedCount,
      deletedCount: result.deletedCount,
      skippedCount: result.skippedCount,
      detectedCount: result.detectedCount,
      blacklistCleanedCount: result.blacklistCleanedCount,
    };
  }
}
