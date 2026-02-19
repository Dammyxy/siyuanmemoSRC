# 秀元卡片 Riff 同步调试指南

## 当前状态

- ✅ 新代码已实现（`createFromBlocks`包含`addRiffCards`调用）
- ✅ 迁移服务已集成到插件启动流程
- ✅ 插件已重新编译
- ❌ 旧的秀元卡片已被全量同步删除
- ⏳ 需要重启思源笔记让新代码生效

## 测试步骤

### 步骤1：重启思源笔记

1. 关闭思源笔记
2. 重新打开思源笔记
3. 等待插件加载完成

### 步骤2：创建测试秀元卡片

1. 选择一个列表块（包含父项和子项）
2. 右键菜单 → 选择"创建秀元卡片"
3. 选择"列表项模板"
4. 确认创建

### 步骤3：检查控制台日志

按F12打开控制台，查找以下关键日志：

#### 创建时的日志（应该看到）：

```
[Xiuyuan] Created Xiuyuan: xiuyuan-xxx
[Xiuyuan] Selected representative block: 20xxxxxx-xxxxxxx
[Xiuyuan] Added representative block to Riff  ← 关键！
[Xiuyuan] Marked block attributes
[Xiuyuan] Creating card: { cardID: 'xiuyuan-xxx-0', ... }
[Xiuyuan] Created FSRSCard: xiuyuan-xxx-0
```

#### 如果看到错误：

```
[Xiuyuan] Failed to add to Riff: <错误信息>
[Xiuyuan] Failed to mark attributes: <错误信息>
```

### 步骤4：验证Riff中是否有记录

在控制台执行：

```javascript
// 获取代表块ID（替换为你的块ID）
const blockId = '20xxxxxx-xxxxxxx';

// 检查Riff中是否有这个块
await window.siyuan.call('/api/riff/getRiffCardsByBlockIDs', { blockIDs: [blockId] })
  .then(data => console.log('Riff中的卡片:', data));
```

### 步骤5：打开卡片浏览器

1. 点击顶栏的FSRS图标
2. 检查秀元卡片是否还在
3. 如果被删除，查看控制台的全量同步日志

## 预期结果

### ✅ 成功的情况

- 控制台显示"Added representative block to Riff"
- Riff API返回卡片数据
- 打开卡片浏览器后，秀元卡片仍然存在
- 全量同步日志显示：`Deleted 0 cards not in Riff`

### ❌ 失败的情况

#### 情况1：创建时没有调用addRiffCards

**症状**：
- 控制台没有"Added representative block to Riff"日志
- 或者显示"Failed to add to Riff"错误

**原因**：
- 新代码未生效（需要重新编译）
- Riff API调用失败

**解决**：
```bash
cd siyuan-plugin-siyuanmemo
npm run build
# 然后重启思源笔记
```

#### 情况2：创建成功但被全量同步删除

**症状**：
- 创建时有"Added representative block to Riff"日志
- 但打开浏览器后卡片消失
- 全量同步日志显示：`Deleted X cards not in Riff`

**原因**：
- `card.blockId`和Riff中的blockId不匹配
- 可能是ID转换逻辑有问题

**调试**：
在控制台执行：
```javascript
// 获取本地卡片
const cards = JSON.parse(localStorage.getItem('siyuan-plugin-siyuanmemo-cards') || '[]');
const xiuyuanCards = cards.filter(c => c.meta?.xiuyuanID);
console.log('本地秀元卡片:', xiuyuanCards);

// 检查blockId
xiuyuanCards.forEach(card => {
  console.log(`卡片 ${card.id} 的 blockId: ${card.blockId}`);
});
```

#### 情况3：Riff API返回空

**症状**：
- 创建时有"Added representative block to Riff"日志
- 但Riff API查询返回空数组

**原因**：
- Riff数据库延迟
- 块ID不存在

**解决**：
等待几秒后重新查询

## 临时禁用全量同步

如果需要临时禁用全量同步以防止卡片被删除：

1. 打开设置面板
2. 找到"Riff集成"设置
3. 禁用"全量同步"
4. 保存设置
5. 重启插件

或者在控制台执行：

```javascript
// 获取当前设置
const settings = JSON.parse(localStorage.getItem('siyuan-plugin-siyuanmemo-settings') || '{}');

// 禁用全量同步
settings.riffIntegration.fullSync.enabled = false;

// 保存
localStorage.setItem('siyuan-plugin-siyuanmemo-settings', JSON.stringify(settings));

// 重启插件
location.reload();
```

## 关键代码位置

### 创建秀元卡片
文件：`src/core/xiuyuan/service.ts`
方法：`createFromBlocks()`
关键行：
- 第432行：选择代表块
- 第437行：添加到Riff
- 第445行：标记块属性
- 第479行：设置FSRSCard的blockId

### 全量同步
文件：`src/services/HybridSyncService.ts`
方法：`fullSync()`
关键行：
- 第472行：构建riffBlockIds集合
- 第489行：过滤要删除的卡片

### 迁移服务
文件：`src/services/MigrationService.ts`
方法：`migrateExistingXiuyuanCards()`

## 下一步

1. 重启思源笔记
2. 创建测试秀元卡片
3. 根据日志判断问题
4. 如果还有问题，把控制台日志发给我

## 常见问题

### Q: 为什么旧的秀元卡片被删除了？

A: 因为旧代码在创建秀元卡片时没有调用`addRiffCards`，所以Riff数据库中没有这些卡片的记录。全量同步时，发现本地有但Riff没有，就删除了。

### Q: 迁移服务会恢复被删除的卡片吗？

A: 不会。迁移服务只能迁移还存在的秀元卡片。如果卡片已经被删除，需要重新创建。

### Q: 如何确认新代码已经生效？

A: 创建秀元卡片时，控制台应该显示"Added representative block to Riff"日志。如果没有，说明新代码未生效。

### Q: 可以恢复被删除的卡片吗？

A: 如果你有备份，可以从备份恢复。否则需要重新创建。

