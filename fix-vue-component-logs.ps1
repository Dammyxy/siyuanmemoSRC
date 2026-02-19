# 批量修复 Vue 组件和复习相关模块的日志前缀
# 将所有不以 [SiyuanMemo] 开头的日志前缀统一为 [SiyuanMemo][ModuleName]

$replacements = @(
    # Review 相关组件
    @{ Old = '\[ReviewHeader\]'; New = '[SiyuanMemo][ReviewHeader]' },
    @{ Old = '\[FSRS ReviewContent\]'; New = '[SiyuanMemo][ReviewContent]' },
    @{ Old = '\[ReviewContent\]'; New = '[SiyuanMemo][ReviewContent]' },
    @{ Old = '\[ReviewActions\]'; New = '[SiyuanMemo][ReviewActions]' },
    @{ Old = '\[FSRS ReviewView\]'; New = '[SiyuanMemo][ReviewView]' },
    
    # Dialog 和 Strategy
    @{ Old = '\[createUnifiedReviewDialog\]'; New = '[SiyuanMemo][createUnifiedReviewDialog]' },
    @{ Old = '\[UnifiedQueueStrategy\]'; New = '[SiyuanMemo][UnifiedQueueStrategy]' },
    @{ Old = '\[UnifiedReviewAdapter\]'; New = '[SiyuanMemo][UnifiedReviewAdapter]' },
    @{ Old = '\[ReviewDialogManager\]'; New = '[SiyuanMemo][ReviewDialogManager]' },
    
    # Card 相关服务
    @{ Old = '\[DescriptorCardRenderService\]'; New = '[SiyuanMemo][DescriptorCardRenderService]' },
    @{ Old = '\[SiyuanBlockAdapter\]'; New = '[SiyuanMemo][SiyuanBlockAdapter]' },
    @{ Old = '\[DescriptorCardRepository\]'; New = '[SiyuanMemo][DescriptorCardRepository]' },
    @{ Old = '\[QuickCardRepository\]'; New = '[SiyuanMemo][QuickCardRepository]' },
    
    # DataSource
    @{ Old = '\[IncrementalLearningDataSource\]'; New = '[SiyuanMemo][IncrementalLearningDataSource]' }
)

$totalFiles = 0
$modifiedFiles = 0

Write-Host "Starting Vue component log prefix fix..." -ForegroundColor Green

Get-ChildItem -Path "src" -Include *.ts,*.vue -Recurse | ForEach-Object {
    $file = $_
    $totalFiles++
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $modified = $false
    
    foreach ($replacement in $replacements) {
        $oldPattern = $replacement.Old
        $newPattern = $replacement.New
        
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
