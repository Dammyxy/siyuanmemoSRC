/**
 * TabApplicationService - 标签页应用服务
 * 
 * 负责协调标签页相关的业务逻辑，统一管理文档和自定义标签页的打开。
 * 
 * @module application/services/TabApplicationService
 */

import type { App, TProtyleAction } from 'siyuan';
import { openTab } from 'siyuan';

/**
 * 标签页位置
 */
export type TabPosition = 'right' | 'bottom';

/**
 * 打开文档标签页选项
 */
export interface OpenDocumentTabOptions {
  /** 文档 ID */
  docId: string;
  /** 标签页位置 */
  position?: TabPosition;
  /** 是否保持光标位置 */
  keepCursor?: boolean;
  /** 原型动作 */
  action?: TProtyleAction[];
  /** 是否缩放 */
  zoomIn?: boolean;
}

/**
 * 打开自定义标签页选项
 */
export interface OpenCustomTabOptions {
  /** 标签页位置 */
  position?: TabPosition;
  /** 自定义配置 */
  custom: {
    /** 图标 */
    icon: string;
    /** 标题 */
    title: string;
    /** 自定义数据 */
    data?: unknown;
    /** ID */
    id?: string;
  };
}

function buildCustomTabId(custom: OpenCustomTabOptions['custom']): string {
  if (custom.id && custom.id.trim().length > 0) {
    return custom.id;
  }

  const titleSlug = custom.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `siyuanmemo-${titleSlug || custom.icon || 'custom-tab'}`;
}

/**
 * 标签页应用服务
 * 
 * 提供统一的标签页管理接口，隔离 UI 层与思源 API 的直接依赖。
 */
export class TabApplicationService {
  constructor(private readonly app: App) {}

  /**
   * 打开文档标签页
   * 
   * @param options 打开选项
   * @returns Promise<void>
   * 
   * @example
   * ```typescript
   * await tabService.openDocumentTab({
   *   docId: 'block-id',
   *   position: 'right'
   * });
   * ```
   */
  async openDocumentTab(options: OpenDocumentTabOptions): Promise<void> {
    const {
      docId,
      position = 'right',
      keepCursor = false,
      action,
      zoomIn = false,
    } = options;

    await openTab({
      app: this.app,
      doc: {
        id: docId,
        action,
        zoomIn,
      },
      position,
      keepCursor,
    });
  }

  /**
   * 打开自定义标签页
   * 
   * @param options 打开选项
   * @returns Promise<void>
   * 
   * @example
   * ```typescript
   * await tabService.openCustomTab({
   *   position: 'right',
   *   custom: {
   *     icon: 'iconCard',
   *     title: 'SRS Browser',
   *     id: 'srs-browser'
   *   }
   * });
   * ```
   */
  async openCustomTab(options: OpenCustomTabOptions): Promise<void> {
    const { position = 'right', custom } = options;
    const normalizedCustom = {
      ...custom,
      id: buildCustomTabId(custom),
    };

    await openTab({
      app: this.app,
      custom: normalizedCustom,
      position,
    });
  }

  /**
   * 打开卡片标签页
   * 
   * @param cardType 卡片类型（'all' | 'doc'）
   * @param docId 文档 ID（当 cardType 为 'doc' 时需要）
   * @param position 标签页位置
   * @returns Promise<void>
   */
  async openCardTab(
    cardType: 'all' | 'doc',
    docId?: string,
    position: TabPosition = 'right'
  ): Promise<void> {
    await openTab({
      app: this.app,
      card: {
        type: cardType,
        ...(docId && { id: docId }),
      },
      position,
    });
  }
}
