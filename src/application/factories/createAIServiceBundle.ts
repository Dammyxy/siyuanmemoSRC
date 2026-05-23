import { AIBackendSessionService } from '@/application/services/AIBackendSessionService';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import { AIWorkbenchSessionStoreService } from '@/application/services/AIWorkbenchSessionStoreService';
import { ArenaKernelService } from '@/application/services/ArenaKernelService';
import { ArenaStoreService } from '@/application/services/ArenaStoreService';
import type { CardContentQueryService } from '@/application/queries/CardContentQueryService';
import type { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import type { SettingsService } from '@/application/services/SettingsService';
import type { ReviewLogService } from '@/application/services/ReviewLogService';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import type { SelectionExcerptService } from '@/application/services/SelectionExcerptService';
import type { SelectionTopicContinuationService } from '@/application/services/SelectionTopicContinuationService';
import { ReviewAIWorkbenchRegistry } from '@/application/services/ReviewAIWorkbenchRegistry';
import { ReviewLogLearningCurveEvidenceReader } from '@/application/services/SrsTransparencyEvidenceReader';
import type { BackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import { AISiyuanAdapter } from '@/infrastructure/siyuan/AISiyuanAdapter';
import { KernelAINetworkProxyAdapter } from '@/infrastructure/ai/KernelAINetworkProxyAdapter';
import { OpenAICompatibleLLMAdapter } from '@/infrastructure/llm/OpenAICompatibleLLMAdapter';
import type { FileService } from '@/infrastructure/services/FileService';
import type { SqlArenaRepository } from '@/infrastructure/persistence/sqlite';

export interface CreateAIServiceBundleDeps {
  getFileService: () => FileService;
  getSqlArenaRepository: () => SqlArenaRepository | null;
  getSettingsService: () => SettingsService;
  getReviewLogService: () => ReviewLogService;
  getPluginApp: () => unknown;
  getCardContentQueryService: () => CardContentQueryService;
  getXiuyuanApplicationService: () => Promise<XiuyuanApplicationService>;
  getSelectionExcerptService: () => SelectionExcerptService;
  getSelectionTopicContinuationService: () => SelectionTopicContinuationService;
  getAIWorkbenchSessionStoreService: () => AIWorkbenchSessionStoreService;
  getArenaStoreService: () => ArenaStoreService;
  getArenaKernelService: () => ArenaKernelService;
  getReviewAIWorkbenchRegistry: () => ReviewAIWorkbenchRegistry;
  getBackendMigrationRuntimePolicy: () => BackendMigrationRuntimePolicy;
  getSrsBackendClient: () => SrsBackendClient | null;
  getKernelSidecarClient: () => KernelSidecarClient;
}

export interface AIServiceBundle {
  createAIWorkbenchSessionStoreService: () => AIWorkbenchSessionStoreService;
  createArenaStoreService: () => ArenaStoreService;
  createArenaKernelService: () => ArenaKernelService;
  createReviewAIWorkbenchRegistry: () => ReviewAIWorkbenchRegistry;
  createAIWorkbenchService: () => AIWorkbenchService;
}

export function createAIServiceBundle(deps: CreateAIServiceBundleDeps): AIServiceBundle {
  return {
    createAIWorkbenchSessionStoreService: () => new AIWorkbenchSessionStoreService(deps.getFileService()),
    createArenaStoreService: () => new ArenaStoreService(
      deps.getFileService(),
      deps.getSqlArenaRepository(),
    ),
    createArenaKernelService: () => new ArenaKernelService({
      getArenaSettings: () => deps.getSettingsService().getSettings().arena,
      updateArenaSettings: async (updater) => {
        const settingsService = deps.getSettingsService();
        await settingsService.updateSettings({
          arena: updater(settingsService.getSettings().arena),
        });
      },
      getFsrsParams: () => deps.getSettingsService().getSettings().fsrs,
      arenaStore: deps.getArenaStoreService(),
      evidenceReader: new ReviewLogLearningCurveEvidenceReader(deps.getReviewLogService()),
    }),
    createReviewAIWorkbenchRegistry: () => {
      const runtimePolicy = deps.getBackendMigrationRuntimePolicy();
      const backendClient = deps.getSrsBackendClient();
      const aiBackendSessionService = runtimePolicy.capabilities.aiBackendSessionEnabled
        && backendClient
        ? new AIBackendSessionService({
            backendClient,
            networkProxy: new KernelAINetworkProxyAdapter(deps.getKernelSidecarClient()),
            resolveSecret: (name) => resolveAISecret(deps.getSettingsService(), name),
          })
        : undefined;
      return new ReviewAIWorkbenchRegistry({
        getAISettings: () => deps.getSettingsService().getSettings().ai,
        updateAISettings: async (updater) => {
          const settingsService = deps.getSettingsService();
          const currentAi = settingsService.getSettings().ai;
          await settingsService.updateSettings({
            ai: updater(currentAi),
          });
        },
        cardContentQueryService: deps.getCardContentQueryService(),
        siyuanPort: new AISiyuanAdapter(deps.getPluginApp()),
        llmPort: new OpenAICompatibleLLMAdapter(),
        getXiuyuanApplicationService: () => deps.getXiuyuanApplicationService(),
        getSelectionExcerptService: () => deps.getSelectionExcerptService(),
        getSelectionTopicContinuationService: () => deps.getSelectionTopicContinuationService(),
        sessionStore: deps.getAIWorkbenchSessionStoreService(),
        arenaKernel: deps.getArenaKernelService(),
        backendRuntimeEnabled: runtimePolicy.flags.aiBackendRuntime,
        backendSessionService: aiBackendSessionService,
      });
    },
    createAIWorkbenchService: () => deps.getReviewAIWorkbenchRegistry().getStandaloneService(),
  };
}

function resolveAISecret(settingsService: SettingsService, name: unknown): string | null {
  const key = String(name || '').trim();
  if (!key) {
    return null;
  }
  const settings = settingsService.getSettings().ai;
  const providers = Array.isArray(settings?.providers) ? settings.providers : [];
  for (const provider of providers) {
    const providerRecord = provider as Record<string, unknown>;
    const providerApiKey = String(providerRecord.apiKey || '').trim();
    if (key === 'apiKey' && providerApiKey) {
      return providerApiKey;
    }
    const providerId = String(providerRecord.id || '').trim();
    if (providerId && key === `${providerId}:apiKey` && providerApiKey) {
      return providerApiKey;
    }
  }
  return null;
}
