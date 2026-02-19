// 直接从数据库检查卡片的 meta 字段
(async () => {
    console.log('=== 🔍 检查数据库中的卡片 meta 字段 ===\n');
    
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

    // 获取所有项目卡片
    console.log('1️⃣ 获取所有项目卡片...');
    const cards = await manager.getCards({ cardType: 'item' });
    console.log(`✅ 找到 ${cards.length} 张项目卡片\n`);

    // 查找快速制卡
    const quickCards = cards.filter(card => card.meta?.cardSource === 'quick-symbol');
    console.log(`2️⃣ 其中有 ${quickCards.length} 张快速制卡\n`);

    if (quickCards.length === 0) {
        console.log('⚠️ 没有找到快速制卡');
        console.log('ℹ️ 请先创建一些快速制卡（使用 >>, ::, ;;, {{}} 符号）');
        return;
    }

    // 显示前 3 张快速制卡的详细信息
    console.log('3️⃣ 快速制卡详细信息（前 3 张）:\n');
    quickCards.slice(0, 3).forEach((card, index) => {
        console.log(`📋 卡片 ${index + 1}:`);
        console.log('  - id:', card.id);
        console.log('  - blockId:', card.blockId);
        console.log('  - meta.cardSource:', card.meta?.cardSource);
        console.log('  - meta.symbolType:', card.meta?.symbolType);
        console.log('  - meta.question:', card.meta?.question);
        console.log('  - meta.answer:', card.meta?.answer);
        console.log('  - due:', new Date(card.due).toISOString());
        console.log('  - state:', card.state);
        console.log('');
    });

    console.log('=== ✅ 检查完成 ===\n');
    console.log('📋 下一步:');
    console.log('1. 刷新思源笔记（F5）');
    console.log('2. 打开复习对话框');
    console.log('3. 在控制台运行 CHECK_REVIEW_CARD.js');
    console.log('4. 验证快速制卡的 meta 字段是否正确传递到 ReviewContent');
})();
