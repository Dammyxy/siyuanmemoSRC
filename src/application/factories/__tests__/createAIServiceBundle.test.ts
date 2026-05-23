import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import { AIWorkbenchSessionStoreService } from '@/application/services/AIWorkbenchSessionStoreService';
import { ArenaKernelService } from '@/application/services/ArenaKernelService';
import { ArenaStoreService } from '@/application/services/ArenaStoreService';
import { ReviewAIWorkbenchRegistry } from '@/application/services/ReviewAIWorkbenchRegistry';
import { createAIServiceBundle } from '../createAIServiceBundle';

describe('createAIServiceBundle', () => {
  it('creates typed AI service factories without ApplicationContext locator access', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/application/factories/createAIServiceBundle.ts'),
      'utf8',
    );
    let registry: ReviewAIWorkbenchRegistry | null = null;
    const bundle = createAIServiceBundle({
      getFileService: () => ({ readJSON: vi.fn(), writeJSON: vi.fn() } as never),
      getSqlArenaRepository: () => null,
      getSettingsService: () => ({
        getSettings: () => ({ ai: { providers: [] }, arena: {}, fsrs: {} }),
        updateSettings: vi.fn(async () => undefined),
      } as never),
      getReviewLogService: () => ({ listReviewLogsForCard: vi.fn(async () => []) } as never),
      getPluginApp: () => ({}),
      getCardContentQueryService: () => ({} as never),
      getXiuyuanApplicationService: vi.fn(async () => ({} as never)),
      getSelectionExcerptService: () => ({} as never),
      getSelectionTopicContinuationService: () => ({} as never),
      getAIWorkbenchSessionStoreService: () => ({} as never),
      getArenaStoreService: () => ({} as never),
      getArenaKernelService: () => ({} as never),
      getReviewAIWorkbenchRegistry: () => {
        if (!registry) {
          registry = bundle.createReviewAIWorkbenchRegistry();
        }
        return registry;
      },
      getBackendMigrationRuntimePolicy: () => ({
        flags: { aiBackendRuntime: false },
        capabilities: { aiBackendSessionEnabled: false },
      } as never),
      getSrsBackendClient: () => null,
      getKernelSidecarClient: () => ({} as never),
    });

    expect(source).toContain('AIServiceBundle');
    expect(source).not.toContain('ApplicationContext');
    expect(bundle.createAIWorkbenchSessionStoreService()).toBeInstanceOf(AIWorkbenchSessionStoreService);
    expect(bundle.createArenaStoreService()).toBeInstanceOf(ArenaStoreService);
    expect(bundle.createArenaKernelService()).toBeInstanceOf(ArenaKernelService);
    expect(bundle.createReviewAIWorkbenchRegistry()).toBeInstanceOf(ReviewAIWorkbenchRegistry);
    expect(bundle.createAIWorkbenchService()).toBeInstanceOf(AIWorkbenchService);
  });
});
