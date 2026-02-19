# 批量修复剩余的非标准日志前缀
# 将所有不以 [SiyuanMemo] 开头的日志前缀统一为 [SiyuanMemo][ModuleName]

$replacements = @(
    # SimpleModeRemovalMigrator
    @{ Old = '\[SimpleModeRemovalMigrator\]'; New = '[SiyuanMemo][SimpleModeRemovalMigrator]' },
    
    # EventEmitter
    @{ Old = '\[EventEmitter\]'; New = '[SiyuanMemo][EventEmitter]' },
    
    # Dialog (已经有部分是 [SiyuanMemo][Dialog]，只修复 [FSRS Dialog])
    @{ Old = '\[FSRS Dialog\]'; New = '[SiyuanMemo][Dialog]' },
    
    # dateUtils
    @{ Old = '\[dateUtils\]'; New = '[SiyuanMemo][dateUtils]' },
    
    # Config
    @{ Old = '\[Config\]'; New = '[SiyuanMemo][Config]' },
    
    # ConfigMigrator
    @{ Old = '\[ConfigMigrator\]'; New = '[SiyuanMemo][ConfigMigrator]' },
    
    # SrsEditor
    @{ Old = '\[SrsEditor\]'; New = '[SiyuanMemo][SrsEditor]' },
    
    # Settings
    @{ Old = '\[Settings\]'; New = '[SiyuanMemo][Settings]' },
    
    # SettingsPanel
    @{ Old = '\[SettingsPanel\]'; New = '[SiyuanMemo][SettingsPanel]' },
    
    # useReviewSession
    @{ Old = '\[useReviewSession\]'; New = '[SiyuanMemo][useReviewSession]' },
    
    # ReviewSession
    @{ Old = '\[ReviewSession\]'; New = '[SiyuanMemo][ReviewSession]' },
    
    # Test (测试文件中的日志)
    @{ Old = '\[Test\]'; New = '[SiyuanMemo][Test]' }
)

$totalFiles = 0
$modifiedFiles = 0

Write-Host "Starting remaining log prefix fix..." -ForegroundColor Green

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
