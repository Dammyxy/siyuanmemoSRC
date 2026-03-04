# 修复引号问题
$filePath = Join-Path $PSScriptRoot "src/services/ReviewDialogManager.ts"
$content = [System.IO.File]::ReadAllText($filePath, [System.Text.UTF8Encoding]::new($false))

# 修复：logger.log('[...] ... "all" mode"); -> logger.log('[...] ... "all" mode');
$content = $content -replace 'logger\.log\(\[''ReviewDialogManager''\] ✅ Cleared temporary blacklist for "all" mode"\);', 'logger.log(''[ReviewDialogManager] ✅ Cleared temporary blacklist for "all" mode'');'

[System.IO.File]::WriteAllText($filePath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "✅ Fixed ReviewDialogManager.ts" -ForegroundColor Green
