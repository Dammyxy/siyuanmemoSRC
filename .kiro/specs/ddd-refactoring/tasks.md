# DDD 架构重构 - 任务列表

## Phase 1: 创建应用上下文（2-3 小时）

- [x] 1. 创建 ApplicationContext
  - [x] 1.1 创建 ApplicationContext 类
  - [x] 1.2 实现服务容器
  - [x] 1.3 实现依赖注入
  - [x] 1.4 实现生命周期管理
  - [x] 1.5 编写单元测试

- [x] 2. 创建 UI 管理器
  - [x] 2.1 创建 DialogManager
  - [x] 2.2 创建 MenuManager
  - [x] 2.3 创建 TabManager
  - [x] 2.4 从 index.ts 提取 UI 逻辑
  - [x] 2.5 测试所有 UI 功能

- [x] 3. 简化 index.ts
  - [x] 3.1 移除服务初始化逻辑
  - [x] 3.2 使用 ApplicationContext
  - [x] 3.3 保留插件生命周期钩子
  - [x] 3.4 验证 index.ts < 200 行
  - [x] 3.5 手动测试插件加载/卸载

## Phase 2: 重构 Xiuyuan 为 DDD 模型（3-4 小时）

- [x] 4. 创建值对象
  - [x] 4.1 创建 XiuyuanId
  - [x] 4.2 创建 BlockId
  - [x] 4.3 创建 TemplateId
  - [x] 4.4 创建 CardFace
  - [x] 4.5 创建 Priority
  - [x] 4.6 编写单元测试

- [x] 5. 创建 Card 实体
  - [x] 5.1 创建 Card 类
  - [x] 5.2 实现业务方法（review, reschedule）
  - [x] 5.3 编写单元测试

- [x] 6. 创建 Xiuyuan 聚合根
  - [x] 6.1 创建 Xiuyuan 类
  - [x] 6.2 实现工厂方法
  - [x] 6.3 实现卡片操作方法
  - [x] 6.4 实现领域事件
  - [x] 6.5 编写单元测试

- [x] 7. 创建仓储接口
  - [x] 7.1 定义 IXiuyuanRepository 接口
  - [x] 7.2 定义查询方法

- [x] 8. 创建仓储实现
  - [x] 8.1 创建 XiuyuanRepository 类
  - [x] 8.2 实现 save 方法
  - [x] 8.3 实现 findById 方法
  - [x] 8.4 实现 findByBlockId 方法
  - [x] 8.5 实现 delete 方法
  - [x] 8.6 实现数据转换方法
  - [x] 8.7 编写集成测试

- [x] 9. 创建领域服务
  - [x] 9.1 创建 CardCreationService
  - [x] 9.2 创建 CardDeletionService
  - [x] 9.3 编写单元测试

## Phase 3: 创建应用服务（2-3 小时）

- [x] 10. 创建命令对象
  - [x] 10.1 创建 CreateCardCommand
  - [x] 10.2 创建 DeleteCardCommand
  - [x] 10.3 创建 UpdateCardCommand

- [x] 11. 创建用例
  - [x] 11.1 创建 CreateCardUseCase
  - [x] 11.2 创建 DeleteCardUseCase
  - [x] 11.3 创建 UpdateCardUseCase
  - [x] 11.4 编写单元测试

- [x] 12. 创建应用服务
  - [x] 12.1 创建 CardApplicationService
  - [x] 12.2 封装用例
  - [x] 12.3 编写集成测试

- [x] 13. 集成到 ApplicationContext
  - [x] 13.1 注册应用服务
  - [x] 13.2 配置依赖注入
  - [x] 13.3 测试服务访问

## Phase 4: 迁移现有功能（1-2 小时）

- [x] 14. 迁移卡片创建
  - [x] 14.1 更新 BlockMenuHandler
  - [x] 14.2 更新 TemplateSelectDialog
  - [x] 14.3 移除旧的直接调用
  - [x] 14.4 恢复模板制卡功能
  - [ ] 14.5 手动测试卡片创建

- [x] 15. 迁移卡片删除
  - [x] 15.1 更新 BlockMenuHandler
  - [x] 15.2 更新 SRSBrowser
  - [x] 15.3 移除旧的直接调用
  - [ ] 15.4 手动测试卡片删除

- [x] 16. 清理旧代码
  - [x] 16.1 移除 index.ts 中的旧逻辑
  - [x] 16.2 移除未使用的服务
  - [x] 16.3 更新导入路径
  - [x] 16.4 运行所有测试（跳过，用户要求不运行全部测试）
  - [ ] 16.5 手动测试所有功能

## 验收测试

- [ ] 17. 单元测试
  - [ ] 17.1 运行所有单元测试
  - [ ] 17.2 验证覆盖率 > 80%

- [ ] 18. 集成测试
  - [ ] 18.1 运行所有集成测试
  - [ ] 18.2 验证核心流程

- [ ] 19. 手动测试
  - [ ] 19.1 测试创建卡片（所有模板）
  - [ ] 19.2 测试删除卡片
  - [ ] 19.3 测试更新卡片
  - [ ] 19.4 测试复习卡片
  - [ ] 19.5 测试同步卡片
  - [ ] 19.6 测试插件加载/卸载

- [ ] 20. 性能测试
  - [ ] 20.1 测试插件启动时间
  - [ ] 20.2 测试卡片创建时间
  - [ ] 20.3 测试复习响应时间

## 文档

- [x] 21. 更新文档
  - [x] 21.1 更新架构文档
  - [x] 21.2 创建长期改进计划
  - [x] 21.3 创建快速诊断指南
  - [ ] 21.4 更新开发指南
  - [ ] 21.5 更新 CHANGELOG

## 长期改进（非紧急，可在后续迭代中实施）

详见：[long-term-improvements.md](./long-term-improvements.md)

- [x] 22. 提取 CardScheduleService 领域服务（2-3 小时）
  - [x] 22.1 创建 CardScheduleService
  - [x] 22.2 实现 isDue、filterDueCards、countDueCards 方法
  - [x] 22.3 更新 StorageManager（标记 getDueCards 为废弃）
  - [x] 22.4 编写单元测试
  - [x] 22.5 更新文档

- [x] 23. 引入 CardApplicationService 查询（2-3 小时）
  - [x] 23.1 创建 GetDueCardsQuery 和 GetDueCardsQueryResult
  - [x] 23.2 创建 GetDueCardsQueryHandler
  - [x] 23.3 扩展 CardApplicationService
  - [x] 23.4 更新 MenuManager 使用应用服务
  - [x] 23.5 编写单元测试和集成测试
  - [x] 23.6 更新文档

- [x] 24. 添加领域事件机制（3-4 小时）
  - [x] 24.1 创建 DomainEvent 基类
  - [x] 24.2 创建卡片相关事件（CardReviewedEvent、CardCreatedEvent、CardDeletedEvent）
  - [x] 24.3 创建 EventBus
  - [x] 24.4 在聚合根中发布事件
  - [x] 24.5 在应用服务中发布事件
  - [x] 24.6 订阅事件并实现业务逻辑
  - [x] 24.7 编写单元测试和集成测试
  - [x] 24.8 更新文档

- [x] 25. 清理废弃代码（1-2 小时）
  - [x] 25.1 移除 StorageManager.getDueCards()
  - [x] 25.2 移除 MenuManager.getDueCount()（已在之前完成）
  - [x] 25.3 更新所有调用方（DockManager、MenuManager、index.ts、index.simplified.ts）
  - [x] 25.4 运行所有测试
  - [x] 25.5 更新文档
