/**
 * 检查当前显示的卡片
 * 
 * 使用方法：
 * 1. 打开"提取练习"对话框
 * 2. 在浏览器控制台中复制粘贴这段代码
 * 3. 按回车执行
 */

console.log('=== 检查当前显示的卡片 ===');

const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');

if (!plugin) {
  console.error('❌ 插件未找到');
} else {
  console.log('✅ 插件已加载');
  
  // 1. 检查队列
  const manager = plugin.unifiedDataSourceManager;
  if (manager) {
    console.log('✅ UnifiedDataSourceManager 已初始化');
    
    const queue = manager.getQueue?.('retrieval-practice');
    if (queue) {
      console.log('✅ 队列已获取');
      
      // 获取队列中的所有卡片
      (async () => {
        try {
          const cards = queue.cards || [];
          console.log('📋 队列中的卡片数量:', cards.length);
          
          cards.forEach((card, index) => {
            console.log(`卡片 ${index + 1}:`, {
              id: card.id,
              blockId: card.blockId,
              cardSource: card.meta?.cardSource,
              symbolType: card.meta?.symbolType,
              question: card.meta?.question,
              answer: card.meta?.answer
            });
          });
          
          // 2. 检查当前显示的块
          const blockContent = document.querySelector('.protyle-wysiwyg [data-node-id]');
          if (blockContent) {
            const displayedBlockId = blockContent.getAttribute('data-node-id');
            console.log('🎯 当前显示的块 ID:', displayedBlockId);
            console.log('📝 块内容:', blockContent.textContent.substring(0, 200));
            
            // 检查这个块是否在队列中
            const isInQueue = cards.some(card => card.blockId === displayedBlockId);
            console.log('❓ 当前块是否在队列中?', isInQueue);
            
            if (!isInQueue) {
              console.warn('⚠️ 当前显示的块不在队列中！');
              console.log('队列中的 blockId 列表:', cards.map(c => c.blockId));
            } else {
              const currentCard = cards.find(card => card.blockId === displayedBlockId);
              console.log('✅ 当前卡片信息:', currentCard);
            }
          } else {
            console.warn('⚠️ 未找到当前显示的块');
          }
          
          // 3. 检查 ReviewContent 组件的 props
          const reviewContent = document.querySelector('.fsrs-review-v2-content');
          if (reviewContent) {
            // 尝试访问 Vue 实例
            const vueKeys = Object.keys(reviewContent).filter(key => key.startsWith('__vue'));
            console.log('Vue 实例 keys:', vueKeys);
            
            if (vueKeys.length > 0) {
              const vueInstance = reviewContent[vueKeys[0]];
              console.log('Vue 实例:', vueInstance);
              
              if (vueInstance?.props) {
                console.log('Props.content:', vueInstance.props.content);
                console.log('Props.content.card:', vueInstance.props.content?.card);
                console.log('Props.content.data (blockId):', vueInstance.props.content?.data);
              }
            }
          }
          
        } catch (error) {
          console.error('❌ 获取队列数据失败:', error);
        }
      })();
    } else {
      console.error('❌ 队列未找到');
    }
  } else {
    console.error('❌ UnifiedDataSourceManager 未初始化');
  }
}
