# 批量修复所有日志前缀
# 将所有 [ModuleName] 格式的日志前缀统一为 [SiyuanMemo][ModuleName]

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
    "IncrementalLearningQueue",
    "ConceptQueryEngine",
    "RetrievalDataSource"
)

$totalFiles = 0
$modifiedFiles = 0

Write-Host "Starting log prefix fix..." -ForegroundColor Green

Get-ChildItem -Path "src" -Include *.ts,*.vue -Recurse | ForEach-Object {
    $file = $_
    $totalFiles++
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $modified = $false
    
    foreach ($prefix in $prefixes) {
        $oldPattern = "\[$prefix\]"
        $newPattern = "[SiyuanMemo][$prefix]"
        
        if ($content -match $oldPattern) {
            $content = $content -replace $oldPattern, $newPattern
            $modified = $true
        }
    }
    
    if ($modified) {
        Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
        $modifiedFiles++
        Write-Host "Updated: $($file.Name)" -ForegroundColor Yellow
    }
}

Write-Host "`nDone!" -ForegroundColor Green
Write-Host "Total files: $totalFiles" -ForegroundColor Cyan
Write-Host "Modified files: $modifiedFiles" -ForegroundColor Cyan
