# Riff 集成文档索引

> **完整的 Riff 集成功能文档**

---

## 📚 文档导航

### 🚀 快速开始

**适合人群**：所有用户，特别是新用户

- **[快速开始指南](./QUICK_START.md)** - 5 分钟快速上手
  - 选择模式
  - 基础配置
  - 开始使用
  - 常见场景

### 📖 完整指南

**适合人群**：想深入了解功能的用户

- **[Riff 集成使用指南](./RIFF_INTEGRATION_GUIDE.md)** - 完整的功能说明
  - 什么是 Riff 集成
  - 两种模式详解
  - 配置选项说明
  - 使用场景和最佳实践
  - 常见问题

### 📝 迁移指南

**适合人群**：从旧版本升级的用户

- **[配置迁移说明](./MIGRATION_GUIDE.md)** - 升级指南
  - 迁移概述
  - 迁移流程
  - 迁移规则详解
  - 注意事项
  - 常见迁移问题
  - 回滚指南

### ❓ 常见问题

**适合人群**：遇到问题的用户

- **[常见问题解答（FAQ）](./FAQ.md)** - 问题和解答
  - 基础问题
  - 同步问题
  - 删除问题
  - 黑名单问题
  - 模式切换问题
  - 性能问题
  - 故障排除

### 🧪 测试指南

**适合人群**：测试人员和高级用户

- **[手动测试指南](../RIFF_HYBRID_SYNC_MANUAL_TESTING_GUIDE.md)** - 测试指南
  - 测试环境准备
  - 完整用户流程测试
  - 边界情况测试
  - UI 交互测试
  - 测试检查清单

### 📄 功能说明

**适合人群**：想快速了解功能的用户

- **[Riff 集成功能说明](./README_RIFF_INTEGRATION.md)** - 功能概述
  - 核心特性
  - 快速开始
  - 性能指标
  - 使用场景
  - 技术架构

### 🔧 开发者文档

**适合人群**：开发者和技术人员

- **[开发者指南](./RIFF_HYBRID_SYNC_DEVELOPER_GUIDE.md)** - 完整的开发者文档
  - 快速开始
  - 核心概念
  - 开发指南
  - 性能优化
  - 测试指南
  - 故障排除

- **[架构文档](./RIFF_HYBRID_SYNC_ARCHITECTURE.md)** - 系统架构和数据流
  - 整体架构图
  - 高阶模式 vs 简单模式
  - 数据流详解
  - 组件关系图
  - 模式对比
  - 扩展指南

- **[API 文档](./RIFF_HYBRID_SYNC_API.md)** - HybridSyncService API 参考
  - 类定义和接口
  - 方法详解
  - 使用示例
  - 最佳实践
  - 常见问题

- **[设计决策文档](./RIFF_HYBRID_SYNC_DESIGN_DECISIONS.md)** - 设计权衡和理由
  - 为什么选择混合同步
  - 为什么使用黑名单
  - 为什么架构简化
  - 性能优化考虑
  - 错误处理策略
  - 未来扩展

---

## 🎯 按需求查找文档

### 我是新用户

1. 先看 **[快速开始指南](./QUICK_START.md)**
2. 再看 **[Riff 集成使用指南](./RIFF_INTEGRATION_GUIDE.md)**
3. 遇到问题查看 **[FAQ](./FAQ.md)**

### 我要升级插件

1. 先看 **[配置迁移说明](./MIGRATION_GUIDE.md)**
2. 遇到问题查看 **[FAQ](./FAQ.md)**
3. 需要详细了解查看 **[Riff 集成使用指南](./RIFF_INTEGRATION_GUIDE.md)**

### 我遇到了问题

1. 先看 **[FAQ](./FAQ.md)**
2. 找不到答案查看 **[Riff 集成使用指南](./RIFF_INTEGRATION_GUIDE.md)**
3. 仍然无法解决提交 Issue 或寻求帮助

### 我想了解技术细节

1. 先看 **[开发者指南](./RIFF_HYBRID_SYNC_DEVELOPER_GUIDE.md)**
2. 再看 **[架构文档](./RIFF_HYBRID_SYNC_ARCHITECTURE.md)**
3. 深入了解 **[API 文档](./RIFF_HYBRID_SYNC_API.md)** 和 **[设计决策文档](./RIFF_HYBRID_SYNC_DESIGN_DECISIONS.md)**
4. 查看源代码和测试用例

### 我是开发者

1. 先看 **[开发者指南](./RIFF_HYBRID_SYNC_DEVELOPER_GUIDE.md)**
2. 学习 **[API 文档](./RIFF_HYBRID_SYNC_API.md)**
3. 理解 **[架构文档](./RIFF_HYBRID_SYNC_ARCHITECTURE.md)**
4. 了解 **[设计决策文档](./RIFF_HYBRID_SYNC_DESIGN_DECISIONS.md)**
5. 查看源代码实现

### 我要测试功能

1. 先看 **[手动测试指南](../RIFF_HYBRID_SYNC_MANUAL_TESTING_GUIDE.md)**
2. 参考 **[Riff 集成使用指南](./RIFF_INTEGRATION_GUIDE.md)**
3. 遇到问题查看 **[FAQ](./FAQ.md)**

---

## 📊 文档结构

```
docs/
├── INDEX.md                                # 本文档（文档索引）
├── QUICK_START.md                          # 快速开始指南
├── RIFF_INTEGRATION_GUIDE.md               # 完整使用指南
├── MIGRATION_GUIDE.md                      # 配置迁移说明
├── FAQ.md                                  # 常见问题解答
├── README_RIFF_INTEGRATION.md              # 功能说明
├── RIFF_HYBRID_SYNC_DEVELOPER_GUIDE.md     # 开发者指南
├── RIFF_HYBRID_SYNC_ARCHITECTURE.md        # 架构文档
├── RIFF_HYBRID_SYNC_API.md                 # API 文档
└── RIFF_HYBRID_SYNC_DESIGN_DECISIONS.md    # 设计决策文档

../
└── RIFF_HYBRID_SYNC_MANUAL_TESTING_GUIDE.md  # 手动测试指南
```

---

## 🔍 按主题查找

### 模式选择

- [快速开始 - 选择模式](./QUICK_START.md#步骤-1选择模式30-秒)
- [使用指南 - 两种模式对比](./RIFF_INTEGRATION_GUIDE.md#两种模式对比)
- [FAQ - 模式切换问题](./FAQ.md#模式切换问题)

### 同步功能

- [使用指南 - 三种同步机制](./RIFF_INTEGRATION_GUIDE.md#三种同步机制)
- [FAQ - 同步问题](./FAQ.md#同步问题)
- [功能说明 - 混合同步方案](./README_RIFF_INTEGRATION.md#-混合同步方案高阶模式)

### 删除操作

- [使用指南 - 删除同步](./RIFF_INTEGRATION_GUIDE.md#3-删除同步delete-sync)
- [FAQ - 删除问题](./FAQ.md#删除问题)

### 黑名单

- [使用指南 - 黑名单机制](./RIFF_INTEGRATION_GUIDE.md#黑名单机制)
- [FAQ - 黑名单问题](./FAQ.md#黑名单问题)

### 配置选项

- [使用指南 - 配置选项说明](./RIFF_INTEGRATION_GUIDE.md#配置选项说明)
- [快速开始 - 高阶模式配置](./QUICK_START.md#-高阶模式详细配置可选)

### 性能

- [功能说明 - 性能指标](./README_RIFF_INTEGRATION.md#性能指标)
- [FAQ - 性能问题](./FAQ.md#性能问题)

### 故障排除

- [FAQ - 故障排除](./FAQ.md#故障排除)
- [迁移指南 - 常见迁移问题](./MIGRATION_GUIDE.md#常见迁移问题)

---

## 📖 阅读建议

### 第一次使用

**推荐阅读顺序**：

1. **[快速开始指南](./QUICK_START.md)** （5 分钟）
   - 了解基本概念
   - 完成基础配置
   - 开始使用

2. **[Riff 集成使用指南](./RIFF_INTEGRATION_GUIDE.md)** （20 分钟）
   - 深入了解功能
   - 学习最佳实践
   - 掌握高级用法

3. **[FAQ](./FAQ.md)** （按需查阅）
   - 遇到问题时查阅
   - 了解常见问题

### 从旧版本升级

**推荐阅读顺序**：

1. **[配置迁移说明](./MIGRATION_GUIDE.md)** （10 分钟）
   - 了解迁移流程
   - 注意事项
   - 常见问题

2. **[Riff 集成使用指南](./RIFF_INTEGRATION_GUIDE.md)** （20 分钟）
   - 了解新功能
   - 学习新用法

3. **[FAQ](./FAQ.md)** （按需查阅）
   - 解决迁移问题

### 遇到问题

**推荐查阅顺序**：

1. **[FAQ](./FAQ.md)**
   - 查找相关问题
   - 尝试解决方案

2. **[Riff 集成使用指南](./RIFF_INTEGRATION_GUIDE.md)**
   - 查看详细说明
   - 理解工作原理

3. **提交 Issue 或寻求帮助**
   - 如果问题仍未解决

---

## 🆘 获取帮助

### 文档内查找

1. 使用浏览器的搜索功能（Ctrl+F / Cmd+F）
2. 查看文档目录
3. 按主题查找

### 社区支持

- 🐛 [提交 Issue](https://github.com/your-repo/issues)
- 💬 在社区论坛寻求帮助
- 📧 联系开发团队

### 贡献文档

如果您发现文档有误或需要改进：

1. 提交 Issue 说明问题
2. 提交 Pull Request 改进文档
3. 在社区分享您的经验

---

## 📝 文档版本

| 文档 | 版本 | 更新日期 |
|------|------|---------|
| 快速开始指南 | 1.0 | 2024-01 |
| Riff 集成使用指南 | 1.0 | 2024-01 |
| 配置迁移说明 | 1.0 | 2024-01 |
| 常见问题解答 | 1.0 | 2024-01 |
| 功能说明 | 1.0 | 2024-01 |
| 手动测试指南 | 1.0 | 2024-01 |
| 开发者指南 | 1.0 | 2024-02 |
| 架构文档 | 1.0 | 2024-02 |
| API 文档 | 1.0 | 2024-02 |
| 设计决策文档 | 1.0 | 2024-02 |

---

## 🎯 快速链接

### 最常用文档

- 🚀 [快速开始](./QUICK_START.md)
- 📖 [完整指南](./RIFF_INTEGRATION_GUIDE.md)
- ❓ [FAQ](./FAQ.md)

### 特定主题

- 🔄 [同步功能](./RIFF_INTEGRATION_GUIDE.md#三种同步机制)
- 🗑️ [删除操作](./RIFF_INTEGRATION_GUIDE.md#3-删除同步delete-sync)
- 🛡️ [黑名单](./RIFF_INTEGRATION_GUIDE.md#黑名单机制)
- ⚙️ [配置选项](./RIFF_INTEGRATION_GUIDE.md#配置选项说明)
- 🏗️ [架构设计](./RIFF_HYBRID_SYNC_ARCHITECTURE.md)
- 📡 [API 参考](./RIFF_HYBRID_SYNC_API.md)

### 问题解决

- 🔧 [故障排除](./FAQ.md#故障排除)
- 📝 [迁移问题](./MIGRATION_GUIDE.md#常见迁移问题)
- 🆘 [获取帮助](./FAQ.md#获取更多帮助)

---

**感谢使用本插件！** 🎉

如有任何问题或建议，欢迎反馈！

---

**文档索引版本**: 1.0  
**最后更新**: 2024-01
