# Riff 解耦 - 下一步快速指南

**当前状态**: 阶段 1-2 完成 (12/39 任务, 31%)  
**下一个任务**: 3.1 扩展 SchedulerRouterConfig  
**详细报告**: 查看 `RIFF_DECOUPLING_PROGRESS_REPORT.md`

---

## 🎯 立即开始

### 1. 恢复上下文（2 分钟）

```bash
# 阅读进度报告
cat RIFF_DECOUPLING_PROGRESS_REPORT.md

# 查看任务清单
cat .kiro/specs/riff-decoupling/tasks.md
```

### 2. 验证现有工作（1 分钟）

```bash
# 运行测试确认一切正常
npm test -- riff.test.ts
npm test -- RiffDataSource.test.ts
```

### 3. 开始任务 3.1（立即）

**目标**: 在 SchedulerRouter 中添加 `riffIntegration` 配置

**文件**: `src/core/scheduler/SchedulerRouter.ts`

**需要添加**:
```typescript
interface RiffIntegrationConfig {
  mode: 'disabled' | 'data-only' | 'full-scheduler';
  syncToRiff: boolean;
  useRiffScheduler: boolean;
}

interface SchedulerRouterConfig {
  // 现有字段...
  riffIntegration?: RiffIntegrationConfig;
}
```

**默认值**:
```typescript
{
  mode: 'data-only',
  syncToRiff: false,
  useRiffScheduler: false
}
```

---

## 📋 后续任务顺序

1. ✅ 任务 3.1: 扩展 SchedulerRouterConfig
2. ⏳ 任务 3.2: 实现模式 1（完全独立）
3. ⏳ 任务 3.3: 实现模式 2（双向同步）
4. ⏳ 任务 3.4: 实现模式 3（Riff 调度器）
5. ⏳ 任务 3.5: 实现配置动态更新
6. ⏳ 任务 3.6: 编写 SchedulerRouter 集成测试

---

## 💡 提示词模板

在新会话中使用：

```
继续执行 riff-decoupling 规范的任务 3.1。

当前进度：
- ✅ 阶段 1: Riff API 层重构（5/5 任务完成）
- ✅ 阶段 2: RiffDataSource 实现（7/7 任务完成）
- ⏳ 阶段 3: SchedulerRouter 集成（0/6 任务）

下一个任务：3.1 扩展 SchedulerRouterConfig

请阅读 RIFF_DECOUPLING_PROGRESS_REPORT.md 和 NEXT_STEPS.md 了解详情，
然后开始实现 SchedulerRouterConfig 的扩展。
```

---

## ✅ 已完成的工作

### Riff API 层 (100%)
- ✅ getRiffCards() - 14 测试通过
- ✅ getRiffNewCards() - 15 测试通过
- ✅ updateRiffCard() - 20 测试通过
- ✅ syncToRiff() - 21 测试通过

### RiffDataSource (100%)
- ✅ 三种模式实现（due-only, all, incremental）
- ✅ 本地数据优先合并
- ✅ Topic 卡片过滤
- ✅ 29 个单元测试通过

**总计**: 99 个测试，100% 通过率 ✅

---

## 📚 关键参考

- **进度报告**: `RIFF_DECOUPLING_PROGRESS_REPORT.md`
- **需求文档**: `.kiro/specs/riff-decoupling/requirements.md`
- **设计文档**: `.kiro/specs/riff-decoupling/design.md`
- **任务清单**: `.kiro/specs/riff-decoupling/tasks.md`

---

**准备好了吗？开始任务 3.1！** 🚀
