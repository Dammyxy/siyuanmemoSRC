# 背面多挖空功能实现总结

## 实现状态

✅ **已完成（包含渲染层）** - 2024年实现

## 功能概述

为快速制卡符号（`>>`, `<<`, `<>`）和块菜单模板制卡添加了背面多挖空支持。当背面包含挖空符号时，自动生成多张卡片，并在渲染时正确显示挖空。

## 核心改动

### 1. 共享工具类 - ClozeDetector ✅
**文件**: `src/utils/cloze-detector.ts`

提供统一的挖空检测功能：
- `extractClozes()` - 提取所有挖空（支持 `{{}}`, `==`, 思源标记）
- `hasClozes()` - 检查是否包含挖空
- `getClozeCount()` - 获取挖空数量

### 2. 命令扩展 ✅
**文件**: `src/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand.ts`

添加 `backClozeInfo` 字段，包含：
- 原始内容、正面、背面
- 挖空列表
- 方向（forward/backward/both）

### 3. UseCase 层处理 ✅
**文件**: `src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts`

在 CardFace 生成部分添加背面挖空处理：
- 正向：为每个挖空生成一个 face，metadata 包含 clozeIndex
- 反向：只生成一个 face（不挖空，clozeIndex: -1）
- 将挖空信息存储到 CardFace 的 metadata 中

### 4. AutoCardHandler 修改 ✅
**文件**: `src/application/handlers/AutoCardHandler.ts`

修改了两个方法：
- `createBasicCard()` - 检测背面挖空，调用 Xiuyuan 系统
- `createBidirectionalCard()` - 支持双向卡片的背面挖空

### 5. DialogManager 修改 ✅
**文件**: `src/application/managers/DialogManager.ts`

修改 `openCreateTemplateCardDialog()` 方法：
- 检测背面块的挖空
- 添加 `backClozeInfo` 到命令

### 6. 渲染层支持 ✅

#### 类型扩展
**文件**: `src/core/card/quick-card/domain/types.ts`

在 `QuickCardMetadata` 中添加：
- `clozeIndex?: number` - 当前挖空索引
- `totalClozes?: number` - 总挖空数量
- `direction?: 'forward' | 'reverse'` - 卡片方向

#### Repository 修改
**文件**: `src/core/card/quick-card/infrastructure/QuickCardRepository.ts`

从 FSRSCard 的 metadata 中提取挖空信息：
- `clozeIndex` - 挖空索引
- `totalClozes` - 总挖空数
- `direction` - 方向

#### 策略修改
**文件**: `src/core/card/quick-card/domain/strategies/BasicCardStrategy.ts`

`parse()` 方法添加挖空渲染逻辑：
- 检查 metadata 中的 `clozeIndex` 和 `totalClozes`
- 使用 `ClozeDetector` 提取挖空
- 隐藏当前索引的挖空，显示为 `<span class="cloze-placeholder">[...]</span>`
- 其他挖空保持原样显示

## 架构优势

1. **统一复用** - 符号监听和模板制卡复用同一套底层系统
2. **代码复用** - 挖空检测提取为共享工具类
3. **职责清晰** - 背面挖空在 UseCase 层统一处理，渲染在策略层处理
4. **易于维护** - 两个入口保持独立，符合单一职责原则
5. **完整实现** - 从数据层到渲染层的完整支持

## 使用示例

### 基础卡片 + 背面挖空
```
问题 >> ==答====案==
```
生成 2 张卡片：
- 卡片1：问题 → 问题<br/><br/>[...]案
- 卡片2：问题 → 问题<br/><br/>答[...]

### 双向卡片 + 背面挖空
```
A <> ==B====C==
```
生成 3 张卡片：
- 正向1：A → A<br/><br/>[...]C
- 正向2：A → A<br/><br/>B[...]
- 反向：BC → BC<br/><br/>A（不挖空）

### 模板制卡 + 背面挖空
选中两个块，右键选择模板：
- 块1：`什么是 DDD？`
- 块2：`==领域====驱动====设计==`

生成 3 张卡片，每张卡片背面显示不同的挖空

## 构建状态

✅ 构建成功，无编译错误

## 后续工作

1. ~~更新卡片渲染逻辑以正确显示挖空~~ ✅ 已完成
2. 添加单元测试
3. 编写用户文档
4. 添加 CSS 样式美化挖空占位符

