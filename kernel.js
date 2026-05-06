const startedAt = Date.now();
const WRITER_LEASE_DEFAULT_TTL_MS = 60_000;
const WRITER_LEASE_MIN_TTL_MS = 3_000;
const WRITER_LEASE_MAX_TTL_MS = 60_000;
const WRITER_COMMAND_PENDING_TTL_MS = 60_000;
const WRITER_COMMAND_RESULT_TTL_MS = 300_000;
const WRITER_COMMAND_DISPATCH_TTL_MS = 5_000;
let writerLease = null;
let writerLeaseEpoch = 0;
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

function normalizeOptionalString(value, maxLength = 512) {
  const text = String(value || '').trim();
  if (!text) {
    return undefined;
  }
  return text.slice(0, maxLength);
}

function normalizeDocumentHasFocus(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
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
    visibilityState: lease.visibilityState,
    documentHasFocus: lease.documentHasFocus,
    locationHref: lease.locationHref,
    leaseEpoch: lease.leaseEpoch,
    ownerChangedAt: lease.ownerChangedAt,
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

function buildLeaseClientState(named, activeLease = null) {
  const visibilityState = normalizeOptionalString(named.visibilityState, 32) ?? activeLease?.visibilityState;
  const documentHasFocus = normalizeDocumentHasFocus(named.documentHasFocus);
  const locationHref = normalizeOptionalString(named.locationHref, 512) ?? activeLease?.locationHref;
  return {
    visibilityState,
    documentHasFocus: typeof documentHasFocus === 'boolean'
      ? documentHasFocus
      : activeLease?.documentHasFocus,
    locationHref,
  };
}

function isRequesterHidden(named) {
  return normalizeOptionalString(named.visibilityState, 32) === 'hidden';
}

function isRequesterVisible(named) {
  return normalizeOptionalString(named.visibilityState, 32) === 'visible';
}

function isAuxiliarySiyuanSurface(locationHref) {
  const href = String(locationHref || '').toLowerCase();
  return href.includes('enhance=true')
    || href.includes('enwindowtitle=quicknote')
    || href.includes('quicknote');
}

function isNormalSiyuanAppSurface(state) {
  const locationHref = normalizeOptionalString(state?.locationHref, 512);
  if (!locationHref) {
    return false;
  }
  const href = locationHref.toLowerCase();
  return href.includes('/stage/build/app') && !isAuxiliarySiyuanSurface(href);
}

function getWriterLeaseSurfaceScore(state) {
  const locationHref = normalizeOptionalString(state?.locationHref, 512);
  if (!locationHref) {
    return 10;
  }
  const href = locationHref.toLowerCase();
  if (href.includes('/stage/build/app') && !isAuxiliarySiyuanSurface(href)) {
    return 30;
  }
  if (href.includes('/stage/build/app')) {
    return 20;
  }
  return 10;
}

function getWriterLeaseForegroundScore(state) {
  const visibilityState = normalizeOptionalString(state?.visibilityState, 32);
  if (visibilityState === 'hidden') {
    return 0;
  }
  if (visibilityState !== 'visible') {
    return 5;
  }
  return getWriterLeaseSurfaceScore(state) * 10;
}

function isLeaseReclaimableByVisibleRequester(activeLease, named) {
  if (!activeLease || !isRequesterVisible(named)) {
    return false;
  }
  const requesterIsNormalApp = isNormalSiyuanAppSurface(named);
  if (isNormalSiyuanAppSurface(activeLease)) {
    return false;
  }
  if (requesterIsNormalApp && isAuxiliarySiyuanSurface(activeLease.locationHref)) {
    return true;
  }
  if (!activeLease.visibilityState || activeLease.visibilityState === 'hidden') {
    return true;
  }
  return getWriterLeaseForegroundScore(named) > getWriterLeaseForegroundScore(activeLease);
}

function buildWriterLeaseOwnerMetadata(activeLease, instanceId, at) {
  const previousEpoch = Math.max(writerLeaseEpoch, Number(activeLease?.leaseEpoch) || 0);
  const ownerChanged = !activeLease || activeLease.instanceId !== instanceId;
  if (ownerChanged) {
    writerLeaseEpoch = previousEpoch + 1;
    return {
      leaseEpoch: writerLeaseEpoch,
      ownerChangedAt: at,
      ownerChanged,
    };
  }
  writerLeaseEpoch = previousEpoch || 1;
  return {
    leaseEpoch: writerLeaseEpoch,
    ownerChangedAt: Number(activeLease.ownerChangedAt) || Number(activeLease.acquiredAt) || at,
    ownerChanged,
  };
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

function rebindPendingWriterCommands(ownerInstanceId, ownerSurfaceId, at = nowMs()) {
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
      writerSurfaceId: ownerSurfaceId,
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
    version: 5,
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
      payloadFields: ['leaseEpoch', 'ownerChangedAt'],
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
    if (!isLeaseReclaimableByVisibleRequester(activeLease, named)) {
      return buildUnavailableEnvelope(
        `writer lease held by another instance: ${activeLease.instanceId}`,
        activeLease,
        at,
      );
    }
  }

  if (!activeLease && isRequesterHidden(named)) {
    return buildUnavailableEnvelope(
      'writer lease requester is hidden; foreground runtime required',
      null,
      at,
    );
  }

  const ttlMs = normalizeTtlMs(named.ttlMs);
  const clientState = buildLeaseClientState(named, activeLease);
  const ownerMetadata = buildWriterLeaseOwnerMetadata(activeLease, instanceId, at);
  const nextLease = {
    instanceId,
    acquiredAt: activeLease ? activeLease.acquiredAt : at,
    expiresAt: at + ttlMs,
    lastHeartbeatAt: at,
    dbRevision: Number.isFinite(Number(named.dbRevision)) ? Number(named.dbRevision) : activeLease?.dbRevision,
    surfaceId: typeof named.surfaceId === 'string' && named.surfaceId.trim()
      ? named.surfaceId.trim()
      : activeLease?.surfaceId,
    ...clientState,
    leaseEpoch: ownerMetadata.leaseEpoch,
    ownerChangedAt: ownerMetadata.ownerChangedAt,
  };
  writerLease = nextLease;
  rebindPendingWriterCommands(nextLease.instanceId, nextLease.surfaceId, at);

  if (ownerMetadata.ownerChanged) {
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
  const clientState = buildLeaseClientState(named, activeLease);
  const ownerMetadata = buildWriterLeaseOwnerMetadata(activeLease, instanceId, at);
  writerLease = {
    ...activeLease,
    lastHeartbeatAt: at,
    expiresAt: at + ttlMs,
    dbRevision: Number.isFinite(Number(named.dbRevision)) ? Number(named.dbRevision) : activeLease.dbRevision,
    surfaceId: typeof named.surfaceId === 'string' && named.surfaceId.trim()
      ? named.surfaceId.trim()
      : activeLease.surfaceId,
    ...clientState,
    leaseEpoch: ownerMetadata.leaseEpoch,
    ownerChangedAt: ownerMetadata.ownerChangedAt,
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
    writerSurfaceId: activeLease.surfaceId,
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
    ownerSurfaceId: activeLease.surfaceId,
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
    writerSurfaceId: activeLease.surfaceId,
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
    writerSurfaceId: activeLease.surfaceId,
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
    writerSurfaceId: activeLease.surfaceId,
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
    writerSurfaceId: activeLease.surfaceId,
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
      ownerSurfaceId: pending.writerSurfaceId,
    }, at);
  }

  const result = writerCommandResults.get(commandId);
  if (result) {
    return buildOkEnvelope({
      commandId,
      status: result.ok ? 'completed' : 'failed',
      ownerInstanceId: result.writerInstanceId,
      ownerSurfaceId: result.writerSurfaceId,
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

  rebindPendingWriterCommands(instanceId, activeLease.surfaceId, at);

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
