# siyuan-plugin-fsrs 项目交接文档

## 项目概述

**项目名称**: siyuan-plugin-fsrs  
**项目类型**: 思源笔记间隔重复插件  
**核心功能**: 基于 FSRS 算法的闪卡学习系统，支持多种复习队列和神经漫游功能

## 项目架构

### 整体架构
```
siyuan-plugin-fsrs/
├── src/
│   ├── core/           # 核心业务逻辑
│   │   ├── scheduler/  # 调度算法 (FSRS)
│   │   ├── queue/      # 队列管理系统
│   │   ├── siyuan/     # 思源 API 封装
│   │   └── storage/    # 存储管理
│   ├── ui/             # 用户界面
│   │   └── browser/    # 卡片浏览器
│   ├── utils/          # 工具函数
│   └── types/          # 类型定义
├── docs/               # 文档
└── assets/             # 静态资源
```

### 核心模块说明

1. **队列系统** (`src/core/queue/`)
   - `IQueueStrategy<T>`: 队列策略接口
   - `NeuralRoamQueue`: 神经漫游队列（核心特色功能）
   - `FinalDrillQueue`: 刻意练习队列
   - `FilterGroupQueue`: 筛选练习队列

2. **调度系统** (`src/core/scheduler/`)
   - `SimpleFSRSScheduler`: FSRS-5 调度器
   - 支持自定义权重参数和调度策略

3. **数据源适配** (`src/ui/browser/datasource/`)
   - `ICardDataSource`: 数据源抽象接口
   - 多种数据源实现（Deck、Queue、Query等）

## 重要功能特性

### 1. 神经漫游系统
- 基于知识图谱的智能导航
- 支持多种关联类型：双向链接、同文档、标签、兄弟块
- 权重化图遍历算法

### 2. 多队列支持
- 刻意练习队列
- 筛选练习队列  
- 水蛭卡片管理
- 子集练习队列

### 3. 高级卡片浏览器
- AG-Grid 表格组件
- 多维度过滤和搜索
- 预览面板
- 批量操作

### 4. 性能优化
- 数据加载缓存（60秒TTL）
- SQL 查询合并（减少75%数据库往返）
- 内存中快速筛选
- 并发加载保护

## 技术栈

- **前端框架**: Vue 3 + TypeScript
- **表格组件**: AG-Grid
- **构建工具**: Vite
- **样式**: 思源原生样式体系
- **算法库**: 自实现 FSRS-5 算法

## 关键接口和类

### 队列策略接口
```typescript
interface IQueueStrategy<TItem = any> {
  getUIConfig(currentItem: TItem | null): QueueUIConfig;
  next(): Promise<TItem | null>;
  onFeedback(currentItem: TItem | null, feedback: QueueFeedback): Promise<void>;
  getStats?(): Promise<QueueStats>;
  reorder?(orderedItems: TItem[]): Promise<boolean>;
}
```

### 数据源接口
```typescript
interface ICardDataSource {
  fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }>;
  getSupportedActions(): CardBrowserAction[];
  performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any>;
}
```

## 性能优化要点

### 1. 数据加载优化
- `loadAllRiffBlocks()`: pageSize 从 100 增加到 500
- `fetchBlockInfoBatched()`: 合并查询减少数据库往返
- `CardCacheManager`: 内存缓存，TTL 60秒

### 2. 筛选优化
- `applyPresetFilter()`: 内存中快速筛选
- `parseQuery()`: 高效查询解析

### 3. UI 优化
- AG-Grid 虚拟滚动
- 防抖节流处理

## 配置和部署

### 开发环境
```bash
pnpm install
pnpm dev  # 开发模式
pnpm build  # 生产构建
```

### 构建产物
- 输出到思源插件目录
- 自动生成 `package.zip`

## 常见问题和维护要点

### 1. 性能相关
- 大数据量下浏览器响应：已通过缓存优化
- 队列加载缓慢：检查 `pageSize` 设置
- SQL 查询超时：检查查询语句优化

### 2. 兼容性
- 与思源内核 API 版本兼容
- 注意思源 API 变更时的适配

### 3. 数据一致性
- 队列状态与思源底层数据同步
- 缓存失效策略

## 扩展建议

### 1. 功能扩展方向
- Anki 导入功能（已有基础）
- 更多队列策略
- 个性化学习路径

### 2. 性能优化方向
- Web Worker 处理大量数据
- 更精细的缓存策略
- 懒加载和分页优化

## 最近优化记录

### 性能优化 (最新)
- SQL 查询合并：4次→1-2次查询
- 内存缓存层：60秒TTL，增量更新
- 筛选性能：内存快速过滤
- UI 响应：新增强制刷新和性能报告功能

### 代码质量
- 类型安全：完整的 TypeScript 类型定义
- 模块化：清晰的分层架构
- 测试友好：接口抽象便于 Mock

## FSRS 调度机制

### 调度器工作原理

FSRS 调度器是思源笔记间隔重复插件的核心组件，其工作机制是客户端-服务端协同的结果：

1. **思源后端 riff 模块**负责核心的 FSRS 算法计算和到期判断
2. **客户端插件**负责队列管理、UI 展示和用户交互
3. **RiffScheduler**作为桥梁，将用户反馈传递给后端进行状态更新
4. **不同队列类型**通过选择不同的调度器实现不同的复习策略

### 关键组件

- **IQueueStrategy**: 队列策略接口，定义了 next() 和 onFeedback() 方法
- **IScheduler**: 调度器接口，负责计算卡片状态
- **RiffScheduler**: 实际调用思源后端 API 的调度器
- **Riff API**: 思源后端提供的闪卡管理接口

### 数据流向

1. **读取路径**: 思源后端 riff 模块 → getRiffDueCards API → 队列策略 → UI 展示
2. **写入路径**: 用户评分 → onFeedback → RiffScheduler → reviewRiffCard API → 思源后端 riff 模块 → 更新卡片状态

### 队列类型与调度行为

1. **提取练习 (RetrievalPracticeQueue)**: 使用 RiffScheduler，调用 reviewRiffCard API，更新卡片的 SRS 数据
2. **刻意练习 (FinalDrillQueue)**: 使用 NullScheduler，仅从队列中移除，不调用任何 API
3. **难点攻坚 (LeechQueue)**: 使用 LeechScheduler，检测困难卡片并可选择暂停或标记
4. **筛选复习 (FilterGroupQueue)**: 可配置调度器类型，决定是否更新 SRS 数据

## 功能增强建议

基于 SuperMemo 浏览器功能分析，以下是可以考虑实现的功能增强：

### 高优先级功能
1. **按复习参数排序**：添加间隔、稳定性、可提取性、难度等FSRS参数列
2. **随机抽卡功能**：从当前筛选结果中随机选择卡片
3. **优先级筛选**：按优先级阈值过滤卡片
4. **保存选择为过滤器**：将当前选中项保存为可复用过滤器

### 中优先级功能
1. **内容类型筛选**：按话题、提取、填空等类型筛选
2. **高级搜索语法**：扩展查询解析器，支持更多搜索语法
3. **子集操作功能**：实现子集的保存、加载和组合操作
4. **数据分析面板**：基于FSRS数据生成统计图表

### 低优先级功能
1. **多种导出格式**：支持HTML、TXT、CSV等格式导出
2. **队列混合功能**：按权重混合不同队列
3. **模拟测试模式**：创建临时队列进行无影响测试
4. **完整子浏览器功能**：实现类似SuperMemo的子浏览器功能

## 联系方式
如有问题，请参考代码注释和类型定义，或联系项目维护者。