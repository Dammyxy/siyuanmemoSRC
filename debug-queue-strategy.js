/**
 * 调试脚本：验证队列策略是否正常工作
 * 
 * 在浏览器控制台中运行此脚本来检查：
 * 1. SessionQueueStrategy 是否被正确加载
 * 2. 调度器是否返回了策略
 * 3. 策略的判断逻辑是否正确
 */

// 1. 检查 SessionQueueStrategy 是否存在
console.log('=== 队列策略调试 ===');

// 2. 模拟一个 Relearning 状态的卡片
const testCard = {
    id: '20230128003959-pu6aq2w',
    state: 3, // Relearning
    due: Date.now() + 60000, // 1分钟后
};

// 3. 获取当天结束时间（假设 dayStartHour = 4）
const dayStartHour = 4;
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(dayStartHour, 0, 0, 0);
const dayEnd = tomorrow.getTime();

console.log('测试卡片:', {
    id: testCard.id,
    state: testCard.state,
    due: new Date(testCard.due).toISOString(),
    dayEnd: new Date(dayEnd).toISOString(),
});

// 4. 判断逻辑
const shouldRemove = testCard.due > dayEnd;
console.log('预期结果:', {
    shouldRemove,
    reason: shouldRemove ? 'due > dayEnd，应该移除' : 'due <= dayEnd，应该保留'
});

// 5. 检查实际的队列策略
console.log('\n请在控制台中检查以下内容：');
console.log('1. 是否有 [SessionQueueStrategy] 开头的日志？');
console.log('2. 是否有 "Using strategy from scheduler" 的日志？');
console.log('3. 是否有 "Card ... removal decision" 的日志？');
console.log('\n如果没有这些日志，说明新代码还没有生效，需要重新构建插件。');
