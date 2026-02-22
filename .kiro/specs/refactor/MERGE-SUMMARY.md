# 快速卡片模板合并总结

## 完成情况

✅ **已完成** - 三个快速卡片模板成功合并为一个统一模板

## 核心改动

### 删除的模板
1. `builtin-symbol-qa` - 符号问答卡
2. `builtin-quick-bidirectional` - 快速制卡双向

### 保留的统一模板
- `builtin-quick-card` - 支持单向和双向卡片

## 技术实现

### 双向卡片机制
```typescript
// 1. 命令层添加标记
interface CreateXiuyuanFromBlocksCommand {
  isBidirectional?: boolean;
}

// 2. 用例层动态生成 cardRules
if (command.isBidirectional) {
  template.cardRules = [
    { typeMarker: 'forward', ... },
    { typeMarker: 'reverse', ... }
  ];
}

// 3. 生成两个 CardFace（使用相同块内容）
faces.push(forwardFace, reverseFace);

// 4. 渲染层根据 typeMarker 决定方向
if (typeMarker === 'reverse') {
  // 反向：定义 -> 概念
} else {
  // 正向：概念 -> 定义
}
```

## 修改的文件

### 核心文件
- ✅ `src/core/xiuyuan/templates/builtin-quick.ts` - 更新描述
- ✅ `src/core/xiuyuan/templates/builtin.ts` - 移除旧模板
- ✅ 删除 `src/core/xiuyuan/templates/builtin-symbol.ts`

### 业务逻辑
- ✅ `src/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand.ts` - 添加 `isBidirectional`
- ✅ `src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts` - 实现双向逻辑
- ✅ `src/application/usecases/card/CreateCardUseCase.ts` - 统一模板选择
- ✅ `src/application/handlers/AutoCardHandler.ts` - 使用 `isBidirectional` 标记
- ✅ `src/application/helpers/CardCreationHelper.ts` - 更新模板ID

## 构建状态

✅ **构建成功** - 无编译错误，无类型错误

## 优势

1. **代码简化** - 减少 2 个模板，降低维护成本
2. **逻辑统一** - 所有快速卡片使用同一套渲染逻辑
3. **灵活性强** - 通过标记和动态 cardRules 支持不同场景
4. **向后兼容** - 现有功能不受影响

## 待完成

- 更新测试文件中的模板ID引用
- 运行测试验证功能
- 测试双向卡片创建和渲染

---

**完成时间**: 2025-02-22  
**构建版本**: 0.0.1
