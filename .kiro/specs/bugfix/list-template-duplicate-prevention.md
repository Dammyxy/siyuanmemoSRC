# 列表模版卡重复创建防护

## 问题

用户可以多次点击"创建有序列表模版卡"菜单项，导致同一个列表项被重复创建多个 Xiuyuan 卡片。

## 影响

1. 数据冗余：同一个列表项有多个 Xiuyuan 卡片
2. 复习混乱：同样的内容会出现多次
3. 存储浪费：重复的卡片数据

## 解决方案

在 `CreateListTemplateCardsUseCase.execute()` 开始时，检查父列表项是否已经有 `custom-xiuyuan-id` 属性：

```typescript
async execute(command: CreateListTemplateCardsCommand): Promise<Result<any>> {
  try {
    // 1. 检查是否已经创建过列表模版卡
    const { getBlockAttrs } = await import('@/core/siyuan/api');
    const attrs = await getBlockAttrs(command.parentBlockId);
    
    if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
      const existingXiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
      console.log(`[CreateListTemplateCardsUseCase] Block ${command.parentBlockId} already has Xiuyuan: ${existingXiuyuanId}`);
      return err(new Error('此列表项已经创建过列表模版卡，请勿重复创建'));
    }
    
    // 2. 验证模板
    // ...
  }
}
```

## 修复位置

文件：`src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts`

在 `execute()` 方法的开始处添加重复检查。

## 验证方法

1. 创建一个有序列表（至少 2 个子项）
2. 右键父列表项 → 选择"创建有序列表模版卡"
3. 等待创建成功
4. 再次右键父列表项 → 选择"创建有序列表模版卡"
5. 应该看到错误提示："此列表项已经创建过列表模版卡，请勿重复创建"
6. 检查存储，确认只有一个 Xiuyuan 卡片

## 用户体验

### 成功创建

```
✅ 成功创建 3 张有序列表模版卡！
```

### 重复创建

```
❌ 创建失败：此列表项已经创建过列表模版卡，请勿重复创建
```

## 相关文件

- `src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts` - 修复位置
- `src/application/managers/BlockMenuHandler.ts` - 菜单调用入口
- `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` - 保存时设置 custom-xiuyuan-id

## 设计原则

1. **防御性编程**：在创建前检查是否已存在
2. **用户友好**：提供清晰的错误提示
3. **数据完整性**：防止重复数据
4. **幂等性**：多次执行相同操作应该有相同的结果（失败）

## 其他模版卡的重复防护

### 已修复

1. ✅ **列表模版卡**：`CreateListTemplateCardsUseCase`
2. ✅ **通用模版卡**：`CreateXiuyuanFromBlocksUseCase`（包括多挖空卡、概念-描述符卡等）

### 实现方式

两个 UseCase 都在 `execute()` 方法开始时检查第一个块是否已有 `custom-xiuyuan-id` 属性：

```typescript
// 1. 检查是否已经创建过 Xiuyuan 卡片
const { getBlockAttrs } = await import('@/core/siyuan/api');
const firstBlockId = command.blockIds[0]; // 或 command.parentBlockId
const attrs = await getBlockAttrs(firstBlockId);

if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
  const existingXiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
  console.log(`[UseCase] Block ${firstBlockId} already has Xiuyuan: ${existingXiuyuanId}`);
  return err(new Error('此块已经创建过修缘卡片，请勿重复创建'));
}
```

### 错误提示

- **列表模版卡**：`此列表项已经创建过列表模版卡，请勿重复创建`
- **通用模版卡**：`此块已经创建过修缘卡片，请勿重复创建`

### 修改文件

1. `src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts`
2. `src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts`
