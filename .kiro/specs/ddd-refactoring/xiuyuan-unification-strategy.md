# Xiuyuan 统一化战略分析

## 当前问题

### 错误信息
```
Error: Cannot find module '@/ui/browser/datasource/DeckDataSource'
```

### 问题分析

这是一个**模块加载问题**，不是架构问题：

1. **文件存在**：`src/ui/browser/datasource/DeckDataSource.ts` 文件确实存在
2. **动态导入**：`BrowserApplicationService.createDataSource()` 使用 `require()` 动态导入
3. **路径别名**：使用了 `@/` 路径别名，可能在运行时解析失败

### 根本原因

**Webpack/Vite 打包问题**：动态 `require()` 在某些打包配置下无法正确解析路径别名。

## 战略选择

你面临两个选择：

### 选项 A：先修复当前 Bug（快速修复）

**优点**：
- 立即恢复功能
- 风险低，改动小
- 不影响后续重构

**缺点**：
- 治标不治本
- 可能需要再次修改

**修复方案**：
1. 将动态 `require()` 改为静态 `import`
2. 或者使用相对路径而不是别名

**工作量**：10 分钟

### 选项 B：直接做 Xiuyuan 统一化（战略重构）

**优点**：
- 一次性解决根本问题
- 简化架构，减少复杂度
- 符合长期目标

**缺点**：
- 工作量大（估计 2-4 小时）
- 风险较高
- 需要迁移现有数据

**工作量**：2-4 小时

## 我的建议：先修复 Bug，再做统一化

### 理由

1. **风险管理**：
   - 当前系统不可用，用户无法使用
   - 快速修复可以立即恢复功能
   - 统一化是大重构，需要充分测试

2. **渐进式改进**：
   - 先让系统可用
   - 再做战略性重构
   - 符合敏捷开发原则

3. **DDD 架构考虑**：
   - 当前 Bug 是技术问题，不是架构问题
   - Xiuyuan 统一化是领域模型重构
   - 两者可以分开处理

4. **时间成本**：
   - 修复 Bug：10 分钟
   - 统一化：2-4 小时
   - 先快速恢复，再从容重构

## 推荐执行顺序

### 第一步：快速修复（10 分钟）

修复 `BrowserApplicationService.createDataSource()` 的模块加载问题：

```typescript
// ❌ 当前：动态 require（运行时可能失败）
const { DeckDataSource } = require('@/ui/browser/datasource/DeckDataSource');

// ✅ 修复：静态 import（编译时解析）
import { DeckDataSource } from '@/ui/browser/datasource/DeckDataSource';
```

### 第二步：Xiuyuan 统一化（2-4 小时）

在系统恢复正常后，进行战略性重构：

1. **设计阶段**（30 分钟）：
   - 定义统一的 Xiuyuan 卡片模型
   - 设计迁移策略
   - 确定块属性保留哪些

2. **实施阶段**（1-2 小时）：
   - 更新领域模型
   - 修改存储层
   - 更新应用服务

3. **迁移阶段**（30 分钟）：
   - 编写数据迁移脚本
   - 测试迁移流程

4. **测试阶段**（30 分钟）：
   - 单元测试
   - 集成测试
   - 用户验收测试

## Xiuyuan 统一化设计草案

### 核心理念

**所有卡片都是 Xiuyuan 卡片**：
- 不再区分"普通闪卡"和"Xiuyuan 卡"
- 统一使用 Xiuyuan 模板系统
- 块属性只保留必要的元数据

### 领域模型变化

#### 当前模型（复杂）

```typescript
interface FSRSCard {
  // FSRS 字段
  id: string;
  blockId: string;
  due: number;
  stability: number;
  // ...
  
  // 类型区分
  type: CardType;  // 'item' | 'topic' | 'concept' | ...
  cardTypeMarker?: 'concept' | 'descriptor';
  
  // Xiuyuan 特有
  meta?: {
    xiuyuanTemplate?: string;
    // ...
  };
}
```

#### 统一模型（简化）

```typescript
interface XiuyuanCard {
  // === 核心标识 ===
  id: string;
  blockId: string;
  
  // === FSRS 调度 ===
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: CardState;
  
  // === Xiuyuan 模板 ===
  template: XiuyuanTemplate;  // 所有卡片都有模板
  
  // === 最小化块属性 ===
  // 只保留必要的元数据
  priority: number;
  suspended: boolean;
  
  // === 移除 ===
  // ❌ type: CardType  // 不再需要
  // ❌ cardTypeMarker  // 不再需要
  // ❌ aFactor         // 统一使用 FSRS
}
```

### 块属性简化

#### 当前块属性（冗余）

```
custom-card-id: xxx
custom-card-type: concept
custom-card-type-marker: concept
custom-priority: 50
custom-suspended: false
custom-a-factor: 2.5
custom-xiuyuan-template: basic
```

#### 统一后块属性（最小化）

```
custom-card-id: xxx
custom-xiuyuan-template: basic
custom-priority: 50
custom-suspended: false
```

### 迁移策略

#### 1. 普通闪卡 → Xiuyuan 卡

```typescript
// 旧：普通闪卡（基于块内容）
{
  type: 'item',
  blockId: '20240101-xxx',
  // 内容直接从块读取
}

// 新：Xiuyuan 卡（使用默认模板）
{
  blockId: '20240101-xxx',
  template: {
    id: 'default-qa',
    front: '{{block.content}}',
    back: '{{block.content}}',
  }
}
```

#### 2. Topic 卡 → Xiuyuan 卡

```typescript
// 旧：Topic 卡（增量阅读）
{
  type: 'topic',
  aFactor: 2.5,
  // 特殊调度逻辑
}

// 新：Xiuyuan 卡（使用增量阅读模板）
{
  template: {
    id: 'incremental-reading',
    front: '{{doc.title}}',
    back: '{{doc.excerpt}}',
  }
}
```

#### 3. Concept 卡 → Xiuyuan 卡

```typescript
// 旧：Concept 卡（文档块）
{
  type: 'concept',
  cardTypeMarker: 'concept',
  // 从文档标题读取
}

// 新：Xiuyuan 卡（使用概念模板）
{
  template: {
    id: 'concept',
    front: '{{doc.title}}',
    back: '{{doc.summary}}',
  }
}
```

### DDD 架构影响

#### 领域层变化

```typescript
// ✅ 简化：统一的卡片聚合根
class XiuyuanCard extends AggregateRoot {
  private template: XiuyuanTemplate;
  private fsrsState: FSRSState;
  
  // 不再需要类型判断
  render(): CardView {
    return this.template.render(this.getContext());
  }
}
```

#### 应用层变化

```typescript
// ✅ 简化：统一的应用服务
class CardApplicationService {
  // 不再需要区分类型
  async createCard(blockId: string, templateId: string) {
    const template = this.templateRepository.findById(templateId);
    const card = XiuyuanCard.create(blockId, template);
    await this.cardRepository.save(card);
  }
}
```

#### 基础设施层变化

```typescript
// ✅ 简化：统一的存储
class CardRepository {
  async save(card: XiuyuanCard) {
    // 只保存必要的块属性
    await setBlockAttrs(card.blockId, {
      'custom-card-id': card.id,
      'custom-xiuyuan-template': card.template.id,
      'custom-priority': card.priority,
      'custom-suspended': card.suspended,
    });
    
    // FSRS 数据存储到数据库
    await this.storageManager.saveCard(card.toFSRSCard());
  }
}
```

## 风险评估

### 快速修复风险：低

- 只改动一个文件
- 不影响业务逻辑
- 容易回滚

### 统一化风险：中

- 需要迁移现有数据
- 可能影响现有功能
- 需要充分测试

## 结论

**推荐方案**：

1. **立即执行**：快速修复模块加载问题（10 分钟）
2. **恢复功能**：验证系统正常运行
3. **规划重构**：设计 Xiuyuan 统一化方案（30 分钟）
4. **分步实施**：渐进式迁移到统一模型（2-4 小时）

这样既能快速恢复功能，又能从容进行战略性重构，符合敏捷开发和 DDD 架构的最佳实践。
