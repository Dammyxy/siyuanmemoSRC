/**
 * 检查当前卡片的数据
 * 
 * 使用方法：
 * 1. 打开"提取练习"对话框
 * 2. 在浏览器控制台中复制粘贴这段代码
 * 3. 按回车执行
 */

console.log('=== 检查当前卡片数据 ===');

// 方法1：通过 DOM 查找 Vue 实例
const reviewContent = document.querySelector('.fsrs-review-v2-content');
if (reviewContent) {
  // 尝试多种方式访问 Vue 实例
  const vueInstance = reviewContent.__vnode || reviewContent.__vue__ || reviewContent._vnode;
  console.log('Vue 实例:', vueInstance);
  
  if (vueInstance) {
    const props = vueInstance.props || vueInstance.componentOptions?.propsData;
    console.log('Props:', props);
    console.log('content:', props?.content);
    console.log('content.card:', props?.content?.card);
    console.log('cardSource:', props?.content?.card?.meta?.cardSource);
  }
}

// 方法2：直接检查 DOM 元素的类
const protyleHost = document.querySelector('.fsrs-review-v2-content__protyle-host');
if (protyleHost) {
  console.log('Protyle host classes:', protyleHost.className);
  console.log('有 hidemark?', protyleHost.classList.contains('card__block--hidemark'));
  console.log('有 hideli?', protyleHost.classList.contains('card__block--hideli'));
  console.log('有 hidesb?', protyleHost.classList.contains('card__block--hidesb'));
  console.log('有 hideh?', protyleHost.classList.contains('card__block--hideh'));
}

// 方法3：检查当前块的内容
const blockContent = document.querySelector('.protyle-wysiwyg [data-node-id]');
if (blockContent) {
  const blockId = blockContent.getAttribute('data-node-id');
  console.log('当前块 ID:', blockId);
  console.log('块内容:', blockContent.textContent.substring(0, 200));
  
  // 检查是否包含快速制卡符号
  const text = blockContent.textContent;
  const hasSymbols = text.includes('>>') || text.includes('::') || text.includes(';;') || text.includes('{{');
  console.log('包含快速制卡符号?', hasSymbols);
}

// 方法4：从插件获取当前卡片数据
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
if (plugin) {
  console.log('插件实例:', plugin);
  
  // 尝试从数据源获取当前卡片
  const manager = plugin.unifiedDataSourceManager;
  if (manager) {
    console.log('UnifiedDataSourceManager:', manager);
    
    // 获取 retrieval-practice 队列
    const queue = manager.getQueue?.('retrieval-practice');
    if (queue) {
      console.log('Queue:', queue);
      // 尝试获取当前卡片
      // 注意：这可能需要异步调用
    }
  }
}
