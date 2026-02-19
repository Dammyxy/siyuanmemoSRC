// 检查当前使用的 Adapter
// 在浏览器控制台中运行此脚本

(function checkAdapter() {
  console.log('=== 检查 Adapter ===\n');
  
  // 1. 获取插件
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  if (!plugin) {
    console.error('❌ 插件未找到');
    return;
  }
  console.log('✅ 插件已加载');
  
  // 2. 检查复习对话框（多个可能的位置）
  let reviewDialog = null;
  let dialogLocation = '';
  
  if (plugin.reviewDialog) {
    reviewDialog = plugin.reviewDialog;
    dialogLocation = 'plugin.reviewDialog';
  } else if (plugin.reviewDialogManager?.reviewDialog) {
    reviewDialog = plugin.reviewDialogManager.reviewDialog;
    dialogLocation = 'plugin.reviewDialogManager.reviewDialog';
  } else if (plugin.reviewService?.reviewDialog) {
    reviewDialog = plugin.reviewService.reviewDialog;
    dialogLocation = 'plugin.reviewService.reviewDialog';
  }
  
  if (!reviewDialog) {
    console.log('⚠️ 复习对话框未找到');
    console.log('💡 已检查的位置:');
    console.log('   - plugin.reviewDialog:', !!plugin.reviewDialog);
    console.log('   - plugin.reviewDialogManager:', !!plugin.reviewDialogManager);
    console.log('   - plugin.reviewDialogManager?.reviewDialog:', !!plugin.reviewDialogManager?.reviewDialog);
    console.log('   - plugin.reviewService:', !!plugin.reviewService);
    console.log('   - plugin.reviewService?.reviewDialog:', !!plugin.reviewService?.reviewDialog);
    console.log('\n💡 请打开"提取练习"复习对话框');
    return;
  }
  
  console.log('✅ 复习对话框已打开');
  console.log('   位置:', dialogLocation);
  
  // 3. 检查 adapter
  const adapter = reviewDialog.adapter;
  if (!adapter) {
    console.error('❌ 找不到 adapter');
    console.log('   reviewDialog 属性:', Object.keys(reviewDialog));
    return;
  }
  
  console.log('\n📋 Adapter 信息:');
  console.log('   类型:', adapter.constructor.name);
  console.log('   是否为 UnifiedReviewAdapter:', adapter.constructor.name === 'UnifiedReviewAdapter');
  
  // 4. 检查 adapter 方法
  console.log('\n🔍 Adapter 方法:');
  console.log('   有 toUIState:', typeof adapter.toUIState === 'function');
  console.log('   有 renderQuickCard:', typeof adapter.renderQuickCard === 'function');
  console.log('   有 renderBasicCard:', typeof adapter.renderBasicCard === 'function');
  
  // 5. 检查队列
  const queue = reviewDialog.queue;
  if (queue) {
    console.log('\n� Queue 信息:');
    console.log('   类型:', queue.constructor.name);
    console.log('   getType:', queue.getType?.());
  }
  
  // 6. 检查当前卡片
  if (reviewDialog.currentState) {
    console.log('\n📋 当前状态:');
    console.log('   content.type:', reviewDialog.currentState.content?.type);
    console.log('   content.id:', reviewDialog.currentState.content?.id);
  }
  
  // 7. 测试 toUIState 是否被调用
  console.log('\n🧪 测试 toUIState:');
  const originalToUIState = adapter.toUIState;
  let callCount = 0;
  
  adapter.toUIState = async function(...args) {
    callCount++;
    console.log(`   toUIState 被调用 (第 ${callCount} 次)`, args[1]?.blockId || args[1]?.id);
    const result = await originalToUIState.apply(this, args);
    console.log(`   返回 content.type:`, result.content?.type);
    return result;
  };
  
  console.log('   已添加拦截器，等待下一次卡片切换...');
  
  console.log('\n=== 检查完成 ===');
  console.log('💡 提示：');
  console.log('   1. 如果 adapter 不是 UnifiedReviewAdapter，说明使用了错误的队列');
  console.log('   2. 如果 toUIState 没有被调用，说明对话框没有正确初始化');
  console.log('   3. 点击"显示答案"或切换卡片，查看 toUIState 是否被调用');
})();
