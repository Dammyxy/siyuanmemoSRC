# DDD 统一架构 - 快速参考

## 📊 当前进度

```
██████████░░░░░░░░░░░░░░░░░░░░ 35%
```

**Phase 2 进度：35%**
- ✅ Phase 1：扩展 DDD 架构（100%）
- ✅ Phase 2.1：BlockMenuHandler 迁移（100%）
- ✅ Phase 2.2.0：AutoCardHandler 辅助方法（100%）
- ⏳ Phase 2.2.1-3：AutoCardHandler 概念卡迁移（0%）

## 🎯 下一步行动

### 立即（今天）
1. ⭐⭐⭐ **测试 BlockMenuHandler 迁移**
   - 文档：[phase2-testing-guide.md](./phase2-testing-guide.md)
   - 时间：30-60 分钟
   - 优先级：最高

2. **决定下一步方向**
   - 选项 A：继续 AutoCardHandler 迁移
   - 选项 B：修复问题
   - 选项 C：跳过 AutoCardHandler

### 本周
- [ ] 完成 Phase 2.2.1：迁移简单场景（2-3 小时）
- [ ] 完成 Phase 2.2.2：迁移 Xiuyuan 调用（3-4 小时）
- [ ] 标记 Phase 2.2.3 的 TODO（15 分钟）

## 📚 核心文档

| 文档 | 用途 | 优先级 |
|------|------|--------|
| [next-actions.md](./next-actions.md) | 行动计划 | ⭐⭐⭐ |
| [phase2-testing-guide.md](./phase2-testing-guide.md) | 测试指南 | ⭐⭐⭐ |
| [autocard-complexity-analysis.md](./autocard-complexity-analysis.md) | 复杂度分析 | ⭐⭐⭐ |
| [phase2-summary.md](./phase2-summary.md) | 阶段总结 | ⭐⭐ |
| [unification-progress.md](./unification-progress.md) | 进度跟踪 | ⭐⭐ |
| [complete-unification-plan.md](./complete-unification-plan.md) | 总体规划 | ⭐ |

## 🔑 关键代码位置

### BlockMenuHandler
- **文件**：`src/services/BlockMenuHandler.ts`
- **方法**：`makeConceptAndAddToRoam()`
- **状态**：✅ 已迁移，待测试

### AutoCardHandler
- **文件**：`src/services/handlers/AutoCardHandler.ts`
- **辅助方法**：
  - `getCardService()` - ✅ 已完成
  - `createConceptCardViaDDD()` - ✅ 已完成
- **待迁移方法**：
  - `createConceptCard()` - ⏳ 进行中
    - 简单场景（920-980 行）- 待迁移
    - Xiuyuan 调用（880-920 行）- 待迁移
    - 复杂逻辑（820-880 行）- 暂时保留

## 🧪 测试场景

### BlockMenuHandler 测试
1. ✅ DDD 路径创建概念卡
2. ✅ 降级机制测试
3. ✅ 优先级设置测试
4. ✅ Riff 同步测试

### AutoCardHandler 测试（待完成）
1. ⏳ 简单概念卡：`概念::定义`
2. ⏳ 块引用概念卡：`((block-id))::定义`
3. ⏳ 挖空概念卡：`((block-id))::==定义==`

## ⚠️ 风险点

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 测试失败 | 高 | 详细测试指南 |
| 复杂度超预期 | 高 | 分阶段迁移 |
| 时间不足 | 中 | 优先级排序 |
| 性能下降 | 中 | 性能测试 |

## 📈 成功标准

### 功能标准
- [ ] BlockMenuHandler 迁移完成并测试通过
- [ ] AutoCardHandler 简单场景迁移完成
- [ ] 降级机制正常工作
- [ ] 所有测试通过

### 质量标准
- [ ] 代码覆盖率 > 80%
- [ ] 无控制台错误
- [ ] 性能无明显下降

### 时间标准
- [ ] Phase 2 在 3-5 天内完成

## 🛠️ 常用命令

### 运行测试
```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- CreateCardUseCase.test.ts
```

### 检查代码
```bash
# 类型检查
npm run type-check

# 代码格式化
npm run format

# 代码检查
npm run lint
```

### 构建插件
```bash
# 开发构建
npm run dev

# 生产构建
npm run build
```

## 💡 快速提示

### 如何测试 BlockMenuHandler？
1. 打开思源笔记
2. 创建一个测试块
3. 右键点击块 → 选择"创建概念卡片"
4. 观察控制台输出和成功提示

### 如何检查 DDD 是否工作？
```javascript
// 在浏览器控制台执行
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const cardService = plugin.context.getCardService();
console.log('CardService:', cardService);
```

### 如何查看 Xiuyuan 数据？
```javascript
// 在浏览器控制台执行
const repo = plugin.context.xiuyuanRepo;
const all = await repo.findAll();
console.log('All Xiuyuan:', all);
```

## 🔗 相关链接

- [思源笔记 API 文档](https://github.com/siyuan-note/siyuan/blob/master/API.md)
- [FSRS 算法文档](https://github.com/open-spaced-repetition/fsrs4anki/wiki)
- [DDD 设计模式](https://martinfowler.com/bliki/DomainDrivenDesign.html)

## 📞 获取帮助

### 遇到问题？
1. 查看 [phase2-testing-guide.md](./phase2-testing-guide.md) 的"常见问题排查"
2. 检查控制台错误信息
3. 查看相关文档
4. 回滚到之前的版本

### 需要调整计划？
1. 查看 [next-actions.md](./next-actions.md)
2. 评估风险和时间
3. 调整优先级
4. 更新进度文档

---

**最后更新**：2026-02-19
**当前状态**：等待测试
**下一个里程碑**：Phase 2 完成（预计 2-3 天）
