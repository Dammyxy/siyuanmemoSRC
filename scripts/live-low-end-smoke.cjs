#!/usr/bin/env node

const fs = require('node:fs');

const DEFAULT_WORKSPACE = 'H:/SiYuanXY';
const SIYUAN_API = process.env.SIYUAN_API || 'http://127.0.0.1:6806';
const CDP_API = process.env.SIYUAN_CDP || 'http://127.0.0.1:9222';
const WORKSPACE = process.env.SIYUAN_WORKSPACE || DEFAULT_WORKSPACE;
const CONF_PATH = `${WORKSPACE}/conf/conf.json`;
const LABEL = process.argv.includes('--label')
  ? process.argv[process.argv.indexOf('--label') + 1] || 'smoke'
  : 'smoke';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function maskId(value) {
  if (!value || typeof value !== 'string') return null;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function readToken() {
  const conf = JSON.parse(fs.readFileSync(CONF_PATH, 'utf8'));
  return conf?.api?.token || '';
}

const token = readToken();

async function siyuanApi(path, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Token ${token}`;
  const response = await fetch(`${SIYUAN_API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.code !== 0) {
    throw new Error(`SiYuan API failed: ${path} http=${response.status} code=${json.code} msg=${json.msg || ''}`);
  }
  return json.data;
}

class CdpClient {
  constructor(target) {
    this.target = target;
    this.id = 0;
    this.pending = new Map();
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)(message);
        this.pending.delete(message.id);
      }
    };
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, options = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: options.timeout || 60000,
    });
    const details = result.result?.exceptionDetails;
    if (details) {
      throw new Error(details.exception?.description || details.text || 'Runtime.evaluate failed');
    }
    return result.result?.result?.value;
  }

  async close() {
    await this.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
    this.ws.close();
  }
}

async function connectRenderer() {
  const targets = await (await fetch(`${CDP_API}/json/list`)).json();
  const page = targets.find((target) =>
    target.type === 'page'
    && /\/stage\/build\/app\//.test(target.url)
    && !/window\.html/.test(target.url)
    && !/^devtools:/.test(target.url)
  ) || targets.find((target) => target.type === 'page' && !/^devtools:/.test(target.url));
  if (!page?.webSocketDebuggerUrl) {
    throw new Error('No SiYuan renderer CDP target found');
  }
  const client = new CdpClient(page);
  await client.open();
  return client;
}

function summarizeReport(report, phaseStartedAt = null, phaseEndedAt = null) {
  const events = Array.isArray(report?.events) ? report.events : [];
  const inPhase = events.filter((event) => {
    if (phaseStartedAt == null || phaseEndedAt == null) return true;
    return event.endedAt >= phaseStartedAt && event.startedAt <= phaseEndedAt;
  });
  const longtasks = inPhase.filter((event) => event.path === 'renderer' && event.operation === 'longtask');
  const byName = (path, operation) => inPhase.filter((event) => event.path === path && event.operation === operation);
  const maxOf = (path, operation) => {
    const values = byName(path, operation).map((event) => event.durationMs || 0);
    return values.length ? Math.max(...values) : 0;
  };
  const latest = (path, operation) => byName(path, operation).at(-1);
  const firstRows = latest('browser', 'open.first-rows-visible');
  const modelUpdated = byName('browser', 'grid.model-updated');
  const sourceRefresh = byName('source-existence', 'refresh-page-cards');
  return {
    eventCount: inPhase.length,
    firstRowsMs: round(Number(firstRows?.metadata?.elapsedMs ?? 0)),
    firstRowsRowCount: Number(firstRows?.metadata?.rowCount ?? 0),
    longtaskCount: longtasks.length,
    longtaskMaxMs: round(longtasks.reduce((max, event) => Math.max(max, event.durationMs || 0), 0)),
    totalBlockingEstimateMs: round(longtasks.reduce((sum, event) => sum + Math.max(0, (event.durationMs || 0) - 50), 0)),
    gridGetRowsMaxMs: round(maxOf('browser', 'grid.get-rows')),
    gridFetchRowsMaxMs: round(maxOf('browser', 'grid.fetch-rows')),
    successCallbackMaxMs: round(maxOf('browser', 'grid.success-callback')),
    modelUpdatedMaxElapsedMs: round(modelUpdated.reduce((max, event) => Math.max(max, Number(event.metadata?.elapsedMs || 0)), 0)),
    modelUpdatedCount: modelUpdated.length,
    snapshotAllRowsMaxMs: round(maxOf('browser', 'snapshot.all-rows')),
    focusRowsMaxMs: round(maxOf('browser', 'snapshot.focus-rows')),
    hydrateChunkMaxMs: round(maxOf('browser', 'snapshot.queryable.hydrate-chunk')),
    sourceRefreshMaxMs: round(sourceRefresh.reduce((max, event) => Math.max(max, event.durationMs || 0), 0)),
    sourceRefreshCount: sourceRefresh.length,
    relayDrainMaxMs: round(maxOf('relay', 'writer.drain-pending-commands')),
    relaySubmitWaitMaxMs: round(maxOf('relay', 'submit-and-wait')),
    autocardReadMaxMs: round(Math.max(
      maxOf('autocard', 'siyuan.get-block-kramdown'),
      maxOf('autocard', 'siyuan.get-block-attrs'),
    )),
    actionPumpMaxMs: round(maxOf('daily-editing', 'kernel-action-pump.poll-once')),
    nativeRiffUpsertMaxMs: round(Math.max(
      maxOf('daily-editing', 'kernel-action-pump.native-riff-upsert'),
      maxOf('daily-editing', 'kernel-action-pump.native-riff-upsert-background'),
    )),
    slowest: inPhase
      .slice()
      .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
      .slice(0, 8)
      .map((event) => ({
        path: event.path,
        operation: event.operation,
        durationMs: round(event.durationMs || 0),
      })),
  };
}

async function startPhase(client, cpuRate) {
  await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  await client.eval('window.siyuanMemoRuntimePerformance?.enable?.(); true');
  return client.eval('performance.timeOrigin + performance.now()');
}

async function finishPhase(client, phaseStartedAt, settleMs = 1400) {
  await sleep(settleMs);
  const endedAt = await client.eval('performance.timeOrigin + performance.now()');
  const report = await client.eval('window.siyuanMemoRuntimePerformance?.report?.()');
  return summarizeReport(report, phaseStartedAt, endedAt);
}

async function clickSelector(client, selector) {
  return client.eval(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  })()`);
}

async function closeBrowser(client) {
  await client.eval(`(() => {
    const element = document.querySelector('.b3-dialog__container[data-key="srs-browser-dialog"] .b3-dialog__close');
    if (element) element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  })()`);
  await sleep(250);
}

async function openBrowserAndWait(client) {
  await clickSelector(client, '.fsrs-topbar');
  return client.eval(`new Promise((resolve) => {
    const start = performance.now();
    const timer = setInterval(() => {
      const rows = document.querySelectorAll('.b3-dialog__container[data-key="srs-browser-dialog"] .ag-row').length;
      const root = Boolean(document.querySelector('.b3-dialog__container[data-key="srs-browser-dialog"] .card-browser'));
      if (rows > 0 || performance.now() - start > 12000) {
        clearInterval(timer);
        resolve({ elapsedMs: performance.now() - start, rows, root });
      }
    }, 40);
  })`);
}

async function setSearchValue(client, value) {
  await client.eval(`(() => {
    const input = document.querySelector('.b3-dialog__container[data-key="srs-browser-dialog"] .toolbar__search input');
    if (!input) return false;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    return true;
  })()`);
}

async function runBrowserOpenPhase(client, name, cpuRate) {
  await closeBrowser(client);
  const startedAt = await startPhase(client, cpuRate);
  const waitState = await openBrowserAndWait(client);
  const summary = await finishPhase(client, startedAt, 2200);
  return { name, cpuRate, waitState, ...summary };
}

async function runSearchClearPhase(client, cpuRate) {
  const startedAt = await startPhase(client, cpuRate);
  await setSearchValue(client, '__siyuanmemo_perf_nomatch__');
  await sleep(1300);
  await setSearchValue(client, '');
  await sleep(1800);
  const summary = await finishPhase(client, startedAt, 1600);
  return { name: 'browser search-clear', cpuRate, ...summary };
}

async function runForceRefreshPhase(client, cpuRate) {
  const startedAt = await startPhase(client, cpuRate);
  await clickSelector(client, '.b3-dialog__container[data-key="srs-browser-dialog"] button[title*="强制刷新"], .b3-dialog__container[data-key="srs-browser-dialog"] button[title*="Force"]');
  await sleep(2600);
  const summary = await finishPhase(client, startedAt, 1600);
  return { name: 'browser force-refresh', cpuRate, ...summary };
}

async function createTempDoc() {
  const notebooksData = await siyuanApi('/api/notebook/lsNotebooks', {});
  const notebook = (notebooksData?.notebooks || []).find((item) => !item.closed) || notebooksData?.notebooks?.[0];
  if (!notebook?.id) throw new Error('No open notebook found');
  const stamp = Date.now().toString(36);
  const path = `/siyuanmemo-perf/low-end-${stamp}`;
  const docId = await siyuanApi('/api/filetree/createDocWithMd', {
    notebook: notebook.id,
    path,
    markdown: 'seed',
  });
  return { notebookId: notebook.id, docId, path };
}

async function cleanupTempDoc(docId) {
  if (!docId) return;
  await siyuanApi('/api/filetree/removeDocByID', { id: docId }).catch(() => undefined);
}

async function openTempDoc(client, docId) {
  await client.eval(`(() => {
    if (typeof window.openFileByURL === 'function') {
      window.openFileByURL('siyuan://blocks/${docId}');
      return true;
    }
    return false;
  })()`);
  await sleep(3200);
}

async function focusActiveEditor(client) {
  return client.eval(`(() => {
    const candidates = Array.from(document.querySelectorAll('.layout-tab-container:not(.fn__none) .protyle-wysiwyg [contenteditable="true"], .protyle-wysiwyg [contenteditable="true"]'));
    const editable = candidates.find((element) => element.offsetParent !== null) || candidates[0];
    if (!editable) return false;
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  })()`);
}

async function typeText(client, text, intervalMs = 12) {
  for (const char of text) {
    await client.send('Input.insertText', { text: char });
    if (intervalMs > 0) await sleep(intervalMs);
  }
}

async function runTypingPhase(client, name, cpuRate, text, intervalMs = 12, settleMs = 2200) {
  const focused = await focusActiveEditor(client);
  const startedAt = await startPhase(client, cpuRate);
  await typeText(client, text, intervalMs);
  const summary = await finishPhase(client, startedAt, settleMs);
  return { name, cpuRate, focused, typedChars: text.length, ...summary };
}

async function runAttrNoisePhase(client, docId, cpuRate) {
  const startedAt = await startPhase(client, cpuRate);
  for (let i = 0; i < 8; i += 1) {
    await siyuanApi('/api/attr/setBlockAttrs', {
      id: docId,
      attrs: { 'custom-siyuanmemo-perf-noise': `${Date.now()}-${i}` },
    });
    await sleep(80);
  }
  const summary = await finishPhase(client, startedAt, 2200);
  return { name: 'editing no-inspectable attr-noise', cpuRate, operations: 8, ...summary };
}

async function runApiStormPhase(client, docId, cpuRate) {
  const startedAt = await startPhase(client, cpuRate);
  for (let i = 0; i < 8; i += 1) {
    await siyuanApi('/api/block/appendBlock', {
      parentID: docId,
      dataType: 'markdown',
      data: `storm ${i}`,
    });
    await sleep(80);
  }
  const summary = await finishPhase(client, startedAt, 2600);
  return { name: 'editing api-transaction-storm', cpuRate, operations: 8, ...summary };
}

function classify(phase) {
  const firstRowsRed = phase.name.includes('browser') && phase.firstRowsMs && phase.firstRowsMs > 1000;
  const longtaskRed = (phase.longtaskMaxMs || 0) >= 250;
  const longtaskYellow = (phase.longtaskMaxMs || 0) > 50;
  const durationRed = (phase.gridGetRowsMaxMs || 0) >= 500 || (phase.sourceRefreshMaxMs || 0) >= 500;
  if (firstRowsRed || longtaskRed || durationRed) return 'red';
  if (longtaskYellow || (phase.gridGetRowsMaxMs || 0) > 120 || (phase.sourceRefreshMaxMs || 0) > 150) return 'yellow';
  return 'green';
}

async function main() {
  const client = await connectRenderer();
  const phases = [];
  let tempDoc = null;
  try {
    phases.push(await runBrowserOpenPhase(client, 'browser open cold-ish', 4));
    phases.push(await runBrowserOpenPhase(client, 'browser warm-open', 4));
    phases.push(await runSearchClearPhase(client, 4));
    phases.push(await runForceRefreshPhase(client, 4));

    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
    await sleep(1600);
    tempDoc = await createTempDoc();
    await openTempDoc(client, tempDoc.docId);
    phases.push(await runTypingPhase(client, 'editing ordinary typing', 4, ' ordinary typing baseline text repeated for low end smoke.', 10));
    phases.push(await runAttrNoisePhase(client, tempDoc.docId, 4));
    phases.push(await runTypingPhase(client, 'editing marker typing', 4, '\nmarker >> answer\nmarker >> answer\nmarker >> answer', 14, 6500));
    phases.push(await runApiStormPhase(client, tempDoc.docId, 4));
  } finally {
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
    await closeBrowser(client).catch(() => undefined);
    await client.close().catch(() => undefined);
    await cleanupTempDoc(tempDoc?.docId);
  }

  const output = {
    label: LABEL,
    generatedAt: new Date().toISOString(),
    environment: {
      cdp: CDP_API,
      siyuanApi: SIYUAN_API,
      workspace: WORKSPACE,
      tempDocId: maskId(tempDoc?.docId),
    },
    phases: phases.map((phase) => ({ ...phase, risk: classify(phase) })),
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ label: LABEL, error: error.message }, null, 2));
  process.exit(1);
});
