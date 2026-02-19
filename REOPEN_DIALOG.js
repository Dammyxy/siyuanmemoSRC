/**
 * 重新打开提取练习对话框
 * 
 * 使用方法：
 * 1. 在浏览器控制台中复制粘贴这段代码
 * 2. 按回车执行
 * 3. 对话框会自动关闭并重新打开
 */

console.log('=== 重新打开提取练习对话框 ===');

const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');

if (!plugin) {
  console.error('❌ 插件未找到');
} else {
  console.log('✅ 插件已加载');
  
  // 1. 关闭当前对话框
  if (plugin.reviewDialogManager?.reviewDialog) {
    console.log('🔄 关闭当前对话框...');
    plugin.reviewDialogManager.reviewDialog.destroy();
    
    // 等待 500ms 后重新打开
    setTimeout(() => {
      console.log('🔄 重新打开对话框...');
      
      // 2. 重新打开提取练习
      if (plugin.reviewDialogManager?.openRetrievalPractice) {
        plugin.reviewDialogManager.openRetrievalPractice();
        console.log('✅ 对话框已重新打开');
        
        // 等待 1 秒后检查队列
        setTimeout(() => {
          console.log('\n=== 检查队列状态 ===');
          
          const manager = plugin.unifiedDataSourceManager;
          if (manager) {
            const queue = manager.getQueue?.('retrieval-practice');
            if (queue) {
              const cards = queue.cards || [];
              console.log('📋 队列中的卡片数量:', cards.length);
              
              if (cards.length > 0) {
                console.log('\n📝 队列中的卡片:');
                cards.forEach((card, index) => {
                  console.log(`\n卡片 ${index + 1}:`, {
                    id: card.id,
                    blockId: card.blockId,
                    cardSource: card.meta?.cardSource,
                    symbolType: card.meta?.symbolType,
                    question: card.meta?.question,
                    answer: card.meta?.answer
                  });
                });
                
                // 检查当前显示的块
                setTimeout(() => {
                  const blockContent = document.querySelector('.protyle-wysiwyg [data-node-id]');
                  if (blockContent) {
                    const displayedBlockId = blockContent.getAttribute('data-node-id');
                    console.log('\n🎯 当前显示的块 ID:', displayedBlockId);
                    console.log('📝 块内容:', blockContent.textContent.substring(0, 200));
                    
                    // 检查是否匹配队列中的第一张卡片
                    const firstCard = cards[0];
                    if (firstCard && firstCard.blockId === displayedBlockId) {
                      console.log('✅ 当前显示的块匹配队列中的第一张卡片');
                      console.log('卡片信息:', {
                        cardSource: firstCard.meta?.cardSource,
                        symbolType: firstCard.meta?.symbolType,
                        question: firstCard.meta?.question
                      });
                    } else {
                      console.warn('⚠️ 当前显示的块不匹配队列中的第一张卡片');
                      console.log('期望的 blockId:', firstCard?.blockId);
                      console.log('实际的 blockId:', displayedBlockId);
                    }
                    
                    // 检查 CSS 类
                    const protyleHost = document.querySelector('.fsrs-review-v2-content__protyle-host');
                    if (protyleHost) {
                      console.log('\n🎨 Protyle host CSS 类:');
                      console.log('- hidemark:', protyleHost.classList.contains('card__block--hidemark'));
                      console.log('- hideli:', protyleHost.classList.contains('card__block--hideli'));
                      console.log('- hidesb:', protyleHost.classList.contains('card__block--hidesb'));
                      console.log('- hideh:', protyleHost.classList.contains('card__block--hideh'));
                      
                      // 如果是快速制卡，应该只有 hidemark
                      if (firstCard?.meta?.cardSource === 'quick-symbol') {
                        const hasOnlyHidemark = 
                          protyleHost.classList.contains('card__block--hidemark') &&
                          !protyleHost.classList.contains('card__block--hideli') &&
                          !protyleHost.classList.contains('card__block--hidesb') &&
                          !protyleHost.classList.contains('card__block--hideh');
                        
                        if (hasOnlyHidemark) {
                          console.log('✅ 快速制卡符号隐藏正确（只有 hidemark）');
                        } else {
                          console.warn('⚠️ 快速制卡符号隐藏不正确');
                        }
                      }
                    }
                  }
                }, 500);
              } else {
                console.log('📋 队列为空，没有到期卡片');
              }
            }
          }
        }, 1000);
      } else {
        console.error('❌ openRetrievalPractice 方法未找到');
      }
    }, 500);
  } else {
    console.log('ℹ️ 当前没有打开的对话框，直接打开新对话框...');
    
    if (plugin.reviewDialogManager?.openRetrievalPractice) {
      plugin.reviewDialogManager.openRetrievalPractice();
      console.log('✅ 对话框已打开');
    } else {
      console.error('❌ openRetrievalPractice 方法未找到');
    }
  }
}
