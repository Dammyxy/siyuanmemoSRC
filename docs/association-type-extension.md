# 关联类型扩展文档

**任务**: 3.1 扩展关联类型（BACKLINK, CONCEPT_LINK, DESCRIPTOR）  
**完成时间**: 2026-02-15  
**状态**: ✅ 已完成

---

## 概述

为神经漫游系统扩展了三种新的关联类型，专门用于概念卡的增强功能。这些新类型遵循"隐式定义优先"的设计理念。

## 新增关联类型

### 1. BACKLINK（反向链接）
- **枚举值**: `'backlink'`
- **权重**: 15（最高优先级）
- **用途**: 表示反向链接关系，体现概念在不同上下文中的使用
- **设计理念**: 隐式定义，通过使用场景理解概念
- **图标**: ← 
- **颜色**: #E91E63（粉红色）

### 2. CONCEPT_LINK（概念间链接）
- **枚举值**: `'concept'`
- **权重**: 8（中等优先级）
- **用途**: 表示概念之间的关联关系
- **设计理念**: 概念网络，建立知识图谱
- **图标**: 🧠
- **颜色**: #667eea（紫罗兰色）

### 3. DESCRIPTOR（描述符卡）
- **枚举值**: `'descriptor'`
- **权重**: 3（较低优先级）
- **用途**: 表示描述符卡与概念卡的关系
- **设计理念**: 显式定义，辅助理解
- **图标**: 📝
- **颜色**: #f59e0b（琥珀色）

## 权重优先级

按照权重从高到低排序：

1. **BACKLINK** (15) - 反向链接，隐式定义
2. **REF_LINK** (10) - 双向链接
3. **CONCEPT_LINK** (8) - 概念间链接
4. **HIERARCHY** (5) - 文档层级
5. **DESCRIPTOR** (3) - 描述符卡，显式定义
6. **TAG** (3) - 标签关联
7. **SIBLING** (1) - 兄弟块

## 设计理念

### 隐式定义优先（自下而上）
- 反向链接权重最高（15），让学习者通过概念的使用场景理解概念
- 概念间链接次之（8），建立知识网络
- 描述符卡权重较低（3），仅作为辅助

### 显式定义辅助
- 描述符卡提供直接定义，但不是主要学习方式
- 权重设置较低，避免过度依赖死记硬背

## 修改的文件

### 1. 核心类型定义
**文件**: `src/core/queue/neural/types.ts`
- 扩展 `AssociationType` 枚举
- 更新 `NeuralQueueConfig` 接口，添加新权重配置
- 更新 `DEFAULT_NEURAL_QUEUE_CONFIG`，设置默认权重

### 2. 权重引擎
**文件**: `src/core/queue/neural/WeightedWalkEngine.ts`
- 更新 `DEFAULT_WEIGHTS` 常量

### 3. 神经队列
**文件**: `src/core/queue/neural/NeuralQueue.ts`
- 更新权重映射初始化
- 扩展 `getReasonText()` 方法，添加新类型的中文描述

### 4. UI 样式
**文件**: `src/application/graph/OrbitStyles.ts`
- 扩展 `ORBIT_CANDIDATE_COLORS`，为新类型添加颜色

### 5. 图数据服务
**文件**: `src/application/graph/GraphDataService.ts`
- 扩展 `getAssociationLabel()` 方法，添加新类型的图标

### 6. 测试文件
**文件**: `src/core/queue/neural/__tests__/AssociationType.test.ts`（新建）
- 验证枚举值定义
- 验证默认权重配置
- 验证权重优先级
- 验证类型安全性

## 测试结果

✅ 所有测试通过（10/10）
- 枚举值定义正确
- 权重配置符合设计
- 优先级排序正确
- 类型安全性验证通过

## 向后兼容性

✅ 完全向后兼容
- 现有的关联类型保持不变
- 现有的权重配置保持不变
- 新增类型不影响现有功能

## 下一步

根据设计文档，后续任务包括：
- 3.2 实现反向链接查询
- 3.3 实现概念间链接查询
- 3.4 实现描述符卡查询
- 3.5 集成到神经漫游队列

## 参考文档

- 设计文档: `.kiro/specs/card-type-system-enhancement/design.md` 第 10.2 节
- 神经漫游增强设计: `.kiro/specs/card-type-system-enhancement/neural-roam-enhancement-design.md`
