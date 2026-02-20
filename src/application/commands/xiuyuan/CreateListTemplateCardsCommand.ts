/**
 * CreateListTemplateCardsCommand - 创建列表模板卡片命令
 * 
 * @description
 * 用于创建列表模板类型的 Xiuyuan 卡片。
 * 列表模板的特点是：1 个 Xiuyuan → N 张 FSRSCard（N = 子列表项数量）
 * 
 * **命令参数**：
 * - parentBlockId: 父列表项 ID（问题）
 * - childBlockIds: 子列表项 ID 列表（答案）
 * - templateId: 模板 ID（通常是 'builtin-list-item'）
 * - deckId: 卡包 ID（可选，默认为内置卡包）
 * - priority: 优先级（可选，默认为 50）
 * 
 * @example
 * ```typescript
 * const command: CreateListTemplateCardsCommand = {
 *   parentBlockId: '20230101120000-parent',
 *   childBlockIds: ['20230101120001-child1', '20230101120002-child2'],
 *   templateId: 'builtin-list-item',
 *   deckId: 'default-deck',
 *   priority: 5
 * };
 * 
 * const result = await xiuyuanService.createListTemplateCards(command);
 * ```
 */
export interface CreateListTemplateCardsCommand {
  /** 父列表项 ID（问题） */
  parentBlockId: string;
  
  /** 子列表项 ID 列表（答案） */
  childBlockIds: string[];
  
  /** 模板 ID */
  templateId: string;
  
  /** 卡包 ID（可选，默认为内置卡包） */
  deckId?: string;
  
  /** 优先级（可选，默认为 50） */
  priority?: number;
}
