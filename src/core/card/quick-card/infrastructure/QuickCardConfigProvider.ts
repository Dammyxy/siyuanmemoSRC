import type { QuickCardSettings } from '@/types/settings';
import type { HiddenContentType } from '../domain/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QuickCardConfigProvider');

/**
 * 快速卡片配置提供者接口
 * 
 * @description 定义获取快速卡片配置的接口
 */
export interface IQuickCardConfigProvider {
  /**
   * 获取快速卡片配置
   * 
   * @returns 快速卡片配置
   */
  getConfig(): QuickCardSettings;
}

/**
 * 默认配置提供者
 * 
 * @description 提供默认的快速卡片配置
 */
export class DefaultQuickCardConfigProvider implements IQuickCardConfigProvider {
  private static readonly DEFAULT_CONFIG: QuickCardSettings = {
    enabled: true,
    enabledSymbols: {
      basic: true,
      concept: true,
      descriptor: true,
      cloze: true,
      multiLine: true,
    },
    debounceDelay: {
      quick: 300,
      list: 2000,
    },
    descriptorUseXiuyuan: false,
  };

  getConfig(): QuickCardSettings {
    return DefaultQuickCardConfigProvider.DEFAULT_CONFIG;
  }
}

/**
 * 插件配置提供者
 * 
 * @description 从插件存储中获取快速卡片配置
 */
export class PluginQuickCardConfigProvider implements IQuickCardConfigProvider {
  constructor(private readonly getSettings: () => any) {}

  getConfig(): QuickCardSettings {
    try {
      const settings = this.getSettings();
      const quickCardConfig = settings?.quickCard;

      if (!quickCardConfig) {
        logger.warn('[QuickCardConfigProvider] No quickCard config found, using defaults');
        return new DefaultQuickCardConfigProvider().getConfig();
      }

      return quickCardConfig;
    } catch (error) {
      logger.error('[QuickCardConfigProvider] Failed to get config:', error);
      return new DefaultQuickCardConfigProvider().getConfig();
    }
  }
}

/**
 * 获取隐藏内容类型列表
 * 
 * @description 根据卡片类型返回应该隐藏的内容类型
 * @param cardType - 卡片类型
 * @returns 隐藏内容类型列表
 */
export function getHiddenContentTypes(cardType: string): HiddenContentType[] {
  switch (cardType) {
    case 'concept':
    case 'cloze':
      return ['mark'];
    case 'multiLine':
      return ['list'];
    case 'descriptor':
      // Descriptor 可配置是否隐藏 mark
      return [];
    default:
      return [];
  }
}
