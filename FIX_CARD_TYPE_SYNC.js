// 修复卡片类型同步问题
// 从块属性同步类型信息到本地存储

(async function() {
    console.log('开始修复卡片类型同步问题...');
    
    // 获取插件实例
    const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
    if (!plugin) {
        console.error('未找到插件实例');
        return;
    }
    
    // 获取所有卡片
    const cards = plugin.storage.getAllCards();
    console.log(`总卡片数：${cards.length}`);
    
    let updated = 0;
    let failed = 0;
    
    for (const card of cards) {
        try {
            // 查询块属性
            const result = await fetch('/api/attr/getBlockAttrs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: card.blockId })
            });
            
            const response = await result.json();
            const attrs = response.data || {};
            const cardType = attrs['custom-fsrs-card-type'];
            
            if (cardType && (cardType === 'topic' || cardType === 'item')) {
                // 更新本地存储
                const oldType = card.type;
                card.type = cardType;
                plugin.storage.setCard(card);
                
                if (oldType !== cardType) {
                    console.log(`✅ 更新卡片 ${card.id.substring(0, 8)}: ${oldType} → ${cardType}`);
                    updated++;
                }
            } else {
                console.warn(`⚠️ 卡片 ${card.id.substring(0, 8)} 没有 card_type 属性`);
                failed++;
            }
        } catch (err) {
            console.error(`❌ 处理卡片 ${card.id} 失败:`, err);
            failed++;
        }
    }
    
    if (updated > 0) {
        await plugin.storage.saveCards();
        console.log(`✅ 已更新 ${updated} 张卡片的类型`);
    }
    
    console.log(`完成！更新: ${updated}, 失败: ${failed}`);
    
    // 验证结果
    const updatedCards = plugin.storage.getAllCards();
    const typeStats = updatedCards.reduce((acc, card) => {
        const type = card.type || 'undefined';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});
    console.log('更新后的类型分布：', typeStats);
})();
