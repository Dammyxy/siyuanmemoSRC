# 神经漫游图谱可视化

## 目录结构

```
graph/
??? components/          # Vue ??
?   ??? GraphWindow.vue              # ???????
?   ??? GraphCanvas.vue              # ????
?   ??? DirectionControlPanel.vue    # ??????
??? types/              # ????
?   ??? graph.ts                     # ??????
??? index.ts            # ????
??? README.md           # ???
```



## 功能概述

神经漫游图谱可视化功能为神经漫游复习模式提供交互式的知识图谱界面，包括：

1. **图谱路径可视化**
   - 显示历史漫游路径（高亮节点+方向连线）
   - 显示候选漫游节点（普通显示+关系标签）
   - 支持点击节点跳转和回退

2. **漫游方向控制**
?????????? `src/infrastructure/graph`??????????? `src/application/graph`?
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
