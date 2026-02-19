# 概念卡功能测试

## 测试目标

验证"制作为概念卡"功能是否正常工作（DDD 架构迁移后）。

## 测试准备

### 1. 打开浏览器控制台
按 F12 打开开发者工具，切换到 Console 标签。

### 2. 确认插件已加载
在控制台执行：
```javascript
const plugin = window.siyuanMemoPlugin;
console.log('插件状态:', plugin ? '✅ 已加载' : '❌ 未加载');
console.log('ApplicationContext:', plugin?.context ? '✅ 已初始化' : '❌ 未初始化');
```

## 测试场景 1：制作为概念卡并加入队列

### 步骤
1. 在思源笔记中创建一个新块，输入内容：`测试概念`
2. 右键点击块图标（块左侧的小圆点）
3. 选择 SiyuanMemo → 📍 制作为概念卡并加入队列
4. 观察控制台输出和提示信息

### 预期结果
- ✅ 显示成功提示："✅ 概念卡创建成功！"
- ✅ 控制台输出：`[AutoCard] Concept card created via DDD: <blockId>`
- ✅ 块被标记为卡片（有卡片图标）

### 实际结果
- [ ] 成功提示：
- [ ] 控制台输出：
- [ ] 块标记：

## 测试场景 2：制作为概念卡并立即漫游

### 步骤
1. 创建另一个新块，输入内容：`高优先级概念`
2. 右键点击块图标
3. 选择 SiyuanMemo → 🚀 制作为概念卡并立即漫游
4. 观察控制台输出和提示信息

### 预期结果
- ✅ 显示成功提示："✅ 概念卡创建成功！"
- ✅ 控制台输出：`[AutoCard] Concept card created via DDD: <blockId>`
- ✅ 块被标记为卡片
- ✅ 优先级设置为 high

### 实际结果
- [ ] 成功提示：
- [ ] 控制台输出：
- [ ] 块标记：
- [ ] 优先级：

## 测试场景 3：验证 DDD 架构

### 步骤
在控制台执行以下代码：
```javascript
const plugin = window.siyuanMemoPlugin;
const repo = plugin.context.xiuyuanRepo;

// 获取所有 Xiuyuan
repo.findAll().then(all => {
  console.log('所有 Xiuyuan 数量:', all.length);
  
  if (all.length > 0) {
    const latest = all[all.length - 1];
    console.log('最新 Xiuyuan:', {
      id: latest.id,
      blockIDs: latest.blockIDs,
      templateID: latest.templateID,
      cardCount: latest.cards.length
    });
    
    if (latest.cards.length > 0) {
      console.log('第一张卡片:', {
        id: latest.cards[0].id,
        priority: latest.cards[0].priority
      });
    }
  }
});
```

### 预期结果
- ✅ 显示 Xiuyuan 数量（应该 >= 2，因为我们创建了 2 张卡片）
- ✅ 最新的 Xiuyuan 包含正确的信息
- ✅ 卡片数量 = 1（每个 Xiuyuan 一张卡片）

### 实际结果
- [ ] Xiuyuan 数量：
- [ ] 最新 Xiuyuan 信息：
- [ ] 卡片信息：

## 测试场景 4：验证降级机制

### 步骤
1. 在控制台临时禁用 CardApplicationService：
```javascript
const plugin = window.siyuanMemoPlugin;
const handler = plugin.context.getBlockMenuHandler();

// 保存原始方法
const originalGetCardService = handler.getCardService;

// 临时禁用
handler.getCardService = () => null;

console.log('✅ CardApplicationService 已临时禁用');
```

2. 创建一个新块，输入内容：`降级测试`
3. 右键点击块图标
4. 选择 SiyuanMemo → 📍 制作为概念卡并加入队列
5. 观察控制台输出

6. 恢复 CardApplicationService：
```javascript
handler.getCardService = originalGetCardService;
console.log('✅ CardApplicationService 已恢复');
```

### 预期结果
- ✅ 控制台输出：`[BlockMenuHandler] CardApplicationService not available, using fallback`
- ✅ 仍然显示成功提示（使用旧方法）
- ✅ 块被标记为卡片

### 实际结果
- [ ] 控制台输出：
- [ ] 成功提示：
- [ ] 块标记：

## 测试场景 5：验证 Riff 同步

### 步骤
1. 创建概念卡后，在控制台执行：
```javascript
const plugin = window.siyuanMemoPlugin;
const storage = plugin.storage;

// 获取最后创建的卡片
const allCards = storage.getAllCards();
const lastCard = allCards[allCards.length - 1];

console.log('最后创建的卡片:', {
  id: lastCard.id,
  blockId: lastCard.blockId,
  type: lastCard.type,
  priority: lastCard.priority
});

// 检查是否在 Riff 卡组中
// （这需要查询 Riff API，暂时跳过）
```

### 预期结果
- ✅ 卡片类型为 'concept'
- ✅ 卡片优先级正确（normal 或 high）

### 实际结果
- [ ] 卡片类型：
- [ ] 卡片优先级：

## 问题排查

### 如果测试失败

#### 问题 1：没有成功提示
**可能原因**：
- CardApplicationService 返回错误
- 网络请求失败

**排查步骤**：
1. 查看控制台完整错误信息
2. 检查 `result.error.message`

#### 问题 2：控制台没有 DDD 日志
**可能原因**：
- CardApplicationService 不可用
- 使用了降级方案

**排查步骤**：
1. 执行测试场景 3 的代码
2. 检查 Xiuyuan 数量是否增加

#### 问题 3：块没有被标记为卡片
**可能原因**：
- markBlockAsCard 失败
- Riff 同步失败

**排查步骤**：
1. 查看控制台错误信息
2. 检查块属性是否包含 `custom-riff-card-id`

## 测试报告

### 测试环境
- 思源笔记版本：
- 插件版本：
- 测试日期：
- 测试人员：

### 测试结果汇总
- [ ] 场景 1：制作为概念卡并加入队列
- [ ] 场景 2：制作为概念卡并立即漫游
- [ ] 场景 3：验证 DDD 架构
- [ ] 场景 4：验证降级机制
- [ ] 场景 5：验证 Riff 同步

### 发现的问题
1. 
2. 
3. 

### 结论
- [ ] ✅ 所有测试通过，功能正常
- [ ] ⚠️ 部分测试失败，需要修复
- [ ] ❌ 测试失败，功能不可用

---

**创建时间**：2026-02-19
**状态**：待测试
