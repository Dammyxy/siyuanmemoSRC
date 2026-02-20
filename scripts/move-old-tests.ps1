# 移动旧架构测试文件到 __tests__.skip 目录
# 这个脚本会识别引用旧 StorageManager 的测试文件并移动它们

$ErrorActionPreference = "Stop"

# 定义旧架构的标识符
$oldArchitecturePatterns = @(
    "from.*['`"]@/core/storage/manager['`"]",
    "from.*['`"].*managers/UnifiedDataSourceManager['`"]",
    "StorageManager.*from.*manager",
    "UnifiedDataSourceManager"
)

# 创建目标目录
$skipDir = "src\__tests__.skip"
if (-not (Test-Path $skipDir)) {
    New-Item -ItemType Directory -Path $skipDir -Force | Out-Null
    Write-Host "✓ 创建目录: $skipDir" -ForegroundColor Green
}

# 查找所有测试文件
$testFiles = Get-ChildItem -Path "src" -Recurse -Filter "*.test.ts" | Where-Object {
    $_.FullName -notlike "*__tests__.skip*"
}

Write-Host "`n正在扫描 $($testFiles.Count) 个测试文件..." -ForegroundColor Cyan

$movedFiles = @()
$skippedFiles = @()

foreach ($file in $testFiles) {
    $content = Get-Content $file.FullName -Raw
    $isOldArchitecture = $false
    
    # 检查是否匹配旧架构模式
    foreach ($pattern in $oldArchitecturePatterns) {
        if ($content -match $pattern) {
            $isOldArchitecture = $true
            break
        }
    }
    
    if ($isOldArchitecture) {
        # 计算相对路径
        $relativePath = $file.FullName.Substring((Get-Location).Path.Length + 1)
        $relativePath = $relativePath.Replace("src\", "")
        
        # 创建目标路径
        $targetPath = Join-Path $skipDir $relativePath
        $targetDir = Split-Path $targetPath -Parent
        
        # 创建目标目录
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        
        # 移动文件
        try {
            Move-Item -Path $file.FullName -Destination $targetPath -Force
            $movedFiles += $relativePath
            Write-Host "  ✓ 移动: $relativePath" -ForegroundColor Yellow
        } catch {
            Write-Host "  ✗ 失败: $relativePath - $_" -ForegroundColor Red
            $skippedFiles += $relativePath
        }
    }
}

# 输出摘要
Write-Host "`n" -NoNewline
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "移动完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "移动的文件数: $($movedFiles.Count)" -ForegroundColor Green
Write-Host "跳过的文件数: $($skippedFiles.Count)" -ForegroundColor Yellow

if ($movedFiles.Count -gt 0) {
    Write-Host "`n已移动的文件:" -ForegroundColor Cyan
    $movedFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
}

if ($skippedFiles.Count -gt 0) {
    Write-Host "`n跳过的文件:" -ForegroundColor Yellow
    $skippedFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
}

Write-Host "`n提示: 运行 'npm test' 来验证剩余的测试" -ForegroundColor Cyan
