# 🚀 立即禁用所有调试日志

## 方法 1：通过设置面板（推荐）✅

1. 打开插件设置
2. 找到"参数设置"选项卡
3. 在"功能开关"部分找到"启用调试日志"
4. 取消勾选该选项
5. 点击"保存设置"
6. 刷新思源笔记（`Ctrl+R` 或 `Cmd+R`）

## 方法 2：一行代码（最快）

在浏览器控制台（F12）中执行：

```javascript
window.FSRS_DISABLE_LOGS = true;
```

然后刷新思源笔记（`Ctrl+R` 或 `Cmd+R`）。

---

## ✅ 验证是否生效

刷新后，控制台应该显示：

```
[FSRS] Debug logs disabled
```

之后不再显示任何 `[FSRS]` 开头的普通日志。

---

## 🔄 重新启用

```javascript
delete window.FSRS_DISABLE_LOGS;
```

然后刷新思源笔记。

---

## 📚 更多信息

- **[快速禁用指南](./QUICK_DISABLE_LOGS.md)** - 所有禁用方法
- **[日志系统指南](./LOGGING_GUIDE.md)** - 完整的日志系统文档
- **[清理总结](./LOG_CLEANUP_SUMMARY.md)** - 日志清理总结

---

**最后更新**：2026-01-31
