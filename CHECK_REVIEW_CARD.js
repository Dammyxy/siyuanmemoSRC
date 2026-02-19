// 在复习对话框打开后运行此脚本
// 检查 ReviewContent.vue 接收到的卡片数据
(function() {
    console.log('=== 🔍 检查 ReviewContent 接收到的卡片数据 ===\n');
    
    // 查找 ReviewContent 组件实例
    const dialogElement = document.querySelector('.b3-dialog--open');
    if (!dialogElement) {
        console.error('❌ 未找到打开的对话框');
        console.log('ℹ️ 请先打开复习对话框');
        return;
    }
    
    // 从 DOM 元素获取 Vue 实例
    const vueKey = Object.keys(dialogElement).find(key => key.startsWith('__vue'));
    if (!vueKey) {
        console.error('❌ 未找到 Vue 实例');
        return;
    }
    
    const vueInstance = dialogElement[vueKey];
    if (!vueInstance) {
        console.error('❌ Vue 实例为空');
        return;
    }
    
    console.log('✅ 找到 Vue 实例\n');
    
    // 递归查找 ReviewContent 组件
    function findReviewContent(component) {
        if (!component) return null;
        
        // 检查当前组件
        if (component.type?.name === 'ReviewContent' || 
            component.type?.__name === 'ReviewContent') {
            return component;
        }
        
        // 检查子组件
        if (component.subTree) {
            const result = findReviewContent(component.subTree);
            if (result) return result;
        }
        
        // 检查 children
        if (component.children) {
            if (Array.isArray(component.children)) {
                for (const child of component.children) {
                    const result = findReviewContent(child);
                    if (result) return result;
                }
            }
        }
        
        // 检查 component
        if (component.component) {
            return findReviewContent(component.component);
        }
        
        return null;
    }
    
    const reviewContent = findReviewContent(vueInstance);
    if (!reviewContent) {
        console.error('❌ 未找到 ReviewContent 组件');
        return;
    }
    
    console.log('✅ 找到 ReviewContent 组件\n');
    
    // 获取 props
    const props = reviewContent.props;
    if (!props) {
        console.error('❌ 未找到 props');
        return;
    }
    
    console.log('📋 Props 内容:');
    console.log('  - content:', props.content);
    
    if (!props.content) {
        console.warn('⚠️ content 为空');
        return;
    }
    
    const card = props.content.card;
    if (!card) {
        console.warn('⚠️ card 为空');
        return;
    }
    
    console.log('\n📋 Card 字段:');
    console.log('  📌 基础字段:');
    console.log('    - id:', card.id);
    console.log('    - blockId:', card.blockId);
    console.log('    - cardID:', card.cardID);
    console.log('    - blockID:', card.blockID);
    
    console.log('\n  📌 Meta 字段:');
    console.log('    - meta:', card.meta);
    if (card.meta) {
        console.log('    - meta.cardSource:', card.meta.cardSource);
        console.log('    - meta.symbolType:', card.meta.symbolType);
        console.log('    - meta.question:', card.meta.question);
        console.log('    - meta.answer:', card.meta.answer);
    }
    
    // 判断是否为快速制卡
    const isQuickCard = card.meta?.cardSource === 'quick-symbol';
    console.log('\n🎯 快速制卡检测:');
    console.log('  ', isQuickCard ? '✅ 是快速制卡' : '❌ 不是快速制卡');
    
    if (isQuickCard) {
        console.log('\n  📝 快速制卡信息:');
        console.log('    - 符号类型:', card.meta.symbolType);
        console.log('    - 问题:', card.meta.question);
        console.log('    - 答案:', card.meta.answer);
        
        console.log('\n  ✅ ReviewContent 应该执行的逻辑:');
        console.log('    - 只应用 card__block--hidemark 类');
        console.log('    - 不应用其他隐藏类');
        console.log('    - 符号（>>, ::, ;;, {{}}）被隐藏');
        console.log('    - 其他内容正常显示');
    } else {
        console.log('\n  ℹ️ 普通卡片，应用标准隐藏行为');
    }
    
    console.log('\n=== ✅ 检查完成 ===');
})();
