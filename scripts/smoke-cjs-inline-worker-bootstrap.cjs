const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TextDecoder, TextEncoder } = require('node:util');

const distPath = path.resolve(__dirname, '..', 'dist', 'index.js');
const bundle = fs.readFileSync(distPath, 'utf8');

const factoryMatch = bundle.match(
  /function\s+([A-Za-z_$][\w$]*)\(\)\{return\s+([A-Za-z_$][\w$]*)\(\(\)=>new\s+([A-Za-z_$][\w$]*)\(\{name:"SiYuanMemoBackendWorker"\}\)\)\}/,
);

if (!factoryMatch) {
  throw new Error('CJS inline Worker factory not found in dist/index.js');
}

const [, factoryName, scopedBootstrapName, workerCtorName] = factoryMatch;
const helperBundle = extractCjsWorkerHelperBundle();
const exposedBundle = `${helperBundle}
;globalThis.__siyuanMemoCjsWorkerSmoke = {
  createDefaultBackendWorker: ${factoryName},
  withScopedCjsBrowserGlobals: ${scopedBootstrapName},
  inlineWorkerConstructor: ${workerCtorName},
};`;

function extractCjsWorkerHelperBundle() {
  const factoryStart = factoryMatch.index;
  const prefix = bundle.slice(0, factoryStart);
  const objectHelperMatches = Array.from(
    prefix.matchAll(/function\s+[A-Za-z_$][\w$]*\(t\)\{return typeof t=="object"&&t!==null\}/g),
  );
  const objectHelperMatch = objectHelperMatches.at(-1);
  if (!objectHelperMatch || objectHelperMatch.index === undefined) {
    throw new Error('CJS Worker helper object guard not found in dist/index.js');
  }
  const workerCtorStart = bundle.indexOf(`function ${workerCtorName}`, objectHelperMatch.index);
  const workerCtorSource = workerCtorStart >= 0 ? bundle.slice(workerCtorStart, workerCtorStart + 5_000) : '';
  const payloadNameMatch = workerCtorSource.match(/data:text\/javascript;base64,"\+([A-Za-z_$][\w$]*)/);
  const payloadStart = payloadNameMatch
    ? bundle.lastIndexOf(`const ${payloadNameMatch[1]}=`, workerCtorStart)
    : -1;
  const transportLoggerMatch = workerCtorStart >= 0
    ? bundle.slice(workerCtorStart).match(/const\s+[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\("BrowserSrsBackendWorkerTransport"\)/)
    : null;
  const transportLoggerStart = transportLoggerMatch?.index === undefined
    ? -1
    : workerCtorStart + transportLoggerMatch.index;
  if (payloadStart < 0 || workerCtorStart < 0 || transportLoggerStart < 0) {
    throw new Error('CJS Worker helper boundaries not found in dist/index.js');
  }
  return [
    bundle.slice(objectHelperMatch.index, payloadStart),
    bundle.slice(payloadStart, workerCtorStart),
    bundle.slice(workerCtorStart, transportLoggerStart),
    factoryMatch[0],
  ].join('');
}

function createSiyuanStub() {
  class Plugin {
    constructor() {
      this.data = {};
      this.i18n = {};
      this.protyleSlash = [];
      this.eventBus = { on() {}, off() {} };
    }

    addCommand() {}
    addTopBar() {
      return { addEventListener() {}, removeEventListener() {}, style: {} };
    }

    loadData() {
      return Promise.resolve({});
    }

    saveData() {
      return Promise.resolve();
    }
  }

  class Dialog {
    constructor() {
      this.element = {
        querySelector: () => null,
        querySelectorAll: () => [],
      };
    }

    destroy() {}
  }

  return {
    Plugin,
    Dialog,
    Menu: class {},
    Constants: {},
    adaptHotkey: (value) => value,
    confirm: () => undefined,
    fetchPost: async () => ({ code: 0, data: null }),
    getFrontend: () => 'desktop',
    openTab: () => undefined,
    showMessage: () => undefined,
  };
}

function createDocumentStub() {
  return {
    body: { appendChild() {}, removeChild() {} },
    createElement: () => ({
      addEventListener() {},
      appendChild() {},
      removeEventListener() {},
      setAttribute() {},
      style: {},
    }),
    head: { appendChild() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

function createConstructors(record) {
  class SmokeWorker {
    constructor(url, options) {
      record.workers.push({ url: String(url), options: options ?? null });
      this.url = url;
      this.options = options;
      this.onmessage = null;
      this.onerror = null;
    }

    addEventListener(type, listener) {
      record.listeners.push({ type, listenerType: typeof listener });
    }

    postMessage(message) {
      record.messages.push(message);
    }

    terminate() {
      record.terminated += 1;
    }
  }

  class SmokeBlob {
    constructor(parts, options) {
      record.blobs.push({ partCount: parts.length, options: options ?? null });
      this.parts = parts;
      this.options = options;
    }
  }

  const SmokeURL = {
    createObjectURL(blob) {
      record.objectUrls.push(blob);
      return `blob:smoke-${record.objectUrls.length}`;
    },
    revokeObjectURL(url) {
      record.revokedUrls.push(url);
    },
  };

  return { Blob: SmokeBlob, URL: SmokeURL, Worker: SmokeWorker };
}

function snapshotDescriptors(target, keys) {
  return Object.fromEntries(keys.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(target, key)
      ? simplifyDescriptor(Object.getOwnPropertyDescriptor(target, key))
      : null,
  ]));
}

function simplifyDescriptor(descriptor) {
  if (!descriptor) {
    return null;
  }
  const simplified = {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
  };
  if ('writable' in descriptor) {
    simplified.writable = descriptor.writable;
  }
  if ('value' in descriptor) {
    simplified.value = describeDescriptorValue(descriptor.value);
  }
  if ('get' in descriptor) {
    simplified.get = describeDescriptorValue(descriptor.get);
  }
  if ('set' in descriptor) {
    simplified.set = describeDescriptorValue(descriptor.set);
  }
  return simplified;
}

function describeDescriptorValue(value) {
  if (typeof value === 'function') {
    return `[Function:${value.name || 'anonymous'}]`;
  }
  if (value && typeof value === 'object') {
    const constructorName = value.constructor?.name || 'Object';
    if (typeof value.createObjectURL === 'function') {
      return `[Object:${constructorName}:URL]`;
    }
    if (value === value.globalThis) {
      return '[Object:globalThis]';
    }
    return `[Object:${constructorName}]`;
  }
  return value;
}

function assertDescriptorsEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} descriptors changed\nexpected=${expectedJson}\nactual=${actualJson}`);
  }
}

function toErrorMessage(error) {
  return error && typeof error === 'object' && typeof error.message === 'string'
    ? error.message
    : String(error);
}

function createSandbox(config = {}) {
  const record = {
    blobs: [],
    listeners: [],
    messages: [],
    objectUrls: [],
    revokedUrls: [],
    terminated: 0,
    workers: [],
  };
  const constructors = createConstructors(record);
  const module = { exports: {} };
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    clearInterval,
    clearTimeout,
    console,
    document: createDocumentStub(),
    exports: module.exports,
    location: { href: 'app://siyuan' },
    module,
    navigator: { userAgent: 'SiYuanMemo smoke' },
    process,
    record,
    require(id) {
      if (id === 'siyuan') {
        return createSiyuanStub();
      }
      if (id === 'electron') {
        return {};
      }
      if (id === 'process') {
        return process;
      }
      return require(id);
    },
    setInterval,
    setTimeout,
  };
  sandbox.globalThis = sandbox;

  if (config.globalUrl) {
    Object.defineProperty(sandbox, 'URL', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: config.globalUrl,
    });
  }
  if (config.globalWorker) {
    Object.defineProperty(sandbox, 'Worker', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: constructors.Worker,
    });
  }
  if (config.globalBlob) {
    Object.defineProperty(sandbox, 'Blob', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: constructors.Blob,
    });
  }
  if (config.invalidNonConfigurableBlob) {
    Object.defineProperty(sandbox, 'Blob', {
      configurable: false,
      enumerable: true,
      get: () => undefined,
    });
  }

  const browserSurface = {
    Blob: constructors.Blob,
    URL: constructors.URL,
    Worker: constructors.Worker,
  };
  if (config.windowSurface) {
    sandbox.window = browserSurface;
  } else {
    sandbox.window = {};
  }
  if (config.selfGlobal) {
    sandbox.self = sandbox;
  } else if (config.selfSurface) {
    sandbox.self = browserSurface;
  } else {
    sandbox.self = {};
  }

  vm.createContext(sandbox);
  return { constructors, module, record, sandbox };
}

function evaluateDist(config) {
  const runtime = createSandbox(config);
  vm.runInContext(exposedBundle, runtime.sandbox, {
    filename: distPath,
    timeout: 5_000,
  });
  if (typeof runtime.sandbox.__siyuanMemoCjsWorkerSmoke?.createDefaultBackendWorker !== 'function') {
    throw new Error('CJS inline Worker factory was not exposed after dist evaluation');
  }
  return runtime;
}

function runImportOnlyDescriptorSmoke() {
  const runtime = createSandbox({
    globalBlob: true,
    globalUrl: true,
    globalWorker: true,
    selfGlobal: true,
    windowSurface: true,
  });
  const keys = ['window', 'self', 'Worker', 'Blob', 'URL', 'webkitURL'];
  const before = snapshotDescriptors(runtime.sandbox, keys);
  vm.runInContext(exposedBundle, runtime.sandbox, {
    filename: distPath,
    timeout: 5_000,
  });
  const after = snapshotDescriptors(runtime.sandbox, keys);
  assertDescriptorsEqual(after, before, 'import-only');
}

function runWindowOnlyConstructionSmoke() {
  const runtime = evaluateDist({
    globalUrl: {},
    selfGlobal: true,
    windowSurface: true,
  });
  const keys = ['Worker', 'Blob', 'URL', 'webkitURL', 'window', 'self'];
  const before = snapshotDescriptors(runtime.sandbox, keys);
  const worker = runtime.sandbox.__siyuanMemoCjsWorkerSmoke.createDefaultBackendWorker();
  if (!worker || runtime.record.workers.length !== 1) {
    throw new Error('inline Worker was not constructed through window-only compatibility surface');
  }
  if (runtime.record.workers[0].options?.name !== 'SiYuanMemoBackendWorker') {
    throw new Error('inline Worker name option was not preserved');
  }
  assertDescriptorsEqual(snapshotDescriptors(runtime.sandbox, keys), before, 'window-only construction');
}

function runSelfObjectConstructionSmoke() {
  const runtime = evaluateDist({
    globalBlob: true,
    selfSurface: true,
  });
  delete runtime.sandbox.Blob;
  const keys = ['Worker', 'Blob', 'URL', 'webkitURL', 'window', 'self'];
  const before = snapshotDescriptors(runtime.sandbox, keys);
  runtime.sandbox.__siyuanMemoCjsWorkerSmoke.createDefaultBackendWorker();
  if (runtime.record.workers.length !== 1) {
    throw new Error('inline Worker was not constructed through self-surface compatibility');
  }
  if (runtime.record.objectUrls.length < 1 || runtime.record.revokedUrls.length < 1) {
    throw new Error('self-surface construction did not exercise Blob URL creation and cleanup');
  }
  assertDescriptorsEqual(snapshotDescriptors(runtime.sandbox, keys), before, 'self-surface construction');
}

function runDescriptorFailureSmoke() {
  const runtime = evaluateDist({
    invalidNonConfigurableBlob: true,
    selfGlobal: true,
    windowSurface: true,
  });
  const keys = ['Worker', 'Blob', 'URL', 'webkitURL', 'window', 'self'];
  const before = snapshotDescriptors(runtime.sandbox, keys);
  let message = '';
  try {
    runtime.sandbox.__siyuanMemoCjsWorkerSmoke.createDefaultBackendWorker();
  } catch (error) {
    message = toErrorMessage(error);
  }
  if (message !== 'BACKEND_UNAVAILABLE: backend Worker CJS bootstrap cannot define globalThis.Blob') {
    throw new Error(`unexpected CJS bootstrap failure message: ${message}`);
  }
  if (runtime.record.workers.length !== 0) {
    throw new Error('Worker was constructed after descriptor failure');
  }
  assertDescriptorsEqual(snapshotDescriptors(runtime.sandbox, keys), before, 'descriptor-failure construction');
}

function runStaticDistGuards() {
  const requiredSnippets = [
    'SiYuanMemoBackendWorker',
    'backend Worker CJS bootstrap cannot define globalThis.',
    'new Worker',
    'createObjectURL',
  ];
  for (const snippet of requiredSnippets) {
    if (!bundle.includes(snippet)) {
      throw new Error(`dist/index.js missing expected CJS Worker snippet: ${snippet}`);
    }
  }
  const forbiddenSnippets = [
    'installCjsBrowserGlobals',
    'renderer DB',
    'renderer-side database',
    'renderer-side SQLite',
  ];
  for (const snippet of forbiddenSnippets) {
    if (bundle.includes(snippet)) {
      throw new Error(`dist/index.js contains forbidden fallback/global installer snippet: ${snippet}`);
    }
  }
}

runStaticDistGuards();
runImportOnlyDescriptorSmoke();
runWindowOnlyConstructionSmoke();
runSelfObjectConstructionSmoke();
runDescriptorFailureSmoke();

console.log(JSON.stringify({
  ok: true,
  factoryName,
  scopedBootstrapName,
  workerCtorName,
  checks: [
    'static-dist-guards',
    'import-only-descriptor-preservation',
    'window-only-inline-worker-construction',
    'self-surface-inline-worker-construction',
    'explicit-descriptor-failure',
  ],
}, null, 2));
