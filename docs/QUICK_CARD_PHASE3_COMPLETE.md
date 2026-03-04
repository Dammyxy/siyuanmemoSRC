# Quick Card Phase 3 完成总结

**完成时间**：2026-02-15  
**任务**：Phase 3 剩余任务（3.1 和 3.3）

---

## 完成的任务

### ✅ Task 3.1：实现 builtin-concept-descriptor 模版

**文件修改**：`src/core/xiuyuan/templates/builtin.ts`

**实现内容**：
1. 定义了 `CONCEPT_DESCRIPTOR_TEMPLATE` 模版
2. 模版结构：
   - ID: `builtin-concept-descriptor`
   - 字段：`concept`（概念块）、`descriptor`（描述符块）
   - 生成规则：1 个 Xiuyuan → 1 张卡片
   - 正面字段：`['concept', 'descriptor']`
   - 反面字段：`['concept', 'descriptor']`

3. 添加到 `BUILTIN_TEMPLATES` 数组中

**模版用途**：
用于概念及其属性描述的卡片。当一个概念块（使用 `::` 符号）有子块使用 `;;` 符号时，自动识别为概念-描述符卡。

**示例**：
```markdown
线粒体 :: 细胞的能量工厂
  ├─ 起源 ;; 被认为是通过内共生起源的
  ├─ 功能 ;; 为细胞生成ATP
  └─ 结构 ;; 具有双层膜结构
```

生成的卡片：
- 正面：线粒体 - 起源
- 反面：线粒体 :: 细胞的能量工厂 + 起源 ;; 被认为是通过内共生起源的

---

### ✅ Task 3.3：注册内置模版

**实现方式**：
模版注册代码已经存在于 `src/index.ts` 中，会自动注册所有 `BUILTIN_TEMPLATES` 中的模版。

**相关代码**（`src/index.ts`）：
```typescript
// 🆕 初始化内置模板
for (const template of BUILTIN_TEMPLATES) {
  const existing = this.xiuyuanService.getTemplate(template.id);
  if (!existing) {
    this.xiuyuanService.createTemplate(template);
  }
}
await this.xiuyuanStorage.save();
console.log('[SiyuanMemo] ✅ XiuyuanService initialized with', BUILTIN_TEMPLATES.length, 'builtin templates');
```

由于 `CONCEPT_DESCRIPTOR_TEMPLATE` 已经添加到 `BUILTIN_TEMPLATES` 数组中，它会在插件启动时自动注册。

**验证**：
- ✅ 编译成功（`npm run build`）
- ✅ 测试通过（`representative-block.test.ts`）
- ✅ 无 TypeScript 错误

---

## 已有的实现

### Task 3.2：实现 Descriptor Cards（已在 Phase 2 完成）

**文件**：`src/services/handlers/AutoCardHandler.ts`

**实现内容**：
1. 检测 `;;` 符号
2. 检查父块是否为概念（包含 `::` 符号）
3. 如果是概念，使用 `builtin-concept-descriptor` 模版创建 Xiuyuan 卡片
4. 如果不是概念，降级为普通卡片

**关键方法**：
- `createDescriptorCard()`: 创建描述符卡片
- `createBasicCardFromDescriptor()`: 降级为普通卡片

**代表块选择**：
`XiuyuanService.selectRepresentativeBlock()` 方法已经支持 `builtin-concept-descriptor` 模版，会选择描述符块作为代表块。

---

## 技术细节

### 模版定义

```typescript
export const CONCEPT_DESCRIPTOR_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-descriptor',
  name: '概念-描述符',
  description: '用于概念及其属性的卡片',
  fields: [
    { name: 'concept', description: '概念块' },
    { name: 'descriptor', description: '描述符块' },
  ],
  cardRules: [
    {
      typeMarker: 'concept-descriptor',
      frontFields: ['concept', 'descriptor'],
      backFields: ['concept', 'descriptor'],
    },
  ],
};
```

### 代表块选择规则

在 `XiuyuanService.selectRepresentativeBlock()` 中：

```typescript
case 'builtin-concept-descriptor':
  // 概念-描述符模版：选择描述符块
  // 如果 fieldMapping 中有 descriptor 字段，使用它；否则使用第一个块
  return fieldMapping['descriptor'] || blockIDs[0];
```

这确保了：
1. 描述符块作为 Riff 卡片的代表块
2. 所有相关的 FSRSCard 共用这个代表块
3. 删除时会正确清理 Riff 卡片

---

## 测试验证

### 单元测试

**文件**：`src/core/xiuyuan/__tests__/representative-block.test.ts`

**测试用例**：
- ✅ 应该为 builtin-concept-descriptor 选择描述符块
- ✅ 应该为 builtin-concept-descriptor 在没有 descriptor 字段时选择第一个块

**测试结果**：
```
✓ src/core/xiuyuan/__tests__/representative-block.test.ts (6)
  ✓ 代表块选择逻辑 (6)
    ✓ selectRepresentativeBlock (6)
      ✓ 应该为 builtin-concept-descriptor 选择描述符块
      ✓ 应该为 builtin-concept-descriptor 在没有 descriptor 字段时选择第一个块
```

### 编译验证

```bash
npm run build
# ✓ 2013 modules transformed.
# ✓ built in 9.63s
```

---

## 渲染逻辑

### 当前实现

概念-描述符卡片使用 Xiuyuan 系统的默认渲染逻辑：
- 正面：显示 `frontBlockIDs` 中的块内容
- 反面：显示 `backBlockIDs` 中的块内容

由于 `frontFields` 和 `backFields` 都是 `['concept', 'descriptor']`，正面和反面都会显示概念块和描述符块的完整内容。

### 未来优化（可选）

如果需要更精细的渲染控制（如只显示概念名称和属性名称），可以：
1. 创建专门的渲染组件（类似 `XiuyuanListTemplateCard.vue`）
2. 在 `ReviewContent.vue` 中添加特殊处理
3. 提取概念名称和属性名称（去除定义和描述部分）

但这不是必需的，当前的实现已经满足基本需求。

---

## 与其他模版的对比

| 模版 | 代表块 | 卡片数量 | 特殊渲染 |
|------|--------|---------|---------|
| `builtin-list-item` | 父列表项 | N（子项数量） | ✅ 有 |
| `builtin-concept-descriptor` | 描述符块 | 1 | ❌ 无（使用默认） |
| `builtin-bidirectional` | 第一个块 | 2 | ❌ 无（使用默认） |
| `builtin-basic-qa` | 第一个块 | 1 | ❌ 无（使用默认） |

---

## 总结

Phase 3 的剩余任务已全部完成：

1. ✅ **Task 3.1**：实现 `builtin-concept-descriptor` 模版
   - 定义了模版结构
   - 添加到 `BUILTIN_TEMPLATES`
   - 编译成功，测试通过

2. ✅ **Task 3.3**：注册内置模版
   - 模版会在插件启动时自动注册
   - 无需额外代码修改

3. ✅ **Task 3.2**（已在 Phase 2 完成）：实现 Descriptor Cards
   - `AutoCardHandler` 已经实现了描述符卡片创建
   - 支持降级为普通卡片
   - 代表块选择逻辑已实现

**下一步**：
- Phase 4：优化和测试（如果需要）
- 可选：为概念-描述符添加特殊渲染组件（提升用户体验）

---

**文档版本**：v1.0  
**最后更新**：2026-02-15
