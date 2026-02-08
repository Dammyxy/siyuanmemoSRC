# SRS浏览器日期显示修复

## 问题描述

用户反馈SRS浏览器中存在两个问题:

1. **日期显示问题**: NextRep等字段显示"已过期"、"今天"、"昨天"等相对时间,用户希望始终显示具体日期
2. **FSRS参数为0**: Retr、Diff、Stab字段数值一直显示为0

## 修复方案

### 1. 日期格式修复

**修改文件**: `src/ui/browser/types.ts`

#### 修改前
```typescript
// formatDueDate 会显示"已过期 X 天"、"今天"、"明天"等相对时间
// formatHistoryDate 会显示"今天"、"昨天"、"前天"等相对时间
```

#### 修改后
```typescript
/** 格式化到期时间（用于 NextRep，始终显示具体日期） */
export function formatDueDate(date: Date | null | undefined): string {
    if (!date) return '-';
    
    // 始终显示具体日期（包含年份）
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** 格式化历史时间（用于 LastRep/FirstRep，始终显示具体日期） */
export function formatHistoryDate(date: Date | null | undefined): string {
    if (!date) return '-';
    
    // 始终显示具体日期（包含年份）
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
```

**影响范围**:
- NextRep (到期时间)
- LastRep (最后复习时间)
- FirstRep (首次复习时间)
- 所有使用这两个函数的数据源

**显示效果**:
- 修改前: `已过期 3 天`, `今天 14:30`, `昨天 09:15`
- 修改后: `2026年2月3日 14:30`, `2026年2月6日 14:30`, `2026年2月5日 09:15`

### 2. FSRS参数为0的问题诊断

**问题分析**:

FSRS参数(Stability、Difficulty、Retrievability)显示为0可能有以下原因:

1. **新卡片**: 如果卡片是新卡(state=0, reps=0),这些参数确实应该为0
2. **数据未初始化**: 卡片已复习但FSRS参数未正确保存
3. **数据转换问题**: FSRSCard → BrowserCard 转换时丢失数据

**调试增强**:

在 `RetrievalDataSource.ts` 中添加了 `elapsedDays` 的调试输出:

```typescript
console.log('[RetrievalDataSource] 📊 Sample FSRSCard data:', {
  // ... 其他字段
  elapsedDays: cards[0].elapsedDays,  // 🆕 添加此字段
});
```

**验证步骤**:

1. 打开浏览器控制台
2. 打开SRS浏览器
3. 查看控制台输出的 `Sample FSRSCard data`
4. 检查以下字段:
   - `stability`: 应该 > 0 (已复习的卡片)
   - `difficulty`: 应该在 1-10 之间
   - `reps`: 复习次数
   - `state`: 卡片状态 (0=新卡, 1=学习中, 2=复习, 3=重学)
   - `elapsedDays`: 距离上次复习的天数

**可能的原因**:

如果控制台显示 FSRSCard 的原始数据中 `stability=0`, `difficulty=0`:

- **原因1**: 卡片确实是新卡 (state=0, reps=0) → 正常
- **原因2**: 卡片已复习但参数未保存 → 需要检查复习流程
- **原因3**: 数据迁移问题 → 需要运行数据修复脚本

如果 FSRSCard 数据正常,但 BrowserCard 显示为0:

- **原因**: `convertToBrowserCard` 转换逻辑有问题
- **解决**: 检查默认值逻辑 `card.stability || 0`

## 测试验证

### 日期显示测试

1. 打开SRS浏览器
2. 检查以下列的显示:
   - **NextRep**: 应显示 `2026年2月X日 HH:MM`
   - **LastRep**: 应显示 `2026年2月X日 HH:MM`
   - **FirstRep**: 应显示 `2026年2月X日 HH:MM`
3. 确认不再显示"今天"、"昨天"、"已过期"等相对时间

### FSRS参数测试

1. 打开浏览器控制台
2. 打开SRS浏览器
3. 查看控制台输出
4. 对比 FSRSCard 和 BrowserCard 的数据
5. 确认参数是否正确传递

## 后续行动

### 如果FSRS参数仍为0

需要进一步诊断:

1. **检查数据源**: 查看 FSRSCard 原始数据
2. **检查复习流程**: 确认复习后参数是否正确保存
3. **数据修复**: 如果是历史数据问题,需要运行修复脚本

### 数据修复脚本(如需要)

```typescript
// 修复历史卡片的FSRS参数
async function fixFSRSParameters() {
  const cards = await getAllCards();
  for (const card of cards) {
    if (card.reps > 0 && card.stability === 0) {
      // 重新计算FSRS参数
      card.stability = calculateStability(card);
      card.difficulty = calculateDifficulty(card);
      await updateCard(card);
    }
  }
}
```

## 修改文件清单

- ✅ `src/ui/browser/types.ts` - 修改日期格式化函数
- ✅ `src/ui/browser/datasource/RetrievalDataSource.ts` - 更新注释和调试输出
- ✅ `src/ui/browser/SRSBrowserAdapter.ts` - 修改日期格式化函数调用

## 影响的数据源

以下数据源都使用了修改后的日期格式化函数:

- ✅ RetrievalDataSource (通过 types.ts)
- ✅ FilterGroupDataSource (通过 types.ts)
- ✅ FinalDrillDataSource (通过 types.ts)
- ✅ QueryDataSource (通过 types.ts)
- ✅ IncrementalLearningDataSource (通过 types.ts)
- ✅ DeckDataSource (通过 browserService.ts)
- ✅ SRSBrowserAdapter (Advanced 模式，直接修改)

所有数据源的日期显示都会统一改为具体日期格式。
