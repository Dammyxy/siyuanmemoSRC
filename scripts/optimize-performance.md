# 性能优化执行指南

## 快速开始

### 1. 更新 Vite 配置（已完成）

已在 `vite.config.ts` 中添加生产环境优化配置：
- ✅ 使用 Terser 压缩
- ✅ 移除 console.log
- ✅ 移除注释
- ✅ 保持单文件打包

### 2. 替换 console 调用

在代码中使用 Logger 替代直接的 console 调用：

```typescript
// 之前
console.log('[SiyuanMemo] 操作完成');

// 之后
import { Logger } from '@/utils/logger';
Logger.log('[SiyuanMemo] 操作完成');
```

### 3. 添加性能监控

在关键操作中添加性能监控：

```typescript
import { PerformanceMonitor } from '@/utils/performance';

// 异步操作
const result = await PerformanceMonitor.measure('load-cards', async () => {
  return await loadCards();
});

// 同步操作
const data = PerformanceMonitor.measureSync('parse-data', () => {
  return parseData(rawData);
});
```

### 4. 使用查询缓存

对频繁查询的数据添加缓存：

```typescript
import { withCache } from '@/utils/queryCache';

// 包装查询函数
const getCachedCard = withCache(
  async (cardId: string) => {
    return await fetchCard(cardId);
  },
  { ttl: 5000, maxSize: 100 }
);

// 使用
const card = await getCachedCard('card-id');
```

### 5. 添加防抖节流

对高频事件添加防抖或节流：

```typescript
import { debounce, throttle } from '@/utils/debounce';

// 搜索输入防抖
const handleSearch = debounce((query: string) => {
  performSearch(query);
}, 300);

// 滚动事件节流
const handleScroll = throttle(() => {
  updateScrollPosition();
}, 100);
```

## 优化检查清单

### 代码质量
- [ ] 移除未使用的导入
- [ ] 移除未使用的变量和函数
- [ ] 使用 const 替代 let（如果不需要重新赋值）
- [ ] 使用类型守卫减少运行时检查

### 数据库查询
- [ ] 使用批量查询替代循环查询
- [ ] 添加查询缓存
- [ ] 确保使用了正确的索引
- [ ] 避免 SELECT *，只查询需要的字段

### Vue 组件
- [ ] 使用 v-memo 缓存渲染结果
- [ ] 使用 v-once 渲染静态内容
- [ ] 使用 defineAsyncComponent 懒加载组件
- [ ] 避免在模板中使用复杂计算

### 事件处理
- [ ] 高频事件使用防抖或节流
- [ ] 使用事件委托减少监听器数量
- [ ] 组件卸载时清理事件监听器

### 内存管理
- [ ] 清理定时器和间隔器
- [ ] 清理 WebSocket 连接
- [ ] 限制缓存大小
- [ ] 使用 WeakMap 存储对象引用

## 性能测试

### 构建测试

```bash
# 开发构建
pnpm dev

# 生产构建
pnpm build

# 检查构建产物大小
ls -lh dist/
```

### 运行时测试

在浏览器开发者工具中：

1. Performance 标签：记录性能分析
2. Memory 标签：检查内存使用
3. Network 标签：检查网络请求

### 性能报告

在开发环境中，可以查看性能监控报告：

```typescript
import { PerformanceMonitor } from '@/utils/performance';

// 打印性能报告
PerformanceMonitor.printReport();
```

## 常见性能问题

### 1. 大列表渲染慢

**问题：** 渲染大量数据时卡顿

**解决方案：**
- 使用虚拟滚动（ag-grid 已内置）
- 分页加载数据
- 使用 v-memo 缓存列表项

### 2. 频繁的数据库查询

**问题：** 相同数据被重复查询

**解决方案：**
- 添加查询缓存
- 使用批量查询
- 预加载相关数据

### 3. 内存持续增长

**问题：** 内存使用不断增加

**解决方案：**
- 检查事件监听器是否清理
- 检查定时器是否清理
- 限制缓存大小
- 使用 WeakMap 替代 Map

### 4. UI 更新卡顿

**问题：** 界面响应慢

**解决方案：**
- 使用防抖节流
- 减少不必要的重新渲染
- 使用 requestAnimationFrame
- 将计算密集型操作移到 Web Worker

## 持续优化

### 定期检查

- 每周检查性能监控报告
- 每月进行性能审计
- 关注用户反馈的性能问题

### 性能指标

关键指标：
- 首次加载时间 < 2s
- 卡片渲染时间 < 16ms
- 数据库查询时间 < 100ms
- 内存使用 < 100MB

### 优化优先级

1. 高优先级：影响用户体验的性能问题
2. 中优先级：可以改进但不紧急的优化
3. 低优先级：边缘情况的优化

## 参考资源

- [Vue 性能优化指南](https://vuejs.org/guide/best-practices/performance.html)
- [Web 性能优化](https://web.dev/performance/)
- [JavaScript 性能优化](https://developer.mozilla.org/en-US/docs/Web/Performance)
