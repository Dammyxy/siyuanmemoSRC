#!/usr/bin/env node

const fs = require('node:fs');
const {
  classifyPhaseRisk,
  maskId,
  sanitizeForOutput,
  summarizePhase,
} = require('./live-low-end-editor-smoke-utils.cjs');

const DEFAULT_WORKSPACE = 'H:/SiYuanXY';
const SIYUAN_API = process.env.SIYUAN_API || 'http://127.0.0.1:6806';
const CDP_API = process.env.SIYUAN_CDP || 'http://127.0.0.1:9222';
const WORKSPACE = process.env.SIYUAN_WORKSPACE || DEFAULT_WORKSPACE;
const CONF_PATH = `${WORKSPACE}/conf/conf.json`;
const PLUGIN_NAME = process.env.SIYUANMEMO_PLUGIN_NAME || 'siyuan-plugin-siyuanmemo';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    actions: 'plain-typing,marker-typing,continuous-scroll,large-doc-open,switch-documents,search,idle-then-edit,api-transaction-storm',
    browserState: 'closed',
    cpuRate: 1,
    idleMs: 60_000,
    label: 'editor-low-end-smoke',
    pluginState: 'on',
    profileName: 'developer',
    repeat: 1,
    vmCores: null,
    vmMemoryGb: null,
    allowHiddenRenderer: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const [rawKey, rawValue] = item.includes('=')
      ? item.slice(2).split(/=(.*)/s).filter((part) => part !== '')
      : [item.slice(2), argv[index + 1]];
    if (!item.includes('=')) index += 1;
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = rawValue ?? 'true';
    if (key === 'actions') args.actions = value;
    else if (key === 'browserState') args.browserState = value;
    else if (key === 'cpuRate') args.cpuRate = Number(value);
    else if (key === 'idleMs') args.idleMs = Number(value);
    else if (key === 'label') args.label = value;
    else if (key === 'pluginState') args.pluginState = value;
    else if (key === 'profileName') args.profileName = value;
    else if (key === 'repeat') args.repeat = Math.max(1, Number(value));
    else if (key === 'vmCores') args.vmCores = Number(value);
    else if (key === 'vmMemoryGb') args.vmMemoryGb = Number(value);
    else if (key === 'allowHiddenRenderer') args.allowHiddenRenderer = value === 'true';
    else if (key === 'selfCheck') args.selfCheck = true;
  }
  args.actionList = args.actions.split(',').map((action) => action.trim()).filter(Boolean);
  return args;
}

function readToken() {
  const conf = JSON.parse(fs.readFileSync(CONF_PATH, 'utf8'));
  return conf?.api?.token || '';
}

let token = '';

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

async function rendererPluginState() {
  const client = await connectRenderer();
  try {
    return await client.eval(`(() => {
      const plugins = window.siyuan?.ws?.app?.plugins || [];
      const plugin = plugins.find((item) => item.name === ${JSON.stringify(PLUGIN_NAME)});
      return {
        loaded: Boolean(plugin),
        hasRuntimePerformance: Boolean(window.siyuanMemoRuntimePerformance),
        hasTopbar: Boolean(document.querySelector('.fsrs-topbar')),
      };
    })()`);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function waitRendererPluginLoaded(expectedLoaded, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await rendererPluginState().catch((error) => ({ error: error.message }));
    if (last.loaded === expectedLoaded) {
      return last;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${PLUGIN_NAME} loaded=${expectedLoaded}; last=${JSON.stringify(last)}`);
}

async function setPluginEnabled(enabled) {
  const data = await siyuanApi('/api/petal/setPetalEnabled', {
    packageName: PLUGIN_NAME,
    enabled,
    app: '',
  });
  const renderer = await waitRendererPluginLoaded(enabled);
  return {
    requestedEnabled: enabled,
    apiReturned: {
      name: data?.name,
      enabled: Boolean(data?.enabled),
    },
    renderer,
  };
}

async function preparePluginState(args) {
  if (args.pluginState !== 'on' && args.pluginState !== 'off') {
    return {
      requestedState: args.pluginState,
      prepared: false,
      reason: 'unknown-plugin-state',
    };
  }
  return setPluginEnabled(args.pluginState === 'on');
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
      timeout: options.timeout || 120000,
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

async function readRendererState(client) {
  return client.eval(`(() => ({
    visibilityState: document.visibilityState,
    hidden: Boolean(document.hidden),
    hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
    href: location.href,
  }))()`);
}

async function prepareRendererForEditorSmoke(client, args) {
  const before = await readRendererState(client);
  await client.send('Target.activateTarget', { targetId: client.target.id }).catch(() => undefined);
  await client.send('Page.bringToFront').catch(() => undefined);
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => undefined);
  await client.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => undefined);
  await client.eval(`(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    return true;
  })()`).catch(() => undefined);
  await sleep(250);
  const after = await readRendererState(client);
  if (after.visibilityState !== 'visible' && !args.allowHiddenRenderer) {
    throw new Error(`Editor smoke requires a visible renderer; got visibility=${after.visibilityState} focus=${after.hasFocus}. Pass --allow-hidden-renderer true only for explicit background-window diagnostics.`);
  }
  return {
    before,
    after,
    hiddenRendererAllowed: args.allowHiddenRenderer,
  };
}

async function installEditorProbe(client) {
  await client.eval(`(() => {
    const root = window.__siyuanMemoEditorSmoke ||= {};
    if (root.installed) return true;
    root.installed = true;
    root.inputDelays = [];
    root.scrollFrameGaps = [];
    root.longtasks = [];
    root.lastKeydownAt = 0;
    root.frameTimer = 0;
    root.lastFrameAt = 0;
    root.heapSnapshot = () => {
      const memory = performance.memory || {};
      return {
        usedJSHeapSize: Number(memory.usedJSHeapSize || 0),
        totalJSHeapSize: Number(memory.totalJSHeapSize || 0),
        jsHeapSizeLimit: Number(memory.jsHeapSizeLimit || 0),
      };
    };
    root.keydownListener = () => {
      root.lastKeydownAt = performance.timeOrigin + performance.now();
    };
    root.inputListener = () => {
      const now = performance.timeOrigin + performance.now();
      if (root.lastKeydownAt) {
        root.inputDelays.push({
          startedAt: root.lastKeydownAt,
          endedAt: now,
          durationMs: now - root.lastKeydownAt,
        });
      }
    };
    document.addEventListener('keydown', root.keydownListener, true);
    document.addEventListener('input', root.inputListener, true);
    try {
      root.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          root.longtasks.push({
            path: 'renderer',
            operation: 'longtask',
            startedAt: performance.timeOrigin + entry.startTime,
            endedAt: performance.timeOrigin + entry.startTime + entry.duration,
            durationMs: entry.duration,
          });
        }
      });
      root.longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {}
    return true;
  })()`);
}

async function startProbePhase(client, cpuRate) {
  await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  await client.eval(`(() => {
    const plugins = window.siyuan?.ws?.app?.plugins || [];
    const loaded = plugins.some((item) => item.name === ${JSON.stringify(PLUGIN_NAME)});
    if (loaded) window.siyuanMemoRuntimePerformance?.enable?.({ reset: false, maxEvents: 8000 });
    return true;
  })()`);
  return client.eval(`(() => {
    const root = window.__siyuanMemoEditorSmoke;
    root.inputDelays = [];
    root.scrollFrameGaps = [];
    root.longtasks = [];
    root.heapBefore = root.heapSnapshot();
    root.lastFrameAt = performance.timeOrigin + performance.now();
    const tick = () => {
      const now = performance.timeOrigin + performance.now();
      if (root.lastFrameAt) {
        root.scrollFrameGaps.push({
          startedAt: root.lastFrameAt,
          endedAt: now,
          durationMs: now - root.lastFrameAt,
        });
      }
      root.lastFrameAt = now;
      root.frameTimer = requestAnimationFrame(tick);
    };
    root.frameTimer = requestAnimationFrame(tick);
    return {
      phaseStartedAt: performance.timeOrigin + performance.now(),
      heapBefore: root.heapBefore,
      rendererStateBefore: {
        visibilityState: document.visibilityState,
        hidden: Boolean(document.hidden),
        hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
        href: location.href,
      },
    };
  })()`);
}

async function finishProbePhase(client, started, settleMs = 1600) {
  await sleep(settleMs);
  const local = await client.eval(`(() => {
    const root = window.__siyuanMemoEditorSmoke;
    if (root.frameTimer) cancelAnimationFrame(root.frameTimer);
    return {
      phaseEndedAt: performance.timeOrigin + performance.now(),
      inputDelays: root.inputDelays || [],
      scrollFrameGaps: root.scrollFrameGaps || [],
      longtasks: root.longtasks || [],
      heapBefore: root.heapBefore || root.heapSnapshot(),
      heapAfter: root.heapSnapshot(),
      pluginLoaded: (window.siyuan?.ws?.app?.plugins || []).some((item) => item.name === ${JSON.stringify(PLUGIN_NAME)}),
      rendererStateAfter: {
        visibilityState: document.visibilityState,
        hidden: Boolean(document.hidden),
        hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
        href: location.href,
      },
      runtimeReport: (window.siyuan?.ws?.app?.plugins || []).some((item) => item.name === ${JSON.stringify(PLUGIN_NAME)})
        ? (window.siyuanMemoRuntimePerformance?.report?.() || null)
        : null,
    };
  })()`);
  const runtimeEvents = [
    ...(Array.isArray(local.runtimeReport?.events) ? local.runtimeReport.events : []),
    ...(Array.isArray(local.longtasks) ? local.longtasks : []),
  ];
  return summarizePhase({
    phaseStartedAt: started.phaseStartedAt,
    phaseEndedAt: local.phaseEndedAt,
    runtimeEvents,
    localEvents: {
      inputDelays: local.inputDelays || [],
      scrollFrameGaps: local.scrollFrameGaps || [],
    },
    heapBefore: started.heapBefore || local.heapBefore,
    heapAfter: local.heapAfter,
    rendererStateBefore: started.rendererStateBefore,
    rendererStateAfter: local.rendererStateAfter,
  });
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
  })()`).catch(() => false);
  await sleep(250);
}

async function openBrowserAndWait(client) {
  await clickSelector(client, '.fsrs-topbar');
  return client.eval(`new Promise((resolve) => {
    const start = performance.now();
    const timer = setInterval(() => {
      const rows = document.querySelectorAll('.b3-dialog__container[data-key="srs-browser-dialog"] .ag-row').length;
      const root = Boolean(document.querySelector('.b3-dialog__container[data-key="srs-browser-dialog"] .card-browser'));
      if (rows > 0 || root || performance.now() - start > 12000) {
        clearInterval(timer);
        resolve({ elapsedMs: performance.now() - start, rows, root });
      }
    }, 50);
  })`);
}

async function prepareBrowserState(client, browserState) {
  if (browserState === 'closed') {
    await closeBrowser(client);
    return { browserPrepared: 'closed' };
  }
  if (browserState === 'opened-once-then-closed') {
    const opened = await openBrowserAndWait(client).catch((error) => ({ error: error.message }));
    await closeBrowser(client);
    return { browserPrepared: 'opened-once-then-closed', opened };
  }
  if (browserState === 'open') {
    const opened = await openBrowserAndWait(client).catch((error) => ({ error: error.message }));
    return { browserPrepared: 'open', opened };
  }
  return { browserPrepared: 'unknown' };
}

async function createTempDoc(markdown) {
  const notebooksData = await siyuanApi('/api/notebook/lsNotebooks', {});
  const notebook = (notebooksData?.notebooks || []).find((item) => !item.closed) || notebooksData?.notebooks?.[0];
  if (!notebook?.id) throw new Error('No open notebook found');
  const stamp = Date.now().toString(36);
  const path = `/siyuanmemo-perf/editor-idle-${stamp}`;
  const docId = await siyuanApi('/api/filetree/createDocWithMd', {
    notebook: notebook.id,
    path,
    markdown,
  });
  return { notebookId: notebook.id, docId, path };
}

async function cleanupTempDoc(docId) {
  if (!docId) return;
  await siyuanApi('/api/filetree/removeDocByID', { id: docId }).catch(() => undefined);
}

async function openDoc(client, docId) {
  const startedAt = Date.now();
  await client.eval(`(() => {
    if (typeof window.openFileByURL === 'function') {
      window.openFileByURL('siyuan://blocks/${docId}');
      return true;
    }
    return false;
  })()`);
  await client.eval(`new Promise((resolve) => {
    const start = performance.now();
    const timer = setInterval(() => {
      const editable = document.querySelector('.layout-tab-container:not(.fn__none) .protyle-wysiwyg [contenteditable="true"], .protyle-wysiwyg [contenteditable="true"]');
      if (editable || performance.now() - start > 8000) {
        clearInterval(timer);
        resolve(Boolean(editable));
      }
    }, 50);
  })`);
  return Date.now() - startedAt;
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
    const isNewline = char === '\n';
    const key = isNewline ? 'Enter' : char;
    const code = isNewline ? 'Enter' : '';
    const windowsVirtualKeyCode = isNewline ? 13 : char.toUpperCase().charCodeAt(0);
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    }).catch(() => undefined);
    await client.send('Input.insertText', { text: char });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    }).catch(() => undefined);
    if (intervalMs > 0) await sleep(intervalMs);
  }
}

async function runPhase(client, args, actionName, repeatIndex, body, settleMs = 1600) {
  const started = await startProbePhase(client, args.cpuRate);
  const actionMeta = await body();
  const summary = await finishProbePhase(client, started, settleMs);
  return sanitizeForOutput({
    action: actionName,
    repeatIndex,
    profile: {
      name: args.profileName,
      cpuRate: args.cpuRate,
      pluginState: args.pluginState,
      browserState: args.browserState,
      vmCores: args.vmCores,
      vmMemoryGb: args.vmMemoryGb,
    },
    actionMeta,
    ...summary,
  });
}

function largeMarkdown(lineCount = 260) {
  return Array.from({ length: lineCount }, (_, index) => `- performance fixture line ${index + 1}`).join('\n');
}

async function runAction(client, args, actionName, repeatIndex, tempDocs) {
  if (actionName === 'plain-typing') {
    const doc = await createTempDoc('seed');
    tempDocs.push(doc.docId);
    await openDoc(client, doc.docId);
    await focusActiveEditor(client);
    return runPhase(client, args, actionName, repeatIndex, async () => {
      const focused = await focusActiveEditor(client);
      const chars = ' ordinary editor typing smoke text for low end profile.';
      await typeText(client, chars, 10);
      return { focused, typedChars: chars.length, docId: doc.docId };
    });
  }

  if (actionName === 'marker-typing') {
    const doc = await createTempDoc('seed');
    tempDocs.push(doc.docId);
    await openDoc(client, doc.docId);
    await focusActiveEditor(client);
    return runPhase(client, args, actionName, repeatIndex, async () => {
      const text = '\nmarker >> answer\nmarker >> answer\nmarker >> answer';
      await typeText(client, text, 14);
      return { typedChars: text.length, docId: doc.docId };
    }, 6500);
  }

  if (actionName === 'continuous-scroll') {
    const doc = await createTempDoc(largeMarkdown(420));
    tempDocs.push(doc.docId);
    await openDoc(client, doc.docId);
    return runPhase(client, args, actionName, repeatIndex, async () => {
      for (let i = 0; i < 18; i += 1) {
        await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 600, y: 420, deltaY: 480, deltaX: 0 });
        await sleep(35);
      }
      for (let i = 0; i < 8; i += 1) {
        await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 600, y: 420, deltaY: -480, deltaX: 0 });
        await sleep(35);
      }
      return { scrollSteps: 26, docId: doc.docId };
    });
  }

  if (actionName === 'large-doc-open') {
    const doc = await createTempDoc(largeMarkdown(650));
    tempDocs.push(doc.docId);
    return runPhase(client, args, actionName, repeatIndex, async () => {
      const openElapsedMs = await openDoc(client, doc.docId);
      return { openElapsedMs, lineCount: 650, docId: doc.docId };
    });
  }

  if (actionName === 'switch-documents') {
    const first = await createTempDoc(largeMarkdown(80));
    const second = await createTempDoc(largeMarkdown(80));
    tempDocs.push(first.docId, second.docId);
    return runPhase(client, args, actionName, repeatIndex, async () => {
      const timings = [];
      for (const docId of [first.docId, second.docId, first.docId, second.docId]) {
        timings.push(await openDoc(client, docId));
      }
      return { switchCount: timings.length, openElapsedMaxMs: Math.max(...timings), docIds: [first.docId, second.docId] };
    });
  }

  if (actionName === 'search') {
    const doc = await createTempDoc(`${largeMarkdown(120)}\nneedle fixture line`);
    tempDocs.push(doc.docId);
    await openDoc(client, doc.docId);
    return runPhase(client, args, actionName, repeatIndex, async () => {
      const startedAt = Date.now();
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70, key: 'f', code: 'KeyF', modifiers: 2 });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70, key: 'f', code: 'KeyF', modifiers: 2 });
      await sleep(250);
      await typeText(client, 'needle', 20);
      await sleep(600);
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
      return { searchElapsedMs: Date.now() - startedAt, queryLength: 6, docId: doc.docId };
    });
  }

  if (actionName === 'idle-then-edit') {
    const doc = await createTempDoc('seed');
    tempDocs.push(doc.docId);
    await openDoc(client, doc.docId);
    await focusActiveEditor(client);
    return runPhase(client, args, actionName, repeatIndex, async () => {
      await sleep(args.idleMs);
      const text = ' resume after idle';
      await typeText(client, text, 12);
      return { idleMs: args.idleMs, typedChars: text.length, docId: doc.docId };
    }, 2200);
  }

  if (actionName === 'api-transaction-storm') {
    const doc = await createTempDoc('seed');
    tempDocs.push(doc.docId);
    await openDoc(client, doc.docId);
    return runPhase(client, args, actionName, repeatIndex, async () => {
      for (let i = 0; i < 8; i += 1) {
        await siyuanApi('/api/block/appendBlock', {
          parentID: doc.docId,
          dataType: 'markdown',
          data: `storm ${i}`,
        });
        await sleep(80);
      }
      return { operations: 8, docId: doc.docId };
    }, 2600);
  }

  return { action: actionName, repeatIndex, skipped: true, reason: 'unknown-action' };
}

function runSelfCheck() {
  const risk = classifyPhaseRisk({
    longtaskMaxMs: 260,
    totalBlockingEstimateMs: 510,
    inputDelayP95Ms: 120,
    inputDelayMaxMs: 280,
    scrollFrameGapP95Ms: 120,
    heapUsageRatio: 0.9,
    pluginDeltaPercent: 55,
  });
  const output = sanitizeForOutput({
    label: 'self-check',
    risk,
    docId: '20260507123456-abcdefg',
    token: 'must-not-print',
    markdown: 'must-not-print',
  });
  console.log(JSON.stringify(output, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) {
    runSelfCheck();
    return;
  }

  token = readToken();
  const pluginPreparation = await preparePluginState(args);
  const client = await connectRenderer();
  const tempDocs = [];
  const phases = [];
  let browserPreparation = null;
  let rendererPreparation = null;
  try {
    rendererPreparation = await prepareRendererForEditorSmoke(client, args);
    await installEditorProbe(client);
    browserPreparation = await prepareBrowserState(client, args.browserState);
    for (let repeatIndex = 1; repeatIndex <= args.repeat; repeatIndex += 1) {
      for (const actionName of args.actionList) {
        phases.push(await runAction(client, args, actionName, repeatIndex, tempDocs));
      }
    }
  } finally {
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
    await client.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => undefined);
    if (args.browserState !== 'open') {
      await closeBrowser(client).catch(() => undefined);
    }
    await client.close().catch(() => undefined);
    for (const docId of tempDocs) {
      await cleanupTempDoc(docId);
    }
  }

  const output = sanitizeForOutput({
    label: args.label,
    generatedAt: new Date().toISOString(),
    environment: {
      cdp: CDP_API,
      siyuanApi: SIYUAN_API,
      workspace: WORKSPACE,
      pluginState: args.pluginState,
      profileName: args.profileName,
      cpuRate: args.cpuRate,
      browserState: args.browserState,
      vmCores: args.vmCores,
      vmMemoryGb: args.vmMemoryGb,
      allowHiddenRenderer: args.allowHiddenRenderer,
      rendererPreparation,
      browserPreparation,
      pluginPreparation,
      tempDocIds: tempDocs.map(maskId),
    },
    matrixStatus: {
      note: 'This script records one profile/browser/plugin-state row. Run matching plugin-off and plugin-on rows before assigning SiYuanMemo root cause.',
      noFixBeforeRootCause: true,
    },
    phases,
  });
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify(sanitizeForOutput({
    label: 'editor-low-end-smoke-error',
    error: error.message,
  }), null, 2));
  process.exit(1);
});
