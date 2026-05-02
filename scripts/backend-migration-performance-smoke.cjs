#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('node:child_process');

const repeatArg = Number.parseInt(process.argv[2] || '1', 10);
const repeat = Number.isFinite(repeatArg) && repeatArg > 0 ? repeatArg : 1;

const suites = [
  {
    id: 'browser',
    label: 'Browser deck query',
    command: ['pnpm', ['vitest', 'run', 'src/application/services/__tests__/BrowserApplicationService.deck-query.test.ts']],
  },
  {
    id: 'review',
    label: 'Review commit use case',
    command: ['pnpm', ['vitest', 'run', 'src/application/usecases/review/__tests__/ReviewCommitUseCase.test.ts']],
  },
  {
    id: 'ai',
    label: 'AI prompt runtime',
    command: ['pnpm', ['vitest', 'run', 'src/application/services/__tests__/AIWorkbenchPromptRuntime.test.ts']],
  },
];

const modes = [
  {
    id: 'legacy',
    label: 'legacy-like',
    env: {
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'false',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'false',
      VITE_SIYUANMEMO_ENABLE_AI_BACKEND_RUNTIME: 'false',
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'false',
    },
  },
  {
    id: 'backend',
    label: 'backend+writer',
    env: {
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'true',
      VITE_SIYUANMEMO_ENABLE_AI_BACKEND_RUNTIME: 'true',
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'true',
    },
  },
];

function runCommand(binary, args, modeEnv) {
  const started = process.hrtime.bigint();
  const result = spawnSync(binary, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...modeEnv,
    },
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  if (result.status !== 0) {
    throw new Error(`Command failed: ${binary} ${args.join(' ')}`);
  }
  return elapsedMs;
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function main() {
  const measurements = [];
  console.log(`Backend migration performance smoke (repeat=${repeat})`);
  for (const suite of suites) {
    for (const mode of modes) {
      const samples = [];
      for (let i = 0; i < repeat; i += 1) {
        console.log(`\n[${suite.id}] ${mode.label} run ${i + 1}/${repeat}`);
        const [binary, args] = suite.command;
        const ms = runCommand(binary, args, mode.env);
        samples.push(ms);
      }
      measurements.push({
        suiteId: suite.id,
        suiteLabel: suite.label,
        modeId: mode.id,
        modeLabel: mode.label,
        samples,
        avgMs: average(samples),
      });
    }
  }

  console.log('\nResults (ms):');
  console.log('| Suite | Mode | Samples | Avg |');
  console.log('| --- | --- | --- | ---: |');
  for (const row of measurements) {
    const sampleText = row.samples.map((value) => value.toFixed(2)).join(', ');
    console.log(`| ${row.suiteLabel} | ${row.modeLabel} | ${sampleText} | ${row.avgMs.toFixed(2)} |`);
  }

  const grouped = new Map();
  for (const row of measurements) {
    if (!grouped.has(row.suiteId)) {
      grouped.set(row.suiteId, {});
    }
    grouped.get(row.suiteId)[row.modeId] = row.avgMs;
  }
  console.log('\nDelta (backend vs legacy):');
  console.log('| Suite | Delta ms | Delta % |');
  console.log('| --- | ---: | ---: |');
  for (const suite of suites) {
    const pair = grouped.get(suite.id) || {};
    const legacy = Number(pair.legacy || 0);
    const backend = Number(pair.backend || 0);
    const delta = backend - legacy;
    const deltaPct = legacy > 0 ? (delta / legacy) * 100 : 0;
    console.log(`| ${suite.label} | ${delta.toFixed(2)} | ${deltaPct.toFixed(2)}% |`);
  }
}

main();
