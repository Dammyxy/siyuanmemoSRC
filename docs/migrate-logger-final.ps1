# Logger 迁移脚本 - 最终版本
# 将 console.log('[SiYuanMemo]...') 替换为 logger.log('...')
# 正确处理括号、逗号和 UTF-8 编码

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
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
    $inString = $false
    $stringChar = $null
    $escaped = $false
    
    while ($pos -lt $text.Length -and $depth -gt 0) {
        $char = $text[$pos]
        
        if ($escaped) {
            $escaped = $false
            $pos++
            continue
        }
        
        if ($char -eq '\') {
            $escaped = $true
            $pos++
            continue
        }
        
        if ($inString) {
            if ($char -eq $stringChar) {
                $inString = $false
                $stringChar = $null
            }
        } else {
            if ($char -eq '"' -or $char -eq "'" -or $char -eq '`') {
                $inString = $true
                $stringChar = $char
            } elseif ($char -eq '(') {
                $depth++
            } elseif ($char -eq ')') {
                $depth--
            }
        }
        
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
    $replacements = @()
    
    # 查找所有 console.xxx('[SiYuanMemo]...') 调用
    $pattern = "console\.(log|debug|info|warn|error)\s*\("
    $matches = [regex]::Matches($content, $pattern)
    
    # 收集所有需要替换的位置（从前往后）
    foreach ($match in $matches) {
        $level = $match.Groups[1].Value
        $startPos = $match.Index
        $parenStart = $match.Index + $match.Length - 1
        
        # 找到匹配的右括号
        $parenEnd = Find-MatchingParen -text $content -startPos $parenStart
        if ($parenEnd -eq -1) {
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
            
            $replacements += @{
                Start = $startPos
                End = $parenEnd
                NewText = $newCall
            }
            
            $modified = $true
        }
    }
    
    # 从后往前应用替换（避免位置偏移）
    $result = $content
    for ($i = $replacements.Count - 1; $i -ge 0; $i--) {
        $repl = $replacements[$i]
        $result = $result.Substring(0, $repl.Start) + $repl.NewText + $result.Substring($repl.End + 1)
    }
    
    return @{
        Content = $result
        Modified = $modified
        Count = $replacements.Count
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
            Write-Host "✅ $relativePath ($($result.Count) replacements)" -ForegroundColor Green
        }
    } catch {
        $stats.Errors++
        $relativePath = $filePath.Replace($srcDir + "\", "")
        Write-Host "❌ $relativePath : $_" -ForegroundColor Red
    }
}

# 主函数
Write-Host "🚀 Logger 迁移开始...`n" -ForegroundColor Cyan

# 查找所有 TypeScript 和 Vue 文件
$files = Get-ChildItem -Path $srcDir -Include "*.ts","*.vue" -Recurse | Where-Object {
    -not (Should-Exclude -path $_.FullName)
}

Write-Host "找到 $($files.Count) 个文件`n" -ForegroundColor Yellow

# 处理每个文件
foreach ($file in $files) {
    Process-File -filePath $file.FullName
}

# 输出统计
Write-Host "`n📊 迁移统计:" -ForegroundColor Cyan
Write-Host "  处理文件: $($stats.FilesProcessed)"
Write-Host "  修改文件: $($stats.FilesModified)"
Write-Host "  替换次数: $($stats.Replacements)"
Write-Host "  添加导入: $($stats.ImportsAdded)"
Write-Host "  错误数量: $($stats.Errors)"

if ($stats.Errors -eq 0) {
    Write-Host "`n✅ 迁移成功完成!" -ForegroundColor Green
    Write-Host "`n下一步:" -ForegroundColor Yellow
    Write-Host "  1. 删除 src/utils/disableLogs.ts"
    Write-Host "  2. 从 src/index.ts 移除 disableLogs 导入"
    Write-Host "  3. 运行 npm run build 验证"
} else {
    Write-Host "`n⚠️ 迁移完成但有错误!" -ForegroundColor Yellow
}
