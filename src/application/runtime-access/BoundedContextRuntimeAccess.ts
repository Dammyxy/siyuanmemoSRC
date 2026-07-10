import type { Plugin } from 'siyuan';
import type { FollowerCommandClient } from '@/application/clients/FollowerCommandClient';
import type { FrontendInstanceRuntime } from '@/application/clients/FrontendInstanceRuntime';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import type { DialogManager } from '@/application/managers/DialogManager';
import type { DocTreeReviewScopeService } from '@/application/services/DocTreeReviewScopeService';
import type { BrowserApplicationService } from '@/application/services/BrowserApplicationService';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { NeuralRoamEntryActionService } from '@/application/services/NeuralRoamEntryActionService';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { SelectionExcerptService } from '@/application/services/SelectionExcerptService';
import type { SelectionTopicContinuationService } from '@/application/services/SelectionTopicContinuationService';
import type { SettingsService } from '@/application/services/SettingsService';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import type { SchedulerRouter } from '@/core/scheduler';
import type { StorageManager } from '@/core/storage';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';

import {
  createBindOnceCallbackPort,
  type BindOnceCallbackPort,
  type BoundCallback,
} from './BindOnceCallbackPort';

type Provider<T> = () => T;

function requireProvider<T>(
  provider: Provider<T> | undefined,
  moduleName: string,
  memberName: string,
): T {
  if (!provider) {
    throw new Error(`${moduleName.toUpperCase()}_UNAVAILABLE: ${memberName} is unavailable`);
  }
  return provider();
}

abstract class DisposableRuntimeAccess {
  private disposed = false;

  protected assertAvailable(moduleName: string): void {
    if (this.disposed) {
      throw new Error(`RUNTIME_ACCESS_DISPOSED: ${moduleName} is disposed`);
    }
  }

  protected markDisposed(): void {
    this.disposed = true;
  }
}

export interface ReviewRuntimeAccessDeps {
  reviewService: Provider<ReviewApplicationService>;
  backendClient: Provider<SrsBackendClient | null>;
  unifiedStorage?: Provider<UnifiedStorageManager>;
  unifiedDataSourceManager?: Provider<UnifiedDataSourceManager>;
  scheduler?: Provider<SchedulerRouter>;
  settingsService?: Provider<SettingsService>;
  frontendInstanceRuntime?: Provider<FrontendInstanceRuntime | null>;
  followerCommandClient?: Provider<FollowerCommandClient | null>;
}

export class ReviewRuntimeAccess extends DisposableRuntimeAccess {
  constructor(private readonly deps: ReviewRuntimeAccessDeps) {
    super();
  }

  get reviewService(): ReviewApplicationService {
    this.assertAvailable('ReviewRuntimeAccess');
    return this.deps.reviewService();
  }

  get backendClient(): SrsBackendClient | null {
    this.assertAvailable('ReviewRuntimeAccess');
    return this.deps.backendClient();
  }

  get unifiedStorage(): UnifiedStorageManager {
    this.assertAvailable('ReviewRuntimeAccess');
    return requireProvider(
      this.deps.unifiedStorage,
      'REVIEW_RUNTIME',
      'UnifiedStorageManager',
    );
  }

  get unifiedDataSourceManager(): UnifiedDataSourceManager {
    this.assertAvailable('ReviewRuntimeAccess');
    return requireProvider(
      this.deps.unifiedDataSourceManager,
      'REVIEW_RUNTIME',
      'UnifiedDataSourceManager',
    );
  }

  get scheduler(): SchedulerRouter {
    this.assertAvailable('ReviewRuntimeAccess');
    return requireProvider(this.deps.scheduler, 'REVIEW_RUNTIME', 'SchedulerRouter');
  }

  get settingsService(): SettingsService {
    this.assertAvailable('ReviewRuntimeAccess');
    return requireProvider(this.deps.settingsService, 'REVIEW_RUNTIME', 'SettingsService');
  }

  get frontendInstanceRuntime(): FrontendInstanceRuntime | null {
    this.assertAvailable('ReviewRuntimeAccess');
    return requireProvider(
      this.deps.frontendInstanceRuntime,
      'REVIEW_RUNTIME',
      'FrontendInstanceRuntime',
    );
  }

  get followerCommandClient(): FollowerCommandClient | null {
    this.assertAvailable('ReviewRuntimeAccess');
    return requireProvider(
      this.deps.followerCommandClient,
      'REVIEW_RUNTIME',
      'FollowerCommandClient',
    );
  }

  requireBackendClient(): SrsBackendClient {
    const backendClient = this.backendClient;
    if (!backendClient) {
      throw new Error('REVIEW_RUNTIME_UNAVAILABLE: SRS backend client is unavailable');
    }
    return backendClient;
  }

  dispose(): void {
    this.markDisposed();
  }
}

export interface BrowserQueueRuntimeAccessDeps {
  browserService: Provider<BrowserApplicationService>;
  backendClient: Provider<SrsBackendClient | null>;
  unifiedStorage?: Provider<UnifiedStorageManager>;
  unifiedDataSourceManager?: Provider<UnifiedDataSourceManager>;
  frontendInstanceRuntime?: Provider<FrontendInstanceRuntime | null>;
  followerCommandClient?: Provider<FollowerCommandClient | null>;
  browserDeckReadPort?: Provider<BrowserDeckReadPort | null>;
}

export class BrowserQueueRuntimeAccess extends DisposableRuntimeAccess {
  constructor(private readonly deps: BrowserQueueRuntimeAccessDeps) {
    super();
  }

  get browserService(): BrowserApplicationService {
    this.assertAvailable('BrowserQueueRuntimeAccess');
    return this.deps.browserService();
  }

  get backendClient(): SrsBackendClient | null {
    this.assertAvailable('BrowserQueueRuntimeAccess');
    return this.deps.backendClient();
  }

  get unifiedStorage(): UnifiedStorageManager {
    this.assertAvailable('BrowserQueueRuntimeAccess');
    return requireProvider(
      this.deps.unifiedStorage,
      'BROWSER_QUEUE_RUNTIME',
      'UnifiedStorageManager',
    );
  }

  get unifiedDataSourceManager(): UnifiedDataSourceManager {
    this.assertAvailable('BrowserQueueRuntimeAccess');
    return requireProvider(
      this.deps.unifiedDataSourceManager,
      'BROWSER_QUEUE_RUNTIME',
      'UnifiedDataSourceManager',
    );
  }

  get frontendInstanceRuntime(): FrontendInstanceRuntime | null {
    this.assertAvailable('BrowserQueueRuntimeAccess');
    return requireProvider(
      this.deps.frontendInstanceRuntime,
      'BROWSER_QUEUE_RUNTIME',
      'FrontendInstanceRuntime',
    );
  }

  get followerCommandClient(): FollowerCommandClient | null {
    this.assertAvailable('BrowserQueueRuntimeAccess');
    return requireProvider(
      this.deps.followerCommandClient,
      'BROWSER_QUEUE_RUNTIME',
      'FollowerCommandClient',
    );
  }

  get browserDeckReadPort(): BrowserDeckReadPort | null {
    this.assertAvailable('BrowserQueueRuntimeAccess');
    return requireProvider(
      this.deps.browserDeckReadPort,
      'BROWSER_QUEUE_RUNTIME',
      'BrowserDeckReadPort',
    );
  }

  requireBackendClient(): SrsBackendClient {
    const backendClient = this.backendClient;
    if (!backendClient) {
      throw new Error('BROWSER_QUEUE_RUNTIME_UNAVAILABLE: SRS backend client is unavailable');
    }
    return backendClient;
  }

  dispose(): void {
    this.markDisposed();
  }
}

export interface ProgressiveRuntimeAccessDeps<TRequest = unknown, TResult = unknown> {
  executeProgressiveCommand?: BoundCallback<[TRequest], TResult | Promise<TResult>>;
  executeProgressiveCommandPort?: BindOnceCallbackPort<[TRequest], TResult | Promise<TResult>>;
}

export class ProgressiveRuntimeAccess<TRequest = unknown, TResult = unknown>
  extends DisposableRuntimeAccess {
  private readonly executePort: BindOnceCallbackPort<[TRequest], TResult | Promise<TResult>>;

  constructor(deps: ProgressiveRuntimeAccessDeps<TRequest, TResult> = {}) {
    super();
    this.executePort = deps.executeProgressiveCommandPort
      ?? createBindOnceCallbackPort('progressive-runtime.execute');
    if (deps.executeProgressiveCommand) {
      this.executePort.bind(deps.executeProgressiveCommand);
    }
  }

  bindExecuteProgressiveCommand(
    callback: BoundCallback<[TRequest], TResult | Promise<TResult>>,
  ): void {
    this.assertAvailable('ProgressiveRuntimeAccess');
    this.executePort.bind(callback);
  }

  executeProgressiveCommand(request: TRequest): TResult | Promise<TResult> {
    this.assertAvailable('ProgressiveRuntimeAccess');
    return this.executePort.invoke(request);
  }

  dispose(): void {
    this.executePort.dispose();
    this.markDisposed();
  }
}

export interface IntegrationRuntimeAccessDeps<TRequest = Record<string, unknown>, TResult = unknown> {
  executeAgentTool?: BoundCallback<[TRequest], TResult | Promise<TResult>>;
  executeAgentToolPort?: BindOnceCallbackPort<[TRequest], TResult | Promise<TResult>>;
}

export interface IntegrationRuntimeBindings {
  plugin: Plugin;
  storage: StorageManager;
  cardService: CardApplicationService;
  unifiedDataSourceManager: UnifiedDataSourceManager;
  neuralRoamEntryActionService: NeuralRoamEntryActionService;
  xiuyuanApplicationService: Promise<XiuyuanApplicationService>;
  reviewService: ReviewApplicationService;
  docTreeReviewScopeService: DocTreeReviewScopeService;
  selectionExcerptService: SelectionExcerptService;
  selectionTopicContinuationService: SelectionTopicContinuationService;
  settingsService: SettingsService;
  dialogManager: DialogManager;
}

export class IntegrationRuntimeAccess<
  TRequest = Record<string, unknown>,
  TResult = unknown,
> extends DisposableRuntimeAccess {
  private readonly executeAgentToolPort:
    BindOnceCallbackPort<[TRequest], TResult | Promise<TResult>>;
  private readonly runtimeBindingsPort =
    createBindOnceCallbackPort<[], IntegrationRuntimeBindings>('integration-runtime.services');

  constructor(deps: IntegrationRuntimeAccessDeps<TRequest, TResult> = {}) {
    super();
    this.executeAgentToolPort = deps.executeAgentToolPort
      ?? createBindOnceCallbackPort('integration-runtime.agent-tool');
    if (deps.executeAgentTool) {
      this.executeAgentToolPort.bind(deps.executeAgentTool);
    }
  }

  bindExecuteAgentTool(
    callback: BoundCallback<[TRequest], TResult | Promise<TResult>>,
  ): void {
    this.assertAvailable('IntegrationRuntimeAccess');
    this.executeAgentToolPort.bind(callback);
  }

  bindRuntime(bindings: IntegrationRuntimeBindings): void {
    this.assertAvailable('IntegrationRuntimeAccess');
    this.runtimeBindingsPort.bind(() => bindings);
  }

  get plugin(): Plugin {
    return this.runtimeBindings().plugin;
  }

  get storage(): StorageManager {
    return this.runtimeBindings().storage;
  }

  get cardService(): CardApplicationService {
    return this.runtimeBindings().cardService;
  }

  get unifiedDataSourceManager(): UnifiedDataSourceManager {
    return this.runtimeBindings().unifiedDataSourceManager;
  }

  get neuralRoamEntryActionService(): NeuralRoamEntryActionService {
    return this.runtimeBindings().neuralRoamEntryActionService;
  }

  get xiuyuanApplicationService(): Promise<XiuyuanApplicationService> {
    return this.runtimeBindings().xiuyuanApplicationService;
  }

  get reviewService(): ReviewApplicationService {
    return this.runtimeBindings().reviewService;
  }

  get docTreeReviewScopeService(): DocTreeReviewScopeService {
    return this.runtimeBindings().docTreeReviewScopeService;
  }

  get selectionExcerptService(): SelectionExcerptService {
    return this.runtimeBindings().selectionExcerptService;
  }

  get selectionTopicContinuationService(): SelectionTopicContinuationService {
    return this.runtimeBindings().selectionTopicContinuationService;
  }

  get settingsService(): SettingsService {
    return this.runtimeBindings().settingsService;
  }

  get dialogManager(): DialogManager {
    return this.runtimeBindings().dialogManager;
  }

  executeAgentTool(request: TRequest): TResult | Promise<TResult> {
    this.assertAvailable('IntegrationRuntimeAccess');
    return this.executeAgentToolPort.invoke(request);
  }

  dispose(): void {
    this.executeAgentToolPort.dispose();
    this.runtimeBindingsPort.dispose();
    this.markDisposed();
  }

  private runtimeBindings(): IntegrationRuntimeBindings {
    this.assertAvailable('IntegrationRuntimeAccess');
    return this.runtimeBindingsPort.invoke();
  }
}
