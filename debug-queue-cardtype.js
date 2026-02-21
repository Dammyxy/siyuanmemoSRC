/**
 * 调试队列视图类型筛选问题
 * 
 * 问题：在提取练习队列和渐进学习队列里，所有当天到期的闪卡都进去了，全是 item
 * 
 * 检查点：
 * 1. 数据库中的卡片是否有正确的 type 字段
 * 2. 队列的 getCards() 方法返回的卡片是否包含正确的 type
 * 3. 数据源的 applyFilters() 方法是否正确过滤
 */

const { UnifiedStorageManager } = require('./dist/core/storage/UnifiedStorageManager');
const { QueueType } = require('./dist/types/unified-data-source');

async function debugQueueCardType() {
    console.log('='.repeat(80));
    console.log('🔍 调试队列视图类型筛选问题');
    console.log('='.repeat(80));
    
    try {
        // 1. 获取 UnifiedStorageManager 实例
        const storage = UnifiedStorageManager.getInstance();
        
        // 2. 获取所有卡片
        console.log('\n📊 1. 检查所有卡片的 type 字段');
        console.log('-'.repeat(80));
        const allCards = storage.getAllCards();
        console.log(`✅ 总共 ${allCards.length} 张卡片`);
        
        // 统计各类型卡片数量
        const typeStats = {};
        allCards.forEach(card => {
            const type = card.type || 'undefined';
            typeStats[type] = (typeStats[type] || 0) + 1;
        });
        
        console.log('\n📈 卡片类型统计：');
        Object.entries(typeStats).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count} 张`);
        });
        
        // 3. 检查到期卡片的类型
        console.log('\n📊 2. 检查到期卡片的 type 字段');
        console.log('-'.repeat(80));
        const now = Date.now();
        const dueCards = allCards.filter(card => card.due <= now && card.state !== 4);
        console.log(`✅ 到期卡片: ${dueCards.length} 张`);
        
        const dueTypeStats = {};
        dueCards.forEach(card => {
            const type = card.type || 'undefined';
            dueTypeStats[type] = (dueTypeStats[type] || 0) + 1;
        });
        
        console.log('\n📈 到期卡片类型统计：');
        Object.entries(dueTypeStats).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count} 张`);
        });
        
        // 4. 显示前 10 张到期卡片的详细信息
        console.log('\n📋 前 10 张到期卡片的详细信息：');
        console.log('-'.repeat(80));
        dueCards.slice(0, 10).forEach((card, index) => {
            console.log(`\n${index + 1}. 卡片 ${card.id}`);
            console.log(`   blockId: ${card.blockId}`);
            console.log(`   type: ${card.type}`);
            console.log(`   due: ${new Date(card.due).toISOString()}`);
            console.log(`   state: ${card.state}`);
            console.log(`   meta.xiuyuanID: ${card.meta?.xiuyuanID || 'N/A'}`);
            console.log(`   meta.templateID: ${card.meta?.templateID || 'N/A'}`);
        });
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ 调试完成');
        console.log('='.repeat(80));
        
    } catch (error) {
        console.error('❌ 调试失败:', error);
        console.error(error.stack);
    }
}

// 运行调试
debugQueueCardType();
