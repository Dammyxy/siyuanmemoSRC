# i18n 修复验证清单

## 需要验证的内容

### 1. 复习界面评分按钮
打开任意复习队列（提取练习、渐进学习、刻意练习等），检查评分按钮：
- [ ] 英文界面显示：Again, Hard, Good, Easy
- [ ] 中文界面显示：重来、困难、良好、简单

### 2. 块菜单 - 复习入口
右键点击任意块 → 插件 → SiyuanMemo，检查菜单项：
- [ ] 英文界面显示：
  - Retrieval Practice - Due (0/0)
  - Retrieval Practice - All (0)
  - Incremental Learning - Due (0/0)
  - Incremental Learning - All (0)
  - Temporary Drill - All (0)
  - Add to Deliberate Practice - All (0)
  
- [ ] 中文界面显示：
  - 提取练习 - 到期 (0/0)
  - 提取练习 - 全部 (0)
  - 渐进学习 - 到期 (0/0)
  - 渐进学习 - 全部 (0)
  - 临时练习 - 全部 (0)
  - 添加到刻意练习 - 全部 (0)

### 3. 块菜单 - 其他按钮
右键点击任意块 → 插件 → SiyuanMemo，检查其他按钮：
- [ ] 英文界面显示：
  - 📍 Make Concept Card and Add to Queue
  - 🚀 Make Concept Card and Start Roaming
  - Create List Template Card
  - Remove Card
  - Edit SRS Data
  
- [ ] 中文界面显示：
  - 📍 制作为概念卡并加入队列
  - 🚀 制作为概念卡并立即漫游
  - 创建列表模版卡
  - 取消闪卡
  - 编辑SRS数据

## 修改的文件列表

1. `src/strategies/UnifiedReviewAdapter.ts` - 评分按钮 i18n
2. `src/strategies/createUnifiedReviewDialog.ts` - 传递 i18n
3. `src/services/ReviewDialogManager.ts` - 传递 i18n（2处）
4. `src/services/BlockMenuHandler.ts` - "到期"/"全部"文本 i18n
5. `src/services/RetrievalPracticeEntry.ts` - displayName i18n
6. `src/services/IncrementalLearningEntry.ts` - displayName i18n
7. `src/services/FinalDrillEntry.ts` - displayName i18n
8. `src/services/AddToFinalDrillEntry.ts` - displayName i18n
9. `src/services/TemporaryDrillEntry.ts` - displayName i18n
10. `src/i18n/zh_CN.json` - 新增7个键值
11. `src/i18n/en_US.json` - 新增7个键值

## 新增的 i18n 键值

### 中文（zh_CN.json）
```json
{
  "makeConceptAndAddToQueue": "📍 制作为概念卡并加入队列",
  "makeConceptAndStartRoam": "🚀 制作为概念卡并立即漫游",
  "createListTemplateCard": "创建列表模版卡",
  "addToFinalDrillQueue": "添加到刻意练习",
  "temporaryDrill": "临时练习",
  "dueMode": "到期",
  "allMode": "全部"
}
```

### 英文（en_US.json）
```json
{
  "makeConceptAndAddToQueue": "📍 Make Concept Card and Add to Queue",
  "makeConceptAndStartRoam": "🚀 Make Concept Card and Start Roaming",
  "createListTemplateCard": "Create List Template Card",
  "addToFinalDrillQueue": "Add to Deliberate Practice",
  "temporaryDrill": "Temporary Drill",
  "dueMode": "Due",
  "allMode": "All"
}
```

## 使用的已存在 i18n 键值

- `cardRatingAgain`: "重来" / "Again"
- `cardRatingHard`: "困难" / "Hard"
- `cardRatingGood`: "良好" / "Good"
- `cardRatingEasy`: "简单" / "Easy"
- `retrievalPractice`: "提取练习" / "Retrieval Practice"
- `incrementalLearning`: "渐进学习" / "Incremental Learning"
- `finalDrill`: "刻意练习" / "Deliberate Practice"
- `deleteCard`: "取消闪卡" / "Remove Card"
- `editSrsData`: "编辑SRS数据" / "Edit SRS Data"

## 编译和测试步骤

1. 编译插件：
   ```bash
   cd siyuan-plugin-siyuanmemo
   pnpm run build
   ```

2. 重新加载插件：
   - 在思源笔记中，打开设置 → 集市 → 已下载 → 插件
   - 找到 SiyuanMemo 插件，点击"重新加载"

3. 切换语言测试：
   - 设置 → 外观 → 语言
   - 分别测试中文和英文界面

4. 验证所有菜单项和按钮的文本是否正确显示

## 常见问题

### Q: 修改后还是显示中文？
A: 请确保：
1. 已经重新编译插件（`pnpm run build`）
2. 已经重新加载插件
3. 如果还不行，尝试重启思源笔记

### Q: 部分文本显示正确，部分还是中文？
A: 检查浏览器控制台是否有错误信息，可能是某个文件编译失败。

### Q: 英文界面下还是显示中文？
A: 检查 `plugin.i18n` 是否正确传递到各个组件。可以在控制台输出 `plugin.i18n` 查看。
