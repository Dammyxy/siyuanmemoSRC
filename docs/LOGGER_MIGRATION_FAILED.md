# Logger 迁移失败总结

## 问题

尝试将插件从劫持全局 `console` 的方式迁移到使用自定义 `logger` 类，但迁移失败。

## 失败原因

### 1. 脚本替换逻辑问题

迁移脚本在处理复杂的 console 调用时存在问题：

- **括号匹配**：无法正确处理嵌套括号和字符串中的括号
- **逗号处理**：无法正确识别参数分隔符
- **引号混合**：中文引号（`'`、`"`）与英文引号混合导致语法错误

### 2. 编码问题

虽然使用了 UTF-8 无 BOM 编码，但在替换过程中仍然出现了编码问题：

- 中文注释在某些情况下显示为乱码
- 特殊字符（如 emoji ✅）处理不当

### 3. 引号不匹配

脚本在替换时产生了引号不匹配的问题：

```typescript
// 错误示例
logger.log('[ReviewDialogManager] ✅ Cleared temporary blacklist for "all" mode");
//                                                                              ^
//                                                                    引号不匹配
```

## 迁移统计

- 处理文件：374 个
- 修改文件：63 个
- 替换次数：902 次
- 添加导入：63 次

虽然脚本报告成功，但实际上产生了语法错误。

## 回滚操作

使用 git 回滚所有更改：

```bash
git restore src/
```

回滚后构建成功通过。

## 经验教训

### 1. 不要使用简单的正则替换

对于复杂的代码转换，简单的正则表达式替换是不够的，需要：

- 使用 AST（抽象语法树）解析
- 使用专门的代码转换工具（如 jscodeshift）
- 或者手动逐个文件修改

### 2. 分批验证

应该：

1. 先在少量文件上测试
2. 每次修改后立即构建验证
3. 确认无误后再继续下一批

### 3. 保留回滚点

在大规模修改前应该：

- 创建 git 分支
- 或者创建 git stash
- 确保可以快速回滚

## 替代方案

### 方案 1：保持现状

继续使用 `disableLogs.ts` 劫持 console，虽然不是最佳实践，但：

- 功能正常
- 已经稳定运行
- 风险最低

### 方案 2：渐进式迁移

不使用脚本，而是：

1. 保留 `disableLogs.ts`
2. 新代码使用 `logger`
3. 旧代码逐步手动迁移
4. 最后删除 `disableLogs.ts`

### 方案 3：使用专业工具

使用 jscodeshift 或类似工具：

```javascript
// jscodeshift 转换示例
module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  
  // 查找所有 console.log('[SiYuanMemo]...') 调用
  root.find(j.CallExpression, {
    callee: {
      object: { name: 'console' },
      property: { name: 'log' }
    }
  })
  .filter(path => {
    const firstArg = path.value.arguments[0];
    return firstArg && 
           firstArg.type === 'Literal' && 
           firstArg.value.startsWith('[SiYuanMemo]');
  })
  .replaceWith(path => {
    // 转换逻辑
  });
  
  return root.toSource();
};
```

## 建议

**暂时保持现状**，不进行 logger 迁移，原因：

1. 当前方案虽然不完美，但功能正常
2. 迁移风险高，收益低
3. 可以在未来有更好的工具或方案时再考虑

## 相关文件

- `LOGGER_MIGRATION.md` - 原始迁移计划
- `migrate-logger-final.ps1` - 失败的迁移脚本
- `src/utils/logger.ts` - Logger 实现（已回滚）
- `src/utils/disableLogs.ts` - 当前使用的方案（已恢复）

## 时间线

- 2024-XX-XX：开始 logger 迁移
- 2024-XX-XX：脚本执行完成，报告 902 次替换
- 2024-XX-XX：构建失败，发现引号不匹配问题
- 2024-XX-XX：多次尝试修复失败
- 2024-XX-XX：决定回滚，使用 `git restore src/`
- 2024-XX-XX：回滚成功，构建通过

## 结论

Logger 迁移失败，已回滚到稳定状态。建议暂时保持现状，不进行迁移。
