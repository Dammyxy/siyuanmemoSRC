# Xiuyuan 列表模版卡 - 块菜单实现

## 问题分析

原方案通过 `TransactionObserver` 监听 `ws-main` 事件来自动检测快速制卡操作，但发现：
1. 思源的"快速制卡"按钮不会触发 `ws-main: transactions` 事件
2. `TransactionObserver` 需要在设置中启用 `autoCardEnabled`
3. 即使启用，也只监听编辑操作，不监听快速制卡

## 新方案：块菜单直接触发

在块菜单中添加"创建列表模版卡"选项，用户主动触发。

### 实现位置

**文件**: `src/services/BlockMenuHandler.ts`

### 菜单项

在 `buildBlockMenu` 方法中添加：

```typescript
// 🆕 创建列表模版卡（自动检测）
submenu.push({
  icon: 'iconList',
  label: '创建列表模版卡',
  click: async () => {
    await this.createListTemplateCards(blockIds);
  },
});
```

### 核心方法

```typescript
private async createListTemplateCards(blockIds: string[]): Promise<void>
```

**功能**：
1. 检查选中的块是否为列表项（type='i'）
2. 查询子级列表项（至少需要2个）
3. 为每个子级创建一张 Xiuyuan 卡片
4. 显示创建结果

**流程**：
```
用户右键点击列表项块
  ↓
选择"创建列表模版卡"
  ↓
检测块类型和子级数量
  ↓
为每个子级调用 xiuyuanService.createFromBlocks()
  ↓
显示成功/失败消息
```

## 使用方法

### 步骤1：创建列表结构

```markdown
- 什么是 FSRS？
  - FSRS 是一种间隔重复算法
  - 它基于记忆遗忘曲线
  - 可以优化复习时间
```

### 步骤2：右键点击父列表项

右键点击"什么是 FSRS？"这一行

### 步骤3：选择菜单项

在弹出的菜单中找到"创建列表模版卡"并点击

### 步骤4：查看结果

- 成功：显示"✅ 成功创建 3 张列表模版卡！"
- 失败：显示具体的错误信息

## 错误提示

### 1. "只能对列表项块使用此功能"

**原因**：选中的不是列表项块

**解决**：确保选中的是列表（以 `-` 或 `*` 开头的行）

### 2. "需要至少2个子级列表项"

**原因**：子级列表项数量不足

**解决**：至少添加2个子级列表项

### 3. "块不存在"

**原因**：块ID无效或已被删除

**解决**：刷新页面后重试

## 调试日志

在控制台（F12）中可以看到详细的日志：

```
[SiyuanMemo] 🎯 Creating list template cards for: <blockId>
[SiyuanMemo] Found 3 children: [...]
[SiyuanMemo] 📌 Creating card 1/3: 什么是 FSRS？ → FSRS 是一种间隔重复算法
[SiyuanMemo] ✅ Created card 1/3: <xiuyuanId>
[SiyuanMemo] 📌 Creating card 2/3: 什么是 FSRS？ → 它基于记忆遗忘曲线
[SiyuanMemo] ✅ Created card 2/3: <xiuyuanId>
[SiyuanMemo] 📌 Creating card 3/3: 什么是 FSRS？ → 可以优化复习时间
[SiyuanMemo] ✅ Created card 3/3: <xiuyuanId>
[SiyuanMemo] 🎉 List template cards creation complete: 3 succeeded, 0 failed
```

## 优势

1. **明确的用户意图**：用户主动选择，不会误触发
2. **即时反馈**：立即显示创建结果
3. **易于调试**：日志清晰，问题容易定位
4. **无需配置**：不依赖 TransactionObserver 的启用状态

## 后续优化

1. **自动检测**：如果选中的是列表项且有子级，自动显示此菜单项
2. **批量创建**：支持同时选中多个父列表项
3. **预览功能**：创建前预览将要生成的卡片
4. **撤销功能**：支持一键撤销刚创建的卡片

## 测试

### 测试场景1：正常创建

1. 创建列表结构（1个父+3个子）
2. 右键父列表项 → 创建列表模版卡
3. 验证：成功创建3张卡片

### 测试场景2：子级不足

1. 创建列表结构（1个父+1个子）
2. 右键父列表项 → 创建列表模版卡
3. 验证：显示"需要至少2个子级列表项"

### 测试场景3：非列表项

1. 创建段落块
2. 右键段落块 → 创建列表模版卡
3. 验证：显示"只能对列表项块使用此功能"

## 完成时间

2026-02-14

## 状态

✅ 已实现并可用
