/**
 * 快速制卡一键修复脚本
 * 
 * 使用方法：
 * 1. 在浏览器控制台中复制粘贴整个脚本
 * 2. 按回车运行
 * 3. 等待完成
 * 4. 重新构建插件: npm run build
 * 5. 重启思源笔记
 */

(async function oneClickFix() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   快速制卡一键修复脚本 v1.0          ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  // ==================== 步骤 1：检查插件 ====================
  console.log('📦 步骤 1/5: 检查插件...');
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  if (!plugin) {
    console.error('❌ 插件未找到！请确认插件已安装并启用。');
    return;
  }
  console.log('✅ 插件已加载\n');
  
  // ==================== 步骤 2：获取快速制卡 ====================
  console.log('🔍 步骤 2/5: 扫描快速制卡...');
  const cards = plugin.storage.getAllCards();
  const quickCards = cards.filter(c => c.meta?.cardSource === 'quick-symbol');
  
  console.log(`   总卡片数: ${cards.length}`);
  console.log(`   快速制卡数: ${quickCards.length}`);
  
  if (quickCards.length === 0) {
    console.log('⚠️  没有找到快速制卡');
    console.log('💡 请先创建一张测试卡片: 测试 >> 答案\n');
    return;
  }
  console.log('✅ 找到快速制卡\n');
  
  // ==================== 步骤 3：清理 IAL ====================
  console.log('🧹 步骤 3/5: 清理 IAL...');
  
  function cleanIAL(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\s*\{:.*?\}\s*/g, ' ').trim();
  }
  
  let cleanedCount = 0;
  let alreadyClean = 0;
  
  for (const card of quickCards) {
    let needsUpdate = false;
    const changes = [];
    
    // 清理各个字段
    const fields = ['question', 'answer', 'concept', 'definition'];
    for (const field of fields) {
      if (card.meta[field]) {
        const original = card.meta[field];
        const cleaned = cleanIAL(original);
        
        if (cleaned !== original) {
          card.meta[field] = cleaned;
          needsUpdate = true;
          changes.push(`${field}: "${original}" -> "${cleaned}"`);
        }
      }
    }
    
    if (needsUpdate) {
      plugin.storage.setCard(card);
      cleanedCount++;
      console.log(`   🔧 清理卡片 ${card.blockId}:`);
      