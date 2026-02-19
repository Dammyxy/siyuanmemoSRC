# 快速制卡符号隐藏修复测试

## 问题诊断

根据调试发现，问题的根源是：

1. **字段命名不匹配**：
   - `FSRSCard` 使用 `id` 和 `blockId`（小写 `d`）
   - `QueueItem` 使用 `cardID` 和 `blockID`（大写 `D`）
   - 队列返回的 item 只有 `id` 字段，导致 `UnifiedReviewAdapter` 无法正确提取 `blockId`

2. **修复方案**：
   - 更新 `UnifiedReviewAdapter` 的字段映射逻辑
   - 优先使用 `FSRSCard` 的字段（`blockId`, `id`）
   - 添加调试日志以验证字段映射

## 测试步骤

1. **重新打开对话框**：
   ```javascript
   // 在浏览器控制台运行 REOPEN_DIALOG.js
   ```

2. **检查字段映射**：
   - 查看控制台中的 `[UnifiedReviewAdapter] Field mapping:` 日志
   - 确认 `resolved blockId` 和 `resolved cardId` 不为 `undefined`

3. **验证快速制卡渲染**：
   - 检查当前显示的卡片是否为快速制卡（`cardSource: 'quick-symbol'`）
   - 检查 CSS 类是否正确应用（只有 `hidemark`，没有其他隐藏类）

4. **测试符号隐藏**：
   - 快速制卡应该只隐藏符号（`>>`, `::`, `;;`, `{{}}`）
   - 其他内容应该正常显示
   - 点击"显示答案"后，符号应该显示出来

## 预期结果

- ✅ 队列中的卡片有正确的 `blockId` 和 `cardId`
- ✅ 快速制卡的符号被正确隐藏
- ✅ 普通卡片的所有隐藏内容被正确隐藏
- ✅ 点击"显示答案"后，所有内容正常显示

## 如果问题仍然存在

如果字段映射仍然失败，可能需要：
1. 检查队列的 `next()` 方法返回的数据结构
2. 确认新架构队列是否正确实现了 `IQueueStrategy` 接口
3. 考虑在队列层面添加字段映射逻辑
