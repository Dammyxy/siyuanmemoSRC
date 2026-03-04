/**
 * 安全的 Logger 迁移脚本
 * 
 * 功能：
 * 1. 将 console.log/debug/info/warn/error('[SiYuanMemo]...') 替换为 logger.log/debug/info/warn/error(...)
 * 2. 自动添加 logger 导入
 * 3. 移除 [SiYuanMemo] 前缀（logger 会自动添加）
 * 4. 跳过测试文件
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// 配置
const SRC_DIR = path.join(__dirname, 'src');
const EXCLUDE_PATTERNS = [
  '**/__tests__/**',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/disableLogs.ts',  // 跳过 disableLogs.ts
];

// 统计
let stats = {
  filesProcessed: 0,
  filesModified: 0,
  replacements: 0,
  importsAdded: 0,
};

/**
 * 检查文件是否应该被排除
 */
function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => {
    const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
    return regex.test(filePath);
  });
}

/**
 * 检查文件是否已经导入 logger
 */
function hasLoggerImport(content) {
  return /import\s+.*\{\s*logger\s*\}.*from\s+['"]@\/utils\/logger['"]/.test(content) ||
         /import\s+.*\{\s*createLogger\s*\}.*from\s+['"]@\/utils\/logger['"]/.test(content);
}

/**
 * 添加 logger 导入
 */
function addLoggerImport(content) {
  // 查找第一个 import 语句的位置
  const importMatch = content.match(/^import\s+/m);
  if (!importMatch) {
    // 如果没有 import，添加到文件开头（跳过注释）
    const firstCodeLine = content.match(/^(?:\/\/.*\n|\/\*[\s\S]*?\*\/\n)*(.*)/);
    if (firstCodeLine) {
      return `import { logger } from '@/utils/logger';\n\n${content}`;
    }
    return `import { logger } from '@/utils/logger';\n\n${content}`;
  }
  
  // 在第一个 import 之前添加
  const insertPos = importMatch.index;
  return content.slice(0, insertPos) + 
         `import { logger } from '@/utils/logger';\n` +
         content.slice(insertPos);
}

/**
 * 替换 console 调用为 logger 调用
 */
function replaceConsoleCalls(content) {
  let modified = false;
  let replacementCount = 0;
  
  // 匹配 console.log/debug/info/warn/error('[SiYuanMemo]...')
  const regex = /console\.(log|debug|info|warn|error)\(\s*['"](\[SiYuanMemo\][^\'"]*)['"](.*?)\)/g;
  
  const newContent = content.replace(regex, (match, level, message, rest) => {
    modified = true;
    replacementCount++;
    
    // 移除 [SiYuanMemo] 前缀
    const cleanMessage = message.replace(/^\[SiYuanMemo\]\s*/, '');
    
    // 构建新的调用
    return `logger.${level}('${cleanMessage}'${rest})`;
  });
  
  return { content: newContent, modified, replacementCount };
}

/**
 * 处理单个文件
 */
function processFile(filePath) {
  stats.filesProcessed++;
  
  // 读取文件
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // 检查是否有需要替换的 console 调用
  const hasConsoleCalls = /console\.(log|debug|info|warn|error)\(\s*['"]\[SiYuanMemo\]/.test(content);
  if (!hasConsoleCalls) {
    return; // 没有需要替换的内容
  }
  
  // 替换 console 调用
  const { content: newContent, modified, replacementCount } = replaceConsoleCalls(content);
  if (!modified) {
    return;
  }
  
  content = newContent;
  stats.replacements += replacementCount;
  
  // 添加 logger 导入（如果需要）
  if (!hasLoggerImport(content)) {
    content = addLoggerImport(content);
    stats.importsAdded++;
  }
  
  // 写回文件
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    stats.filesModified++;
    console.log(`✅ Modified: ${path.relative(SRC_DIR, filePath)} (${replacementCount} replacements)`);
  }
}

/**
 * 主函数
 */
function main() {
  console.log('🚀 Starting logger migration...\n');
  
  // 查找所有 TypeScript 文件
  const files = glob.sync('**/*.ts', {
    cwd: SRC_DIR,
    absolute: true,
    ignore: EXCLUDE_PATTERNS,
  });
  
  console.log(`Found ${files.length} TypeScript files\n`);
  
  // 处理每个文件
  files.forEach(file => {
    if (!shouldExclude(file)) {
      try {
        processFile(file);
      } catch (err) {
        console.error(`❌ Error processing ${file}:`, err.message);
      }
    }
  });
  
  // 输出统计
  console.log('\n📊 Migration Statistics:');
  console.log(`  Files processed: ${stats.filesProcessed}`);
  console.log(`  Files modified: ${stats.filesModified}`);
  console.log(`  Console calls replaced: ${stats.replacements}`);
  console.log(`  Logger imports added: ${stats.importsAdded}`);
  console.log('\n✅ Migration completed!');
}

// 运行
main();
