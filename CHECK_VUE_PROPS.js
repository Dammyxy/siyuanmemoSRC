/**
 * 检查 Vue 组件的 props
 * 
 * 查看 ReviewContent 组件接收到的 props.content.card 数据
 */

console.log('=== 检查 Vue 组件的 props ===');

// 等待 DOM 准备
setTimeout(() => {
  const reviewContent = document.querySelector('.fsrs-review-v2-content');
  
  if (!reviewContent) {
    console.error('❌ 未找到 ReviewContent 组件');
    return;
  }
  
  console.log('✅ 找到 ReviewContent 组件');
  
  // Vue 3 使用 __vueParentComponent 访问组件实例
  const allKeys = Object.keys(reviewContent);
  console.log('所有 keys (前20个):', allKeys.slice(0, 20));
  
  // 尝试多种方式访问 Vue 实例
  const vueKeys = allKeys.filter(key => key.includes('vue') || key.includes('Vue'));
  console.log('Vue 相关 keys:', vueKeys);
  
  // 尝试直接访问 __vueParentComponent
  let vueInstance = null;
  for (const key of allKeys) {
    if (key.startsWith('__vue')) {
      vueInstance = reviewContent[key];
      console.log(`找到 Vue 实例 (${key}):`, vueInstance);
      break;
    }
  }
  
  if (!vueInstance) {
    console.warn('⚠️ 未找到 Vue 实例，尝试其他方法');
    
    // 方法2：通过插件直接访问
    const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
    const manager = plugin?.unifiedDataSourceManager;
    const queue = manager?.getQueue?.('retrieval-practice');
    
    if (queue) {
      queue.getAllCards().then(cards => {
        if (cards.length > 0) {
          const firstCard = cards[0];
          console.log('\n📋 从队列获取的第一张卡片:');
          console.log('- id:', firstCard.id);
          console.log('- blockId:', firstCard.blockId);
          console.log('- meta.cardSource:', firstCard.meta?.cardSource);
          console.log('- meta.symbolType:', firstCard.meta?.symbolType);
        }
      });
    }
    return;
  }
  
  // 检查 props
  const props = vueInstance.props || vueInstance.setupState || vueInstance.data;
  
  if (!props) {
    console.error('❌ 未找到 props');
    console.log('vueInstance 的属性:', Object.keys(vueInstance));
    return;
  }
  
  console.log('\n📋 Props 数据:');
  console.log('- hasHiddenContent:', props.hasHiddenContent);
  console.log('- showAnswer:', props.showAnswer);
  console.log('- content:', props.content);
  console.log('- content.type:', props.content?.type);
  console.log('- content.data:', props.content?.data);
  console.log('- content.card:', props.content?.card);
  
  if (props.content?.card) {
    const card = props.content.card;
    console.log('\n📋 Card 数据:');
    console.log('- id:', card.id);
    console.log('- blockId:', card.blockId);
    console.log('- meta:', card.meta);
    console.log('- meta.cardSource:', card.meta?.cardSource);
    console.log('- meta.symbolType:', card.meta?.symbolType);
    console.log('- meta.question:', card.meta?.question);
    console.log('- meta.answer:', card.meta?.answer);
    
    // 检查是否为快速制卡
    const isQuickCard = card.meta?.cardSource === 'quick-symbol';
    console.log('\n❓ 是否为快速制卡?', isQuickCard);
    
    if (isQuickCard) {
      console.log('✅ 这是一张快速制卡');
      console.log('符号类型:', card.meta.symbolType);
    } else {
      console.warn('⚠️ 这不是快速制卡');
      console.log('cardSource:', card.meta?.cardSource);
    }
  } else {
    console.warn('⚠️ props.content.card 为空');
  }
  
  // 检查 CSS 类
  const protyleHost = document.querySelector('.fsrs-review-v2-content__protyle-host');
  if (protyleHost) {
    console.log('\n🎨 Protyle host CSS 类:');
    console.log('- hidemark:', protyleHost.classList.contains('card__block--hidemark'));
    console.log('- hideli:', protyleHost.classList.contains('card__block--hideli'));
    console.log('- hidesb:', protyleHost.classList.contains('card__block--hidesb'));
    console.log('- hideh:', protyleHost.classList.contains('card__block--hideh'));
  }
}, 1000);
