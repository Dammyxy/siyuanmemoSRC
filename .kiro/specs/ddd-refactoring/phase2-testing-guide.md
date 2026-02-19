# Phase 2 测试指南 - BlockMenuHandler 概念卡迁移

## 测试目标

验证 BlockMenuHandler 的概念卡创建功能是否正确迁移到 DDD 架构。

## 测试环境准备

### 1. 确认插件已加载
- 打开思源笔记
- 确认 SiYuanMemo 插件已启用
- 检查控制台是否有错误信息

### 2. 准备测试文档
创建一个新文档，命名为"DDD 概念卡测试"

## 测试场景

### 场景 1：通过块菜单创建概念卡（DDD 路径）

**前置条件**：
- CardApplicationService 可用
- Xiuyuan 系统正常工作

**测试步骤**：
1. 在测试文档中创建一个块，输入任意内容（如"测试概念"）
2. 右键点击块，打开块菜单
3. 选择"创建概念卡片"选项
4. 观察是否显示成功提示："✅ 概念卡创建成功！"

**预期结果**：
- ✅ 显示成功提示
- ✅ 块被标记为卡片（有卡片图标）
- ✅ 卡片被添加到 Riff 卡组
- ✅ 控制台输出：`[AutoCard] Concept card created via DDD: <blockId>`

**验证方法**：
```javascript
// 在浏览器控制台执行
// 1. 检查 Xiuyuan 是否创建
const xiuyuanRepo = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo').context.xiuyuanRepo;
const allXiuyuan = await xiuyuanRepo.findAll();
console.log('所有 Xiuyuan:', allXiuyuan);

// 2. 检查卡片是否创建
const lastXiuyuan = allXiuyuan[allXiuyuan.length - 1];
console.log('最新 Xiuyuan:', lastXiuyuan);
console.log('卡片数量:', lastXiuyuan.cards.length);
```

### 场景 2：降级机制测试（Fallback 路径）

**前置条件**：
- 模拟 CardApplicationService 不可用

**测试步骤**：
1. 临时禁用 CardApplicationService（修改代码或注释掉）
2. 重复场景 1 的步骤
3. 观察是否使用旧方法创建卡片

**预期结果**：
- ✅ 显示成功提示（可能不同）
- ✅ 使用 `createDefaultCard()` 创建 FSRS 卡片
- ✅ 控制台输出：`[AutoCard] CardApplicationService not available, using fallback`

### 场景 3：优先级设置测试

**测试步骤**：
1. 创建一个块
2. 右键点击块，选择"创建概念卡片"
3. 在对话框中设置优先级为"高"
4. 确认创建

**预期结果**：
- ✅ 卡片的优先级被正确设置为"high"
- ✅ 块属性中包含优先级标记

### 场景 4：Riff 同步测试

**测试步骤**：
1. 创建概念卡片
2. 打开 Riff 卡组管理界面
3. 检查卡片是否出现在内置卡组中

**预期结果**：
- ✅ 卡片出现在 Riff 内置卡组
- ✅ 卡片可以正常复习

## 测试检查清单

### 功能测试
- [ ] 场景 1：DDD 路径创建成功
- [ ] 场景 2：降级机制正常工作
- [ ] 场景 3：优先级设置正确
- [ ] 场景 4：Riff 同步正常

### 数据完整性测试
- [ ] Xiuyuan 聚合根正确创建
- [ ] Card 实体正确创建
- [ ] BlockId、TemplateId、Priority 值对象正确
- [ ] 数据持久化到 xiuyuan.msgpack

### 错误处理测试
- [ ] CardApplicationService 不可用时降级
- [ ] 无效的 blockId 时显示错误
- [ ] 模板不存在时显示错误

### 性能测试
- [ ] 创建卡片响应时间 < 500ms
- [ ] 无内存泄漏
- [ ] 控制台无异常错误

## 常见问题排查

### 问题 1：CardApplicationService 不可用

**症状**：
- 控制台输出：`CardApplicationService not available`
- 使用降级方案创建卡片

**排查步骤**：
1. 检查 ApplicationContext 是否正确初始化
2. 检查 `plugin.context` 是否存在
3. 检查 `getCardService()` 方法是否正确实现

**解决方案**：
```typescript
// 在 index.ts 中确认
console.log('Plugin context:', this.context);
console.log('Card service:', this.context?.getCardService());
```

### 问题 2：模板不存在

**症状**：
- 错误信息：`Template not found: builtin-concept-simple`

**排查步骤**：
1. 检查 `builtin-concept.ts` 是否正确创建
2. 检查模板是否正确注册到 `builtin.ts`
3. 检查 TemplateRegistry 是否加载模板

**解决方案**：
```typescript
// 检查已注册的模板
const templateRegistry = plugin.context.templateRegistry;
const template = templateRegistry.getTemplate('builtin-concept-simple');
console.log('Template:', template);
```

### 问题 3：卡片创建成功但不显示

**症状**：
- 成功提示显示
- 但卡片浏览器中看不到卡片

**排查步骤**：
1. 检查 XiuyuanRepository 是否正确保存
2. 检查 xiuyuan.msgpack 文件是否更新
3. 检查卡片浏览器的查询逻辑

**解决方案**：
```typescript
// 手动检查存储
const repo = plugin.context.xiuyuanRepo;
const all = await repo.findAll();
console.log('All Xiuyuan:', all);
```

## 测试报告模板

```markdown
# Phase 2 测试报告 - BlockMenuHandler

## 测试环境
- 思源笔记版本：
- 插件版本：
- 测试日期：
- 测试人员：

## 测试结果

### 场景 1：DDD 路径
- 状态：✅ 通过 / ❌ 失败
- 备注：

### 场景 2：降级机制
- 状态：✅ 通过 / ❌ 失败
- 备注：

### 场景 3：优先级设置
- 状态：✅ 通过 / ❌ 失败
- 备注：

### 场景 4：Riff 同步
- 状态：✅ 通过 / ❌ 失败
- 备注：

## 发现的问题
1. 
2. 
3. 

## 建议
1. 
2. 
3. 

## 结论
- [ ] 可以继续 Phase 2 的其他迁移
- [ ] 需要修复问题后再继续
- [ ] 需要回滚到之前的版本
```

## 下一步行动

### 如果测试通过 ✅
1. 更新 `unification-progress.md`，标记 Phase 2.1 完成
2. 开始分析 AutoCardHandler 的迁移策略
3. 识别可以简化的部分
4. 制定详细的迁移计划

### 如果测试失败 ❌
1. 记录失败的场景和错误信息
2. 分析根本原因
3. 修复问题
4. 重新测试
5. 考虑是否需要调整架构设计

## 参考文档

- [完全统一架构计划](./complete-unification-plan.md)
- [统一进度跟踪](./unification-progress.md)
- [DDD 重构设计](./design.md)
- [测试指南](./testing-guide.md)
