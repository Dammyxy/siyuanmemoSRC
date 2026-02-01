# Vitest 配置说明

## 已完成的配置

### 1. 安装的依赖

已添加以下测试相关依赖到 `package.json`：

```json
{
  "devDependencies": {
    "vitest": "^2.1.8",
    "@vitest/ui": "^2.1.8",
    "@vue/test-utils": "^2.4.6",
    "happy-dom": "^15.11.7"
  }
}
```

- **vitest**: 测试框架
- **@vitest/ui**: 测试 UI 界面
- **@vue/test-utils**: Vue 组件测试工具
- **happy-dom**: 轻量级 DOM 环境（用于测试）

### 2. 配置文件

#### `vitest.config.ts`
创建了 vitest 配置文件，包含：
- 测试环境设置（happy-dom）
- 路径别名配置（@/ 指向 src/）
- 覆盖率配置
- 测试文件匹配模式
- 超时和并发设置

#### `tsconfig.json`
更新了 TypeScript 配置，添加了 vitest 类型支持：
```json
{
  "compilerOptions": {
    "types": ["node", "vite/client", "vitest/globals"]
  }
}
```

### 3. 测试脚本

更新了 `package.json` 中的测试脚本：

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:legacy": "node scripts/unit-test.ts"
  }
}
```

## 安装步骤

在项目目录下运行：

```bash
cd siyuan-plugin-fsrs
npm install
```

这会安装所有新添加的测试依赖。

## 验证安装

安装完成后，运行以下命令验证：

```bash
# 运行测试（应该会发现并运行所有测试文件）
npm test

# 或者运行单次测试
npm run test:run
```

## 测试文件位置

测试文件已创建在以下位置：

1. **队列端到端测试**
   - `src/core/queue/__tests__/e2e.queue.test.ts`

2. **UI 端到端测试**
   - `src/ui/review/__tests__/e2e.review-ui.test.ts`

3. **现有测试**
   - `src/__tests__/phase1-v2-queues.test.ts`
   - `src/core/queue/__tests__/SchedulerRouter.performance.test.ts`

## 使用 Vitest UI

运行以下命令打开测试 UI 界面：

```bash
npm run test:ui
```

这会在浏览器中打开一个交互式界面，你可以：
- 查看所有测试及其状态
- 运行/重新运行特定测试
- 查看测试输出和错误
- 查看代码覆盖率
- 调试测试

## 覆盖率报告

生成覆盖率报告：

```bash
npm run test:coverage
```

报告会生成在 `coverage/` 目录，包括：
- `coverage/index.html` - HTML 格式的覆盖率报告
- `coverage/coverage-final.json` - JSON 格式的覆盖率数据

## 常见问题

### Q: 测试运行失败，提示找不到模块？
A: 确保已经运行 `npm install` 安装所有依赖。

### Q: 测试文件没有被发现？
A: 检查测试文件名是否符合模式 `*.test.ts` 或 `*.spec.ts`。

### Q: Vue 组件测试失败？
A: 确保 `@vue/test-utils` 和 `happy-dom` 已正确安装。

### Q: 想要使用旧的测试脚本？
A: 运行 `npm run test:legacy` 使用原来的 `scripts/unit-test.ts`。

## 下一步

1. 运行 `npm install` 安装依赖
2. 运行 `npm test` 验证测试是否正常工作
3. 根据需要修复测试中的问题
4. 开始编写更多测试！

## 参考资源

- [Vitest 官方文档](https://vitest.dev/)
- [Vue Test Utils 文档](https://test-utils.vuejs.org/)
- [测试指南](./TESTING_GUIDE.md)
