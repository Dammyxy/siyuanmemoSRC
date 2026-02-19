# Phase 8: 性能优化 - 执行计划

**创建时间**: 2026-02-19
**预计时间**: 3-4 天（本次执行关键优化）
**当前 DDD 符合度**: 94%

## 执行策略

Phase 8 专注于优化依赖注入和服务创建的性能,确保重构不会带来性能下降。

### 本次执行范围
1. 分析当前 ApplicationContext 的性能特征
2. 添加循环依赖检测
3. 添加性能监控
4. 优化服务创建流程

## 当前实现分析

### ApplicationContext.getService() 现状

```typescript
getService<T>(serviceName: string): T {
  this.ensureNotDisposed();
  
  // ✅ 已实现：服务缓存
  if (this.serviceContainer.has(serviceName)) {
    return this.serviceContainer.get(serviceName) as T;
  }
  
  // ✅ 已实现：懒加载
  const factory = this.serviceFactories.get(serviceName);
  if (factory) {
    const service = factory(this);
    this.serviceContainer.set(serviceName, service);
    return service as T;
  }
  
  throw new Error(`Service '${serviceName}' is not registered`);
}
```

### 优点 ✅
1. 服务缓存 - 避免重复创建
2. 懒加载 - 只在需要时创建
3. 简洁清晰 - 代码易读

### 缺点 ⚠️
1. 无循环依赖检测 - 可能导致栈溢出
2. 无性能监控 - 无法发现慢服务
3. 无错误恢复 - 创建失败后无法重试

## 任务清单

### Task 8.1: 添加循环依赖检测 ✅ 待执行

**目标**: 防止循环依赖导致的栈溢出

**实现方案**:
```typescript
private creatingServices = new Set<string>();

getService<T>(serviceName: string): T {
  this.ensureNotDisposed();
  
  // 检查缓存
  if (this.serviceContainer.has(serviceName)) {
    return this.serviceContainer.get(serviceName) as T;
  }
  
  // 检查循环依赖
  if (this.creatingServices.has(serviceName)) {
    const chain = Array.from(this.creatingServices).join(' -> ');
    throw new Error(
      `Circular dependency detected: ${chain} -> ${serviceName}\n` +
      `Please check your service dependencies and break the cycle.`
    );
  }
  
  const factory = this.serviceFactories.get(serviceName);
  if (!factory) {
    throw new Error(`Service '${serviceName}' is not registered`);
  }
  
  // 标记正在创建
  this.creatingServices.add(serviceName);
  
  try {
    const service = factory(this);
    this.serviceContainer.set(serviceName, service);
    return service as T;
  } finally {
    // 清理标记
    this.creatingServices.delete(serviceName);
  }
}
```

**优点**:
- 及早发现循环依赖
- 提供清晰的错误信息
- 性能开销极小（Set 操作 O(1)）

### Task 8.2: 添加性能监控 ✅ 待执行

**目标**: 监控服务创建时间,发现性能瓶颈

**实现方案**:
```typescript
// 开发模式下启用性能监控
private readonly enablePerformanceMonitoring = process.env.NODE_ENV === 'development';
private readonly performanceThreshold = 100; // ms

getService<T>(serviceName: string): T {
  this.ensureNotDisposed();
  
  // 检查缓存
  if (this.serviceContainer.has(serviceName)) {
    return this.serviceContainer.get(serviceName) as T;
  }
  
  // 检查循环依赖
  if (this.creatingServices.has(serviceName)) {
    const chain = Array.from(this.creatingServices).join(' -> ');
    throw new Error(`Circular dependency detected: ${chain} -> ${serviceName}`);
  }
  
  const factory = this.serviceFactories.get(serviceName);
  if (!factory) {
    throw new Error(`Service '${serviceName}' is not registered`);
  }
  
  this.creatingServices.add(serviceName);
  
  try {
    // 性能监控
    const startTime = this.enablePerformanceMonitoring ? performance.now() : 0;
    
    const service = factory(this);
    this.serviceContainer.set(serviceName, service);
    
    // 记录慢服务
    if (this.enablePerformanceMonitoring) {
      const duration = performance.now() - startTime;
      if (duration > this.performanceThreshold) {
        console.warn(
          `[ApplicationContext] Service '${serviceName}' took ${duration.toFixed(2)}ms to create ` +
          `(threshold: ${this.performanceThreshold}ms)`
        );
      }
    }
    
    return service as T;
  } finally {
    this.creatingServices.delete(serviceName);
  }
}
```

**优点**:
- 只在开发模式启用,不影响生产性能
- 自动发现慢服务
- 可配置阈值

### Task 8.3: 添加错误恢复机制 ✅ 待执行

**目标**: 服务创建失败后可以重试

**实现方案**:
```typescript
private failedServices = new Map<string, Error>();

getService<T>(serviceName: string): T {
  this.ensureNotDisposed();
  
  // 检查缓存
  if (this.serviceContainer.has(serviceName)) {
    return this.serviceContainer.get(serviceName) as T;
  }
  
  // 检查是否之前创建失败
  if (this.failedServices.has(serviceName)) {
    const previousError = this.failedServices.get(serviceName)!;
    console.warn(
      `[ApplicationContext] Service '${serviceName}' failed to create previously. ` +
      `Previous error: ${previousError.message}`
    );
    // 允许重试,但记录警告
  }
  
  // 检查循环依赖
  if (this.creatingServices.has(serviceName)) {
    const chain = Array.from(this.creatingServices).join(' -> ');
    throw new Error(`Circular dependency detected: ${chain} -> ${serviceName}`);
  }
  
  const factory = this.serviceFactories.get(serviceName);
  if (!factory) {
    throw new Error(`Service '${serviceName}' is not registered`);
  }
  
  this.creatingServices.add(serviceName);
  
  try {
    const startTime = this.enablePerformanceMonitoring ? performance.now() : 0;
    
    const service = factory(this);
    this.serviceContainer.set(serviceName, service);
    
    // 清除失败记录
    this.failedServices.delete(serviceName);
    
    if (this.enablePerformanceMonitoring) {
      const duration = performance.now() - startTime;
      if (duration > this.performanceThreshold) {
        console.warn(
          `[ApplicationContext] Service '${serviceName}' took ${duration.toFixed(2)}ms to create`
        );
      }
    }
    
    return service as T;
  } catch (error) {
    // 记录失败
    this.failedServices.set(serviceName, error as Error);
    throw error;
  } finally {
    this.creatingServices.delete(serviceName);
  }
}
```

**优点**:
- 允许重试失败的服务
- 记录失败历史,便于调试
- 不影响正常流程

### Task 8.4: 优化服务创建顺序 ⏭️ 可选

**目标**: 预创建常用服务,减少首次访问延迟

**实现方案**:
```typescript
async warmup(): Promise<void> {
  // 预创建常用服务
  const commonServices = [
    'storage',
    'scheduler',
    'eventBus',
    'cardStorage',
    'schedulerRouter',
  ];
  
  for (const serviceName of commonServices) {
    try {
      this.getService(serviceName);
    } catch (error) {
      console.warn(`[ApplicationContext] Failed to warmup service '${serviceName}':`, error);
    }
  }
}
```

**注意**: 这个优化是可选的,只在发现首次访问延迟问题时才需要。

## 优先级排序

### P0 - 必须完成（本次执行）
1. Task 8.1: 添加循环依赖检测
2. Task 8.2: 添加性能监控

### P1 - 高优先级（本次执行）
3. Task 8.3: 添加错误恢复机制

### P2 - 可选（按需执行）
4. Task 8.4: 优化服务创建顺序

## 性能目标

### 服务创建
- ✅ 单个服务创建时间 < 100ms
- ✅ 总启动时间 < 1s
- ✅ 内存使用无明显增加

### 运行时
- ✅ 服务访问时间 < 1ms（缓存命中）
- ✅ 无内存泄漏
- ✅ 无性能下降

## 测试计划

### 单元测试
```typescript
describe('ApplicationContext Performance', () => {
  it('should detect circular dependency', () => {
    // 测试循环依赖检测
  });
  
  it('should create service within threshold', () => {
    // 测试服务创建时间
  });
  
  it('should cache service instances', () => {
    // 测试服务缓存
  });
  
  it('should allow retry after failure', () => {
    // 测试错误恢复
  });
});
```

### 性能测试
```typescript
describe('ApplicationContext Performance Benchmarks', () => {
  it('should create all services within 1 second', async () => {
    const start = performance.now();
    const context = await ApplicationContext.create(config);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1000);
  });
  
  it('should access cached service within 1ms', () => {
    const start = performance.now();
    context.getService('storage');
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1);
  });
});
```

## 风险评估

### 低风险 ✅
- 循环依赖检测 - 只在错误情况下触发
- 性能监控 - 只在开发模式启用
- 错误恢复 - 不改变正常流程

### 无风险 ✅
- 所有优化都是向后兼容的
- 不改变公共 API
- 不影响现有功能

## 成功标准

### 代码质量 ✅
- ✅ 添加循环依赖检测
- ✅ 添加性能监控
- ✅ 添加错误恢复
- ✅ 代码清晰易读

### 性能 ✅
- ✅ 无性能下降
- ✅ 可以发现性能问题
- ✅ 可以诊断循环依赖

### 可维护性 ✅
- ✅ 错误信息清晰
- ✅ 易于调试
- ✅ 易于扩展

## 下一步行动

1. **立即开始**: Task 8.1 - 添加循环依赖检测
2. **继续执行**: Task 8.2 - 添加性能监控
3. **完成优化**: Task 8.3 - 添加错误恢复机制

---

**状态**: 📋 计划中
**预计完成**: 本次执行完成 P0 和 P1 任务
