# Core Extensions (Provider Pattern)

本目录用于定义“可被外部插件/模块复用”的队列提供者接口（Provider Pattern），用于将复习队列能力从 UI 与具体实现中解耦。

## 导出入口
- `src/core/extensions/index.ts`

## 接口
- `QueueProvider<TItem>`：提供队列数据与评分/跳过等操作
- `ReviewUIProvider<TItem>`：提供 UI 组件与 Adapter（将 `TItem` 转换为 `ReviewUIState`）

## 版本
- `EXTENSIONS_API_VERSION = 1`

