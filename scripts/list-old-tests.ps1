# 列出引用旧架构的测试文件
# 运行此脚本查看哪些测试文件需要移动

$ErrorActionPreference = "Stop"

Write-Host "正在扫描引用旧架构的测试文件..." -ForegroundColor Cyan
Write-Host ""

# 定义旧架构的标识符
$patterns = @{
    "旧 StorageManager" = "from.*['`"]@/core/storage/manager['`"]"
    "UnifiedDataSourceManager" = "UnifiedDataSourceManager"
}

$foundFiles = @{}

# 查找所有测试文件
$testFiles = Get-ChildItem -Path "src" -Recurse -Filter "*.test.ts" | Where-Object {
    $_.FullName -notlike "*__tests__.skip*" -and $_.FullName -notlike "*node_modules*"
}

Write-Host "扫描 $($testFiles.Count) 个测试文件...`n" -ForegroundColor Gray

foreach ($file in $testFiles) {
    $content = Get-Content $file.FullName -Raw
    $relativePath = $file.FullName.Replace((Get-Location).Path + "\", "")
    
    foreach ($patternName in $patterns.Keys) {
        $pattern = $patterns[$patternName]
        if ($content -match $pattern) {
            if (-not $foundFiles.ContainsKey($patternName)) {
                $foundFiles[$patternName] = @()
            }
            $foundFiles[$patternName] += $relativePath
            break
        }
    }
}

# 输出结果
$totalFiles = 0
foreach ($patternName in $foundFiles.Keys) {
    $files = $foundFiles[$patternName]
    $totalFiles += $files.Count
    
    Write-Host "[$patternName] - $($files.Count) 个文件:" -ForegroundColor Yellow
    $files | ForEach-Object { 
        Write-Host "  $_" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "总计: $totalFiles 个测试文件引用旧架构" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步:" -ForegroundColor Cyan
Write-Host "  1. 运行 'scripts\move-old-tests.ps1' 移动这些文件" -ForegroundColor White
Write-Host "  2. 或者手动移动到 'src\__tests__.skip\' 目录" -ForegroundColor White
