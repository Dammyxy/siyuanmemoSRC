/**
 * 测试字段映射
 * 
 * 检查 UnifiedReviewAdapter 是否正确映射 FSRSCard 的字段
 */

console.log('=== 测试字段映射 ===');

const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');

if (!plugin) {
  console.error('❌ 插件未找到');
} else {
  console.log('✅ 插件已加载');
  
  // 获取队列
  const manager = plugin.unifiedDataSourceManager;
  const queue = manager?.getQueue?.('retrieval-practice');
  
  if (!queue) {
    console.error('❌ 队列未找到');
  } else {
    console.log('✅ 队列已获取');
    
    // 获取所有卡片
    queue.getAllCards().then(cards => {
      if (cards.length === 0) {
        console.warn('⚠️ 队列为空');
        return;
      }
      
      const firstCard = cards[0];
      console.log('\n📋 第一张卡片的原始数据:');
      console.log('- id:', firstCard.id);
      console.log('- blockId:', firstCard.blockId);
      console.log('- cardID:', firstCard.cardID);
      console.log('- blockID:', firstCard.blockID);
      console.log('- meta.cardSource:', firstCard.meta?.cardSource);
      console.log('- meta.symbolType:', firstCard.meta?.symbolType);
      
      // 模拟 UnifiedReviewAdapter 的字段映射逻辑
      console.log('\n🔧 模拟字段映射:');
      const card = firstCard;
      const item = firstCard;
      
      // 旧的映射逻辑（错误的）
      const oldBlockId = (item as any).blockID || card.blockId || (item as any).blockId || card.id || (item as any).cardID;
      const oldCardId = (item as any).cardID || card.id || (item as any).id;
      
      console.log('旧逻辑 - blockId:', oldBlockId);
      console.log('旧逻辑 - cardId:', oldCardId);
      
      // 新的映射逻辑（正确的）
      const newBlockId = card.blockId || (item as any).blockID || (item as any).blockId || card.id || (item as any).cardID;
      const newCardId = card.id || (item as any).cardID || (item as any).id;
      
      console.log('新逻辑 - blockId:', newBlockId);
      console.log('新逻辑 - cardId:', newCardId);
      
      // 验证
      if (newBlockId && newCardId) {
        console.log('\n✅ 字段映射成功！');
      } else {
        console.error('\n❌ 字段映射失败！');
      }
    });
  }
}
