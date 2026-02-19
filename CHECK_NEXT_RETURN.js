// 检查 UnifiedQueueStrategy.next() 返回值
(async () => {
    const plugin = window.siyuanMemoPlugin;
    if (!plugin) {
        console.error('❌ 插件未加载');
        return;
    }

    const manager = plugin.unifiedDataSourceManager;
    if (!manager) {
        console.error('❌ UnifiedDataSourceManager 未初始化');
        return;
    }

    const queue = await manager.getQueue('retrieval-practice');
    if (!queue) {
        console.error('❌ 队列未获取');
        return;
    }

    console.log('=== 调用 queue.next() ===');
    const card = await queue.next();
    
    if (!card) {
        console.log('⚠️ 队列为空');
        return;
    }

    console.log('✅ 返回的卡片对象:');
    console.log('  id:', card.id);
    console.log('  blockId:', card.blockId);
    console.log('  cardID:', card.cardID);
    console.log('  blockID:', card.blockID);
    console.log('  meta:', card.meta);
    console.log('  meta.cardSource:', card.meta?.cardSource);
    console.log('  meta.symbolType:', card.meta?.symbolType);
    console.log('  meta.question:', card.meta?.question);
    console.log('  meta.answer:', card.meta?.answer);
    
    console.log('\n=== 完整对象 ===');
    console.log(card);
    
    console.log('\n=== 对象的所有键 ===');
    console.log('Object.keys:', Object.keys(card));
    console.log('Object.getOwnPropertyNames:', Object.getOwnPropertyNames(card));
})();
