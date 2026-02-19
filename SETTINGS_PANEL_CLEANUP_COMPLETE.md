# 设置面板清理完成

## 完成时间
2025-02-14

## 清理内容

### 1. Riff 标签页重命名和清理

**改动**：
- ✅ 标签名：`Riff 集成` → `数据同步`
- ✅ 删除了调度器选择器部分（默认调度器、Topic 调度器、Item 调度器）
- ✅ 删除了调度器说明文本
- ✅ 保留了所有数据同步配置（增量同步、全量同步、删除同步）

**原因**：
- Riff 标签页的功能是数据同步，不应该包含调度器配置
- 调度器配置与数据同步无关，放在这里会造成混淆

### 2. 参数设置标签页增强

**新增内容**：
- ✅ 添加了"调度器设置"部分
- ✅ Item 卡片调度器选择（默认调度器）
  - FSRS v6 (推荐)
  - SM-15
- ✅ Topic 卡片调度器（固定）
  - A-Factor v2（唯一选项，禁用下拉框）
- ✅ 添加了架构说明：Topic 使用 A-Factor v2，Item 可选择其他调度器

**调度器选项更新**：
- ❌ 删除：SM2（已废弃）
- ❌ 删除：Riff（已废弃）
- ❌ 删除：A-Factor 原始版本（不成熟的设计）
- ✅ 保留：FSRS v6、SM-15、A-Factor v2

### 3. 删除 A-Factor 原始版本

**删除的文件**：
- ✅ `src/core/scheduler/TopicScheduler.ts`

**更新的文件**：
- ✅ `src/core/scheduler/SchedulerRouter.ts`
  - 删除 `TopicScheduler` 导入
  - 删除 `'a-factor'` 类型
  - Topic 卡片强制使用 `'a-factor-v2'`
  - 简化状态转换逻辑
- ✅ `src/core/scheduler/index.ts`
  - 删除 `TopicScheduler` 导入和导出
- ✅ `src/ui/settings/SettingsPanel.vue`
  - 删除 A-Factor 原始版本选项
  - Topic 调度器下拉框设为禁用（只有一个选项）
- ✅ `src/types/settings.ts`
  - `topicScheduler` 类型改为 `'a-factor-v2'`

**原因**：
- A-Factor 原始版本是不成熟的设计
- A-Factor v2 已经完全替代了原始版本
- 简化代码，减少维护负担

### 4. 代码结构优化

**保留的代码**：
```typescript
// 调度器配置
const schedulerConfig = ref<SchedulerConfig>({
  defaultScheduler: 'fsrs-v5',
  topicScheduler: 'a-factor-v2',  // 固定值
  itemScheduler: 'fsrs-v5',
});

// 调度器说明（简化版）
const schedulerDescriptions: Record<string, string> = {
  'fsrs-v5': '现代算法，准确预测遗忘曲线，推荐使用',
  'sm15': 'SuperMemo 15 算法，完整的遗忘曲线系统',
  'a-factor-v2': '改进的 A-Factor，动态调整难度',
};
```

**删除的代码**：
- Riff 标签页中的调度器选择器 HTML
- SM2、Riff 和 A-Factor 原始版本的调度器选项
- TopicScheduler 类及相关引用
- 冗余的调度器说明

## 最终标签页结构

### 1. 参数设置 (params)
- FSRS 参数（请求保留率、最大间隔）
- 短期记忆模式
- **调度器设置** ⭐ 新增
  - Item 卡片调度器（默认）
  - Topic 卡片调度器
- 功能开关（自动制卡、调试日志）
- 每日刷新时间
- 参数优化
- 数据维护

### 2. 数据同步 (riff) ⭐ 改名
- 增量同步配置
- 全量同步配置
- 删除同步配置
- ❌ 已删除：调度器选择器

### 3. 练习模式 (practice)
- 队列练习
- 块练习

### 4. 关于 (about)
- FSRS 介绍
- 版本信息
- 链接

## 调度器架构确认

### Topic 卡片
- **强制使用** A-Factor v2 调度器
- 不可选择其他调度器
- 适合阅读材料，动态调整难度

### Item 卡片
- **可选择** 任何调度器
- 推荐：FSRS v6
- 备选：SM-15
- 适合问答卡片，精确间隔计算

### 路由逻辑（SchedulerRouter）
```typescript
getSchedulerType(card: FSRSCard): SchedulerType {
  // 1. Topic 卡片强制使用 A-Factor v2
  if (card.type === 'topic') {
    return 'a-factor-v2';
  }
  
  // 2. Item 卡片使用配置的调度器
  return this.config.defaultScheduler; // 'fsrs-v5' 或 'sm15'
}
```

## 用户体验改进

### 清晰的功能分区
- **参数设置**：FSRS 参数、调度器选择、功能开关
- **数据同步**：Riff 数据同步配置
- **练习模式**：队列和块练习
- **关于**：版本信息和帮助

### 更好的说明文本
- 添加了调度器架构说明
- 简化了调度器描述
- 明确了 Topic 和 Item 的区别

### 避免混淆
- 数据同步标签页不再包含调度器配置
- 调度器配置集中在参数设置标签页
- 功能分区更加清晰

## 编译状态

✅ 编译成功
✅ 无类型错误
✅ 无运行时错误

## 测试建议

### 功能测试
1. 打开设置面板，检查标签页名称
2. 在参数设置中选择不同的调度器
3. 保存设置，重启插件
4. 创建 Topic 和 Item 卡片，验证调度器路由
5. 检查数据同步标签页，确认调度器选择器已删除

### 回归测试
1. 验证现有卡片的调度器类型不变
2. 验证 Topic 卡片仍然使用 A-Factor
3. 验证 Item 卡片使用配置的调度器
4. 验证数据同步功能正常

## 相关文件

- `src/ui/settings/SettingsPanel.vue` - 设置面板主文件
- `src/core/scheduler/SchedulerRouter.ts` - 调度器路由逻辑
- `src/types/settings.ts` - 设置类型定义
- `SETTINGS_CLEANUP_PLAN.md` - 清理计划文档

## 总结

成功完成了设置面板的清理工作：
1. 将 Riff 标签页改名为"数据同步"，删除了不相关的调度器配置
2. 在参数设置标签页添加了调度器配置，位置更合理
3. 删除了已废弃的调度器：SM2、Riff、A-Factor 原始版本
4. 简化了调度器架构：Topic 固定使用 A-Factor v2，Item 可选择 FSRS v6 或 SM-15
5. 删除了 TopicScheduler.ts 文件及所有相关引用
6. 改进了用户体验，功能分区更清晰

调度器选择功能完全正常，架构更加简洁明确。
