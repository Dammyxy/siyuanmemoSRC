# 多工作空间支持

## 问题背景

思源笔记支持同时打开多个工作空间，每个工作空间使用不同的端口：
- 第一个工作空间：默认使用 `6806` 端口
- 第二个工作空间：使用 `6807` 端口
- 第三个工作空间：使用 `6808` 端口
- 以此类推...

如果插件硬编码 WebSocket 端口为 `6806`，则在第二个及后续工作空间中无法正常工作。

## 解决方案

### 动态端口获取

两个 WebSocket 服务都实现了动态端口获取：

1. **TransactionWebSocketService**（事务监听服务）
2. **QuickCardWebSocketService**（快速制卡服务）

### 实现原理

```typescript
private getWebSocketURL(): string {
    // 从 window.siyuan 获取当前工作空间的配置
    if (typeof window !== 'undefined' && (window as any).siyuan) {
        const siyuan = (window as any).siyuan;
        const host = siyuan.config?.system?.host || '127.0.0.1';
        const port = siyuan.config?.system?.httpPort || 6806;
        return `ws://${host}:${port}/ws`;
    }
    
    // 降级方案：使用默认端口
    return 'ws://127.0.0.1:6806/ws';
}
```

### 工作流程

1. **插件启动时**：
   - 从 `window.siyuan.config.system.httpPort` 读取当前工作空间的端口
   - 构建正确的 WebSocket URL

2. **连接 WebSocket**：
   - 使用动态获取的端口连接
   - 支持任意工作空间

3. **降级处理**：
   - 如果无法获取配置，使用默认端口 `6806`
   - 确保在第一个工作空间中仍能正常工作

## 测试场景

### 场景 1：单工作空间
- 端口：6806
- 结果：✅ 正常工作

### 场景 2：第二个工作空间
- 端口：6807
- 结果：✅ 自动使用正确端口

### 场景 3：第三个工作空间
- 端口：6808
- 结果：✅ 自动使用正确端口

## 相关文件

- `src/services/TransactionWebSocketService.ts` - 事务监听服务
- `src/services/QuickCardWebSocketService.ts` - 快速制卡服务

## 注意事项

1. **依赖 window.siyuan**：
   - 必须在思源环境中运行
   - 浏览器环境下会使用降级方案

2. **端口范围**：
   - 思源默认从 6806 开始递增
   - 理论上支持无限个工作空间

3. **连接时机**：
   - 插件启动后立即连接
   - 确保 `window.siyuan` 已初始化

## 日志输出

连接时会输出当前使用的端口：

```
[QuickCard] Using WebSocket URL: ws://127.0.0.1:6807/ws
[SiyuanMemo][TransactionWS] Connecting to WebSocket: ws://127.0.0.1:6807/ws
```

通过日志可以确认插件是否使用了正确的端口。
