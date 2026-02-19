import * as fc from 'fast-check';

// 配置 fast-check 以加快测试速度
// 在 CI 环境中使用更多次数，本地开发使用较少次数
const numRuns = process.env.CI ? 100 : 10;

fc.configureGlobal({
  numRuns,
  verbose: false,
  // 设置超时以防止测试卡死
  interruptAfterTimeLimit: 3000,
  // 启用快速失败
  endOnFailure: true,
});
