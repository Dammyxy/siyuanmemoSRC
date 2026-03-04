# 测试 Logger 迁移脚本
# 创建测试文件，验证替换逻辑

$testContent = @"
import { something } from 'somewhere';

export class TestClass {
  test() {
    console.log('[SiYuanMemo] Simple message');
    console.debug('[SiYuanMemo] Debug with data', { foo: 'bar' });
    console.info('[SiYuanMemo] Info message', data, moreData);
    console.warn('[SiYuanMemo] Warning: something happened');
    console.error('[SiYuanMemo] Error occurred', error);
    
    // 带逗号的复杂情况
    console.log('[SiYuanMemo] Message with comma', value1, value2, { nested: { data: 'test' } });
    
    // 嵌套括号
    console.log('[SiYuanMemo] Nested call', someFunc(a, b), otherFunc());
    
    // 不应该被替换的
    console.log('Other plugin message');
    console.log('[OtherPlugin] message');
  }
}
"@

Write-Host "📝 Test Content:" -ForegroundColor Cyan
Write-Host $testContent
Write-Host "`n" + ("=" * 80) + "`n"

# 应用替换逻辑
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
    
    Write-Host "Found $($matches.Count) console calls" -ForegroundColor Yellow
    
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
        
        Write-Host "`nProcessing: console.$level(...)" -ForegroundColor Cyan
        Write-Host "  Args: $argsText" -ForegroundColor Gray
        
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
            
            Write-Host "  ✅ Will replace with: $newCall" -ForegroundColor Green
            
            # 替换
            $oldCall = $content.Substring($startPos, $parenEnd - $startPos + 1)
            $result = $result.Substring(0, $startPos) + $newCall + $result.Substring($parenEnd + 1)
            
            $modified = $true
            $count++
        } else {
            Write-Host "  ⏭️ Skipping (not SiYuanMemo log)" -ForegroundColor Gray
        }
    }
    
    return @{
        Content = $result
        Modified = $modified
        Count = $count
    }
}

$result = Replace-ConsoleCalls -content $testContent

Write-Host "`n" + ("=" * 80) + "`n"
Write-Host "✨ Result ($($result.Count) replacements):" -ForegroundColor Cyan
Write-Host $result.Content

Write-Host "`n" + ("=" * 80) + "`n"
if ($result.Modified) {
    Write-Host "✅ Test passed! Script logic is correct." -ForegroundColor Green
} else {
    Write-Host "❌ Test failed! No replacements made." -ForegroundColor Red
}
