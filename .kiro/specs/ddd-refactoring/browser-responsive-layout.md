# SRS 浏览器响应式布局方案

## 修复日期
2026-02-19

## 问题背景

用户担心固定宽度的对话框在不同分辨率的屏幕上会出现问题：
- 小屏幕：对话框太大，超出屏幕
- 大屏幕：对话框太小，浪费空间
- 表格区域：始终需要足够的空间显示信息

## 响应式布局策略

### 核心原则
1. **屏幕适配**: 根据屏幕宽度动态调整对话框大小
2. **比例平衡**: 预览区占比随屏幕大小变化，确保表格区域充足
3. **最小保护**: 设置最小宽度，防止布局崩溃
4. **用户优先**: 保存用户调整，尊重用户偏好

### 对话框宽度策略

```typescript
const screenWidth = window.innerWidth;

if (screenWidth < 1024) {
  // 小屏幕（平板）：90vw
  dialogWidth = '90vw';
  dialogHeight = '85vh';
} else if (screenWidth < 1440) {
  // 中等屏幕（笔记本）：85vw，最大 1200px
  dialogWidth = 'min(1200px, 85vw)';
  dialogHeight = 'min(800px, 85vh)';
} else if (screenWidth < 1920) {
  // 大屏幕（桌面）：80vw，最大 1400px
  dialogWidth = 'min(1400px, 80vw)';
  dialogHeight = 'min(850px, 85vh)';
} else {
  // 超大屏幕（4K）：75vw，最大 1600px
  dialogWidth = 'min(1600px, 75vw)';
  dialogHeight = 'min(900px, 85vh)';
}
```

### 预览区宽度策略

```typescript
const calculateInitialPreviewSize = (): number => {
  const dialogWidth = window.innerWidth;
  
  if (dialogWidth < 1024) {
    // 小屏幕：30%，最小 250px
    return Math.max(250, Math.floor(dialogWidth * 0.3));
  } else if (dialogWidth < 1440) {
    // 中等屏幕：28%，最小 300px
    return Math.max(300, Math.floor(dialogWidth * 0.28));
  } else if (dialogWidth < 1920) {
    // 大屏幕：25%，最小 350px
    return Math.max(350, Math.floor(dialogWidth * 0.25));
  } else {
    // 超大屏幕：22%，最小 400px
    return Math.max(400, Math.floor(dialogWidth * 0.22));
  }
};
```

## 不同分辨率下的布局

### 1. 小屏幕（1024px 以下，如平板）
```
屏幕: 1024px
对话框: 922px (90vw)
├─ 层级: 260px (28%)
├─ 表格: 355px (39%)
└─ 预览: 307px (33%)
```
