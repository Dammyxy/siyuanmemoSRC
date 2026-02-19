# Logger 迁移脚本 - 精确版本
# 将 console.log('[SiYuanMemo]...') 替换为 logger.log('...')
# 正确处理括号、逗号和编码问题

$ErrorActionPreference = "Stop"
$srcDir = Join-Path $PSScriptRoot "src"
$stats = @{
    FilesProcessed = 0
    FilesModified = 0
    Replacements = 0
    ImportsAdded = 0
    Errors = 0
}

# 排除模式
$excludePatterns = @(
    "*\__tests__\*",
    "*.test.ts",
    "*.spec.ts",
    "*\disableLogs.ts"
)

function Should-Exclude {
    param($path)
    foreach ($pattern in $excludePatterns) {
        if ($path -like $pattern) {
            return $true
        }
    }
    return $false
}

function Has-LoggerImport {
    param($content)
    return $content -match "import\s+.*\{\s*logger\s*\}.*from\s+['`"]@/utils/logger['`"]" -or
           $content -match "import\s+.*\{\s*createLogger\s*\}.*from\s+['`"]@/utils/logger['`"]"
}

function Add-LoggerImport {
    param($content)
    
    # 查找第一个 import 语句
    if ($content -match "(?m)^import\s+") {
        $insertPos = $Matches[0].Index
        return $content.Substring(0, $insertPos) + 
               "import { logger } from '@/utils/logger';`n" +
               $content.Substring($insertPos)
    }
    
    # 如果没有 import，添加到文件开头（跳过注释）
    if ($content -match "(?s)^((?:\/\/.*\n|\/\*.*?\*\/\n)*)(.*)") {
        $comments = $Matches[1]
        $rest = $Matches[2]
        return $comments + "import { logger } from '@/utils/logger';`n`n" + $rest
    }
    
    return "import { logger } from '@/utils/logger';`n`n" + $content
}

function Find-MatchingParen {
    param($text, $startPos)
    
    $depth = 1
    $pos = $startPos + 1
    
    while ($pos -lt $text.Length -and $depth -gt 0) {
        $char = $text[$pos]
        if ($char -eq '(') { $depth++ }
        elseif ($char -eq ')') { $depth-- }
        $pos++
    }
    
    if ($depth -eq 0) {
        return $pos - 1
    }
    return -1
}

function Replace-ConsoleCalls {
    param($content)
    
    $modified = $false
    $count = 0
    $result = $content
    
    # 查找所有 console.xxx('[SiYuanMemo]...') 调用
    $pattern = "console\.(log|debug|info|warn|error)\s*\("
    $matches = [regex]::Matches($content, $pattern)
    
    # 从后往前替换，避免位置偏移
    for ($i = $matches.Count - 1; $i -ge 0; $i--) {
        $match = $matches[$i]
        $level = $match.Groups[1].Value
        $startPos = $match.Index
        $parenStart = $match.Index + $match.Length - 1
        
        # 找到匹配的右括号
        $parenEnd = Find-MatchingParen -text $content -startPos $parenStart
        if ($parenEnd -eq -1) {
            Write-Host "⚠️ Warning: Cannot find matching paren at position $startPos" -ForegroundColor Yellow
            continue
        }
        
        # 提取参数部分
        $argsText = $content.Substring($parenStart + 1, $parenEnd - $parenStart - 1).Trim()
        
        # 检查第一个参数是否是 '[SiYuanMemo]...' 字符串
        if ($argsText -match "^[`"'](\[SiYuanMemo\][^`"']*)[`"'](.*)$") {
            $message = $Matches[1]
            $restArgs = $Matches[2].Trim()
            
            # 移除 [SiYuanMemo] 前缀
            $cleanMessage = $message -replace '^\[SiYuanMemo\]\s*', ''
            
            # 转义单引号
            $cleanMessage = $cleanMessage -replace "'", "\'"
            
            # 构建新的调用
            $newCall = "logger.$level('$cleanMessage'$restArgs)"
            
            # 替换
            $oldCall = $content.Substring($startPos, $parenEnd - $startPos + 1)
            $result = $result.Substring(0, $startPos) + $newCall + $result.Substring($parenEnd + 1)
            
            $modified = $true
            $count++
        }
    }
    
    return @{
        Content = $result
        Modified = $modified
        Count = $count
    }
}

function Process-File {
    param($filePath)
    
    $stats.FilesProcessed++
    
    try {
        # 读取文件（UTF-8 无 BOM）
        $content = [System.IO.File]::ReadAllText($filePath, [System.Text.UTF8Encoding]::new($false))
        $originalContent = $content
        
        # 检查是否有需要替换的 console 调用
        if ($content -notmatch "console\.(log|debug|info|warn|error)\s*\([`"']\[SiYuanMemo\]") {
            return
        }
        
        # 替换 console 调用
        $result = Replace-ConsoleCalls -content $content
        if (-not $result.Modified) {
            return
        }
        
        $content = $result.Content
        $stats.Replacements += $result.Count
        
        # 添加 logger 导入（如果需要）
        if (-not (Has-LoggerImport -content $content)) {
            $content = Add-LoggerImport -content $content
            $stats.ImportsAdded++
        }
        
        # 写回文件（UTF-8 无 BOM）
        if ($content -ne $originalContent) {
            [System.IO.File]::WriteAllText($filePath, $content, [System.Text.UTF8Encoding]::new($false))
            $stats.FilesModified++
            $relativePath = $filePath.Replace($srcDir + "\", "")
            Write-Host "✅ Modified: $relativePath ($($result.Count) replacements)" -ForegroundColor Green
        }
    } catch {
        $stats.Errors++
        Write-Host "❌ Error processing $($filePath): $_" -ForegroundColor Red
    }
}

# 主函数
Write-Host "🚀 Starting logger migration (precise version)...`n" -ForegroundColor Cyan

# 查找所有 TypeScript 和 Vue 文件
$files = Get-ChildItem -Path $srcDir -Include "*.ts","*.vue" -Recurse | Where-Object {
    -not (Should-Exclude -path $_.FullName)
}

Write-Host "Found $($files.Count) files to process`n" -ForegroundColor Yellow

# 处理每个文件
foreach ($file in $files) {
    Process-File -filePath $file.FullName
}

# 输出统计
Write-Host "`n📊 Migration Statistics:" -ForegroundColor Cyan
Write-Host "  Files processed: $($stats.FilesProcessed)"
Write-Host "  Files modified: $($stats.FilesModified)"
Write-Host "  Console calls replaced: $($stats.Replacements)"
Write-Host "  Logger imports added: $($stats.ImportsAdded)"
Write-Host "  Errors: $($stats.Errors)"

if ($stats.Errors -eq 0) {
    Write-Host "`n✅ Migration completed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️ Migration completed with errors!" -ForegroundColor Yellow
}
