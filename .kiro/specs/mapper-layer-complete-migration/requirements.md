# 需求文档：DDD 映射层完整迁移

## 简介

本需求文档定义了 xiuyuan 系统 DDD 映射层的完整迁移需求。系统需要修复现有映射层的所有语法错误、完善 Result 类型处理、集成映射层到存储管理器，并确保向后兼容性。

## 术语表

- **System**: xiuyuan 卡片管理系统
- **CardMapper**: 卡片映射器，负责在领域模型和持久化模型之间转换
- **Card_Entity**: 卡片领域实体，包含业务逻辑
- **CardPersistenceDTO**: 卡片持久化数据传输对象
- **FSRSCard**: 传统卡片接口，用于向后兼容
- **CardRepository**: 卡片仓储，封装持久化逻辑
- **UnifiedStorageManager**: 统一存储管理器
- **Result_Type**: 结果类型，用于显式错误处理
- **Xiuyuan**: 修远卡片元数据实体

## 需求

### 需求 1：修复 CardMapper 语法错误

**用户故事**：作为开发者，我希望 CardMapper 没有语法错误，以便代码可以正常编译和运行。

#### 验收标准

1. WHEN CardMapper 被编译时，THEN THE System SHALL 不产生任何语法错误
2. WHEN fromEntity 方法被调用时，THEN THE System SHALL 正确将 Card Entity 转换为 CardPersistenceDTO
3. WHEN toEntity 方法被调用时，THEN THE System SHALL 正确将 CardPersistenceDTO 转换为 Card Entity
4. WHEN fromEntityBatch 方法被调用时，THEN THE System SHALL 正确批量转换 Card Entity 数组
5. WHEN toEntityBatch 方法被调用时，THEN THE System SHALL 正确批量转换 CardPersistenceDTO 数组

### 需求 2：完善 Result 类型处理

**用户故事**：作为开发者，我希望所有可能失败的操作都返回 Result 类型，以便显式处理错误。

#### 验收标准

1. WHEN Card Entity 创建失败时，THEN THE System SHALL 返回包含错误信息的 Result
2. WHEN CardMapper.toEntity 转换失败时，THEN THE System SHALL 返回包含错误信息的 Result
3. WHEN CardMapper.toEntityBatch 转换失败时，THEN THE System SHALL 返回包含所有错误信息的 Result
4. WHEN Card Entity 的值对象创建失败时，THEN THE System SHALL 正确访问 Result 的 error 属性
5. WHEN Result 类型被使用时，THEN THE System SHALL 强制调用者显式处理成功和失败情况

### 需求 3：修复 CardRepository 方法调用

**用户故事**：作为开发者，我希望 CardRepository 调用的所有方法都存在，以便仓储可以正常工作。

#### 验收标准

1. WHEN CardRepository.save 被调用时，THEN THE System SHALL 使用 CardMapper.fromEntity 转换实体
2. WHEN CardRepository.findById 被调用时，THEN THE System SHALL 使用 CardMapper.toEntity 转换 DTO
3. WHEN CardRepository 查询方法被调用时，THEN THE System SHALL 正确处理 Result 类型
4. WHEN CardRepository 批量操作被调用时，THEN THE System SHALL 使用批量转换方法
5. WHEN CardRepository 操作失败时，THEN THE System SHALL 返回包含错误信息的 Result

### 需求 4：集成映射层到 UnifiedStorageManager

**用户故事**：作为开发者，我希望 UnifiedStorageManager 支持 DTO 操作，以便完整使用映射层。

#### 验收标准

1. WHEN UnifiedStorageManager 保存卡片时，THEN THE System SHALL 接受 CardPersistenceDTO 作为参数
2. WHEN UnifiedStorageManager 加载卡片时，THEN THE System SHALL 返回 CardPersistenceDTO
3. WHEN UnifiedStorageManager 批量操作时，THEN THE System SHALL 支持 DTO 数组
4. WHEN UnifiedStorageManager 使用 DTO 时，THEN THE System SHALL 正确提取顶层 Xiuyuan 字段
5. WHEN UnifiedStorageManager 重建索引时，THEN THE System SHALL 使用 DTO 的顶层字段

### 需求 5：确保向后兼容性

**用户故事**：作为系统维护者，我希望现有代码继续工作，以便迁移不会破坏现有功能。

#### 验收标准

1. WHEN 现有代码使用 FSRSCard 接口时，THEN THE System SHALL 继续支持该接口
2. WHEN CardMapper.toDomain 被调用时，THEN THE System SHALL 返回 FSRSCard
3. WHEN CardMapper.toPersistence 被调用时，THEN THE System SHALL 接受 FSRSCard
4. WHEN UnifiedStorageManager 使用 FSRSCard 时，THEN THE System SHALL 正确转换为 DTO
5. WHEN 新旧接口混合使用时，THEN THE System SHALL 保持数据一致性

### 需求 6：添加完整测试覆盖

**用户故事**：作为开发者，我希望有完整的测试覆盖，以便验证映射层的正确性。

#### 验收标准

1. WHEN CardMapper 测试运行时，THEN THE System SHALL 验证所有转换方法的正确性
2. WHEN CardRepository 测试运行时，THEN THE System SHALL 验证所有 CRUD 操作
3. WHEN 集成测试运行时，THEN THE System SHALL 验证端到端的数据流
4. WHEN 测试失败时，THEN THE System SHALL 提供清晰的错误信息
5. WHEN 测试覆盖率检查时，THEN THE System SHALL 达到至少 80% 的代码覆盖率

### 需求 7：数据一致性验证

**用户故事**：作为系统维护者，我希望映射层保证数据一致性，以便数据在转换过程中不丢失或损坏。

#### 验收标准

1. WHEN 数据从 Entity 转换为 DTO 再转换回 Entity 时，THEN THE System SHALL 保持数据完全一致（往返属性）
2. WHEN Xiuyuan 字段被提取到顶层时，THEN THE System SHALL 从 meta 中移除这些字段
3. WHEN DTO 转换为 Entity 时，THEN THE System SHALL 将顶层 Xiuyuan 字段合并回 meta
4. WHEN 批量转换时，THEN THE System SHALL 保证所有卡片的数据一致性
5. WHEN 转换失败时，THEN THE System SHALL 不修改原始数据

### 需求 8：性能优化

**用户故事**：作为系统用户，我希望映射层操作高效，以便不影响系统性能。

#### 验收标准

1. WHEN 单个卡片转换时，THEN THE System SHALL 在 1ms 内完成
2. WHEN 批量转换 1000 个卡片时，THEN THE System SHALL 在 100ms 内完成
3. WHEN 索引更新时，THEN THE System SHALL 使用 DTO 的顶层字段避免解析 meta
4. WHEN 查询 Xiuyuan 卡片时，THEN THE System SHALL 直接使用顶层 xiuyuanID 索引
5. WHEN 内存使用时，THEN THE System SHALL 不创建不必要的中间对象
