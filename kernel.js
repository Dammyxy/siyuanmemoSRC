const startedAt = Date.now();
const WRITER_LEASE_DEFAULT_TTL_MS = 12_000;
const WRITER_LEASE_MIN_TTL_MS = 3_000;
const WRITER_LEASE_MAX_TTL_MS = 60_000;
const WRITER_COMMAND_PENDING_TTL_MS = 60_000;
const WRITER_COMMAND_RESULT_TTL_MS = 300_000;
const WRITER_COMMAND_DISPATCH_TTL_MS = 5_000;
let writerLease = null;
const writerCommandsPending = new Map();
const writerCommandResults = new Map();

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

function normalizeCommandId(value) {
  const commandId = String(value || '').trim();
  if (!commandId) {
    throw new Error('writer command requires non-empty commandId');
  }
  return commandId;
}

function normalizeMethodName(value) {
  const method = String(value || '').trim();
  if (!method) {
    throw new Error('writer command requires non-empty method');
  }
  return method;
}

function createCommandId() {
  return `cmd-${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

function buildOkEnvelope(payload, at = nowMs()) {
  return {
    ok: true,
    ...payload,
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

async function broadcastWriterCommand(command) {
  try {
    await siyuan.rpc.broadcast('memo.writer.command', command);
  } catch (error) {
    await siyuan.logger.warn('[SiYuanMemo kernel] failed to broadcast writer command', String(error));
  }
}

async function broadcastWriterCommandResult(result) {
  try {
    await siyuan.rpc.broadcast('memo.writer.commandResult', result);
  } catch (error) {
    await siyuan.logger.warn('[SiYuanMemo kernel] failed to broadcast writer command result', String(error));
  }
}

function cleanupWriterCommandState(at = nowMs()) {
  for (const [commandId, pending] of writerCommandsPending.entries()) {
    if (pending.expiresAt <= at) {
      writerCommandsPending.delete(commandId);
    }
  }
  for (const [commandId, result] of writerCommandResults.entries()) {
    if (result.expiresAt <= at) {
      writerCommandResults.delete(commandId);
    }
  }
}

function rebindPendingWriterCommands(ownerInstanceId, at = nowMs()) {
  let changed = false;
  for (const [commandId, pending] of writerCommandsPending.entries()) {
    if (pending.expiresAt <= at) {
      continue;
    }
    if (pending.writerInstanceId === ownerInstanceId) {
      continue;
    }
    writerCommandsPending.set(commandId, {
      ...pending,
      writerInstanceId: ownerInstanceId,
      inFlightUntil: 0,
    });
    changed = true;
  }
  return changed;
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
    version: 4,
    methods: [
      'health',
      'version',
      'capabilities',
      'writer.hello',
      'writer.getLease',
      'writer.acquireLease',
      'writer.renewLease',
      'writer.releaseLease',
      'writer.submitCommand',
      'writer.completeCommand',
      'writer.failCommand',
      'writer.getCommandResult',
      'writer.takeCommand',
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
  rebindPendingWriterCommands(nextLease.instanceId, at);

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

async function writerSubmitCommand(params) {
  const at = nowMs();
  cleanupWriterCommandState(at);
  const named = toObjectParams(params);
  const activeLease = getActiveLease(at);
  let instanceId;
  let method;
  try {
    instanceId = normalizeInstanceId(named.instanceId);
    method = normalizeMethodName(named.method);
  } catch (error) {
    return buildInvalidEnvelope(
      error instanceof Error ? error.message : String(error),
      activeLease,
      at,
    );
  }

  if (!activeLease) {
    return buildUnavailableEnvelope(
      'writer command unavailable: no active writer lease',
      null,
      at,
    );
  }
  if (activeLease.instanceId === instanceId) {
    return buildInvalidEnvelope(
      'writer instance should execute command locally instead of submitCommand',
      activeLease,
      at,
    );
  }

  const commandId = String(named.commandId || '').trim() || createCommandId();
  writerCommandResults.delete(commandId);
  writerCommandsPending.set(commandId, {
    commandId,
    requesterInstanceId: instanceId,
    writerInstanceId: activeLease.instanceId,
    method,
    params: named.params,
    requestedAt: at,
    expiresAt: at + WRITER_COMMAND_PENDING_TTL_MS,
    inFlightUntil: 0,
  });
  await broadcastWriterCommand({
    commandId,
    requesterInstanceId: instanceId,
    method,
    params: named.params,
    requestedAt: at,
  });
  return buildOkEnvelope({
    commandId,
    ownerInstanceId: activeLease.instanceId,
    status: 'queued',
  }, at);
}

async function writerCompleteCommand(params) {
  const at = nowMs();
  cleanupWriterCommandState(at);
  const named = toObjectParams(params);
  const activeLease = getActiveLease(at);
  let instanceId;
  let commandId;
  try {
    instanceId = normalizeInstanceId(named.instanceId);
    commandId = normalizeCommandId(named.commandId);
  } catch (error) {
    return buildInvalidEnvelope(
      error instanceof Error ? error.message : String(error),
      activeLease,
      at,
    );
  }

  if (!activeLease || activeLease.instanceId !== instanceId) {
    return buildUnavailableEnvelope(
      'writer completeCommand unavailable: current instance is not active writer',
      activeLease,
      at,
    );
  }

  const pending = writerCommandsPending.get(commandId);
  if (!pending) {
    return buildInvalidEnvelope(
      `writer completeCommand unknown commandId: ${commandId}`,
      activeLease,
      at,
    );
  }
  writerCommandsPending.delete(commandId);
  const resultPayload = {
    commandId,
    requesterInstanceId: pending.requesterInstanceId,
    writerInstanceId: instanceId,
    ok: true,
    result: named.result,
    completedAt: at,
    expiresAt: at + WRITER_COMMAND_RESULT_TTL_MS,
  };
  writerCommandResults.set(commandId, resultPayload);
  await broadcastWriterCommandResult({
    commandId,
    requesterInstanceId: pending.requesterInstanceId,
    writerInstanceId: instanceId,
    ok: true,
    result: named.result,
    completedAt: at,
  });
  return buildOkEnvelope({ commandId, status: 'completed' }, at);
}

async function writerFailCommand(params) {
  const at = nowMs();
  cleanupWriterCommandState(at);
  const named = toObjectParams(params);
  const activeLease = getActiveLease(at);
  let instanceId;
  let commandId;
  try {
    instanceId = normalizeInstanceId(named.instanceId);
    commandId = normalizeCommandId(named.commandId);
  } catch (error) {
    return buildInvalidEnvelope(
      error instanceof Error ? error.message : String(error),
      activeLease,
      at,
    );
  }

  if (!activeLease || activeLease.instanceId !== instanceId) {
    return buildUnavailableEnvelope(
      'writer failCommand unavailable: current instance is not active writer',
      activeLease,
      at,
    );
  }

  const pending = writerCommandsPending.get(commandId);
  if (!pending) {
    return buildInvalidEnvelope(
      `writer failCommand unknown commandId: ${commandId}`,
      activeLease,
      at,
    );
  }
  writerCommandsPending.delete(commandId);
  const errorEnvelope = named.error && typeof named.error === 'object'
    ? {
      code: String(named.error.code || 'INTERNAL_ERROR'),
      message: String(named.error.message || 'writer command failed'),
    }
    : {
      code: 'INTERNAL_ERROR',
      message: 'writer command failed',
    };
  const resultPayload = {
    commandId,
    requesterInstanceId: pending.requesterInstanceId,
    writerInstanceId: instanceId,
    ok: false,
    error: errorEnvelope,
    completedAt: at,
    expiresAt: at + WRITER_COMMAND_RESULT_TTL_MS,
  };
  writerCommandResults.set(commandId, resultPayload);
  await broadcastWriterCommandResult({
    commandId,
    requesterInstanceId: pending.requesterInstanceId,
    writerInstanceId: instanceId,
    ok: false,
    error: errorEnvelope,
    completedAt: at,
  });
  return buildOkEnvelope({ commandId, status: 'failed' }, at);
}

function writerGetCommandResult(params) {
  const at = nowMs();
  cleanupWriterCommandState(at);
  const named = toObjectParams(params);
  let commandId;
  try {
    commandId = normalizeCommandId(named.commandId);
  } catch (error) {
    return buildInvalidEnvelope(
      error instanceof Error ? error.message : String(error),
      getActiveLease(at),
      at,
    );
  }

  const pending = writerCommandsPending.get(commandId);
  if (pending) {
    return buildOkEnvelope({
      commandId,
      status: 'pending',
      ownerInstanceId: pending.writerInstanceId,
    }, at);
  }

  const result = writerCommandResults.get(commandId);
  if (result) {
    return buildOkEnvelope({
      commandId,
      status: result.ok ? 'completed' : 'failed',
      ownerInstanceId: result.writerInstanceId,
      result: result.result,
      error: result.error,
      completedAt: result.completedAt,
    }, at);
  }

  return buildUnavailableEnvelope(
    `writer command result unavailable or expired: ${commandId}`,
    getActiveLease(at),
    at,
  );
}

function writerTakeCommand(params) {
  const at = nowMs();
  cleanupWriterCommandState(at);
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
      'writer takeCommand unavailable: current instance is not active writer',
      activeLease,
      at,
    );
  }

  rebindPendingWriterCommands(instanceId, at);

  for (const pending of writerCommandsPending.values()) {
    if (pending.writerInstanceId !== instanceId) {
      continue;
    }
    if (Number(pending.inFlightUntil || 0) > at) {
      continue;
    }
    pending.inFlightUntil = at + WRITER_COMMAND_DISPATCH_TTL_MS;
    writerCommandsPending.set(pending.commandId, pending);
    return buildOkEnvelope({
      command: {
        commandId: pending.commandId,
        requesterInstanceId: pending.requesterInstanceId,
        method: pending.method,
        params: pending.params,
        requestedAt: pending.requestedAt,
      },
    }, at);
  }

  return buildOkEnvelope({ command: null }, at);
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
  await siyuan.rpc.bind('writer.submitCommand', async (params) => writerSubmitCommand(params), 'Relay a write command from follower instance to active writer instance.');
  await siyuan.rpc.bind('writer.completeCommand', async (params) => writerCompleteCommand(params), 'Submit completed writer command result from active writer instance.');
  await siyuan.rpc.bind('writer.failCommand', async (params) => writerFailCommand(params), 'Submit failed writer command result from active writer instance.');
  await siyuan.rpc.bind('writer.getCommandResult', async (params) => writerGetCommandResult(params), 'Poll writer command relay result.');
  await siyuan.rpc.bind('writer.takeCommand', async (params) => writerTakeCommand(params), 'Poll next pending writer relay command for active writer instance.');
};

siyuan.plugin.lifecycle.onrunning = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] running');
};

siyuan.plugin.lifecycle.onunload = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] unloading');
};
