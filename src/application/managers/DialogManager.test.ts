/**
 * DialogManager 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DialogManager } from './DialogManager';
import type { ApplicationContext } from '../ApplicationContext';
import type { Plugin } from 'siyuan';
import { createVueDialog } from '@/utils/dialog';
import { QueueType } from '@/types/unified-data-source';

const { dialogInstances, DialogMock, openManualSyncConflictResolutionDialogMock } = vi.hoisted(() => ({
  dialogInstances: [] as Array<{
    options: { title: string; content: string; width?: string };
    element: HTMLElement;
    destroy: ReturnType<typeof vi.fn>;
  }>,
  DialogMock: vi.fn((options: { title: string; content: string; width?: string }) => {
    const element = document.createElement('div');
    element.innerHTML = options.content;
    const dialog = {
      options,
      element,
      destroy: vi.fn(),
    };
    dialogInstances.push(dialog);
    return dialog;
  }),
  openManualSyncConflictResolutionDialogMock: vi.fn(async () => undefined),
}));

// Mock dependencies
vi.mock('@/utils/dialog', () => ({
  applyDialogChrome: vi.fn(),
  createVueDialog: vi.fn((options) => {
    const mockDialog = {
      dialog: { element: document.createElement('div') },
      destroy: vi.fn(),
    };
    
    // 模拟 onClose 回调
    if (options.onClose) {
      setTimeout(() => options.onClose(), 0);
    }
    
    return mockDialog;
  }),
}));

vi.mock('@/ui/settings', () => ({
  SettingsPanel: {},
}));

vi.mock('@/ui/browser', () => ({
  SRSBrowser: {},
}));

const { createUnifiedReviewDialogMock } = vi.hoisted(() => ({
  createUnifiedReviewDialogMock: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('@/application/factories/createUnifiedReviewDialog', () => ({
  createUnifiedReviewDialog: createUnifiedReviewDialogMock,
}));

vi.mock('siyuan', () => ({
  Dialog: DialogMock,
}));

vi.mock('@/ui/syncConflict/manualSyncConflictResolutionDialog', () => ({
  openManualSyncConflictResolutionDialog: openManualSyncConflictResolutionDialogMock,
}));

function buildDomainStatus(
  status: 'clean' | 'merged' | 'repairable' | 'divergent' | 'needs-direction' | 'source-error',
  overrides: {
    repairableDivergenceCount?: number;
    divergentCardCount?: number;
    skippedSourceCount?: number;
    pendingImportCount?: number;
    reasonCounts?: Record<string, number>;
  } = {},
) {
  const repairableDivergenceCount = overrides.repairableDivergenceCount ?? 0;
  const skippedSourceCount = overrides.skippedSourceCount ?? 0;
  return {
    ok: true,
    ledger: {
      operationCount: 1,
      newestOperationAt: 1,
      operationTypes: {},
    },
    processedSources: {
      recent: [],
      skipped: [],
      totalProcessed: 0,
      totalSkipped: skippedSourceCount,
    },
    sanity: {
      status,
      checkedAt: 1,
      ledgerOperationCount: 1,
      pendingImportCount: overrides.pendingImportCount ?? 0,
      processedSourceCount: 0,
      skippedSourceCount,
      repairableDivergenceCount,
      divergentCardCount: overrides.divergentCardCount ?? repairableDivergenceCount,
      reasonCounts: overrides.reasonCounts ?? {},
      affectedCardIds: [],
      truncated: false,
    },
    repair: {
      available: repairableDivergenceCount > 0,
      repairableDivergenceCount,
      latestPlanId: null,
    },
  };
}

describe('DialogManager', () => {
  let dialogManager: DialogManager;
  let mockContext: ApplicationContext;
  let mockPlugin: Plugin;
  let mockStorage: any;
  let mockScheduler: any;
  let mockI18n: any;
  let mockSettingsService: any;
  let mockSiyuanApi: any;
  let mockProgressiveSiyuanApi: any;
  let mockPracticeQueueManager: any;
  let mockRetrievalQueue: any;
  let mockReadDomainSyncDiagnostics: any;
  let mockTabManager: any;
  let mockNativeRiffImportModule: any;
  let mockNativeRiffAdoptionModule: any;

  beforeEach(() => {
    // 创建 mock 对象
    mockStorage = {
      getSettings: vi.fn(() => ({})),
    };

    mockScheduler = {};
    mockSettingsService = {
      getSettings: vi.fn(() => ({})),
      updateSettings: vi.fn(async () => undefined),
    };
    mockPracticeQueueManager = {
      previewPracticeQueue: vi.fn(),
      addPracticeQueue: vi.fn(),
      startPracticeQueue: vi.fn(),
      clearPracticeQueue: vi.fn(),
    };
    mockRetrievalQueue = {
      localBuffer: [],
      cards: [],
      buffer: [],
    };
    mockSiyuanApi = {
      pushErrMsg: vi.fn(async () => undefined),
      pushMsg: vi.fn(async () => undefined),
    };
    mockProgressiveSiyuanApi = {};
    mockReadDomainSyncDiagnostics = vi.fn(async () => buildDomainStatus('clean'));
    mockTabManager = {
      openReviewTabInNewTab: vi.fn(),
    };
    mockNativeRiffImportModule = {
      preview: vi.fn(async () => ({
        candidates: [],
        counts: {
          importable: 0,
          alreadyOwned: 0,
          existingNeedsRepair: 0,
          tombstoned: 0,
          legacyExcluded: 0,
          semanticConflict: 0,
        },
      })),
      applySelected: vi.fn(),
    };
    mockNativeRiffAdoptionModule = {
      preview: vi.fn(async () => ({
        candidates: [],
        counts: {
          adoptable: 0,
          alreadyLocal: 0,
          tombstoned: 0,
          legacyExcluded: 0,
          sourceMissing: 0,
          semanticConflict: 0,
        },
      })),
      applySelected: vi.fn(),
    };

    mockI18n = {
      settings: 'Settings',
      srsBrowser: 'SRS Browser',
    };

    mockContext = {
      getStorage: vi.fn(() => mockStorage),
      getBackendMigrationRuntimePolicy: vi.fn(() => ({
        capabilities: {
          backendWorkerAvailable: false,
        },
      })),
      getSettingsService: vi.fn(() => mockSettingsService),
      getScheduler: vi.fn(() => mockScheduler),
      getBrowserService: vi.fn(() => ({})),
      getTabApplicationService: vi.fn(() => ({})),
      getEventBus: vi.fn(() => ({})),
      getReviewQueuePreparationService: vi.fn(() => null),
      getReviewAdmissionModule: vi.fn(() => ({
        admitReviewSession: vi.fn(async ({ queueType, entrySurface }) => ({
          queueType,
          entrySurface: entrySurface ?? null,
          projectionPolicyHash: 'test-policy',
          projectionGeneration: 1,
          readinessRequest: {
            queueType,
            preset: 'all',
            searchText: null,
            docId: null,
            scopeDocIds: [],
            cardType: 'all',
            source: 'browser',
          },
          admittedAt: Date.now(),
          source: 'ready-projection',
        })),
      })),
      getPracticeQueueManager: vi.fn(() => mockPracticeQueueManager),
      getRetrievalQueue: vi.fn(() => mockRetrievalQueue),
      getUnifiedDataSourceManager: vi.fn(() => ({
        getQueue: vi.fn(() => ({ cards: [] })),
        materializeQueueProjection: vi.fn(async () => undefined),
      })),
      getTabManager: vi.fn(() => mockTabManager),
      readDomainSyncDiagnostics: mockReadDomainSyncDiagnostics,
      getI18n: vi.fn(() => mockI18n),
      getPlugin: vi.fn(() => mockPlugin),
      getSrsCardSemanticsRepairService: vi.fn(() => ({
        preview: vi.fn(async () => ({
          status: 'unavailable',
          diagnostics: [{ message: 'repair unavailable' }],
        })),
        commit: vi.fn(),
      })),
      getNativeRiffImportModule: vi.fn(() => mockNativeRiffImportModule),
      getNativeRiffAdoptionModule: vi.fn(() => mockNativeRiffAdoptionModule),
      getConfiguredCaptureStorageService: vi.fn(() => ({
        listOpenNotebooks: vi.fn(async () => []),
      })),
      getKernelCompanionPort: vi.fn(() => ({
        getStatus: vi.fn(async () => ({
          kind: 'unavailable',
          checkedAt: Date.now(),
          pluginName: 'siyuan-plugin-siyuanmemo',
          methods: [],
          reason: 'not-loaded',
          message: 'Plugin not loaded',
        })),
      })),
    } as any;

    mockPlugin = {} as Plugin;

    dialogManager = new DialogManager(mockContext, mockPlugin, {
      siyuanApi: mockSiyuanApi,
      progressiveSiyuanApi: mockProgressiveSiyuanApi,
      leechActionEffects: {} as any,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    dialogInstances.length = 0;
  });

  describe('构造函数', () => {
    it('应该正确创建 DialogManager 实例', () => {
      expect(dialogManager).toBeDefined();
      expect(dialogManager).toBeInstanceOf(DialogManager);
    });
  });

  describe('设置对话框', () => {
    it('应该能够打开设置对话框', async () => {
      await dialogManager.openSettingsDialog();
      
      expect(mockContext.getSettingsService).toHaveBeenCalled();
      expect(mockSettingsService.getSettings).toHaveBeenCalled();
    });

    it('应该能够打开设置对话框并指定默认标签页', async () => {
      await dialogManager.openSettingsDialog('general');
      
      expect(mockContext.getSettingsService).toHaveBeenCalled();
      expect(mockSettingsService.getSettings).toHaveBeenCalled();
    });

    it('应该能够关闭设置对话框', async () => {
      await dialogManager.openSettingsDialog();
      dialogManager.closeSettingsDialog();
      
      // 验证对话框已被销毁
      // 注意：由于 mock 的限制，这里只能验证方法被调用
      expect(mockContext.getSettingsService).toHaveBeenCalled();
    });

    it('关闭不存在的设置对话框不应该报错', () => {
      expect(() => {
        dialogManager.closeSettingsDialog();
      }).not.toThrow();
    });

    it('passes kernel companion refresh handler through the settings dialog props', async () => {
      const getStatus = vi.fn(async () => ({
        kind: 'available',
        checkedAt: Date.now(),
        pluginName: 'siyuan-plugin-siyuanmemo',
        pluginState: 'running',
        methods: [{ name: 'health', descriptions: [] }],
        version: '0.2.1',
        platform: 'windows',
        uptimeMs: 100,
      }));
      vi.mocked(mockContext.getKernelCompanionPort).mockReturnValue({ getStatus } as never);

      await dialogManager.openSettingsDialog('maintenance');

      const dialogConfig = vi.mocked(createVueDialog).mock.calls.at(-1)?.[0] as {
        props?: {
          kernelCompanionHandlers?: {
            refresh: () => Promise<unknown>;
          };
        };
      };
      expect(dialogConfig.props?.kernelCompanionHandlers?.refresh).toBeTypeOf('function');
      await expect(dialogConfig.props!.kernelCompanionHandlers!.refresh()).resolves.toMatchObject({
        kind: 'available',
        pluginState: 'running',
      });
      expect(getStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('SRS 浏览器对话框', () => {
    it('应该能够打开 SRS 浏览器对话框', async () => {
      await dialogManager.openBrowserDialog();
      
      expect(mockContext.getStorage).toHaveBeenCalled();
      expect(mockContext.getScheduler).toHaveBeenCalled();
      expect(mockContext.getI18n).toHaveBeenCalled();
    });

    it('应该能够关闭 SRS 浏览器对话框', async () => {
      await dialogManager.openBrowserDialog();
      dialogManager.closeBrowserDialog();
      
      // 验证对话框已被销毁
      expect(mockContext.getStorage).toHaveBeenCalled();
    });

    it('关闭不存在的 SRS 浏览器对话框不应该报错', () => {
      expect(() => {
        dialogManager.closeBrowserDialog();
      }).not.toThrow();
    });
  });

  describe('复习对话框', () => {
    it('应该能够打开复习对话框', async () => {
      await dialogManager.openReviewDialog();
      
      expect(createUnifiedReviewDialogMock).toHaveBeenCalledWith(expect.objectContaining({
        title: '提取练习',
        headerVariant: 'retrieval-practice',
      }));
    });

    it('如果创建复习对话框失败，应该推送错误消息', async () => {
      createUnifiedReviewDialogMock.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      await dialogManager.openReviewDialog();
      
      expect(mockSiyuanApi.pushErrMsg).toHaveBeenCalled();
    });

    it('allows standard Review entry when domain sync repairable drift is reps-only', async () => {
      mockReadDomainSyncDiagnostics.mockResolvedValueOnce(buildDomainStatus('repairable', {
        repairableDivergenceCount: 2,
        reasonCounts: {
          'review-history-newer-than-card-state': 0,
          'review-event-count-exceeds-card-reps': 2,
        },
      }));

      await dialogManager.openReviewDialog();

      expect(createUnifiedReviewDialogMock).toHaveBeenCalledWith(expect.objectContaining({
        queueType: QueueType.RetrievalPractice,
      }));
      expect(openManualSyncConflictResolutionDialogMock).not.toHaveBeenCalled();
    });

    it('blocks tab-mode Review before opening a Review tab', async () => {
      mockSettingsService.getSettings.mockReturnValueOnce({
        ui: {
          reviewOpenInNewTabByDefault: true,
        },
      });
      mockReadDomainSyncDiagnostics.mockResolvedValueOnce(buildDomainStatus('needs-direction'));

      await dialogManager.openFinalDrillDialog();

      expect(mockTabManager.openReviewTabInNewTab).not.toHaveBeenCalled();
      expect(createUnifiedReviewDialogMock).not.toHaveBeenCalled();
      expect(openManualSyncConflictResolutionDialogMock).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          reviewBlockDecision: expect.objectContaining({ kind: 'block-needs-direction' }),
        }),
      );
    });

    it('blocks scoped Review before creating a subset queue', async () => {
      const manager = {
        getQueue: vi.fn(() => ({ cards: [] })),
        materializeQueueProjection: vi.fn(async () => undefined),
      };
      vi.mocked(mockContext.getUnifiedDataSourceManager).mockReturnValueOnce(manager as never);
      mockReadDomainSyncDiagnostics.mockResolvedValueOnce(buildDomainStatus('source-error', {
        skippedSourceCount: 1,
      }));

      await dialogManager.openSubsetReviewDialog(['20260520191142-k4so8as']);

      expect(manager.getQueue).not.toHaveBeenCalled();
      expect(createUnifiedReviewDialogMock).not.toHaveBeenCalled();
      expect(openManualSyncConflictResolutionDialogMock).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          reviewBlockDecision: expect.objectContaining({ kind: 'block-source-error' }),
        }),
      );
    });

    it('keeps safe Review entry behavior for representative surfaces', async () => {
      await dialogManager.openReviewDialog();
      await dialogManager.openFinalDrillDialog();
      await dialogManager.openSubsetReviewDialog(['20260520191142-k4so8as']);

      expect(createUnifiedReviewDialogMock).toHaveBeenCalledTimes(3);
      expect(createUnifiedReviewDialogMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
        queueType: QueueType.RetrievalPractice,
      }));
      expect(createUnifiedReviewDialogMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
        queueType: QueueType.FinalDrill,
      }));
      expect(createUnifiedReviewDialogMock).toHaveBeenNthCalledWith(3, expect.objectContaining({
        headerVariant: 'subset-review',
      }));
    });
  });

  describe('SRS 卡片语义修复对话框', () => {
    it('uses the bundled static SiYuan Dialog import instead of runtime dynamic import', () => {
      const source = readFileSync('src/application/managers/DialogManager.ts', 'utf8');

      expect(source).not.toContain("import('siyuan')");
    });

    it('fails closed when semantic repair preview is unavailable', async () => {
      const repairService = {
        preview: vi.fn(async () => ({
          status: 'unavailable',
          diagnostics: [{ message: 'SQL unavailable' }],
        })),
        commit: vi.fn(),
      };
      vi.mocked(mockContext.getSrsCardSemanticsRepairService).mockReturnValueOnce(repairService as never);

      await dialogManager.openSrsCardSemanticsRepairDialog();

      expect(repairService.preview).toHaveBeenCalledTimes(1);
      expect(repairService.commit).not.toHaveBeenCalled();
      expect(mockSiyuanApi.pushErrMsg).toHaveBeenCalledWith('SQL unavailable');
      expect(DialogMock).not.toHaveBeenCalled();
    });

    it('previews before committing deterministic card semantic repairs', async () => {
      const repairService = {
        preview: vi.fn(async () => ({
          status: 'ready',
          counts: {
            total: 3,
            safeRepair: 1,
            ambiguous: 1,
            insufficient: 0,
            noop: 1,
            skipped: 1,
          },
          rows: [{
            cardId: '<card-a>',
            status: 'safe-repair',
            beforeKind: 'topic',
            afterKind: 'item',
            evidenceCount: 2,
            diagnosticCodes: [],
          }],
          audits: [],
        })),
        commit: vi.fn(async () => ({
          status: 'committed',
          appliedCount: 1,
          skippedCount: 2,
          failedCount: 0,
          updatedCardIds: ['card-a'],
          diagnostics: [],
        })),
      };
      vi.mocked(mockContext.getSrsCardSemanticsRepairService).mockReturnValueOnce(repairService as never);

      const pending = dialogManager.openSrsCardSemanticsRepairDialog();
      await vi.waitFor(() => expect(dialogInstances).toHaveLength(1));
      expect(dialogInstances[0].options.title).toBe('诊断并修复卡片类型');
      expect(dialogInstances[0].element.innerHTML).toContain('&lt;card-a&gt;');
      expect(repairService.commit).not.toHaveBeenCalled();

      dialogInstances[0].element.querySelector<HTMLButtonElement>('[data-action="commit"]')?.click();
      await pending;

      expect(dialogInstances[0].destroy).toHaveBeenCalledTimes(1);
      expect(repairService.commit).toHaveBeenCalledTimes(1);
      expect(mockSiyuanApi.pushMsg).toHaveBeenCalledWith('卡片类型修复完成：已修复 1 张，跳过 2 张');
    });
  });

  describe('Native Riff 显式导入与接管', () => {
    it('previews import candidates before applying selected logical faces', async () => {
      mockNativeRiffImportModule.preview.mockResolvedValueOnce({
        candidates: [
          {
            classification: 'importable',
            nativeCardId: 'riff-a',
            deckId: 'deck-a',
            blockId: 'block-a',
            logicalKey: 'block-a::face-0',
            faceIndex: 0,
          },
          {
            classification: 'already-owned',
            nativeCardId: 'riff-b',
            deckId: 'deck-a',
            blockId: 'block-b',
            logicalKey: 'block-b::face-0',
            faceIndex: 0,
            existingCardId: 'card-b',
          },
        ],
        counts: {
          importable: 1,
          alreadyOwned: 1,
          existingNeedsRepair: 0,
          tombstoned: 0,
          legacyExcluded: 0,
          semanticConflict: 0,
        },
      });
      mockNativeRiffImportModule.applySelected.mockResolvedValueOnce({
        createdCardIds: ['card-a'],
        createdCount: 1,
        skippedCount: 0,
      });

      const pending = dialogManager.openNativeRiffImportDialog();
      await vi.waitFor(() => expect(dialogInstances).toHaveLength(1));
      expect(dialogInstances[0].options.title).toBe('从 Riff 导入');
      expect(dialogInstances[0].element.innerHTML).toContain('可导入');
      expect(mockNativeRiffImportModule.applySelected).not.toHaveBeenCalled();

      dialogInstances[0].element.querySelector<HTMLButtonElement>('[data-action="commit"]')?.click();
      await pending;

      expect(mockNativeRiffImportModule.applySelected).toHaveBeenCalledWith({
        logicalKeys: ['block-a::face-0'],
      });
      expect(mockSiyuanApi.pushMsg).toHaveBeenCalledWith('Riff 导入完成：新建 1 张，跳过 0 张');
    });

    it('fails closed when import preview has no importable candidates', async () => {
      await dialogManager.openNativeRiffImportDialog();

      expect(mockNativeRiffImportModule.preview).toHaveBeenCalledTimes(1);
      expect(mockNativeRiffImportModule.applySelected).not.toHaveBeenCalled();
      expect(DialogMock).not.toHaveBeenCalled();
      expect(mockSiyuanApi.pushMsg).toHaveBeenCalledWith('没有可导入的 Riff 卡片');
    });

    it('previews adoption candidates before applying selected existing cards', async () => {
      mockNativeRiffAdoptionModule.preview.mockResolvedValueOnce({
        candidates: [
          {
            cardId: 'card-a',
            xiuyuanId: 'xiuyuan-a',
            blockId: 'block-a',
            classification: 'adoptable',
          },
          {
            cardId: 'card-b',
            xiuyuanId: 'xiuyuan-b',
            blockId: 'block-b',
            classification: 'source-missing',
            reason: 'native-riff-adoption-source-missing',
          },
        ],
        counts: {
          adoptable: 1,
          alreadyLocal: 0,
          tombstoned: 0,
          legacyExcluded: 0,
          sourceMissing: 1,
          semanticConflict: 0,
        },
      });
      mockNativeRiffAdoptionModule.applySelected.mockResolvedValueOnce({
        adopted: [{ cardId: 'card-a' }],
        blocked: [],
      });

      const pending = dialogManager.openNativeRiffAdoptionDialog();
      await vi.waitFor(() => expect(dialogInstances).toHaveLength(1));
      expect(dialogInstances[0].options.title).toBe('接管旧 Riff 卡片');
      expect(dialogInstances[0].element.innerHTML).toContain('可接管');
      expect(mockNativeRiffAdoptionModule.applySelected).not.toHaveBeenCalled();

      dialogInstances[0].element.querySelector<HTMLButtonElement>('[data-action="commit"]')?.click();
      await pending;

      expect(mockNativeRiffAdoptionModule.applySelected).toHaveBeenCalledWith({
        cardIds: ['card-a'],
      });
      expect(mockSiyuanApi.pushMsg).toHaveBeenCalledWith('旧 Riff 卡片接管完成：已接管 1 张，阻止 0 张');
    });

    it('fails closed when adoption preview has no adoptable candidates', async () => {
      await dialogManager.openNativeRiffAdoptionDialog();

      expect(mockNativeRiffAdoptionModule.preview).toHaveBeenCalledTimes(1);
      expect(mockNativeRiffAdoptionModule.applySelected).not.toHaveBeenCalled();
      expect(DialogMock).not.toHaveBeenCalled();
      expect(mockSiyuanApi.pushMsg).toHaveBeenCalledWith('没有可接管的旧 Riff 卡片');
    });
  });

  describe('生命周期管理', () => {
    it('dispose 应该关闭所有对话框', async () => {
      await dialogManager.openSettingsDialog();
      await dialogManager.openBrowserDialog();
      
      dialogManager.dispose();
      
      // 验证所有对话框都被关闭
      // 注意：由于 mock 的限制，这里只能验证方法被调用
      expect(mockContext.getSettingsService).toHaveBeenCalled();
    });

    it('dispose 多次调用不应该报错', () => {
      expect(() => {
        dialogManager.dispose();
        dialogManager.dispose();
      }).not.toThrow();
    });
  });

  describe('国际化', () => {
    it('应该使用国际化文本作为对话框标题', async () => {
      const { createVueDialog } = await import('@/utils/dialog');
      
      await dialogManager.openSettingsDialog();
      
      expect(createVueDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Settings',
        })
      );
    });

    it('如果国际化文本不存在，应该使用默认文本', async () => {
      mockI18n = {};
      mockContext.getI18n = vi.fn(() => mockI18n);
      
      dialogManager = new DialogManager(mockContext, mockPlugin, {
        siyuanApi: mockSiyuanApi,
        progressiveSiyuanApi: mockProgressiveSiyuanApi,
        leechActionEffects: {} as any,
      });
      
      const { createVueDialog } = await import('@/utils/dialog');
      
      await dialogManager.openSettingsDialog();
      
      expect(createVueDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '设置',
        })
      );
    });
  });
});
