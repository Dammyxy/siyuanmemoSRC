# 神经漫游图谱可视化

## 目录结构

```
graph/
├── components/          # Vue 组件
│   ├── GraphWindow.vue              # 图谱窗口主组件
│   ├── GraphCanvas.vue              # vis-network 画布封装
│   ├── DirectionControlPanel.vue    # 方向控制面板
│   └── GraphToolbar.vue             # 图谱工具栏
├── services/           # 服务层
│   ├── GraphDataService.ts          # 图谱数据获取和转换
│   ├── GraphRenderService.ts        # vis-network 渲染管理
│   ├── GraphSyncService.ts          # 与复习界面同步
│   └── GraphStorageService.ts       # 配置持久化
├── types/              # 类型定义
│   └── graph.ts                     # 图谱相关类型
├── utils/              # 工具函数
│   ├── nodeCalculator.ts            # 节点大小计算
│   └── layoutOptimizer.ts           # 布局优化算法
├── index.ts            # 模块导出
└── README.md           # 本文件
```

## 功能概述

神经漫游图谱可视化功能为神经漫游复习模式提供交互式的知识图谱界面，包括：

1. **图谱路径可视化**
   - 显示历史漫游路径（高亮节点+方向连线）
   - 显示候选漫游节点（普通显示+关系标签）
   - 支持点击节点跳转和回退

2. **漫游方向控制**
   - 提供勾选选项控制漫游方向（链接、层级、标签、兄弟块）
   - 实时更新候选节点集合
   - 持久化用户偏好设置

3. **双向同步**
   - 图谱与复习界面实时同步
   - 支持从图谱跳转到复习界面
   - 支持从复习界面更新图谱

## 技术栈

- **图谱渲染**: vis-network (复用思源笔记的 CDN 加载方式)
- **UI 框架**: Vue 3
- **类型系统**: TypeScript
- **事件通信**: 事件总线模式
- **数据持久化**: localStorage

## 使用方式

```typescript
import { GraphWindow } from '@/ui/graph';

// 在神经漫游复习界面中使用
<GraphWindow
  :queueInstance="neuralRoamQueue"
  :visible="graphWindowVisible"
  @close="handleGraphClose"
  @node-click="handleNodeClick"
/>
```

## 开发指南

参考规格文档：
- Requirements: `.kiro/specs/neural-roam-graph-visualization/requirements.md`
- Design: `.kiro/specs/neural-roam-graph-visualization/design.md`
- Tasks: `.kiro/specs/neural-roam-graph-visualization/tasks.md`
