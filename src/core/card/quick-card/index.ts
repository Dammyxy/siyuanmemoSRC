/**
 * 快速卡片渲染器 - 导出模块
 * 
 * @description 提供快速卡片渲染相关的所有导出
 */

import type { QuickCardRenderService } from './application/QuickCardRenderService';
import type { IQuickCardConfigProvider } from './infrastructure/QuickCardConfigProvider';

// Domain Layer
export { QuickCard } from './domain/QuickCard';
export { CardFace } from './domain/CardFace';
export type { QuickCardType, QuickCardMetadata, HiddenContentType, SiyuanBlock, CardFaceData } from './domain/types';
export { CardFaceStrategyFactory } from './domain/strategies/CardFaceStrategyFactory';
export type { ICardFaceStrategy } from './domain/strategies/ICardFaceStrategy';

// Infrastructure Layer
export { SiyuanBlockAdapter } from './infrastructure/SiyuanBlockAdapter';
export { QuickCardRepository } from './infrastructure/QuickCardRepository';
export {
  type IQuickCardConfigProvider,
  DefaultQuickCardConfigProvider,
  PluginQuickCardConfigProvider,
  getHiddenContentTypes,
} from './infrastructure/QuickCardConfigProvider';

// Application Layer
export { QuickCardRenderService } from './application/QuickCardRenderService';

// Errors
export {
  CardNotFoundError,
  InvalidCardTypeError,
  ParseError,
  ConfigError,
} from './domain/errors';

/**
 * 创建快速卡片渲染服务
 * 
 * @param configProvider - 配置提供者（可选）
 * @returns 快速卡片渲染服务实例
 * 
 * @example
 * ```typescript
 * // 使用默认配置
 * const service = createQuickCardRenderService();
 * 
 * // 使用插件配置
 * const service = createQuickCardRenderService(
 *   new PluginQuickCardConfigProvider(() => plugin.getContext().getSettingsService().getSettings())
 * );
 * ```
 */
export function createQuickCardRenderService(
  configProvider?: IQuickCardConfigProvider,
): QuickCardRenderService {
  // 动态导入以避免循环依赖
  const { SiyuanBlockAdapter: Adapter } = require('./infrastructure/SiyuanBlockAdapter');
  const { QuickCardRepository: Repository } = require('./infrastructure/QuickCardRepository');
  const { QuickCardRenderService: Service } = require('./application/QuickCardRenderService');
  
  const adapter = new Adapter();
  const repository = new Repository(adapter, configProvider);
  return new Service(repository);
}
