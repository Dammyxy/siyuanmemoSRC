/**
 * 快速卡片错误类型
 * 
 * @description 定义快速卡片系统中可能出现的错误类型
 */

/**
 * 卡片未找到错误
 * 
 * @description 当请求的块 ID 不存在或无法访问时抛出
 */
export class CardNotFoundError extends Error {
  constructor(blockId: string) {
    super(`Card not found: ${blockId}`);
    this.name = 'CardNotFoundError';
  }
}

/**
 * 无效卡片类型错误
 * 
 * @description 当检测到未知的卡片类型时抛出
 */
export class InvalidCardTypeError extends Error {
  constructor(type: string) {
    super(`Invalid card type: ${type}`);
    this.name = 'InvalidCardTypeError';
  }
}

/**
 * 解析错误
 * 
 * @description 当解析块内容失败时抛出
 */
export class ParseError extends Error {
  constructor(message: string, public readonly content?: string) {
    super(`Parse error: ${message}`);
    this.name = 'ParseError';
  }
}

/**
 * 配置错误
 * 
 * @description 当配置无效或缺失时抛出
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(`Config error: ${message}`);
    this.name = 'ConfigError';
  }
}
