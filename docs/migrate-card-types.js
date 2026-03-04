/**
 * 批量修复现有卡片的类型
 * 
 * 问题：所有卡片的 type 都是 'item'，需要重新检测
 * 
 * 使用方法：
 * 1. 在思源笔记中打开开发者工具（F12）
 * 2. 在控制台中粘贴并运行此脚本
 */

(async function migrateCardTypes() {
    console.log('='.repeat(80));
    console.log('🔧 开始批量修复卡片类型');
    console.log('='.repeat(80));
    
    try {
        // 1. 获取必要的服务
        const { UnifiedStorageManager } = await import('./dist/core/storage/UnifiedStorageManager.js');
        const { CardTypeDetectionService } = await import('./dist/core/xiuyuan/domain/services/CardTypeDetectionService.js');
        
        const storage = UnifiedStorageManager.getInstance();
        const cardTypeDetectionService = new CardTypeDetectionService();
        
        // 2. 获取所有卡片
        const allCards = storage.getAllCards();
        console.log(`\n📊 总共 ${allCards.length} 张卡片`);
        
        // 3. 统计当前类型分布
        const beforeStats = {};
        allCards.forEach(card => {
            const type = card.type || 'undefined';
            beforeStats[type] = (beforeStats[type] || 0) + 1;
        });
        
        console.log('\n📈 修复前的类型分布：');
        Object.entries(beforeStats).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count} 张`);
        });
        
        // 4. 批量检测并更新类型
        console.log('\n🔍 开始检测卡片类型...');
        let fixed = 0;
        let errors = 0;
        
        for (let i = 0; i < allCards.length; i++) {
            const card = allCards[i];
            
            if (!card.blockId) {
                console.warn(`⚠️ 卡片 ${card.id} 没有 blockId，跳过`);
                continue;
            }
            
            try {
                // 检测类型
                const detectedType = await cardTypeDetectionService.detectCardType(card.blockId);
                
                // 如果类型不同，更新
                if (card.type !== detectedType) {
                    console.log(`  ${i + 1}/${allCards.length} - 更新 ${card.blockId}: ${card.type} → ${detectedType}`);
                    card.type = detectedType;
                    await storage.updateCard(card);
                    fixed++;
                } else {
                    // 类型相同，不需要更新
                    if (i % 10 === 0) {
                        console.log(`  ${i + 1}/${allCards.length} - 检查中...`);
                    }
                }
            } catch (error) {
                console.error(`❌ 检测卡片 ${card.blockId} 失败:`, error);
                errors++;
            }
        }
        
        // 5. 保存更改
        console.log('\n💾 保存更改到数据库...');
        const saveResult = await storage.save();
        if (!saveResult.ok) {
            console.error('❌ 保存失败:', saveResult.error);
            return;
        }
        
        // 6. 统计修复后的类型分布
        const afterStats = {};
        allCards.forEach(card => {
            const type = card.type || 'undefined';
            afterStats[type] = (afterStats[type] || 0) + 1;
        });
        
        console.log('\n📈 修复后的类型分布：');
        Object.entries(afterStats).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count} 张`);
        });
        
        console.log('\n' + '='.repeat(80));
        console.log(`✅ 修复完成！`);
        console.log(`  - 总卡片数: ${allCards.length}`);
        console.log(`  - 已修复: ${fixed}`);
        console.log(`  - 错误: ${errors}`);
        console.log('='.repeat(80));
        
        // 7. 提示用户刷新
        console.log('\n💡 请刷新卡片浏览器以查看更新后的类型');
        
    } catch (error) {
        console.error('❌ 迁移失败:', error);
        console.error(error.stack);
    }
})();
