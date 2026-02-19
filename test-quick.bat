@echo off
REM 快速测试脚本 - 只运行核心测试，跳过属性测试

npx vitest run --reporter=basic --pool=threads --poolOptions.threads.maxThreads=4 --exclude="**/*.property.test.ts" %*
