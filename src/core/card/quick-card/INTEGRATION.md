# 快速卡片渲染器 - 集成指南

## 概述

快速卡片渲染器提供了一种优化的卡片渲染方式，支持多种快速制卡符号（`>>`, `<<`, `<>`, `::`, `;;`, `{{}}`, `>>>`）。

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                   Presentation Layer                     │
│              (QuickCardRenderer.vue)                     │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│              (QuickCardRenderService)                    │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                    │
│    (QuickCardRepository, SiyuanBlockAdapter)            │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                     Domain Layer                         │
│  (QuickCard, CardFace, Strategies, Factory)             │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 创建渲染服务

```typescript
import { createQuickCardRenderService } from '@/core/card/quick-card';

// 使用默认配置
const renderService = createQuickCardRenderService();

// 或使用插件配置
import { PluginQuickCardConfigProvider } from '@/core/card/quick-card';

const configProvider = new PluginQuickCardConfigProvider(
  () => plugin.getContext().getSettingsService().getSettings()
);
const renderService = createQuickCardRenderService(configProvider);
```

### 2. 在 Vue 组件中使用

```vue
<template>
  <QuickCardRenderer
    :block-id="blockId"
    :render-service="renderService"
    :show-answer="showAnswer"
    @loaded="handleLoaded"
    @error="handleError"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import QuickCardRenderer from '@/ui/review/components/QuickCardRenderer.vue';
import { createQuickCardRenderService } from '@/core/card/quick-card';

const blockId = ref('20230101120000-abcdefg');
const showAnswer = ref(false);
const renderService = createQuickCardRenderService();

function handleLoaded(result) {
  console.log('Card loaded:', result);
}

function handleError(error) {
  console.error('Failed to load card:', error);
}
</script>
```

### 3. 在 ReviewContent 中集成（可选）

如果要在复习界面中使用快速卡片渲染器，可以在 `ReviewContent.vue` 中添加条件渲染：

```vue
<template>
  <div class="fsrs-review-v2-content">
    <!-- 快速卡片渲染 -->
    <QuickCardRenderer
      v-if="content.type === 'quick-card'"
      :block-id="content.id"
      :render-service="quickCardRenderService"
      :show-answer="showAnswer"
    />
    
    <!-- 其他内容类型... -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import QuickCardRenderer from './components/QuickCardRenderer.vue';
import { createQuickCardRenderService } from '@/core/card/quick-card';

const quickCardRenderService = ref(createQuickCardRenderService());
</script>
```

## 支持的卡片类型

### 1. Basic Card（基础卡片）

**符号**: `>>`, `<<`, `<>`

**示例**:
```
什么是 DDD？ >> 领域驱动设计
```

### 2. Concept Card（概念卡片）

**符号**: `::`

**示例**:
```
DDD::领域驱动设计
```

### 3. Cloze Card（填空卡片）

**符号**: `{{}}`

**示例**:
```
DDD 的核心是{{领域模型}}
```

### 4. Descriptor Card（描述符卡片）

**符号**: `;;`

**示例**:
```
优点;;易于维护和扩展
```

### 5. MultiLine Card（列表模版卡片）

**符号**: `>>>`

**示例**:
```
>>> DDD 的优点
- 易于维护
- 易于扩展
- 易于测试
```

## 配置

### 配置结构

```typescript
interface QuickCardSettings {
  enabled: boolean;
  enabledSymbols: {
    basic: boolean;      // >> << <>
    concept: boolean;    // ::
    descriptor: boolean; // ;;
    cloze: boolean;      // {{}}
    multiLine: boolean;  // >>>
  };
  descriptorUseXiuyuan: boolean;
  debounceDelay: {
    quick: number;
    list: number;
  };
}
```

### 默认配置

```typescript
{
  enabled: true,
  enabledSymbols: {
    basic: true,
    concept: true,
    descriptor: true,
    cloze: true,
    multiLine: true,
  },
  descriptorUseXiuyuan: false,
  debounceDelay: {
    quick: 300,
    list: 2000,
  },
}
```

## API 参考

### QuickCardRenderService

#### `render(blockId: string, side: 'front' | 'back'): Promise<QuickCardRenderResult | null>`

渲染指定面的卡片。

**参数**:
- `blockId`: 块 ID
- `side`: 卡片面（'front' 或 'back'）

**返回**: 渲染结果或 null（如果不是快速卡片）

#### `toggleFace(blockId: string, currentSide: 'front' | 'back'): Promise<QuickCardRenderResult | null>`

切换卡片面。

**参数**:
- `blockId`: 块 ID
- `currentSide`: 当前面

**返回**: 另一面的渲染结果

### QuickCardRenderer.vue

#### Props

- `blockId: string` - 块 ID（必需）
- `renderService: QuickCardRenderService` - 渲染服务（必需）
- `showAnswer: boolean` - 是否显示答案（可选，默认 false）
- `i18n: Record<string, string>` - 国际化文本（可选）

#### Events

- `loaded(result: QuickCardRenderResult)` - 加载完成
- `error(error: Error)` - 加载失败

## 错误处理

渲染器会自动处理以下错误：

1. **CardNotFoundError**: 块不存在或无法访问
2. **InvalidCardTypeError**: 未知的卡片类型
3. **ParseError**: 解析块内容失败
4. **ConfigError**: 配置无效或缺失

所有错误都会：
- 记录到控制台
- 触发 `error` 事件
- 显示错误信息给用户

## 性能优化

1. **策略缓存**: 策略实例会被缓存，避免重复创建
2. **配置缓存**: 配置会被缓存，减少读取次数
3. **降级处理**: 如果不是快速卡片，会返回 null，让调用方使用普通渲染

## 测试

运行测试：

```bash
# 运行所有快速卡片测试
npm run test:quick -- src/core/card/quick-card src/ui/review/components

# 运行特定层的测试
npm run test:quick -- src/core/card/quick-card/domain
npm run test:quick -- src/core/card/quick-card/infrastructure
npm run test:quick -- src/core/card/quick-card/application
npm run test:quick -- src/ui/review/components
```

## 故障排查

### 问题：卡片无法加载

**可能原因**:
1. 块 ID 不存在
2. 块内容不包含快速制卡符号
3. 网络错误

**解决方案**:
1. 检查块 ID 是否正确
2. 检查块内容是否包含支持的符号
3. 查看控制台错误日志

### 问题：CSS 样式不生效

**可能原因**:
1. CSS 类名不正确
2. 样式被覆盖

**解决方案**:
1. 检查 `cssClasses` 是否正确应用
2. 检查 CSS 优先级

### 问题：Xiuyuan 模版不工作

**可能原因**:
1. 配置中 `descriptorUseXiuyuan` 为 false
2. 父块不是概念卡片

**解决方案**:
1. 启用 `descriptorUseXiuyuan` 配置
2. 确保父块包含 `::` 符号

## 更多信息

- [设计文档](../../../.kiro/specs/quick-card-renderer/design.md)
- [需求文档](../../../.kiro/specs/quick-card-renderer/requirements.md)
- [任务列表](../../../.kiro/specs/quick-card-renderer/tasks.md)
