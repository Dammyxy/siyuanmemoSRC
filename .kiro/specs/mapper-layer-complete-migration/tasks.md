# 实施计划：DDD 映射层完整迁移

## 概述

本实施计划将 DDD 映射层迁移分解为一系列可执行的编码任务。每个任务都是独立的、可测试的，并且引用了具体的需求。

## 任务

- [x] 1. 修复 CardMapper 语法错误
  - 将 `fromEntity`、`toEntity`、`fromEntityBatch`、`toEntityBatch` 方法移到 CardMapper 类内部
  - 确保所有方法都是 static 方法
  - 修复方法签名和返回类型
  - 确保 TypeScript 编译通过
  - _需求：1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 1.1 编写 CardMapper 单元测试
  - 测试 fromEntity 方法的基本功能
  - 测试 toEntity 方法的基本功能
  - 测试批量转换方法
  - 测试边界条件（空数组、undefined 字段）
  - _需求：6.1_

- [x] 2. 完善 Card Entity 的 Result 类型处理
  - 修复 Card 构造函数中的 Result 错误访问
  - 使用类型守卫（`!result.ok`）正确访问 error 属性
  - 确保所有值对象创建都正确处理 Result
  - 更新 updatePriority 方法的 Result 处理
  - _需求：2.1, 2.4_

- [x] 2.1 编写 Card Entity Result 处理测试
  - 测试无效输入返回 err
  - 测试有效输入返回 ok
  - 测试 updatePriority 的 Result 处理
  - _需求：2.1, 2.4_

- [x] 3. 修复 CardRepository 方法调用
  - 将所有 `CardMapper.fromEntity` 调用替换为正确的方法
  - 将所有 `CardMapper.toEntity` 调用替换为正确的方法
  - 确保所有 Result 类型都正确处理
  - 更新 findById、findByBlockId、findByXiuyuanId 等方法
  - _需求：3.1, 3.2, 3.3, 3.5_

- [x] 3.1 编写 CardRepository 单元测试
  - 测试 save 方法
  - 测试 findById 方法
  - 测试查询方法（findByBlockId、findByXiuyuanId）
  - 测试错误处理
  - _需求：6.2_

- [ ] 4. 扩展 UnifiedStorageManager 支持 DTO
  - [x] 4.1 添加 cardDTOs 存储字段
    - 添加 `private cardDTOs: Map<string, CardPersistenceDTO> = new Map()`
    - _需求：4.1_
  
  - [x] 4.2 实现 DTO CRUD 方法
    - 实现 `createCardDTO(xiuyuan: IXiuyuan, dto: CardPersistenceDTO)`
    - 实现 `getCardDTO(cardId: string)`
    - 实现 `updateCardDTO(dto: CardPersistenceDTO)`
    - 实现 `batchCreateCardsDTO(xiuyuan: IXiuyuan, dtos: CardPersistenceDTO[])`
    - _需求：4.1, 4.2, 4.3_
  
  - [x] 4.3 实现 updateIndexesForDTO 方法
    - 使用 DTO 的顶层 xiuyuanID 字段更新索引
    - 避免解析 meta 对象
    - 支持 add 和 remove 操作
    - _需求：4.4, 4.5_
  
  - [x] 4.4 更新现有 FSRSCard 方法以使用 DTO
    - 修改 `createCard` 内部调用 `createCardDTO`
    - 修改 `updateCard` 内部调用 `updateCardDTO`
    - 保持 FSRSCard 接口不变（向后兼容）
    - _需求：5.1, 5.4_
  
  - [x] 4.5 更新持久化方法
    - 修改 `getStoreData` 同时返回 cardDTOs
    - 修改 `load` 方法加载 cardDTOs
    - 修改 `save` 方法保存 cardDTOs
    - _需求：4.2_

- [x] 4.6 编写 UnifiedStorageManager DTO 操作测试
  - 测试 createCardDTO 方法
  - 测试 getCardDTO 方法
  - 测试 updateCardDTO 方法
  - 测试批量操作
  - 测试索引更新
  - _需求：4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. 检查点 - 确保所有单元测试通过
  - 运行 `npm run test:run`
  - 确保所有测试通过
  - 如有问题，询问用户

- [ ] 6. 编写属性测试
  - [x] 6.1 编写 Entity-DTO 往返属性测试
    - **属性 1：Entity-DTO 往返一致性**
    - **验证：需求 7.1, 1.2, 1.3**
    - 使用 fast-check 生成随机 Card Entity
    - 转换为 DTO 再转换回 Entity
    - 验证所有字段值相同
  
  - [x] 6.2 编写 FSRSCard-DTO 往返属性测试
    - **属性 2：FSRSCard-DTO 往返一致性**
    - **验证：需求 7.1, 5.2, 5.3**
    - 使用 fast-check 生成随机 FSRSCard
    - 转换为 DTO 再转换回 FSRSCard
    - 验证所有字段值相同
  
  - [x] 6.3 编写 Xiuyuan 字段提取属性测试
    - **属性 3：Xiuyuan 字段提取正确性**
    - **验证：需求 7.2, 4.4**
    - 生成包含 Xiuyuan 元数据的 FSRSCard
    - 转换为 DTO
    - 验证顶层包含 xiuyuanID、templateID 等字段
    - 验证 meta 中不包含这些字段
  
  - [x] 6.4 编写 Xiuyuan 字段合并属性测试
    - **属性 4：Xiuyuan 字段合并正确性**
    - **验证：需求 7.3, 4.4**
    - 生成包含顶层 Xiuyuan 字段的 DTO
    - 转换为 FSRSCard
    - 验证 meta 中包含这些字段
  
  - [x] 6.5 编写批量转换属性测试
    - **属性 5：批量转换长度保持**
    - **属性 6：批量转换元素正确性**
    - **验证：需求 1.4, 7.4**
    - 生成随机 Card Entity 数组
    - 批量转换为 DTO 数组
    - 验证数组长度相同
    - 验证每个元素都正确转换
  
  - [x] 6.6 编写错误处理属性测试
    - **属性 7：错误输入返回 Err**
    - **属性 8：批量转换错误收集**
    - **验证：需求 2.1, 2.2, 2.3**
    - 生成无效的 CardProps
    - 验证 Card.create 返回 err
    - 生成包含无效 DTO 的数组
    - 验证 toEntityBatch 返回包含所有错误的 Result
  
  - [x] 6.7 编写 Repository 属性测试
    - **属性 9：Repository 保存-加载一致性**
    - **验证：需求 3.1, 3.2, 5.5**
    - 生成随机 Card Entity
    - 保存后再加载
    - 验证得到等价的实体
  
  - [x] 6.8 编写索引属性测试
    - **属性 10：DTO 索引使用顶层字段**
    - **验证：需求 4.5**
    - 生成包含 xiuyuanID 的 DTO
    - 保存到 UnifiedStorageManager
    - 通过 getCardsByXiuyuanId 查询
    - 验证能找到该卡片
  
  - [x] 6.9 编写向后兼容性属性测试
    - **属性 11：向后兼容性保持**
    - **验证：需求 5.1, 5.4**
    - 生成随机 FSRSCard
    - 使用旧接口保存
    - 使用新接口加载
    - 验证得到正确的 DTO
  
  - [x] 6.10 编写不变性属性测试
    - **属性 12：转换不修改原始数据**
    - **验证：需求 7.5**
    - 生成 Card Entity
    - 尝试失败的转换
    - 验证原始 Entity 未被修改

- [ ] 7. 检查点 - 确保所有属性测试通过
  - 运行 `npm run test:run`
  - 确保所有属性测试通过（至少 100 次迭代）
  - 如有问题，询问用户

- [ ] 8. 编写集成测试
  - [ ] 8.1 编写完整保存-加载流程测试
    - 创建 Card Entity
    - 通过 CardRepository 保存
    - 通过 CardRepository 加载
    - 验证数据一致性
    - _需求：6.3_
  
  - [ ] 8.2 编写新旧接口混合使用测试
    - 使用 FSRSCard 接口保存
    - 使用 Card Entity 接口加载
    - 验证数据一致性
    - _需求：5.5_
  
  - [ ] 8.3 编写索引构建和查询测试
    - 批量创建包含 Xiuyuan 字段的卡片
    - 验证索引正确构建
    - 通过各种查询方法验证索引
    - _需求：4.5_
  
  - [ ] 8.4 编写数据一致性验证测试
    - 创建混合数据（Xiuyuan 卡片和普通卡片）
    - 执行各种操作（创建、更新、删除）
    - 验证数据一致性
    - _需求：7.1, 7.2, 7.3_

- [ ] 9. 最终检查点 - 运行所有测试并检查覆盖率
  - 运行 `npm run test:coverage`
  - 确保代码覆盖率至少 80%
  - 确保所有关键路径都被覆盖
  - 如有问题，询问用户

- [ ] 10. 更新文档
  - 更新 CardMapper 的 JSDoc 注释
  - 更新 CardRepository 的 JSDoc 注释
  - 更新 UnifiedStorageManager 的 JSDoc 注释
  - 添加迁移指南（如何从旧接口迁移到新接口）
  - _需求：所有需求_

## 注意事项

- 标记为 `*` 的任务是可选的测试任务，可以根据时间和优先级决定是否实施
- 每个检查点任务都应该暂停并询问用户是否继续
- 所有属性测试都应该配置为至少运行 100 次迭代
- 使用 fast-check 库进行属性测试
- 每个属性测试都应该包含注释，引用设计文档中的属性编号和需求编号
