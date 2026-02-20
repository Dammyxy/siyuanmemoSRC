# GetCardQuery 错误处理修复

## 修复日期
2024-02-20

## 问题描述

**错误信息**：
```
[SiYuanMemo][HybridSync] Incremental sync failed: Error: Card not found: 20211020084142-v4m7d1n
at GetCardQueryHandler.execute (plugin:siyuan-plugin-siyuanmemo:105169:13)
```

**影响**：
- HybridSync（增量同步）在启动时失败
- 插件初始化失败
- 用户无法使用插件

## DDD 架构审视

### 问题根源

`GetCardQueryHandler` 在卡片不存在时抛出异常，而不是返回 `null` 或使用 Result 模式。

```typescript
// ❌ 旧实现
async execute(query: GetCardQuery): Promise<GetCardQueryResult> {
  const card = this.storageManager.getCard(query.cardId);
  
  if (!card) {
    throw new Error(`Card not found: ${query.cardId}`);  // 抛出异常
  }
  
  return { card };
}
```

### 违反的 DDD 原则

1. **错误处理原则**
   - 查询不存在的资源不应该是异常情况
   - 这是正常的业务场景，应该优雅处理

2. **Result 模式**
   - 应该使用 Result 类型来表示成功/失败
   - 而不是强制调用者使用 try-catch

3. **防御性编程**
   - 调用者需要处理"卡片不存在"的情况
   - 但当前设计强制使用异常处理

### 业务场景分析

在 `XiuyuanSyncService.incrementalSync()` 中：

```typescript
// 代码期望 getCard() 返回 null 当卡片不存在时
const result = await this.cardApplicationService.getCard({ cardId: riffCard.id });
const localCard = result.card;  // 期望 card 可以是 null

if (!localCard) {
  // 处理卡片不存在的情况（添加新卡片）
  console.log(`[SiYuanMemo][HybridSync] Adding new card ${riffCard.id}`);
  // ...
} else {
  // 处理卡片已存在的情况（更新卡片）
  console.log(`[SiYuanMemo][HybridSync] Updating card ${riffCard.id}`);
  // ...
}
```

这是一个典型的"查询-检查-操作"模式，卡片不存在是正常的业务流程。

## 修复方案

### 方案选择

考虑了两种符合 DDD 的方案：

**方案 1：返回 null（选择）**
```typescript
async execute(query: GetCardQuery): Promise<GetCardQueryResult> {
  const card = this.storageManager.getCard(query.cardId);
  return { card: card || null };  // 不抛出异常
}
```

**优点**：
- 简单直接，不需要大规模重构
- 符合当前代码的期望
- "卡片不存在"是正常的业务场景，不是异常

**方案 2：使用 Result 模式（未选择）**
```typescript
async execute(query: GetCardQuery): Promise<Result<GetCardQueryResult, CardNotFoundError>> {
  const card = this.storageManager.getCard(query.cardId);
  
  if (!card) {
    return Result.err(new CardNotFoundError(query.cardId));
  }
  
  return Result.ok({ card });
}
```

**优点**：
- 更符合 DDD 的错误处理模式
- 类型安全，强制调用者处理错误

**缺点**：
- 需要大规模重构所有调用点
- 需要引入 Result 类型库
- 当前项目还没有统一的 Result 模式

### 实施方案 1

#### 1. 修改 GetCardQueryHandler

```typescript
/**
 * 执行查询
 * 
 * @param query - 查询对象
 * @returns 查询结果，如果卡片不存在则 card 为 null
 */
async execute(query: GetCardQuery): Promise<GetCardQueryResult> {
  const card = this.storageManager.getCard(query.cardId);
  
  // ✅ DDD 原则：查询不存在的资源是正常业务场景，不应抛出异常
  // 返回 null 让调用者决定如何处理
  return {
    card: card || null
  };
}
```

#### 2. 修改类型定义

```typescript
/**
 * 获取卡片查询结果
 */
export interface GetCardQueryResult {
  /**
   * 卡片数据（FSRSCard 格式）
   * 如果卡片不存在，则为 null
   */
  card: any | null; // 使用 any 避免循环依赖，实际类型是 FSRSCard | null
}
```

## 修改的文件

1. `src/application/queries/card/GetCardQueryHandler.ts`
   - 移除异常抛出
   - 返回 null 当卡片不存在

2. `src/application/queries/card/GetCardQuery.ts`
   - 更新类型定义，允许 `card` 为 `null`

## 测试验证

### 编译测试
✅ TypeScript 编译成功，无类型错误

### 预期行为
- HybridSync 能够正常启动
- 增量同步能够处理不存在的卡片
- 插件初始化成功

## DDD 原则总结

这次修复体现了以下 DDD 原则：

1. **业务场景优先**
   - "卡片不存在"是正常的业务场景
   - 不应该用异常来处理正常流程

2. **防御性编程**
   - 查询操作应该安全，不会因为数据不存在而崩溃
   - 让调用者决定如何处理 null 值

3. **简单性原则**
   - 选择最简单的解决方案
   - 不过度设计（如引入 Result 模式）

4. **渐进式重构**
   - 先修复当前问题
   - 未来可以考虑引入统一的 Result 模式

## 后续改进建议

### 1. 引入 Result 模式

当项目成熟后，可以考虑引入统一的 Result 模式：

```typescript
import { Result } from '@/core/result';

class GetCardQueryHandler {
  async execute(query: GetCardQuery): Promise<Result<FSRSCard, CardNotFoundError>> {
    const card = this.storageManager.getCard(query.cardId);
    
    if (!card) {
      return Result.err(new CardNotFoundError(query.cardId));
    }
    
    return Result.ok(card);
  }
}

// 调用方
const result = await handler.execute({ cardId: '123' });

if (result.isOk()) {
  const card = result.value;
  // 处理卡片
} else {
  const error = result.error;
  // 处理错误
}
```

### 2. 统一查询接口

定义统一的查询接口规范：

```typescript
interface QueryHandler<TQuery, TResult> {
  execute(query: TQuery): Promise<Result<TResult, Error>>;
}
```

### 3. 错误类型层次

定义清晰的错误类型层次：

```typescript
abstract class DomainError extends Error {
  abstract readonly code: string;
}

class CardNotFoundError extends DomainError {
  readonly code = 'CARD_NOT_FOUND';
  
  constructor(public readonly cardId: string) {
    super(`Card not found: ${cardId}`);
  }
}
```

## 总结

这次修复：
1. ✅ 解决了 HybridSync 启动失败的问题
2. ✅ 符合 DDD 的错误处理原则
3. ✅ 保持了代码的简单性
4. ✅ 为未来的 Result 模式重构留下了空间

修复后的代码更加健壮，能够优雅地处理"卡片不存在"这一正常业务场景。
