type BrowserGlobalLike = Record<string, unknown> & {
  Blob?: typeof Blob;
  URL?: typeof URL;
  Worker?: typeof Worker;
  self?: unknown;
  webkitURL?: { createObjectURL?: unknown; revokeObjectURL?: unknown };
  window?: unknown;
};

type BrowserGlobalKey = 'Worker' | 'Blob' | 'URL' | 'webkitURL';

type BrowserGlobalDescriptorSnapshot = Partial<Record<BrowserGlobalKey, PropertyDescriptor | null>>;

function isObject(value: unknown): value is BrowserGlobalLike {
  return typeof value === 'object' && value !== null;
}

function readLexicalWindow(): BrowserGlobalLike | null {
  return typeof window === 'undefined' || !isObject(window)
    ? null
    : window as unknown as BrowserGlobalLike;
}

function readLexicalSelf(): BrowserGlobalLike | null {
  return typeof self === 'undefined' || !isObject(self)
    ? null
    : self as unknown as BrowserGlobalLike;
}

function hasWorkerConstructionApis(value: BrowserGlobalLike): boolean {
  return typeof value.Worker === 'function'
    || typeof value.Blob === 'function'
    || typeof value.URL?.createObjectURL === 'function'
    || typeof value.webkitURL?.createObjectURL === 'function';
}

export function withScopedCjsBrowserGlobals<T>(
  factory: () => T,
  runtimeGlobal: BrowserGlobalLike = globalThis as BrowserGlobalLike,
): T {
  const includeLexicalGlobals = runtimeGlobal === globalThis;
  const candidates = [
    isObject(runtimeGlobal.window) ? runtimeGlobal.window : null,
    includeLexicalGlobals ? readLexicalWindow() : null,
    isObject(runtimeGlobal.self) ? runtimeGlobal.self : null,
    includeLexicalGlobals ? readLexicalSelf() : null,
    runtimeGlobal,
  ];
  const browserGlobal = candidates.find((candidate): candidate is BrowserGlobalLike => (
    isObject(candidate) && hasWorkerConstructionApis(candidate)
  ));
  if (!browserGlobal) {
    return factory();
  }

  const snapshot = snapshotDescriptors(runtimeGlobal, ['Worker', 'Blob', 'URL', 'webkitURL']);
  try {
    installTemporaryConstructor(runtimeGlobal, 'Worker', browserGlobal.Worker, isWorkerConstructor);
    installTemporaryConstructor(runtimeGlobal, 'Blob', browserGlobal.Blob, isBlobConstructor);
    installTemporaryConstructor(runtimeGlobal, 'URL', browserGlobal.URL, hasCreateObjectUrl);
    installTemporaryConstructor(runtimeGlobal, 'webkitURL', browserGlobal.webkitURL, hasCreateObjectUrl);
    return factory();
  } finally {
    restoreDescriptors(runtimeGlobal, snapshot);
  }
}

function snapshotDescriptors(
  target: BrowserGlobalLike,
  keys: BrowserGlobalKey[],
): BrowserGlobalDescriptorSnapshot {
  return Object.fromEntries(keys.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(target, key)
      ? Object.getOwnPropertyDescriptor(target, key) ?? null
      : null,
  ])) as BrowserGlobalDescriptorSnapshot;
}

function restoreDescriptors(
  target: BrowserGlobalLike,
  snapshot: BrowserGlobalDescriptorSnapshot,
): void {
  for (const [key, descriptor] of Object.entries(snapshot) as Array<[BrowserGlobalKey, PropertyDescriptor | null]>) {
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
    } else {
      delete target[key];
    }
  }
}

function installTemporaryConstructor<T>(
  target: BrowserGlobalLike,
  key: BrowserGlobalKey,
  value: T | undefined,
  isValid: (candidate: unknown) => boolean,
): void {
  if (isValid(target[key])) {
    return;
  }
  if (!isValid(value)) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor && descriptor.configurable === false && descriptor.writable !== true) {
    throw new Error(`BACKEND_UNAVAILABLE: backend Worker CJS bootstrap cannot define globalThis.${key}`);
  }
  try {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      writable: true,
      value,
    });
  } catch {
    throw new Error(`BACKEND_UNAVAILABLE: backend Worker CJS bootstrap cannot define globalThis.${key}`);
  }
}

function isWorkerConstructor(candidate: unknown): candidate is typeof Worker {
  return typeof candidate === 'function';
}

function isBlobConstructor(candidate: unknown): candidate is typeof Blob {
  return typeof candidate === 'function';
}

function hasCreateObjectUrl(candidate: unknown): candidate is typeof URL {
  return isObject(candidate) && typeof candidate.createObjectURL === 'function';
}
