// 最终测试：验证快速制卡符号隐藏功能
(async () => {
    console.log('=== 🔍 最终测试：快速制卡符号隐藏 ===\n');
    
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

    // 1. 获取队列策略
    console.log('1️⃣ 获取检索练习队列策略...');
    const strategy = manager.getQueueStrategy('retrieval-practice');
    if (!strategy) {
        console.error('❌ 队列策略未获取');
        return;
    }
    console.log('✅ 队列策略已获取\n');

    // 2. 调用 next() 获取下一张卡片
    console.log('2️⃣ 调用 strategy.next() 获取卡片...');
    const card = await strategy.next();
    
    if (!card) {
        console.log('⚠️ 队列为空，没有到期卡片');
        return;
    }
    
    console.log('✅ 获取到卡片\n');
    
    // 3. 检查卡片字段
    console.log('3️⃣ 检查卡片字段:');
    console.log('  📌 基础字段:');
    console.log('    - id:', card.id);
    console.log('    - blockId:', card.blockId);
    console.log('    - cardID (兼容):', card.cardID);
    console.log('    - blockID (兼容):', card.blockID);
    
    console.log('\n  📌 Meta 字段:');
    console.log('    - meta:', card.meta);
    if (card.meta) {
        console.log('    - meta.cardSource:', card.meta.cardSource);
        console.log('    - meta.symbolType:', card.meta.symbolType);
        console.log('    - meta.question:', card.meta.question);
        console.log('    - meta.answer:', card.meta.answer);
    }
    
    // 4. 判断是否为快速制卡
    const isQuickCard = card.meta?.cardSource === 'quick-symbol';
    console.log('\n4️⃣ 快速制卡检测:');
    console.log('  ', isQuickCard ? '✅ 是快速制卡' : '❌ 不是快速制卡');
    
    if (isQuickCard) {
        console.log('  📝 符号类型:', card.meta.symbolType);
        console.log('  📝 问题:', card.meta.question);
        console.log('  📝 答案:', card.meta.answer);
    }
    
    // 5. 检查 ReviewContent.vue 的逻辑
    console.log('\n5️⃣ ReviewContent.vue 应该执行的逻辑:');
    if (isQuickCard) {
        console.log('  ✅ 检测到快速制卡');
        console.log('  ✅ 只应用 card__block--hidemark 类（隐藏符号）');
        console.log('  ✅ 不应用其他隐藏类（保留其他内容）');
    } else {
        console.log('  ℹ️ 普通卡片');
        console.log('  ℹ️ 应用所有隐藏类（标准行为）');
    }
    
    console.log('\n=== ✅ 测试完成 ===');
    console.log('\n📋 下一步操作:');
    console.log('1. 刷新思源笔记（F5）');
    console.log('2. 打开复习对话框');
    console.log('3. 检查快速制卡是否只隐藏符号（>>, ::, ;;, {{}}）');
    console.log('4. 检查其他内容是否正常显示');
})();
