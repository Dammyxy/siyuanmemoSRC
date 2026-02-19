# 模块加载错误修复

## 问题描述

插件在运行时报错：
```
Error: Cannot find module '@/core/shared/domain/events/EventBus'
Require stack:- electron/js2c/renderer_init
```

完整错误信息：
```
[SiYuanMemo] Plugin initialization failed: Error: Cannot find module '@/core/shared/domain/events/EventBus'
at Module._resolveFilename (node:internal/modules/cjs/loader:1390:15)
at a._resolveFilename (node:electron/js2c/renderer_init:2:4859)
```

## 原因分析

在 `ApplicationContext.ts` 中使用了 `require()` 动态加载 EventBus:

```typescript
this.registerServiceFactory('eventBus', (context) => {
  const { EventBus } = require('@/core/shared/domain/events/EventBus');
  // ...
});
```

问题在于:
1. `@/` 路径别名只在 Vite 构建时有效
2. 运行时 Electron 环境无法解析这个别名
3. `require()` 动态导入在打包后无法正确解析路径别名

## 解决方案

改用静态导入 (static import):

1. 在文件顶部添加导入语句:
```typescript
import { EventBus } from '@/core/shared/domain/events/EventBus';
```

2. 在工厂函数中直接使用:
```typescript
this.registerServiceFactory('eventBus', (context) => {
  const eventBus = new EventBus(false);
  // ...
});
```

## 修改文件

- `src/application/ApplicationContext.ts`
  - 添加 EventBus 静态导入
  - 移除 require() 动态加载

## 验证

✅ 构建成功
✅ EventBus 已正确打包到 `dist/index.js` 中
✅ 路径别名在构建时正确解析

## 经验教训

1. 避免在运行时使用 `require()` 动态加载模块
2. 路径别名 (`@/`) 只在构建时有效,不能用于运行时动态加载
3. 优先使用静态 `import` 语句,让打包工具在构建时处理依赖
