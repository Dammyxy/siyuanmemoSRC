# 刻意练习功能测试指南

## 测试目的

验证刻意练习功能是否按预期工作，包括：
1. 黑名单机制
2. 进度保存和恢复
3. 评分规则（评分 4 加入黑名单）

## 测试步骤

### 测试 1: 基本功能测试

**步骤**:
1. 右键点击一个包含 3 张卡片的文档块
2. 选择 `SiyuanMemo` → `刻意练习 (3)`
3. 复习对话框应该打开，显示第一张卡片

**预期结果**:
- ✅ 对话框成功打开
- ✅ 显示卡片内容
- ✅ 控制台显示: `[BlockPracticeBlacklist] Initialized blacklist for block xxx, totalCards=3`

### 测试 2: 评分 4 加入黑名单

**步骤**:
1. 在刻意练习对话框中，对第一张卡片评分 4（已掌握）
2. 继续复习第二张卡片
3. 关闭对话框
4. 再次右键点击同一个文档块
5. 选择 `SiyuanMemo` → `刻意练习 (3)`

**预期结果**:
- ✅ 第一张卡片不再出现（已加入黑名单）
- ✅ 只显示剩余的 2 张卡片
- ✅ 控制台显示: `[BlockPracticeBlacklist] Added card xxx to blacklist for block xxx`

### 测试 3: 评分 1/2/3 继续练习

**步骤**:
1. 在刻意练习对话框中，对第一张卡片评分 2（继续练习）
2. 关闭对话框
3. 再次打开刻意练习

**预期结果**:
- ✅ 第一张卡片仍然出现（未加入黑名单）
- ✅ 所有 3 张卡片都可以复习

### 测试 4: 进度保存和恢复

**步骤**:
1. 打开刻意练习，对 2 张卡片评分 4
2. 关闭对话框
3. 再次打开刻意练习

**预期结果**:
- ✅ 显示进度提示对话框: "你上次练习这个文档时，学习了 2/3 张卡片。要继续上次的进度吗？"
- ✅ 提供【从头开始】和【继续】两个按钮

### 测试 5: 从头开始

**步骤**:
1. 在进度提示对话框中，点击【从头开始】
2. 开始复习

**预期结果**:
- ✅ 黑名单被清空
- ✅ 所有 3 张卡片重新出现
- ✅ 控制台显示: `[BlockPracticeBlacklist] Cleared blacklist for block xxx`

### 测试 6: 继续上次进度

**步骤**:
1. 在进度提示对话框中，点击【继续】
2. 开始复习

**预期结果**:
- ✅ 黑名单保留
- ✅ 只显示未完成的卡片（已评分 4 的不出现）

### 测试 7: 所有卡片完成

**步骤**:
1. 对所有 3 张卡片都评分 4
2. 关闭对话框
3. 再次打开刻意练习

**预期结果**:
- ✅ 显示提示: "所有卡片都已复习完成！"
- ✅ 对话框不打开

## 调试信息

### 关键日志

在浏览器控制台中查找以下日志：

1. **黑名单初始化**:
```
[BlockPracticeBlacklist] Initialized blacklist for block xxx, totalCards=3
```

2. **添加到黑名单**:
```
[BlockPracticeBlacklist] Added card xxx to blacklist for block xxx
```

3. **清空黑名单**:
```
[BlockPracticeBlacklist] Cleared blacklist for block xxx
```

4. **获取进度**:
```javascript
// 在控制台执行
const progress = BlockPracticeBlacklistManager.getProgress('block-id');
console.log(progress);
// 输出: {completedCount: 2, totalCount: 3, hasProgress: true}
```

### 检查 localStorage

在浏览器控制台中执行：

```javascript
// 查看黑名单数据
const data = localStorage.getItem('block-practice-blacklist');
console.log(JSON.parse(data));
```

输出示例：
```json
{
  "20260213164614-t16138f": {
    "blacklistedCardIds": ["card-1", "card-2"],
    "totalCards": 3,
    "timestamp": 1739436374000,
    "expiresAt": 1739522774000
  }
}
```

## 已知问题

### 问题 1: onReview 回调未触发

**症状**: 评分后，卡片没有加入黑名单

**检查**:
1. 确认 `openDrillWithCards` 正确传递了 `onReview` 参数
2. 确认 ReviewView 组件接收了 `onReview` prop
3. 确认 useReviewSession 在评分时调用了回调

**解决方案**: 检查 ReviewView.vue 和 useReviewSession.ts 的实现

### 问题 2: 进度提示对话框未显示

**症状**: 有进度时，没有显示提示对话框

**检查**:
1. 确认 `getProgress()` 返回 `hasProgress: true`
2. 确认 `showProgressDialog()` 方法被调用

**解决方案**: 检查 DeliberatePracticeEntry.ts 的实现

## 测试清单

- [ ] 测试 1: 基本功能测试
- [ ] 测试 2: 评分 4 加入黑名单
- [ ] 测试 3: 评分 1/2/3 继续练习
- [ ] 测试 4: 进度保存和恢复
- [ ] 测试 5: 从头开始
- [ ] 测试 6: 继续上次进度
- [ ] 测试 7: 所有卡片完成

## 测试结果

### 当前状态

根据提供的日志：
- ✅ 黑名单初始化成功
- ✅ 对话框创建成功
- ✅ 卡片加载成功
- ✅ Protyle 渲染成功

### 待验证

- ⏳ 评分 4 是否正确加入黑名单
- ⏳ 进度提示对话框是否正常显示
- ⏳ "从头开始"和"继续"功能是否正常

## 下一步

1. 完成上述测试清单
2. 如果发现问题，记录详细的错误信息
3. 根据测试结果调整实现

---

**测试日期**: 2024-XX-XX  
**测试人员**: [Your Name]  
**测试环境**: 思源笔记 + SiyuanMemo 插件
