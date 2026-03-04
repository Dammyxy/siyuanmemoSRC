# CDF 概念定义卡 - 修复说明

## 问题

在复习概念定义卡时出现错误：
```
Error: XiuyuanService has been removed. Use context.getXiuyuanApplicationService() instead.
```

## 原因

`ConceptDefinitionCardRenderService` 中的 `getXiuyuan` 方法使用了已废弃的 `xiuyuanService`，需要更新为使用新的 `XiuyuanApplicationService`。

## 修复内容

### 修改文件
`src/core/card/concept-definition/application/ConceptDefinitionCardRenderService.ts`

### 修改点

1. **更新 `getXiuyuan` 方法**：
   - 从同步方法改为异步方法
   - 通过 `plugin.context.getXiuyuanApplicationService()` 获取服务
   - 使用 `xiuyuanAppService.getXiuyuan(xiuyuanID)` 获取数据

2. **更新 `prepareViewModel` 方法**：
   - 将 `this.getXiuyuan(xiuyuanID)` 改为 `await this.getXiuyuan(xiuyuanID)`

### 修改前
```typescript
private getXiuyuan(xiuyuanID: string): any {
  const xiuyuanStorage = (window as any).siyuan?.ws?.app?.plugins?.find(
    (p: any) => p.name === 'siyuan-plugin-siyuanmemo'
  )?.xiuyuanService;

  if (!xiuyuanStorage) {
    throw new Error('XiuyuanService not found');
  }

  return xiuyuanStorage.getXiuyuan(xiuyuanID);
}
```

### 修改后
```typescript
private async getXiuyuan(xiuyuanID: string): Promise<any> {
  // 通过 window 获取 plugin 实例
  const plugin = (window as any).siyuan?.ws?.app?.plugins?.find(
    (p: any) => p.name === 'siyuan-plugin-siyuanmemo'
  );

  if (!plugin) {
    throw new Error('Plugin not found');
  }

  // 获取 XiuyuanApplicationService
  const xiuyuanAppService = await plugin.context.getXiuyuanApplicationService();
  if (!xiuyuanAppService) {
    throw new Error('XiuyuanApplicationService not available');
  }

  // 从 XiuyuanApplicationService 获取 Xiuyuan
  const xiuyuan = await xiuyuanAppService.getXiuyuan(xiuyuanID);
  if (!xiuyuan) {
    throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
  }

  return xiuyuan;
}
```

## 测试

修复后，概念定义卡应该能够正常渲染：
- ✅ 正向卡片：显示"概念的定义？"
- ✅ 反向卡片：显示"以下是哪个概念的定义？"
- ✅ 带挖空的卡片：正确隐藏当前挖空

## 相关文件

- [使用说明](./CDF-概念定义卡使用说明.md)
- [CDF 调查报告](./RemNote-CDF-调查报告.md)
