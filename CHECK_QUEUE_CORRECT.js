/**
 * 正确检查队列中的卡片
 * 
 * 使用方法：
 * 1. 打开"提取练习"对话框
 * 2. 在浏览器控制台中复制粘贴这段代码
 * 3. 按回车执行
 */

console.log('=== 正确检查队列中的卡片 ===');

const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');

if (!plugin) {
  console.error('❌ 插件未找到');
} else {
  console.log('✅ 插件已加载');
  
  const manager = plugin.unifiedDataSourceManager;
  if (manager) {
    console.log('✅ UnifiedDataSourceManager 已初始化');
    
    const queue = manager.getQueue?.('retrieval-practice');
    if (queue) {
      console.log('✅ 队列已获取');
      console.log('队列对象:', queue);
      console.log('队列类型:', queue.constructor.name);
      
      // 方法1：通过 sequencer 获取
      if (queue.sequencer) {
        console.log('\n📋 方法1：通过 sequencer.getAll() 获取');
        const items = queue.sequencer.getAll();
        console.log('卡片数量:', items.length);
        
        items.forEach((item, index) => {
          console.log(`\n卡片 ${index + 1}:`, {
            id: item.id,
            cardID: item.cardID,
            blockID: item.blockID,
            cardSource: item.meta?.cardSource,
            symbolType: item.meta?.symbolType,
            question: item.meta?.question,
            answer: item.meta?.answer
          });
        });
        
        // 检查当前显示的块
        const blockContent = document.querySelector('.protyle-wysiwyg [data-node-id]');
        if (blockContent) {
          const displayedBlockId = blockContent.getAttribute('data-node-id');
          console.log('\n🎯 当前显示的块 ID:', displayedBlockId);
          console.log('📝 块内容:', blockContent.textContent.substring(0, 200));
          
          // 检查是否在队列中
          const isInQueue = items.some(item => item.blockID === displayedBlockId);
          console.log('❓ 当前块是否在队列中?', isInQueue);
          
          if (!isInQueue) {
            console.warn('⚠️ 当前显示的块不在队列中！');
            console.log('队列中的 blockID 列表:', items.map(item => item.blockID));
          } else {
            const currentCard = items.find(item => item.blockID === displayedBlockId);
            console.log('✅ 当前卡片信息:', currentCard);
            
            // 检查 CSS 类
            const protyleHost = document.querySelector('.fsrs-review-v2-content__protyle-host');
            if (protyleHost) {
              console.log('\n🎨 Protyle host CSS 类:');
              console.log('- hidemark:', protyleHost.classList.contains('card__block--hidemark'));
              console.log('- hideli:', protyleHost.classList.contains('card__block--hideli'));
              console.log('- hidesb:', protyleHost.classList.contains('card__block--hidesb'));
              console.log('- hideh:', protyleHost.classList.contains('card__block--hideh'));
              
              // 如果是快速制卡，应该只有 hidemark
              if (currentCard?.meta?.cardSource === 'quick-symbol') {
                const hasOnlyHidemark = 
                  protyleHost.classList.contains('card__block--hidemark') &&
                  !protyleHost.classList.contains('card__block--hideli') &&
                  !protyleHost.classList.contains('card__block--hidesb') &&
                  !protyleHost.classList.contains('card__block--hideh');
                
                if (hasOnlyHidemark) {
                  console.log('✅ 快速制卡符号隐藏正确（只有 hidemark）');
                } else {
                  console.warn('⚠️ 快速制卡符号隐藏不正确');
                  console.log('期望：只有 hidemark');
                  console.log('实际：', {
                    hidemark: protyleHost.classList.contains('card__block--hidemark'),
                    hideli: protyleHost.classList.contains('card__block--hideli'),
                    hidesb: protyleHost.classList.contains('card__block--hidesb'),
                    hideh: protyleHost.classList.contains('card__block--hideh')
                  });
                }
              }
            }
          }
        }
      }
      
      // 方法2：通过 getAllCards() 获取
      if (queue.getAllCards) {
        console.log('\n📋 方法2：通过 getAllCards() 获取');
        queue.getAllCards().then(cards => {
          console.log('卡片数量:', cards.length);
          cards.forEach((card, index) => {
            console.log(`卡片 ${index + 1}:`, {
              id: card.id,
              cardID: card.cardID,
              blockID: card.blockID,
              cardSource: card.meta?.cardSource
            });
          });
        });
      }
      
      // 方法3：通过 getAllItems() 获取
      if (queue.getAllItems) {
        console.log('\n📋 方法3：通过 getAllItems() 获取');
        const items = queue.getAllItems();
        console.log('卡片数量:', items.length);
        items.forEach((item, index) => {
          console.log(`卡片 ${index + 1}:`, {
            id: item.id,
            cardID: item.cardID,
            blockID: item.blockID,
            cardSource: item.meta?.cardSource
          });
        });
      }
      
    } else {
      console.error('❌ 队列未找到');
    }
  } else {
    console.error('❌ UnifiedDataSourceManager 未初始化');
  }
}
