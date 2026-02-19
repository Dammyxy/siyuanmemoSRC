/**
 * 检查 createUnifiedReviewDialog 的返回值
 * 
 * 使用方法：
 * 1. 在浏览器控制台中复制粘贴这段代码
 * 2. 按回车执行
 */

console.log('=== 检查 createUnifiedReviewDialog 返回值 ===');

const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');

if (!plugin) {
  console.error('❌ 插件未加载');
} else {
  console.log('✅ 插件已加载');
  
  // 检查 ReviewDialogManager
  if (!plugin.reviewDialogManager) {
    console.error('❌ ReviewDialogManager 未初始化');
  } else {
    console.log('✅ ReviewDialogManager 已初始化');
    
    // 保存原始方法
    const originalMethod = plugin.reviewDialogManager.openRetrievalPractice.bind(plugin.reviewDialogManager);
    
    // 拦截方法调用
    plugin.reviewDialogManager.openRetrievalPractice = async function() {
      console.log('[拦截] openRetrievalPractice 被调用');
      
      // 调用原始方法
      await originalMethod();
      
      // 检查返回值
      const reviewDialog = plugin.reviewDialogManager.reviewDialog;
      
      console.log('[拦截] reviewDialog 对象:', reviewDialog);
      console.log('[拦截] reviewDialog 属性:', Object.keys(reviewDialog || {}));
      console.log('[拦截] 有 adapter?', !!reviewDialog?.adapter);
      console.log('[拦截] 有 queue?', !!reviewDialog?.queue);
      console.log('[拦截] 有 dialog?', !!reviewDialog?.dialog);
      console.log('[拦截] 有 destroy?', !!reviewDialog?.destroy);
      
      if (reviewDialog?.adapter) {
        console.log('[拦截] adapter 类型:', reviewDialog.adapter.constructor.name);
      }
      
      if (reviewDialog?.queue) {
        console.log('[拦截] queue 类型:', reviewDialog.queue.constructor.name);
      }
    };
    
    console.log('✅ 已拦截 openRetrievalPractice 方法');
    console.log('💡 现在请打开"提取练习"对话框，控制台会显示详细信息');
  }
}
