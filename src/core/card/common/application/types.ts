/**
 * 卡片通用类型定义
 * 
 * 这些类型被所有卡片类型共享使用
 */

/**
 * 面包屑项
 */
export interface BreadcrumbItem {
  id: string;
  name: string;
  type: string;
}

/**
 * 卡片视图模型基接口
 * 
 * 所有卡片视图模型都应该包含这些基础字段
 */
export interface BaseCardViewModel {
  blockId: string;
  breadcrumbs: BreadcrumbItem[];
}
