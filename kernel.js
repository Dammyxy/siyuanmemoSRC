const startedAt = Date.now();
const WRITER_LEASE_DEFAULT_TTL_MS = 12_000;
const WRITER_LEASE_MIN_TTL_MS = 3_000;
const WRITER_LEASE_MAX_TTL_MS = 60_000;
let writerLease = null;

function nowMs() {
  return Date.now();
}

function toObjectParams(params) {
  if (Array.isArray(params)) {
    const [first] = params;
    if (first && typeof first === 'object') {
      return first;
    }
    return {};
  }
  if (params && typeof params === 'object') {
    return params;
  }
  return {};
}

function normalizeInstanceId(value) {
  const instanceId = String(value || '').trim();
  if (!instanceId) {
    throw new Error('writer lease requires non-empty instanceId');
  }
  return instanceId;
}

function normalizeTtlMs(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return WRITER_LEASE_DEFAULT_TTL_MS;
  }
  return Math.max(
    WRITER_LEASE_MIN_TTL_MS,
    Math.min(WRITER_LEASE_MAX_TTL_MS, Math.floor(raw)),
  );
}

function cloneLease(lease) {
  if (!lease) {
    return null;
  }
  return {
    instanceId: lease.instanceId,
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
    lastHeartbeatAt: lease.lastHeartbeatAt,
    dbRevision: lease.dbRevision,
    surfaceId: lease.surfaceId,
  };
}

function isLeaseExpired(lease, at) {
  return !lease || lease.expiresAt <= at;
}

function getActiveLease(at = nowMs()) {
  if (!writerLease) {
    return null;
  }
  if (isLeaseExpired(writerLease, at)) {
    writerLease = null;
    return null;
  }
  return writerLease;
}

function buildUnavailableEnvelope(message, lease, at = nowMs()) {
  return {
    ok: false,
    error: {
      code: 'BACKEND_UNAVAILABLE',
      message,
    },
    lease: cloneLease(lease),
    now: at,
  };
}

function buildInvalidEnvelope(message, lease, at = nowMs()) {
  return {
    ok: false,
    error: {
      code: 'INVALID_REQUEST',
      message,
    },
    lease: cloneLease(lease),
    now: at,
  };
}

function buildLeaseEnvelope(lease, at = nowMs()) {
  return {
    ok: true,
    lease: cloneLease(lease),
    now: at,
  };
}

async function broadcastWriterLeaseChanged(lease) {
  try {
    await siyuan.rpc.broadcast('memo.writer.leaseChanged', cloneLease(lease));
  } catch (error) {
    await siyuan.logger.warn('[SiYuanMemo kernel] failed to broadcast writer lease change', String(error));
  }
}

function buildHealth() {
  return {
    ok: true,
    plugin: siyuan.plugin.name,
    version: siyuan.plugin.version,
    platform: siyuan.plugin.platform,
    uptimeMs: Date.now() - startedAt,
  };
}

function buildCapabilities() {
  return {
    version: 2,
    methods: [
      'health',
      'version',
      'capabilities',
      'writer.hello',
      'writer.getLease',
      'writer.acquireLease',
      'writer.renewLease',
      'writer.releaseLease',
    ],
    storage: 'siyuan.storage',
    rpc: 'json-rpc-2.0',
    writesSiyuanMemoDb: false,
    writerLease: {
      defaultTtlMs: WRITER_LEASE_DEFAULT_TTL_MS,
      minTtlMs: WRITER_LEASE_MIN_TTL_MS,
      maxTtlMs: WRITER_LEASE_MAX_TTL_MS,
    },
  };
}

function writerHello(params) {
  const at = nowMs();
  const lease = getActiveLease(at);
  const named = toObjectParams(params);
  try {
    normalizeInstanceId(named.instanceId);
  } catch (error) {
    return buildInvalidEnvelope(
      error instanceof Error ? error.message : String(error),
      lease,
      at,
    );
  }
  return buildLeaseEnvelope(lease, at);
}

function writerGetLease() {
  const at = nowMs();
  return buildLeaseEnvelope(getActiveLease(at), at);
}

async function writerAcquireLease(params) {
  const at = nowMs();
  const named = toObjectParams(params);
  const activeLease = getActiveLease(at);
  let instanceId;
  try {
    instanceId = normalizeInstanceId(named.instanceId);
  } catch (error) {
    return buildInvalidEnvelope(
      error instanceof Error ? error.message : String(error),
      activeLease,
      at,
    );
  }

  if (activeLease && activeLease.instanceId !== instanceId) {
    return buildUnavailableEnvelope(
      `writer lease held by another instance: ${activeLease.instanceId}`,
      activeLease,
      at,
    );
  }

  const ttlMs = normalizeTtlMs(named.ttlMs);
  const nextLease = {
    instanceId,
    acquiredAt: activeLease ? activeLease.acquiredAt : at,
    expiresAt: at + ttlMs,
    lastHeartbeatAt: at,
    dbRevision: Number.isFinite(Number(named.dbRevision)) ? Number(named.dbRevision) : activeLease?.dbRevision,
    surfaceId: typeof named.surfaceId === 'string' && named.surfaceId.trim()
      ? named.surfaceId.trim()
      : activeLease?.surfaceId,
  };
  writerLease = nextLease;

  if (!activeLease || activeLease.instanceId !== nextLease.instanceId) {
    await broadcastWriterLeaseChanged(nextLease);
  }

  return buildLeaseEnvelope(nextLease, at);
}

function writerRenewLease(params) {
  const at = nowMs();
  const named = toObjectParams(params);
  const activeLease = getActiveLease(at);
  let instanceId;
  try {
    instanceId = normalizeInstanceId(named.instanceId);
  } catch (error) {
    return buildInvalidEnvelope(
      error instanceof Error ? error.message : String(error),
      activeLease,
      at,
    );
  }

  if (!activeLease || activeLease.instanceId !== instanceId) {
    return buildUnavailableEnvelope(
      'writer lease unavailable for renew; acquire lease first',
      activeLease,
      at,
    );
  }

  const ttlMs = normalizeTtlMs(named.ttlMs);
  writerLease = {
    ...activeLease,
    lastHeartbeatAt: at,
    expiresAt: at + ttlMs,
    dbRevision: Number.isFinite(Number(named.dbRevision)) ? Number(named.dbRevision) : activeLease.dbRevision,
  };
  return buildLeaseEnvelope(writerLease, at);
}

async function writerReleaseLease(params) {
  const at = nowMs();
  const named = toObjectParams(params);
  const activeLease = getActiveLease(at);
  let instanceId;
  try {
    instanceId = normalizeInstanceId(named.instanceId);
  } catch (error) {
    return buildInvalidEnvelope(
      error instanceof Error ? error.message : String(error),
      activeLease,
      at,
    );
  }

  if (!activeLease) {
    return buildLeaseEnvelope(null, at);
  }
  if (activeLease.instanceId !== instanceId) {
    return buildUnavailableEnvelope(
      `writer lease held by another instance: ${activeLease.instanceId}`,
      activeLease,
      at,
    );
  }

  writerLease = null;
  await broadcastWriterLeaseChanged(null);
  return buildLeaseEnvelope(null, at);
}

siyuan.plugin.lifecycle.onload = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] loading');

  await siyuan.rpc.bind('health', async () => buildHealth(), 'Return SiYuanMemo kernel companion health.');
  await siyuan.rpc.bind('version', async () => ({
    plugin: siyuan.plugin.name,
    version: siyuan.plugin.version,
    platform: siyuan.plugin.platform,
  }), 'Return SiYuanMemo kernel companion version.');
  await siyuan.rpc.bind('capabilities', async () => buildCapabilities(), 'Return SiYuanMemo kernel companion capabilities.');
  await siyuan.rpc.bind('writer.hello', async (params) => writerHello(params), 'Register frontend instance and return current writer lease.');
  await siyuan.rpc.bind('writer.getLease', async () => writerGetLease(), 'Return current writer lease state.');
  await siyuan.rpc.bind('writer.acquireLease', async (params) => writerAcquireLease(params), 'Acquire or refresh writer lease for one instance.');
  await siyuan.rpc.bind('writer.renewLease', async (params) => writerRenewLease(params), 'Renew writer lease heartbeat for current owner instance.');
  await siyuan.rpc.bind('writer.releaseLease', async (params) => writerReleaseLease(params), 'Release writer lease owned by current frontend instance.');
};

siyuan.plugin.lifecycle.onrunning = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] running');
};

siyuan.plugin.lifecycle.onunload = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] unloading');
};
