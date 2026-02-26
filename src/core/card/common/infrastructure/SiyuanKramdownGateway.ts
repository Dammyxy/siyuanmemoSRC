import { createLogger } from '@/utils/logger';

interface LoggerLike {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface SiyuanApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

interface BlockKramdownData {
  id: string;
  kramdown: string;
}

interface LuteInstance {
  SpinBlockDOM?: (kramdown: string) => string;
  Md2BlockDOM?: (kramdown: string) => string;
}

interface LuteFactoryContainer {
  New?: () => LuteInstance;
}

export interface KramdownRenderOptions {
  stripAttributeLines?: boolean;
  preferSpinBlockDOM?: boolean;
}

const gatewayLogger = createLogger('SiyuanKramdownGateway');

/**
 * Shared infrastructure gateway for Siyuan kramdown fetch + render flow.
 */
export class SiyuanKramdownGateway {
  private readonly logger: LoggerLike;

  constructor(logger?: LoggerLike) {
    this.logger = logger ?? gatewayLogger;
  }

  private readLuteFactory(): LuteFactoryContainer | null {
    const lute = (window as Window & { Lute?: unknown }).Lute;
    if (!lute || typeof lute !== 'object') {
      return null;
    }
    return lute as LuteFactoryContainer;
  }

  async getBlockKramdown(blockId: string): Promise<string | null> {
    try {
      const response = await fetch('/api/block/getBlockKramdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: blockId }),
      });

      if (!response.ok) {
        this.logger.warn('Failed to get kramdown', {
          blockId,
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      const result: SiyuanApiResponse<BlockKramdownData> = await response.json();
      if (result.code !== 0 || !result.data) {
        this.logger.warn('Invalid getBlockKramdown response', {
          blockId,
          code: result.code,
          msg: result.msg,
        });
        return null;
      }

      return result.data.kramdown || '';
    } catch (error) {
      this.logger.error('Error getting kramdown', { blockId, error });
      return null;
    }
  }

  kramdownToHtml(kramdown: string, options: KramdownRenderOptions = {}): string {
    try {
      this.logger.debug('kramdownToHtml called', {
        preview: kramdown.substring(0, 100),
        options,
      });

      const luteContainer = this.readLuteFactory();
      const luteFactory = luteContainer?.New;
      if (typeof luteFactory !== 'function') {
        this.logger.warn('Lute not available, returning raw kramdown');
        return kramdown;
      }

      const lute: LuteInstance = luteFactory.call(luteContainer);
      const content = options.stripAttributeLines ? this.stripAttributeLines(kramdown) : kramdown;

      const html = this.renderWithLute(content, lute, Boolean(options.preferSpinBlockDOM));
      return html || kramdown;
    } catch (error) {
      this.logger.error('Failed to render kramdown', error);
      return kramdown;
    }
  }

  private renderWithLute(kramdown: string, lute: LuteInstance, preferSpin: boolean): string {
    if (preferSpin && typeof lute.SpinBlockDOM === 'function') {
      this.logger.debug('Using SpinBlockDOM');
      return lute.SpinBlockDOM(kramdown);
    }

    if (typeof lute.Md2BlockDOM === 'function') {
      this.logger.debug('Using Md2BlockDOM');
      return lute.Md2BlockDOM(kramdown);
    }

    if (!preferSpin && typeof lute.SpinBlockDOM === 'function') {
      this.logger.debug('Fallback to SpinBlockDOM');
      return lute.SpinBlockDOM(kramdown);
    }

    this.logger.warn('No suitable Lute render method found');
    return kramdown;
  }

  private stripAttributeLines(kramdown: string): string {
    return kramdown
      .split('\n')
      .filter((line) => !line.trim().startsWith('{:'))
      .join('\n');
  }
}
