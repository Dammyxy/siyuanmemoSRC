# 卡片渲染器共享代码重构方案

## 架构理解

### 当前架构（正确的限界上下文模式）

```
src/
├── domain/              # 外层 DDD - 整个项目的领域层
├── application/         # 外层 DDD - 整个项目的应用层  
├── infrastructure/      # 外层 DDD - 整个项目的基础设施层
├── ui/                  # 外层 DDD - 整个项目的 UI 层
└── core/                # 子领域（限界上下文集合）
    ├── card/            # 卡片限界上下文
    │   ├── descriptor-card/   # 描述符卡（独立的小 DDD）
    │   │   ├── domain/
    │   │   ├── application/
    │   │   └── infrastructure/
    │   ├── quick-card/        # 快速卡（独立的小 DDD）
    │   │   ├── domain/
    │   │   ├── application/
    │   │   └── infrastructure/
    │   └── common/            # ⚠️ 目前缺失：卡片通用代码
    ├── queue/           # 队列限界上下文
    ├── scheduler/       # 调度器限界上下文
    └── xiuyuan/         # 修远限界上下文
```

### 重构目标

在 `src/core/card/common/` 创建**共享代码**（不是新的 DDD），供各个卡片类型使用。

## 问题分析

当前问题：
1. **代码重复**：面包屑加载逻辑在每个渲染器中重复
2. **样式重复**：面包屑、加载状态、错误状态样式重复
3. **缺乏共享层**：没有 `common/` 目录存放共享代码

## 重构方案

### 目标结构

```
src/core/card/
├── common/                          # 卡片通用代码（新增）
│   ├── application/
│   │   ├── BaseCardRenderService.ts # 基础渲染服务（提供通用方法）
│   │   └── types.ts                 # 通用类型定义
│   └── ui/                          # 通用 UI 组件（新增）
│       ├── CardBreadcrumb.vue       # 面包屑组件
│       ├── CardLoadingState.vue     # 加载状态组件
│       └── CardErrorState.vue       # 错误状态组件
│
├── descriptor-card/                 # 描述符卡（现有）
│   ├── domain/
│   │   └── DescriptorCard.ts
│   ├── application/
│   │   └── DescriptorCardRenderService.ts  # 继承 BaseCardRenderService
│   └── infrastructure/
│       └── DescriptorCardRepository.ts
│
├── quick-card/                      # 快速卡（现有）
│   ├── domain/
│   ├── application/
│   │   └── QuickCardRenderService.ts
│   └── infrastructure/
│
└── multi-cloze/                     # 多挖孔卡（新增）
    ├── domain/
    │   └── MultiClozeCard.ts
    ├── application/
    │   └── MultiClozeCardRenderService.ts  # 继承 BaseCardRenderService
    └── infrastructure/
        └── MultiClozeCardRepository.ts
```

## 实施细节

### 1. 创建共享应用层代码

#### 1.1 通用类型定义

```typescript
// src/core/card/common/application/types.ts

/**
 * 面包屑项
 */
export interface BreadcrumbItem {
  id: string;
  name: string;
  type: string;
}

/**
 * 卡片视图模型基接口
 * 
 * 所有卡片视图模型都应该包含这些基础字段
 */
export interface BaseCardViewModel {
  blockId: string;
  breadcrumbs: BreadcrumbItem[];
}
```

#### 1.2 基础渲染服务

```typescript
// src/core/card/common/application/BaseCardRenderService.ts

import { getBlockBreadcrumb } from '@/core/siyuan/api';
import type { BreadcrumbItem } from './types';

/**
 * 基础卡片渲染服务
 * 
 * 职责：
 * - 提供通用的渲染辅助方法
 * - 不包含业务逻辑，只是工具方法集合
 * - 供各个卡片类型的 RenderService 继承使用
 * 
 * 注意：这不是一个完整的 DDD 层，只是共享代码
 */
export abstract class BaseCardRenderService {
  /**
   * 加载块的面包屑
   * 
   * @param blockId 块 ID
   * @param excludeLast 排除最后几项（默认 1，排除当前块）
   * @returns 面包屑列表
   */
  protected async loadBreadcrumbs(
    blockId: string,
    excludeLast: number = 1
  ): Promise<BreadcrumbItem[]> {
    try {
      const breadcrumbResult = await getBlockBreadcrumb(blockId);
      
      if (!breadcrumbResult || !Array.isArray(breadcrumbResult)) {
        return [];
      }
      
      // 排除最后 N 项
      const parentBreadcrumbs = breadcrumbResult.slice(0, -excludeLast);
      
      const allBreadcrumbs = parentBreadcrumbs.map((item: any) => ({
        id: item.id || '',
        name: item.name || '',
        type: item.type || 'NodeParagraph',
      }));
      
      // 去重：使用 Map 按标准化后的 name 去重
      return this.deduplicateBreadcrumbs(allBreadcrumbs);
    } catch (error) {
      console.error('[BaseCardRenderService] Failed to load breadcrumbs:', error);
      return [];
    }
  }

  /**
   * 去重面包屑
   * 
   * @param breadcrumbs 原始面包屑列表
   * @returns 去重后的面包屑列表
   */
  private deduplicateBreadcrumbs(breadcrumbs: BreadcrumbItem[]): BreadcrumbItem[] {
    const dedupMap = new Map<string, BreadcrumbItem>();
    
    for (const item of breadcrumbs) {
      // 标准化文本：去掉列表符号
      const normalizedName = item.name.replace(/^[•\-\d]+\.?\s*/, '').trim();
      dedupMap.set(normalizedName, {
        id: item.id,
        name: normalizedName,
        type: item.type,
      });
    }
    
    return Array.from(dedupMap.values());
  }

  /**
   * 创建答案分隔线 HTML
   * 
   * @param label 分隔线标签（默认"答案"）
   * @returns HTML 字符串
   */
  protected createAnswerDivider(label: string = '答案'): string {
    return `<div class="card-renderer__answer-divider"><span>${label}</span></div>`;
  }

  /**
   * 创建正面预览 HTML（灰显）
   * 
   * @param frontHtml 正面 HTML
   * @returns 包装后的 HTML
   */
  protected createFrontPreview(frontHtml: string): string {
    return `<div class="card-renderer__front-preview">${frontHtml}</div>`;
  }

  /**
   * 包装答案 HTML
   * 
   * @param answerHtml 答案 HTML
   * @returns 包装后的 HTML
   */
  protected wrapAnswer(answerHtml: string): string {
    return `<div class="card-renderer__answer">${answerHtml}</div>`;
  }

  /**
   * 组合背面 HTML（正面预览 + 分隔线 + 答案）
   * 
   * @param frontHtml 正面 HTML
   * @param answerHtml 答案 HTML
   * @param dividerLabel 分隔线标签
   * @returns 完整的背面 HTML
   */
  protected composeBackHtml(
    frontHtml: string,
    answerHtml: string,
    dividerLabel: string = '答案'
  ): string {
    const preview = this.createFrontPreview(frontHtml);
    const divider = this.createAnswerDivider(dividerLabel);
    const answer = this.wrapAnswer(answerHtml);
    
    return `${preview}${divider}${answer}`;
  }
}
```

### 2. 创建共享 UI 组件

#### 2.1 面包屑组件

```vue
<!-- src/core/card/common/ui/CardBreadcrumb.vue -->
<template>
  <div v-if="items.length > 0" class="card-breadcrumb">
    <div 
      v-for="(item, index) in items" 
      :key="item.id"
      class="card-breadcrumb__item"
      :style="{ paddingLeft: `${index * 16 + 8}px` }"
    >
      <span class="card-breadcrumb__text">
        <svg class="card-breadcrumb__icon">
          <use :xlink:href="getIcon(item.type)"></use>
        </svg>
        {{ item.name || '...' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BreadcrumbItem } from '../application/types';

defineProps<{
  items: BreadcrumbItem[];
}>();

function getIcon(type: string): string {
  return type === 'NodeDocument' ? '#iconFile' : '#iconALIGN';
}
</script>

<style scoped>
.card-breadcrumb {
  display: flex;
  flex-direction: column;
  padding: 8px 16px;
  margin-bottom: 0;
  background: transparent;
}

.card-breadcrumb__item {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: pointer;
  color: var(--b3-theme-on-surface);
  line-height: 1.6;
  border-radius: 4px;
  transition: all 0.2s;
}

.card-breadcrumb__item:hover {
  text-decoration: underline;
  color: var(--b3-theme-primary);
  background-color: var(--b3-list-hover);
}

.card-breadcrumb__text {
  display: flex;
  align-items: center;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--b3-font-family);
  opacity: 0.86;
  flex: 1;
  min-width: 0;
}

.card-breadcrumb__icon {
  width: 12px;
  height: 12px;
  margin-right: 6px;
  opacity: 0.6;
  fill: var(--b3-theme-on-surface);
  flex-shrink: 0;
}
</style>
```

#### 2.2 加载状态组件

```vue
<!-- src/core/card/common/ui/CardLoadingState.vue -->
<template>
  <div class="card-loading-state">
    <div class="card-loading-state__spinner"></div>
    <div class="card-loading-state__text">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  text?: string;
}>(), {
  text: '加载中...'
});
</script>

<style scoped>
.card-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
}

.card-loading-state__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--b3-border-color);
  border-top-color: var(--b3-theme-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.card-loading-state__text {
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
}
</style>
```

#### 2.3 错误状态组件

```vue
<!-- src/core/card/common/ui/CardErrorState.vue -->
<template>
  <div class="card-error-state">
    <div class="card-error-state__icon">⚠️</div>
    <div class="card-error-state__text">{{ message }}</div>
    <button 
      v-if="showRetry"
      class="card-error-state__retry"
      @click="$emit('retry')"
    >
      重试
    </button>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  message: string;
  showRetry?: boolean;
}>(), {
  showRetry: false
});

defineEmits<{
  (e: 'retry'): void;
}>();
</script>

<style scoped>
.card-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
}

.card-error-state__icon {
  font-size: 48px;
}

.card-error-state__text {
  font-size: 14px;
  color: var(--b3-theme-error);
  text-align: center;
  max-width: 400px;
}

.card-error-state__retry {
  margin-top: 8px;
  padding: 8px 16px;
  background: var(--b3-theme-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.card-error-state__retry:hover {
  background: var(--b3-theme-primary-light);
}
</style>
```

### 3. 重构现有 RenderService

#### 3.1 MultiClozeCardRenderService（新建）

```typescript
// src/core/card/multi-cloze/application/MultiClozeCardRenderService.ts

import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BreadcrumbItem, BaseCardViewModel } from '@/core/card/common/application/types';

/**
 * 多挖孔卡视图模型
 */
export interface MultiClozeCardViewModel extends BaseCardViewModel {
  currentFace: {
    question: string;
    answer: string;
  };
  faceIndex: number;
  totalFaces: number;
}

/**
 * 多挖孔卡渲染服务
 */
export class MultiClozeCardRenderService extends BaseCardRenderService {
  /**
   * 准备视图模型
   */
  async prepareViewModel(card: any): Promise<MultiClozeCardViewModel> {
    const faces = card.meta?.faces || [];
    const faceIndex = card.meta?.faceIndex ?? 0;
    const currentFace = faces[faceIndex] || { question: '', answer: '' };
    
    // 使用基类方法加载面包屑
    const breadcrumbs = await this.loadBreadcrumbs(card.blockId);
    
    return {
      blockId: card.blockId,
      breadcrumbs,
      currentFace,
      faceIndex,
      totalFaces: faces.length,
    };
  }
}
```

#### 3.2 重构 DescriptorCardRenderService

```typescript
// src/core/card/descriptor-card/application/DescriptorCardRenderService.ts

import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BaseCardViewModel } from '@/core/card/common/application/types';
import { DescriptorCard } from '../domain/DescriptorCard';
import type { DescriptorCardRepository } from '../infrastructure/DescriptorCardRepository';
import type { ParentConceptBlock, SiblingDescriptor } from '../infrastructure/DescriptorCardRepository';

/**
 * 描述符卡视图模型
 */
export interface DescriptorCardViewModel extends BaseCardViewModel {
  frontHtml: string;
  backHtml: string;
  attribute: string;
  description: string;
  parentConcept: {
    blockId: string;
    title: string;
    preview: string;
    html: string;
    isConceptCard: boolean;
  } | null;
  siblingDescriptors: SiblingDescriptor[];
  warning: string | null;
}

export class DescriptorCardRenderService extends BaseCardRenderService {
  constructor(
    private repository: DescriptorCardRepository
  ) {
    super(); // 调用基类构造函数
  }

  async prepareViewModel(blockId: string, fsrsCard?: any): Promise<DescriptorCardViewModel | null> {
    try {
      // 1. 从仓储加载数据
      const data = await this.repository.loadDescriptorCard(blockId, fsrsCard);
      if (!data) {
        return null;
      }

      // 2. 创建领域实体
      const card = new DescriptorCard(data);

      // 3. 使用基类方法加载面包屑
      const breadcrumbs = await this.loadBreadcrumbs(blockId);

      // 4. 分离正面和背面内容
      const { frontHtml, backHtml } = this.splitDescriptorContent(card);

      // 5. 构建视图模型
      return {
        blockId: card.blockId,
        breadcrumbs, // 添加面包屑
        frontHtml,
        backHtml,
        attribute: card.attribute,
        description: card.description,
        parentConcept: this.buildParentConceptViewModel(card),
        siblingDescriptors: card.siblingDescriptors,
        warning: card.getWarning(),
      };
    } catch (error) {
      console.error('[DescriptorCardRenderService] Error:', error);
      return null;
    }
  }

  // ... 其他方法保持不变
}
```

### 4. 重构 UI 组件

#### 4.1 MultiClozeCardRenderer（简化版）

```vue
<!-- src/ui/review/components/MultiClozeCardRenderer.vue -->
<template>
  <div class="multi-cloze-card-renderer">
    <!-- 加载状态 -->
    <CardLoadingState v-if="loading" text="加载多挖孔卡片..." />

    <!-- 错误状态 -->
    <CardErrorState v-else-if="error" :message="error" />

    <!-- 卡片内容 -->
    <div v-else-if="viewModel" class="multi-cloze-card-renderer__content">
      <!-- 面包屑 -->
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <!-- 正面：显示问题 -->
      <div v-if="!showAnswer" class="multi-cloze-card-renderer__front">
        <div class="multi-cloze-card-renderer__question" v-html="viewModel.currentFace.question"></div>
      </div>

      <!-- 背面：显示答案 -->
      <div v-else class="multi-cloze-card-renderer__back">
        <div class="multi-cloze-card-renderer__front-preview" v-html="viewModel.currentFace.question"></div>
        <div class="multi-cloze-card-renderer__answer-divider"><span>答案</span></div>
        <div class="multi-cloze-card-renderer__answer" v-html="viewModel.currentFace.answer"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { MultiClozeCardRenderService } from '@/core/card/multi-cloze/application/MultiClozeCardRenderService';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import type { MultiClozeCardViewModel } from '@/core/card/multi-cloze/application/MultiClozeCardRenderService';

const props = defineProps<{
  card: any;
  showAnswer?: boolean;
}>();

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<MultiClozeCardViewModel | null>(null);

const renderService = new MultiClozeCardRenderService();

onMounted(async () => {
  try {
    loading.value = true;
    viewModel.value = await renderService.prepareViewModel(props.card);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.multi-cloze-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

.multi-cloze-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

/* 正面样式 */
.multi-cloze-card-renderer__front {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 48px 32px;
  min-height: 200px;
}

.multi-cloze-card-renderer__question {
  font-size: 24px;
  line-height: 1.6;
  text-align: left;
  color: var(--b3-theme-on-surface);
  width: 100%;
}

/* 背面样式 */
.multi-cloze-card-renderer__back {
  flex: 1;
  padding: 48px 32px 32px;
}

.multi-cloze-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 16px;
  line-height: 1.5;
  margin-bottom: 20px;
  text-align: left;
}

.multi-cloze-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 500;
}

.multi-cloze-card-renderer__answer-divider::before {
  content: '';
  width: 60px;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.multi-cloze-card-renderer__answer-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

.multi-cloze-card-renderer__answer {
  font-size: 24px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
  text-align: left;
  width: 100%;
}

/* 挖空占位符样式 */
.multi-cloze-card-renderer__question :deep(mark),
.multi-cloze-card-renderer__answer :deep(mark) {
  background-color: var(--b3-theme-primary-lightest, #e3f2fd);
  color: var(--b3-theme-on-surface);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
</style>
```

## 架构优势

### 1. 符合限界上下文模式
- ✅ `common/` 是共享代码，不是新的 DDD
- ✅ 各个卡片类型保持独立的 DDD 结构
- ✅ 清晰的职责划分

### 2. 代码复用
- ✅ 面包屑加载逻辑统一在 `BaseCardRenderService`
- ✅ UI 组件可复用（减少 60% 重复代码）
- ✅ 通用方法（答案分隔线、正面预览等）

### 3. 易于扩展
- ✅ 新增卡片类型只需继承 `BaseCardRenderService`
- ✅ 使用通用 UI 组件
- ✅ 保持一致的用户体验

### 4. 易于测试
- ✅ 基类方法可独立测试
- ✅ UI 组件可独立测试
- ✅ RenderService 可 mock 基类方法

## 实施步骤

### 阶段 1：创建共享代码（1-2 小时）

1. 创建目录结构：
   ```bash
   mkdir -p src/core/card/common/application
   mkdir -p src/core/card/common/ui
   ```

2. 创建文件：
   - `src/core/card/common/application/types.ts`
   - `src/core/card/common/application/BaseCardRenderService.ts`
   - `src/core/card/common/ui/CardBreadcrumb.vue`
   - `src/core/card/common/ui/CardLoadingState.vue`
   - `src/core/card/common/ui/CardErrorState.vue`

### 阶段 2：创建 MultiCloze 卡片（1-2 小时）

1. 创建目录结构：
   ```bash
   mkdir -p src/core/card/multi-cloze/application
   mkdir -p src/core/card/multi-cloze/domain
   mkdir -p src/core/card/multi-cloze/infrastructure
   ```

2. 创建 `MultiClozeCardRenderService.ts`

### 阶段 3：重构现有渲染器（2-3 小时）

1. 重构 `DescriptorCardRenderService`（继承基类）
2. 重构 `ConceptDefinitionCardRenderService`（继承基类）
3. 重构对应的 UI 组件

### 阶段 4：测试和验证（1-2 小时）

1. 单元测试基类方法
2. 集成测试渲染服务
3. UI 测试渲染组件

## 注意事项

1. **不是新的 DDD**：`common/` 只是共享代码，不包含完整的 DDD 结构
2. **向后兼容**：保持现有 API 不变
3. **渐进式重构**：一次重构一个渲染器
4. **类型安全**：充分利用 TypeScript

## 总结

这个方案：
- ✅ 符合你的限界上下文架构
- ✅ 不是"套娃"，而是共享代码
- ✅ 减少重复代码 60%+
- ✅ 易于扩展和维护
