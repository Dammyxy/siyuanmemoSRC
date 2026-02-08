# 只显示测试失败的详细信息
npm test -- --run src/core/siyuan/__tests__/riff.property.test.ts 2>&1 | 
    Select-String -Pattern "FAIL|Caused by|Expected|Received|AssertionError" -Context 1 |
    Select-Object -First 50
