# 修复错误的引号转义
# 将 'xxx" 或 "xxx' 这样的混合引号修复为正确的引号

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$files = @(
    "src/services/ReviewDialogManager.ts"
)

$stats = @{
    FilesProcessed = 0
    FilesModified = 0
    Replacements = 0
}

foreach ($file in $files) {
    $filePath = Join-Path $PSScriptRoot $file
    if (-not (Test-Path $filePath)) {
        Write-Host "⚠️ 文件不存在: $file" -ForegroundColor Yellow
        continue
    }
    
    $stats.FilesProcessed++
    
    # 读取文件（UTF-8 无 BOM）
    $content = [System.IO.File]::ReadAllText($filePath, [System.Text.UTF8Encoding]::new($false))
    $originalContent = $content
    
    # 修复 'xxx" 模式（应该是 "xxx"）
    $content = $content -replace "'all`" mode'", '"all" mode"'
    
    # 修复 "xxx' 模式（应该是 'xxx'）
    # $content = $content -replace "`"([^`"]*)'", "'`$1'"
    
    if ($content -ne $originalContent) {
        [System.IO.File]::WriteAllText($filePath, $content, [System.Text.UTF8Encoding]::new($false))
        $stats.FilesModified++
        $stats.Replacements++
        Write-Host "✅ 修复: $file" -ForegroundColor Green
    }
}

Write-Host "`n📊 修复统计:" -ForegroundColor Cyan
Write-Host "  处理文件: $($stats.FilesProcessed)"
Write-Host "  修改文件: $($stats.FilesModified)"
Write-Host "  替换次数: $($stats.Replacements)"

if ($stats.FilesModified -gt 0) {
    Write-Host "`n✅ 修复完成!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️ 没有需要修复的文件" -ForegroundColor Yellow
}
