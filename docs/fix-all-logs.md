# 批量修复所有日志前缀

## 需要修复的日志前缀模式

根据控制台输出，以下模块的日志需要统一为 `[SiyuanMemo]` 前缀：

1. `[StorageManager]` -> `[SiyuanMemo] StorageManager:`
2. `[Scheduler]` -> `[SiyuanMemo] Scheduler:`
3. `[RetrievalPracticeQueue]` -> `[SiyuanMemo] RetrievalPracticeQueue:`
4. `[FinalDrillQueue]` -> `[SiyuanMemo] FinalDrillQueue:`
5. `[FilterGroupQueue]` -> `[SiyuanMemo] FilterGroupQueue:`
6. `[LeechQueue]` -> `[SiyuanMemo] LeechQueue:`
7. `[Deprecated Queue]` -> `[SiyuanMemo] Deprecated Queue:`
8. `[HybridSync]` -> `[SiyuanMemo] HybridSync:`
9. `[TransactionWS]` -> `[SiyuanMemo] TransactionWS:`
10. `[AutoCard]` -> `[SiyuanMemo] AutoCard:`
11. `[Dialog]` -> `[SiyuanMemo] Dialog:`
12. `[SRSBrowser]` -> `[SiyuanMemo] SRSBrowser:`
13. `[BrowserHierarchy]` -> `[SiyuanMemo] BrowserHierarchy:`
14. `[FilterButton]` -> `[SiyuanMemo] FilterButton:`
15. `[browserService]` -> `[SiyuanMemo] browserService:`
16. `[SRSBrowserAdapter]` -> `[SiyuanMemo] SRSBrowserAdapter:`
17. `[SyncStatusIndicator]` -> `[SiyuanMemo] SyncStatusIndicator:`
18. `[DeckDataSource]` -> `[SiyuanMemo] DeckDataSource:`
19. `[AdvancedDataRouter]` -> `[SiyuanMemo] AdvancedDataRouter:`
20. `[CardBrowser]` -> `[SiyuanMemo] CardBrowser:`
21. `[NeuralRoamQueue]` -> `[SiyuanMemo] NeuralRoamQueue:`
22. `[ConceptNeuralQueue]` -> `[SiyuanMemo] ConceptNeuralQueue:`
23. `[IncrementalLearningQueue]` -> `[SiyuanMemo] IncrementalLearningQueue:`
24. `[ReviewViewController]` -> `[SiyuanMemo] ReviewViewController:` ✅ 已修复

## 批量替换命令

由于文件太多，建议使用 PowerShell 脚本批量替换：

```powershell
# 定义要替换的前缀列表
$prefixes = @(
    "StorageManager",
    "Scheduler",
    "RetrievalPracticeQueue",
    "FinalDrillQueue",
    "FilterGroupQueue",
    "LeechQueue",
    "Deprecated Queue",
    "HybridSync",
    "TransactionWS",
    "AutoCard",
    "Dialog",
    "SRSBrowser",
    "BrowserHierarchy",
    "FilterButton",
    "browserService",
    "SRSBrowserAdapter",
    "SyncStatusIndicator",
    "DeckDataSource",
    "AdvancedDataRouter",
    "CardBrowser",
    "NeuralRoamQueue",
    "ConceptNeuralQueue",
    "IncrementalLearningQueue"
)

# 遍历所有 TypeScript 和 Vue 文件
Get-ChildItem -Path "src" -Include *.ts,*.vue -Recurse | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw
    $modified = $false
    
    foreach ($prefix in $prefixes) {
        $oldPattern = "\[$prefix\]"
        $newPattern = "[SiyuanMemo] $prefix:"
        
        if ($content -match $oldPattern) {
            $content = $content -replace $oldPattern, $newPattern
            $modified = $true
        }
    }
    
    if ($modified) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "Updated: $($file.FullName)"
    }
}
```

## 手动验证

修复后，在控制台执行以下命令验证：

```javascript
// 检查是否还有非标准前缀的日志
// 在浏览器控制台中，所有插件日志应该都以 [SiyuanMemo] 开头
```

## 注意事项

1. 某些日志可能是占位符或测试代码，可以考虑直接删除
2. 某些 warn 和 error 日志也需要统一前缀
3. 修复后需要重新编译和测试
