# 卡片类型修复指南

## 问题

规范化后，所有卡片的 `type` 字段都变成了 `0`（Item），因为：

1. **原始数据没有 `type` 字段**：
   - 你的本地存储数据是旧版本创建的
   - 旧版本没有保存 `type` 字段

2. **规范化无法读取块属性**：
   - `normalizeCard()` 只能处理内存中的数据
   - 无法访问思源笔记的块属性（`custom-fsrs-card-type`）

3. **默认值填充**：
   - 缺失的 `type` 字段被填充为 `0`（Item）

## 解决方案

### 方案 1：从 Riff API 重新同步（推荐）✅

这会从 Riff API 重新读取所有卡片，包括正确的 `type` 字段。

#### 步骤：

1. **切换到简单模式**：
   - 打开插件设置
   - 找到"数据源模式"
   - 选择"简单模式"
   - 保存设置

2. **重启思源笔记**

3. **切换回高级模式**：
   - 打开插件设置
   - 选择"高级模式"
   - 保存设置
   - **这会触发增量同步，从 Riff API 重新读取所有卡片**

4. **重启思源笔记**

5. **验证**：
   - 打开 SRS 浏览器
   - 选择"检索练习"队列
   - 检查卡片类型列是否正确显示

### 方案 2：删除本地存储，强制重新同步

如果方案 1 不起作用，可以删除本地存储文件，强制从 Riff API 重新同步。

#### 步骤：

1. **关闭思源笔记**

2. **备份数据**（重要！）：
   ```bash
   cp -r "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs" "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs.backup"
   ```

3. **删除本地存储文件**：
   ```bash
   rm "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs/cards.msgpack"
   rm "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs/cards.json"
   ```

4. **打开思源笔记**

5. **切换到高级模式**（如果还没有）：
   - 打开插件设置
   - 选择"高级模式"
   - 保存设置
   - **这会触发完整同步，从 Riff API 重新创建本地存储**

6. **重启思源笔记**

7. **验证**：
   - 打开 SRS 浏览器
   - 检查卡片类型是否正确

### 方案 3：手动修复（不推荐）

如果你知道每张卡片的正确类型，可以手动修复。但这非常繁琐，不推荐。

## 为什么会出现这个问题？

### 根本原因

1. **历史数据格式**：
   - 旧版本插件没有保存 `type` 字段到本地存储
   - 只有 Riff API 的块属性中有 `custom-fsrs-card-type`

2. **规范化限制**：
   - `normalizeCard()` 只能处理内存中的数据
   - 无法访问思源笔记的块属性
   - 只能填充默认值 `0`（Item）

3. **同步缺失**：
   - 你直接在高级模式下使用
   - 没有触发从 Riff API 的同步
   - 本地存储数据一直是旧格式

### 正确的数据流向

```
Riff API（块属性）
    ↓
SimpleDataRouter.convertRiffBlockToFSRSCard()
    ↓
读取 custom-fsrs-card-type 属性
    ↓
创建完整的 FSRSCard（包含正确的 type）
    ↓
保存到本地存储
    ↓
高级模式使用
```

但你的情况是：

```
旧版本本地存储（没有 type 字段）
    ↓
直接在高级模式下使用
    ↓
规范化时填充默认值 type: 0
    ↓
所有卡片都变成 Item 类型 ❌
```

## 预防措施

### 未来避免此问题

1. **定期同步**：
   - 定期切换到简单模式再切换回高级模式
   - 这会触发增量同步，更新本地数据

2. **数据备份**：
   - 定期备份插件数据目录
   - 出问题时可以快速恢复

3. **版本升级**：
   - 升级插件版本时，先切换到简单模式
   - 升级后再切换回高级模式
   - 这样可以确保数据格式正确

## 技术细节

### 为什么 normalizeCard() 不能读取块属性？

```typescript
private normalizeCard(card: any): FSRSCard {
    // ❌ 无法访问思源笔记 API
    // const blockAttr = await siyuanApi.getBlockAttrs(card.blockId);
    // const cardType = blockAttr['custom-fsrs-card-type'];
    
    // ✅ 只能使用内存中的数据
    const normalized: FSRSCard = {
        type: card.type ?? 0, // 如果缺失，只能填充默认值
        // ...
    };
    
    return normalized;
}
```

原因：
1. `normalizeCard()` 是同步方法，不能使用 `await`
2. 批量处理时，逐个查询块属性会非常慢
3. 设计上，规范化只处理数据格式，不负责数据补全

### 正确的数据补全方式

应该通过**数据同步**来补全缺失的字段：

```typescript
// UnifiedDataSourceManager.triggerIncrementalSync()
const riffCards = await this.simpleRouter.getCards(); // 从 Riff API 获取
for (const riffCard of riffCards) {
    await this.advancedRouter.updateCard(riffCard); // 更新到本地存储
}
```

这样可以确保：
- 从 Riff API 读取完整数据（包括 type）
- 更新到本地存储
- 下次加载时就有正确的 type 字段

## 常见问题

### Q: 为什么不在规范化时自动同步？

**A:** 性能考虑。规范化是在插件启动时执行的，如果每次都同步会导致启动变慢。

### Q: 同步会覆盖我的本地修改吗？

**A:** 不会。增量同步只更新远程更新时间更新的卡片，保留本地修改。

### Q: 我可以手动修改 cards.msgpack 文件吗？

**A:** 不推荐。msgpack 是二进制格式，手动修改容易损坏文件。建议使用同步方式。

### Q: 同步需要多长时间？

**A:** 取决于卡片数量：
- 100 张卡片：约 1-2 秒
- 1000 张卡片：约 5-10 秒
- 10000 张卡片：约 30-60 秒

## 总结

卡片类型变成 Item 的问题是因为：
1. ❌ 本地存储数据没有 `type` 字段
2. ❌ 规范化无法读取块属性
3. ❌ 只能填充默认值 `0`（Item）

解决方案：
1. ✅ 切换模式触发同步（推荐）
2. ✅ 删除本地存储强制重新同步
3. ❌ 手动修复（不推荐）

**现在就按照方案 1 操作，让卡片类型恢复正常！**

---

**更新日期**：2026-02-05  
**相关文档**：
- `SRS_BROWSER_DATA_FIX_SUMMARY.md` - 字段缺失修复
- `SRS_BROWSER_MIXED_TYPE_FIX.md` - 混合类型修复
- `DATA_NORMALIZATION_GUIDE.md` - 数据规范化指南
- `CARD_TYPE_FIX_INSTRUCTIONS.md` - 卡片类型修复指南（本文档）
