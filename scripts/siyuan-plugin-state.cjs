#!/usr/bin/env node

const fs = require('node:fs');

const DEFAULT_WORKSPACE = 'H:/SiYuanXY';
const SIYUAN_API = process.env.SIYUAN_API || 'http://127.0.0.1:6806';
const CDP_API = process.env.SIYUAN_CDP || 'http://127.0.0.1:9222';
const WORKSPACE = process.env.SIYUAN_WORKSPACE || DEFAULT_WORKSPACE;
const CONF_PATH = `${WORKSPACE}/conf/conf.json`;
const PLUGIN_NAME = process.env.SIYUANMEMO_PLUGIN_NAME || 'siyuan-plugin-siyuanmemo';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

class CdpClient {
  constructor(target) {
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
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: 60_000,
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

async function waitRendererLoaded(expectedLoaded, timeoutMs = 25_000) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await rendererPluginState().catch((error) => ({ error: error.message }));
    if (last.loaded === expectedLoaded) return last;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${PLUGIN_NAME} loaded=${expectedLoaded}; last=${JSON.stringify(last)}`);
}

async function persistedPluginState() {
  const petals = await siyuanApi('/api/petal/loadPetals', { frontend: 'desktop' });
  const petal = (petals || []).find((item) => item.name === PLUGIN_NAME);
  return {
    enabled: Boolean(petal?.enabled),
    found: Boolean(petal),
    jsBytes: String(petal?.js || '').length,
    cssBytes: String(petal?.css || '').length,
  };
}

async function setPluginEnabled(enabled) {
  const data = await siyuanApi('/api/petal/setPetalEnabled', {
    packageName: PLUGIN_NAME,
    enabled,
    app: '',
  });
  const renderer = await waitRendererLoaded(enabled);
  return {
    requestedEnabled: enabled,
    apiReturned: {
      name: data?.name,
      enabled: Boolean(data?.enabled),
    },
    renderer,
  };
}

async function main() {
  const command = process.argv[2] || 'status';
  token = readToken();

  if (command === 'status') {
    console.log(JSON.stringify({
      pluginName: PLUGIN_NAME,
      persisted: await persistedPluginState(),
      renderer: await rendererPluginState(),
    }, null, 2));
    return;
  }

  if (command === 'enable' || command === 'on') {
    console.log(JSON.stringify(await setPluginEnabled(true), null, 2));
    return;
  }

  if (command === 'disable' || command === 'off') {
    console.log(JSON.stringify(await setPluginEnabled(false), null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(JSON.stringify({
    label: 'siyuan-plugin-state-error',
    error: error.message,
  }, null, 2));
  process.exit(1);
});
