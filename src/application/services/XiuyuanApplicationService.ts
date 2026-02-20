/**
 * XiuyuanApplicationService - Xiuyuan 应用服务
 * 
 * @description
 * Xiuyuan 相关操作的主要入口点,提供统一的 API。
 * 作为表现层和应用层之间的桥梁。
 * 
 * **设计原则**：
 * - 应用服务模式：协调用例执行
 * - 依赖注入：通过构造函数注入依赖
 * - 薄包装：不包含业务逻辑,仅委托给 UseCase
 * - 统一接口：为表现层提供一致的 API
 * 
 * **职责**：
 * - 提供 Xiuyuan 创建、查询、删除的统一接口
 * - 委托具体业务逻辑给专门的 UseCase 类
 * - 处理用例之间的协调
 * 
 * **架构改进**：
 * ✅ 已创建专门的 UseCase 类
 * ✅ 应用服务作为纯粹的协调器
 * ✅ 符合 DDD 分层架构
 */

import { Result } from '@/types/result';
import { CreateXiuyuanFromBlocksCommand } from '../commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import { CreateListTemplateCardsCommand } from '../commands/xiuyuan/CreateListTemplateCardsCommand';
import { GetXiuyuanQuery, GetXiuyuanQueryResult } from '../queries/xiuyuan/GetXiuyuanQuery';
import { GetAllXiuyuansQuery, GetAllXiuyuansQueryResult } from '../queries/xiuyuan/GetAllXiuyuansQuery';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import {
  CreateXiuyuanFromBlocksUseCase,
  DeleteXiuyuanUseCase,
  GetXiuyuanQueryHandler,
  GetAllXiuyuansQueryHandler,
  CreateListTemplateCardsUseCase,
  CreateTemplateUseCase,
  GetTemplateQueryHandler,
  GetAllTemplatesQueryHandler
} from '../usecases/xiuyuan';

/**
 * Xiuyuan 应用服务
 * 
 * @class XiuyuanApplicationService
 */
export class XiuyuanApplicationService {
  // UseCase 实例
  private readonly createXiuyuanFromBlocksUseCase: CreateXiuyuanFromBlocksUseCase;
  private readonly deleteXiuyuanUseCase: DeleteXiuyuanUseCase;
  private readonly getXiuyuanQueryHandler: GetXiuyuanQueryHandler;
  private readonly getAllXiuyuansQueryHandler: GetAllXiuyuansQueryHandler;
  private readonly createListTemplateCardsUseCase: CreateListTemplateCardsUseCase;
  private readonly createTemplateUseCase: CreateTemplateUseCase;
  private readonly getTemplateQueryHandler: GetTemplateQueryHandler;
  private readonly getAllTemplatesQueryHandler: GetAllTemplatesQueryHandler;

  /**
   * 构造函数
   * 
   * @param xiuyuanRepository - Xiuyuan 仓储
   * @param templateRegistry - 模板注册表
   */
  constructor(
    xiuyuanRepository: IXiuyuanRepository,
    templateRegistry: Map<string, ICardTemplate>
  ) {
    // 初始化 UseCase 实例
    this.createXiuyuanFromBlocksUseCase = new CreateXiuyuanFromBlocksUseCase(
      xiuyuanRepository,
      templateRegistry
    );
    this.deleteXiuyuanUseCase = new DeleteXiuyuanUseCase(xiuyuanRepository);
    this.getXiuyuanQueryHandler = new GetXiuyuanQueryHandler(xiuyuanRepository);
    this.getAllXiuyuansQueryHandler = new GetAllXiuyuansQueryHandler(xiuyuanRepository);
    this.createListTemplateCardsUseCase = new CreateListTemplateCardsUseCase(
      xiuyuanRepository,
      templateRegistry
    );
    this.createTemplateUseCase = new CreateTemplateUseCase(templateRegistry);
    this.getTemplateQueryHandler = new GetTemplateQueryHandler(templateRegistry);
    this.getAllTemplatesQueryHandler = new GetAllTemplatesQueryHandler(templateRegistry);
  }

  /**
   * 从块创建 Xiuyuan
   * 
   * @param command - 创建命令
   * @returns Result<any> - 成功返回创建的 Xiuyuan 和卡片,失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.createFromBlocks({
   *   blockIds: ['block-1', 'block-2'],
   *   templateId: 'basic',
   *   fieldMapping: { question: 'block-1', answer: 'block-2' },
   *   deckId: 'deck-123',
   *   priority: 5
   * });
   * 
   * if (result.ok) {
   *   console.log('Created Xiuyuan:', result.value.xiuyuan.id);
   *   console.log('Created Cards:', result.value.cards.length);
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async createFromBlocks(command: CreateXiuyuanFromBlocksCommand): Promise<Result<any>> {
    return this.createXiuyuanFromBlocksUseCase.execute(command);
  }

  /**
   * 获取单个 Xiuyuan
   * 
   * @param query - 查询对象
   * @returns GetXiuyuanQueryResult - 查询结果
   * @throws Error 如果 Xiuyuan 不存在
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.getXiuyuan({ xiuyuanId: 'xiuyuan-123' });
   * console.log('Xiuyuan:', result.xiuyuan);
   * ```
   */
  async getXiuyuan(query: GetXiuyuanQuery): Promise<GetXiuyuanQueryResult> {
    return this.getXiuyuanQueryHandler.handle(query);
  }

  /**
   * 获取所有 Xiuyuan
   * 
   * @param _query - 查询对象（可选,当前未使用）
   * @returns GetAllXiuyuansQueryResult - 查询结果
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.getAllXiuyuans({});
   * console.log(`Total: ${result.total}`);
   * result.xiuyuans.forEach(x => console.log(x.id));
   * ```
   */
  async getAllXiuyuans(_query: GetAllXiuyuansQuery = {}): Promise<GetAllXiuyuansQueryResult> {
    return this.getAllXiuyuansQueryHandler.handle(_query);
  }

  /**
   * 删除 Xiuyuan
   * 
   * @param xiuyuanId - Xiuyuan ID
   * @returns Result<boolean> - 成功返回 true,失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.deleteXiuyuan('xiuyuan-123');
   * 
   * if (result.ok) {
   *   console.log('Deleted successfully');
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async deleteXiuyuan(xiuyuanId: string): Promise<Result<boolean>> {
    return this.deleteXiuyuanUseCase.execute(xiuyuanId);
  }

  /**
   * 获取模板
   * 
   * @param templateId - 模板 ID
   * @returns 模板对象
   * @throws Error 如果模板不存在
   * 
   * @example
   * ```typescript
   * const template = await xiuyuanService.getTemplate('basic');
   * console.log('Template:', template.name);
   * ```
   */
  async getTemplate(templateId: string): Promise<ICardTemplate> {
    const result = await this.getTemplateQueryHandler.handle({ templateId });
    return result.template;
  }

  /**
   * 获取所有模板
   * 
   * @returns 模板列表
   * 
   * @example
   * ```typescript
   * const templates = await xiuyuanService.getAllTemplates();
   * templates.forEach(t => console.log(t.id, t.name));
   * ```
   */
  async getAllTemplates(): Promise<ICardTemplate[]> {
    const result = await this.getAllTemplatesQueryHandler.handle({});
    return result.templates;
  }

  /**
   * 创建模板
   * 
   * @param template - 模板定义
   * @returns Result<void> - 成功返回 ok,失败返回错误
   * 
   * @description
   * 动态创建并注册一个新的卡片模板。
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.createTemplate({
   *   id: 'my-template',
   *   name: '我的模板',
   *   fields: [
   *     { name: 'question', description: '问题' },
   *     { name: 'answer', description: '答案' }
   *   ],
   *   cardRules: [
   *     {
   *       typeMarker: 'basic',
   *       frontFields: ['question'],
   *       backFields: ['answer']
   *     }
   *   ]
   * });
   * ```
   */
  async createTemplate(template: ICardTemplate): Promise<Result<void>> {
    return this.createTemplateUseCase.execute(template);
  }

  /**
   * 创建列表模板卡片
   * 
   * @param command - 创建命令
   * @returns Result<any> - 成功返回创建的 Xiuyuan 和卡片,失败返回错误
   * 
   * @description
   * 列表模板的特点：
   * - 1 个 Xiuyuan → N 张 FSRSCard（N = 子列表项数量）
   * - 每张卡片的问题相同（父列表项）,答案不同（各个子列表项）
   * - 支持提示功能：使用 `→` 分隔提示和答案
   * - 渐进式显示：复习时显示已学过的答案 + 当前提示
   * 
   * **DDD 架构优势**：
   * - ✅ 通过应用服务统一入口
   * - ✅ 使用专门的 UseCase 封装业务逻辑
   * - ✅ 便于添加事务、日志、权限等横切关注点
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.createListTemplateCards({
   *   parentBlockId: '20230101120000-parent',
   *   childBlockIds: ['20230101120001-child1', '20230101120002-child2'],
   *   templateId: 'builtin-list-item',
   *   deckId: 'default-deck',
   *   priority: 5
   * });
   * 
   * if (result.ok) {
   *   console.log('Created Xiuyuan:', result.value.xiuyuan.id);
   *   console.log('Created Cards:', result.value.cards.length);
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async createListTemplateCards(command: CreateListTemplateCardsCommand): Promise<Result<any>> {
    return this.createListTemplateCardsUseCase.execute(command);
  }
}
