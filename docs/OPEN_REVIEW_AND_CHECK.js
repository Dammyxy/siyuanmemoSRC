// 打开复习对话框并检查快速制卡
(async () => {
    console.log('=== 🔍 打开复习对话框并检查快速制卡 ===\n');
    
    const plugin = window.siyuanMemoPlugin;
    if (!plugin) {
        console.error('❌ 插件未加载');
        return;
    }

    // 1. 打开检索练习对话框
    console.log('1️⃣ 打开检索练习对话框...');
    const dialogManager = plugin.reviewDialogManager;
    if (!dialogManager) {
        console.error('❌ ReviewDialogManager 未初始化');
        return;
    }

    try {
        await dialogManager.openDialog('retrieval-practice');
        console.log('✅ 对话框已打开\n');
        
        // 2. 等待 1 秒让对话框完全加载
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 3. 检查当前显示的卡片
        console.log('2️⃣ 检查当前显示的卡片...');
        
        // 从 UnifiedReviewAdapter 获取当前卡片
        const adapter = (window as any).__currentReviewAdapter;
        if (!adapter) {
            console.warn('⚠️ 未找到 __currentReviewAdapter');
            console.log('ℹ️ 请手动检查复习界面中的快速制卡是否只隐藏了符号');
            return;
        }
        
        const currentCard = adapter.currentCard;
        if (!currentCard) {
            console.log('⚠️ 当前没有卡片');
            return;
        }
        
        console.log('✅ 找到当前卡片\n');
        
        // 4. 检查卡片字段
        console.log('3️⃣ 检查卡片字段:');
        console.log('  📌 基础字段:');
        console.log('    - id:', currentCard.id);
        console.log('    - blockId:', currentCard.blockId);
        console.log('    - cardID:', currentCard.cardID);
        console.log('    - blockID:', currentCard.blockID);
        
        console.log('\n  📌 Meta 字段:');
        console.log('    - meta:', currentCard.meta);
        if (currentCard.meta) {
            console.log('    - meta.cardSource:', currentCard.meta.cardSource);
            console.log('    - meta.symbolType:', currentCard.meta.symbolType);
            console.log('    - meta.question:', currentCard.meta.question);
            console.log('    - meta.answer:', currentCard.meta.answer);
        }
        
        // 5. 判断是否为快速制卡
        const isQuickCard = currentCard.meta?.cardSource === 'quick-symbol';
        console.log('\n4️⃣ 快速制卡检测:');
        console.log('  ', isQuickCard ? '✅ 是快速制卡' : '❌ 不是快速制卡');
        
        if (isQuickCard) {
            console.log('  📝 符号类型:', currentCard.meta.symbolType);
            console.log('  📝 问题:', currentCard.meta.question);
            console.log('  📝 答案:', currentCard.meta.answer);
            console.log('\n  ✅ 应该只隐藏符号（>>, ::, ;;, {{}}）');
            console.log('  ✅ 其他内容应该正常显示');
        } else {
            console.log('\n  ℹ️ 这是普通卡片，应用标准隐藏行为');
        }
        
        console.log('\n=== ✅ 检查完成 ===');
        console.log('\n📋 请在复习界面中验证:');
        console.log('1. 快速制卡：只有符号被隐藏');
        console.log('2. 其他内容（问题、答案）正常显示');
        console.log('3. 点击"显示答案"后，答案应该出现');
        
    } catch (error) {
        console.error('❌ 打开对话框失败:', error);
    }
})();
