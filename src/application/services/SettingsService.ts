/**
 * SettingsService - 设置管理服务
 * 
 * @module SettingsService
 * @description
 * 应用层服务，负责管理插件设置和 Riff 集成配置。
 * 提供类型安全的设置访问接口，支持部分更新和验证。
 * 
 * **职责**：
 * - 管理插件设置的加载和保存
 * - 管理 Riff 集成配置的读写
 * - 验证设置的有效性
 * - 提供类型安全的设置访问接口
 * - 使用防抖机制避免频繁写入
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */

import type { IFileService } from '../../infrastructure/services/FileService';
import type { PluginSettings, RiffIntegrationConfig } from '../../types/settings';
import { DEFAULT_SETTINGS, DEFAULT_RIFF_CONFIG, FSRS_WEIGHT_COUNT, normalizePluginSettings } from '../../types/settings';
import { createLogger } from '@/utils/logger';
import { getDefaultSiyuanFlashcardConfig, readSiyuanFlashcardConfig } from '@/utils/siyuanFlashcardConfig';

const logger = createLogger('SettingsService');

/**
 * 设置服务接口
 */
export interface ISettingsService {
  /**
   * 初始化设置服务（加载设置）
   */
  init(): Promise<void>;
  
  /**
   * 获取插件设置
   */
  getSettings(): PluginSettings;
  
  /**
   * 更新插件设置
   * @param settings 部分设置（只更新提供的字段）
   */
  updateSettings(settings: Partial<PluginSettings>): Promise<void>;
  
  /**
   * 获取 Riff 集成配置
   */
  getRiffIntegrationConfig(): RiffIntegrationConfig;
  
  /**
   * 更新 Riff 集成配置
   * @param config 部分配置（只更新提供的字段）
   */
  updateRiffIntegrationConfig(config: Partial<RiffIntegrationConfig>): Promise<void>;
}

/**
 * 设置验证错误
 */
export class SettingsValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

/**
 * 设置服务实现
 */
export class SettingsService implements ISettingsService {
  private currentSettings: PluginSettings;
  private currentRiffConfig: RiffIntegrationConfig;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 300; // 300ms 防抖延迟
  
  // 存储文件名
  private readonly SETTINGS_FILE = 'settings.json';

  constructor(private readonly fileService: IFileService) {
    // 初始化为默认设置
    this.currentSettings = { ...DEFAULT_SETTINGS };
    this.currentRiffConfig = { ...DEFAULT_RIFF_CONFIG };
  }

  /**
   * 初始化设置服务（加载设置）
   */
  async init(): Promise<void> {
    try {
      // 加载插件设置
      const loadedSettings = await this.fileService.readJSON<PluginSettings>(this.SETTINGS_FILE);
      
      // 🔍 调试日志：检查从文件读取的原始数据
      logger.info('[SettingsService] Loaded settings from file:', loadedSettings?.quickCard);
      
      if (loadedSettings) {
        // 合并加载的设置和默认设置（处理新增字段）
        const mergedSettings = this.mergeWithDefaults(loadedSettings, DEFAULT_SETTINGS);
        const normalized = normalizePluginSettings(mergedSettings);
        this.currentSettings = normalized.settings;
        const seededQuickCardFlashcard = this.seedQuickCardFlashcardSettings();
        
        // 🔍 调试日志：检查合并后的数据
        logger.info('[SettingsService] Merged settings:', this.currentSettings.quickCard);
        
        // 🔧 修复：从 settings.json 中读取 riffIntegration 配置
        // 不再使用单独的 riff-integration.json 文件
        if (this.currentSettings.riffIntegration) {
          this.currentRiffConfig = this.currentSettings.riffIntegration;
        } else {
          this.currentRiffConfig = { ...DEFAULT_RIFF_CONFIG };
        }
        if (normalized.changed || seededQuickCardFlashcard) {
          await this.saveSettings();
          logger.info('[SettingsService] Persisted normalized or seeded settings');
        }
      } else {
        // 文件不存在，使用默认设置并保存
        this.currentSettings = { ...DEFAULT_SETTINGS };
        this.currentRiffConfig = { ...DEFAULT_RIFF_CONFIG };
        this.seedQuickCardFlashcardSettings();
        await this.saveSettings();
      }

      logger.info('[SettingsService] Settings initialized successfully');
    } catch (error) {
      logger.error('[SettingsService] Failed to initialize settings:', error);
      // 初始化失败时使用默认设置
      this.currentSettings = { ...DEFAULT_SETTINGS };
      this.currentRiffConfig = { ...DEFAULT_RIFF_CONFIG };
      throw error;
    }
  }

  /**
   * 获取插件设置
   */
  getSettings(): PluginSettings {
    // 返回深拷贝，防止外部修改
    return JSON.parse(JSON.stringify(this.currentSettings));
  }

  /**
   * 更新插件设置
   * @param settings 部分设置（只更新提供的字段）
   */
  async updateSettings(settings: Partial<PluginSettings>): Promise<void> {
    try {
      // 验证设置
      this.validateSettings(settings);

      // 深度合并设置
      this.currentSettings = this.deepMerge(this.currentSettings, settings);

      // 防抖保存
      this.debouncedSaveSettings();
    } catch (error) {
      logger.error('[SettingsService] Failed to update settings:', error);
      throw error;
    }
  }

  /**
   * 获取 Riff 集成配置
   */
  getRiffIntegrationConfig(): RiffIntegrationConfig {
    // 返回深拷贝，防止外部修改
    return JSON.parse(JSON.stringify(this.currentRiffConfig));
  }

  /**
   * 更新 Riff 集成配置
   * @param config 部分配置（只更新提供的字段）
   */
  async updateRiffIntegrationConfig(config: Partial<RiffIntegrationConfig>): Promise<void> {
    try {
      // 验证配置
      this.validateRiffConfig(config);

      // 深度合并配置
      this.currentRiffConfig = this.deepMerge(this.currentRiffConfig, config);
      
      // 🔧 修复：同时更新 currentSettings.riffIntegration
      this.currentSettings.riffIntegration = this.currentRiffConfig;

      // 🔧 修复：保存到 settings.json 而不是单独的文件
      this.debouncedSaveSettings();
    } catch (error) {
      logger.error('[SettingsService] Failed to update Riff integration config:', error);
      throw error;
    }
  }

  /**
   * 验证插件设置
   */
  private validateSettings(settings: Partial<PluginSettings>): void {
    // 验证 FSRS 参数
    if (settings.fsrs) {
      const { requestRetention, maximumInterval, weights } = settings.fsrs;
      
      if (requestRetention !== undefined) {
        if (requestRetention < 0.7 || requestRetention > 0.99) {
          throw new SettingsValidationError(
            'requestRetention must be between 0.7 and 0.99',
            'fsrs.requestRetention'
          );
        }
      }
      
      if (maximumInterval !== undefined) {
        if (maximumInterval < 1) {
          throw new SettingsValidationError(
            'maximumInterval must be at least 1',
            'fsrs.maximumInterval'
          );
        }
      }
      
      if (weights !== undefined) {
        if (!Array.isArray(weights) || weights.length !== FSRS_WEIGHT_COUNT) {
          throw new SettingsValidationError(
            `weights must be an array of ${FSRS_WEIGHT_COUNT} numbers`,
            'fsrs.weights'
          );
        }
      }
    }

    // 验证每日卡片数量
    if (settings.newCardsPerDay !== undefined) {
      if (settings.newCardsPerDay < 0) {
        throw new SettingsValidationError(
          'newCardsPerDay must be non-negative',
          'newCardsPerDay'
        );
      }
    }

    if (settings.reviewsPerDay !== undefined) {
      if (settings.reviewsPerDay < 0) {
        throw new SettingsValidationError(
          'reviewsPerDay must be non-negative',
          'reviewsPerDay'
        );
      }
    }

    // 验证优先级
    if (settings.defaultPriority !== undefined) {
      if (settings.defaultPriority < 0 || settings.defaultPriority > 100) {
        throw new SettingsValidationError(
          'defaultPriority must be between 0 and 100',
          'defaultPriority'
        );
      }
    }

    if (settings.priorityRandomness !== undefined) {
      if (settings.priorityRandomness < 0 || settings.priorityRandomness > 1) {
        throw new SettingsValidationError(
          'priorityRandomness must be between 0 and 1',
          'priorityRandomness'
        );
      }
    }

    const addToOutstandingEveryNth = settings.queues?.addToOutstandingEveryNth;
    if (addToOutstandingEveryNth !== undefined) {
      if (!Number.isFinite(addToOutstandingEveryNth) || addToOutstandingEveryNth < 1 || addToOutstandingEveryNth > 100) {
        throw new SettingsValidationError(
          'queues.addToOutstandingEveryNth must be between 1 and 100',
          'queues.addToOutstandingEveryNth'
        );
      }
    }

    const autoSortEnabled = settings.queues?.autoSort?.enabled;
    if (autoSortEnabled !== undefined && typeof autoSortEnabled !== 'boolean') {
      throw new SettingsValidationError(
        'queues.autoSort.enabled must be a boolean',
        'queues.autoSort.enabled'
      );
    }

    const autoPostponeEnabled = settings.queues?.autoPostpone?.enabled;
    if (autoPostponeEnabled !== undefined && typeof autoPostponeEnabled !== 'boolean') {
      throw new SettingsValidationError(
        'queues.autoPostpone.enabled must be a boolean',
        'queues.autoPostpone.enabled'
      );
    }

    const autoPostponeSkipTopN = settings.queues?.autoPostpone?.skipTopNElements;
    if (autoPostponeSkipTopN !== undefined) {
      if (!Number.isFinite(autoPostponeSkipTopN) || autoPostponeSkipTopN < 0 || autoPostponeSkipTopN > 2000) {
        throw new SettingsValidationError(
          'queues.autoPostpone.skipTopNElements must be between 0 and 2000',
          'queues.autoPostpone.skipTopNElements'
        );
      }
    }

    const quickCardFlashcard = settings.quickCard?.flashcard;
    if (quickCardFlashcard) {
      for (const [key, value] of Object.entries(quickCardFlashcard)) {
        if (value !== undefined && typeof value !== 'boolean') {
          throw new SettingsValidationError(
            `quickCard.flashcard.${key} must be a boolean`,
            `quickCard.flashcard.${key}`
          );
        }
      }
    }

    const neuralHistory = settings.queues?.neuralRoam?.history;
    if (neuralHistory) {
      this.validateFiniteRange(
        neuralHistory.maxEntries,
        200,
        5000,
        'queues.neuralRoam.history.maxEntries'
      );
    }

    const hyperspace = settings.queues?.neuralRoam?.hyperspace;
    if (hyperspace) {
      if (hyperspace.treeChannels?.blockTree !== undefined && typeof hyperspace.treeChannels.blockTree !== 'boolean') {
        throw new SettingsValidationError(
          'queues.neuralRoam.hyperspace.treeChannels.blockTree must be a boolean',
          'queues.neuralRoam.hyperspace.treeChannels.blockTree'
        );
      }

      if (hyperspace.treeChannels?.documentTree !== undefined && typeof hyperspace.treeChannels.documentTree !== 'boolean') {
        throw new SettingsValidationError(
          'queues.neuralRoam.hyperspace.treeChannels.documentTree must be a boolean',
          'queues.neuralRoam.hyperspace.treeChannels.documentTree'
        );
      }

      this.validateFiniteRange(
        hyperspace.maxLayersPerRepetition,
        1,
        5,
        'queues.neuralRoam.hyperspace.maxLayersPerRepetition'
      );
      this.validateFiniteRange(
        hyperspace.maxTotalDepth,
        1,
        16,
        'queues.neuralRoam.hyperspace.maxTotalDepth'
      );
      this.validateFiniteRange(
        hyperspace.conceptLinkGroupPriority,
        0,
        1,
        'queues.neuralRoam.hyperspace.conceptLinkGroupPriority'
      );
      this.validateFiniteRange(
        hyperspace.elementLinkGroupPriority,
        0,
        1,
        'queues.neuralRoam.hyperspace.elementLinkGroupPriority'
      );
      this.validateFiniteRange(
        hyperspace.treeChildGroupPriority,
        0,
        1,
        'queues.neuralRoam.hyperspace.treeChildGroupPriority'
      );
      this.validateFiniteRange(
        hyperspace.treeParentGroupPriority,
        0,
        1,
        'queues.neuralRoam.hyperspace.treeParentGroupPriority'
      );
      this.validateFiniteRange(
        hyperspace.treeSiblingBaseGroupPriority,
        0,
        1,
        'queues.neuralRoam.hyperspace.treeSiblingBaseGroupPriority'
      );
      this.validateFiniteRange(
        hyperspace.siblingDistancePenalty,
        0,
        5,
        'queues.neuralRoam.hyperspace.siblingDistancePenalty'
      );
      this.validateFiniteRange(
        hyperspace.articleRootParentConductionProbability,
        0,
        1,
        'queues.neuralRoam.hyperspace.articleRootParentConductionProbability'
      );
      this.validateFiniteRange(
        hyperspace.activationCarryDecay,
        0,
        1,
        'queues.neuralRoam.hyperspace.activationCarryDecay'
      );
      this.validateFiniteRange(
        hyperspace.raceRandomness,
        0,
        1,
        'queues.neuralRoam.hyperspace.raceRandomness'
      );
    }
  }

  /**
   * 验证 Riff 集成配置
   */
  private validateRiffConfig(config: Partial<RiffIntegrationConfig>): void {
    // 验证模式
    if (config.mode !== undefined) {
      if (config.mode !== 'advanced' && config.mode !== 'simple') {
        throw new SettingsValidationError(
          'mode must be "advanced" or "simple"',
          'mode'
        );
      }
    }

    // 验证全量同步间隔
    if (config.fullSync?.interval !== undefined) {
      if (config.fullSync.interval < 0) {
        throw new SettingsValidationError(
          'fullSync.interval must be non-negative',
          'fullSync.interval'
        );
      }
    }

    // 验证增量同步触发器
    if (config.incrementalSync?.triggers !== undefined) {
      const validTriggers = ['plugin-start', 'browser-open', 'review-open'];
      for (const trigger of config.incrementalSync.triggers) {
        if (!validTriggers.includes(trigger)) {
          throw new SettingsValidationError(
            `Invalid trigger: ${trigger}. Must be one of: ${validTriggers.join(', ')}`,
            'incrementalSync.triggers'
          );
        }
      }
    }

    if (config.storageConflictResolution !== undefined) {
      const validStrategies = ['merge', 'prefer-local', 'prefer-remote'];
      if (!validStrategies.includes(config.storageConflictResolution)) {
        throw new SettingsValidationError(
          `Invalid storageConflictResolution: ${config.storageConflictResolution}. Must be one of: ${validStrategies.join(', ')}`,
          'storageConflictResolution'
        );
      }
    }
  }

  /**
   * 防抖保存设置
   */
  private debouncedSaveSettings(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      await this.saveSettings();
      this.saveDebounceTimer = null;
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * 防抖保存 Riff 配置
   * @deprecated 不再使用，Riff 配置现在保存在 settings.json 中
   */
  public debouncedSaveRiffConfig(): void {
    // 🔧 修复：Riff 配置现在保存在 settings.json 中
    this.debouncedSaveSettings();
  }

  /**
   * 立即保存设置
   */
  private async saveSettings(): Promise<void> {
    try {
      await this.fileService.writeJSON(this.SETTINGS_FILE, this.currentSettings);
      logger.info('[SettingsService] Settings saved successfully');
    } catch (error) {
      logger.error('[SettingsService] Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * 立即保存 Riff 配置
   * @deprecated 不再使用，Riff 配置现在保存在 settings.json 中
   */
  public async saveRiffConfig(): Promise<void> {
    // 🔧 修复：Riff 配置现在保存在 settings.json 中
    await this.saveSettings();
  }

  /**
   * 深度合并对象
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
    const sourceRecord = source as Record<string, unknown>;

    for (const key of Object.keys(sourceRecord)) {
      const sourceValue = sourceRecord[key];
      const targetValue = result[key];

      if (this.isPlainObject(sourceValue) && this.isPlainObject(targetValue)) {
        // 递归合并对象
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Partial<Record<string, unknown>>
        );
      } else {
        // 直接赋值
        result[key] = sourceValue;
      }
    }

    return result as T;
  }

  /**
   * 合并加载的设置和默认设置
   */
  private mergeWithDefaults<T>(loaded: Partial<T>, defaults: T): T {
    return this.deepMerge(defaults, loaded);
  }

  private seedQuickCardFlashcardSettings(): boolean {
    if (this.currentSettings.quickCard?.flashcardSeededFromSiyuan === true) {
      return false;
    }

    const flashcard = readSiyuanFlashcardConfig() ?? getDefaultSiyuanFlashcardConfig();
    this.currentSettings = this.deepMerge(this.currentSettings, {
      quickCard: {
        flashcard,
        flashcardSeededFromSiyuan: true,
      },
    } as Partial<PluginSettings>);

    logger.info('[SettingsService] Seeded quickCard.flashcard settings from Siyuan config', {
      flashcard,
    });
    return true;
  }

  /**
   * 检查是否是普通对象
   */
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]'
    );
  }

  private validateFiniteRange(value: unknown, min: number, max: number, field: string): void {
    if (value === undefined) {
      return;
    }
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
      throw new SettingsValidationError(
        `${field} must be between ${min} and ${max}`,
        field
      );
    }
  }

  /**
   * 清理资源并立即保存配置
   * 
   * 在插件卸载时调用,确保所有待保存的配置都被写入文件
   */
  async dispose(): Promise<void> {
    // 清除防抖定时器
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    // 立即保存配置
    try {
      await this.saveSettings();
      logger.info('[SettingsService] Settings saved on dispose');
    } catch (error) {
      logger.error('[SettingsService] Failed to save settings on dispose:', error);
    }
  }
}
