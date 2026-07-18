/// <reference types="siyuan/kernel" />

const startedAt = Date.now();
const WRITER_LEASE_DEFAULT_TTL_MS = 60_000;
const WRITER_LEASE_MIN_TTL_MS = 3_000;
const WRITER_LEASE_MAX_TTL_MS = 60_000;
const WRITER_LEASE_STALE_OWNER_RECLAIM_GRACE_MS = 30_000;
const WRITER_COMMAND_PENDING_TTL_MS = 60_000;
const WRITER_COMMAND_RESULT_TTL_MS = 300_000;
const WRITER_COMMAND_DISPATCH_TTL_MS = 5_000;
const IDENTITY_INITIALIZATION_FENCE_DEFAULT_TTL_MS = 15_000;
const IDENTITY_INITIALIZATION_FENCE_MIN_TTL_MS = 1_000;
const IDENTITY_INITIALIZATION_FENCE_MAX_TTL_MS = 30_000;
const PRIVATE_COMMAND_WAIT_TIMEOUT_MS = 30_000;
const PRIVATE_COMMAND_POLL_INTERVAL_MS = 250;
const AGENT_MCP_TOOL_NAMES = ['memo_query', 'memo_card', 'memo_review', 'memo_ui'];
const AGENT_MCP_TOOL_ACTIONS = {
  memo_query: ['status', 'query'],
  memo_card: ['get', 'query', 'search', 'create', 'save', 'suspend', 'resume'],
  memo_review: ['get', 'status', 'query', 'search'],
  memo_ui: ['open', 'get', 'status', 'focus'],
};
const AGENT_MCP_BLOCKED_ACTIONS = {
  memo_review: ['answer', 'grade', 'feedback', 'submit', 'commit'],
};
const QUEUE_PROJECTION_IDENTITY_QUEUE_TYPES = new Set([
  'retrieval-practice',
  'incremental-learning',
  'filter-group',
  'final-drill',
  'leech',
  'neural-roam',
]);
let writerLease = null;
let writerLeaseEpoch = 0;
let identityInitializationFence = null;
const writerCommandsPending = new Map();
const writerCommandResults = new Map();
const registeredAgentMcpTools = new Set();

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

function normalizeIdentityFenceInstanceId(value) {
  const instanceId = String(value || '').trim();
  if (!instanceId) {
    throw new Error('identity initialization fence requires non-empty instanceId');
  }
  return instanceId.slice(0, 256);
}

function normalizeIdentityFenceToken(value) {
  const token = String(value || '').trim();
  if (!token) {
    throw new Error('identity initialization fence requires non-empty token');
  }
  return token.slice(0, 256);
}

function cloneIdentityInitializationFence(fence) {
  return fence ? { ...fence } : null;
}

function getActiveIdentityInitializationFence(at = nowMs()) {
  if (identityInitializationFence && identityInitializationFence.expiresAt <= at) {
    identityInitializationFence = null;
  }
  return cloneIdentityInitializationFence(identityInitializationFence);
}

function identityAcquireInitializationFence(params) {
  const at = nowMs();
  const named = toObjectParams(params);
  let instanceId;
  try {
    instanceId = normalizeIdentityFenceInstanceId(named.instanceId);
  } catch (error) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: error instanceof Error ? error.message : String(error) },
      fence: getActiveIdentityInitializationFence(at),
      now: at,
    };
  }
  const active = getActiveIdentityInitializationFence(at);
  if (active && active.instanceId !== instanceId) {
    return {
      ok: false,
      error: {
        code: 'FENCE_UNAVAILABLE',
        message: `identity initialization fence held by another instance: ${active.instanceId}`,
      },
      fence: active,
      now: at,
    };
  }
  const requestedTtl = Math.floor(Number(named.ttlMs));
  const ttlMs = Number.isFinite(requestedTtl)
    ? Math.max(IDENTITY_INITIALIZATION_FENCE_MIN_TTL_MS, Math.min(IDENTITY_INITIALIZATION_FENCE_MAX_TTL_MS, requestedTtl))
    : IDENTITY_INITIALIZATION_FENCE_DEFAULT_TTL_MS;
  identityInitializationFence = {
    instanceId,
    token: active?.token || `identity-fence-${at.toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
    acquiredAt: active?.acquiredAt || at,
    expiresAt: at + ttlMs,
  };
  return { ok: true, fence: cloneIdentityInitializationFence(identityInitializationFence), now: at };
}

function identityReleaseInitializationFence(params) {
  const at = nowMs();
  const named = toObjectParams(params);
  let instanceId;
  let token;
  try {
    instanceId = normalizeIdentityFenceInstanceId(named.instanceId);
    token = normalizeIdentityFenceToken(named.token);
  } catch (error) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: error instanceof Error ? error.message : String(error) },
      fence: getActiveIdentityInitializationFence(at),
      now: at,
    };
  }
  const active = getActiveIdentityInitializationFence(at);
  if (!active) {
    return { ok: true, fence: null, now: at };
  }
  if (active.instanceId !== instanceId || active.token !== token) {
    return {
      ok: false,
      error: { code: 'FENCE_UNAVAILABLE', message: 'identity initialization fence is owned by another instance' },
      fence: active,
      now: at,
    };
  }
  identityInitializationFence = null;
  return { ok: true, fence: null, now: at };
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

function normalizeHttpMethod(value) {
  const method = String(value || 'GET').trim().toUpperCase();
  return method || 'GET';
}

function normalizeHeaderRecord(value) {
  const headers = {};
  if (!value || typeof value !== 'object') {
    return headers;
  }
  for (const key of Object.keys(value)) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      continue;
    }
    const raw = value[key];
    if (Array.isArray(raw)) {
      headers[normalizedKey] = raw.map((item) => String(item)).join(', ');
    } else if (raw !== undefined && raw !== null) {
      headers[normalizedKey] = String(raw);
    }
  }
  return headers;
}

function toProxyHeaderRecord(headers) {
  const proxyHeaders = {};
  for (const key of Object.keys(headers || {})) {
    const value = headers[key];
    if (value !== undefined && value !== null) {
      proxyHeaders[key] = [String(value)];
    }
  }
  return proxyHeaders;
}

function normalizeUrl(value) {
  const url = String(value || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('network.fetchExternal requires absolute http/https url');
  }
  return url;
}

function normalizeDeckId(value) {
  const deckId = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(deckId)) {
    throw new Error('riff proxy requires safe non-empty deckId');
  }
  return deckId;
}

function normalizePositiveInt(value, fallback, max) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(max, numeric);
}

function normalizeQueueProjectionIdentityBroadcast(params) {
  const named = toObjectParams(params);
  const queueType = String(named.queueType || '').trim();
  const queueId = String(named.queueId || queueType).trim();
  const policyId = String(named.policyId || '').trim();
  const sourceInstanceId = String(named.sourceInstanceId || '').trim();
  const generation = Math.floor(Number(named.generation));
  if (!QUEUE_PROJECTION_IDENTITY_QUEUE_TYPES.has(queueType)) {
    throw new Error('queueProjection.publishIdentityChanged requires supported queueType');
  }
  if (!queueId || !policyId || !Number.isFinite(generation) || generation <= 0 || !sourceInstanceId) {
    throw new Error('queueProjection.publishIdentityChanged requires identity and sourceInstanceId');
  }
  const reason = named.reason === 'materialized' ? 'materialized' : 'refreshed';
  const source = ['backend', 'writer-relay', 'runtime'].includes(named.source) ? named.source : 'runtime';
  const timestamp = Number.isFinite(Number(named.timestamp)) ? Number(named.timestamp) : nowMs();
  const diagnosticEventId = String(named.diagnosticEventId || '').trim()
    || `queue-projection:${queueType}:${policyId}:${generation}:${sourceInstanceId}`;
  return {
    queueId,
    queueType,
    policyId,
    generation,
    reason,
    source,
    sourceInstanceId,
    sourceSurfaceId: normalizeOptionalString(named.sourceSurfaceId, 128),
    sourceMode: normalizeOptionalString(named.sourceMode, 64),
    timestamp,
    diagnosticEventId,
  };
}

function utf8Bytes(value) {
  const text = String(value || '');
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >> 18));
      bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    }
  }
  return bytes;
}

function base64UrlEncode(value) {
  if (typeof Buffer !== 'undefined' && Buffer.from) {
    return Buffer.from(String(value || ''), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = utf8Bytes(value);
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    output += alphabet[(triple >> 18) & 0x3f];
    output += alphabet[(triple >> 12) & 0x3f];
    output += index + 1 < bytes.length ? alphabet[(triple >> 6) & 0x3f] : '=';
    output += index + 2 < bytes.length ? alphabet[triple & 0x3f] : '=';
  }
  return output.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(operation, timeoutMs, message) {
  if (typeof setTimeout !== 'function') {
    return operation;
  }
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (typeof clearTimeout === 'function') {
      clearTimeout(timeoutId);
    }
  }
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

function normalizeWriterProfile(value) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const backendContainer = normalizeOptionalString(value.backendContainer, 32);
  const frontendKind = normalizeOptionalString(value.frontendKind, 32);
  const surfaceRole = normalizeOptionalString(value.surfaceRole, 32);
  const writerEligibility = normalizeOptionalString(value.writerEligibility, 32);
  const confidence = normalizeOptionalString(value.confidence, 16);
  const reason = normalizeOptionalString(value.reason, 256);
  const sanitizedLocationHref = value.sanitizedLocationHref === null
    ? null
    : normalizeOptionalString(value.sanitizedLocationHref, 512);
  if (!backendContainer || !frontendKind || !surfaceRole || !writerEligibility || !confidence || !reason) {
    return undefined;
  }
  return {
    backendContainer,
    frontendKind,
    surfaceRole,
    writerEligibility,
    confidence,
    reason,
    sanitizedLocationHref,
  };
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
    writerProfile: lease.writerProfile,
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
  const writerProfile = normalizeWriterProfile(named.writerProfile) ?? activeLease?.writerProfile;
  return {
    visibilityState,
    documentHasFocus: typeof documentHasFocus === 'boolean'
      ? documentHasFocus
      : activeLease?.documentHasFocus,
    locationHref,
    writerProfile,
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

function getSiyuanAppSurfaceRole(state) {
  const profileRole = normalizeOptionalString(state?.writerProfile?.surfaceRole, 32);
  if (
    profileRole === 'primary-app'
    || profileRole === 'document-window'
    || profileRole === 'active-frontend'
    || profileRole === 'auxiliary'
  ) {
    return profileRole;
  }
  const locationHref = normalizeOptionalString(state?.locationHref, 512);
  if (!locationHref) {
    return 'unknown';
  }
  const href = locationHref.toLowerCase();
  if (!href.includes('/stage/build/app')) {
    return 'unknown';
  }
  if (isAuxiliarySiyuanSurface(href)) {
    return 'auxiliary';
  }
  if (href.includes('/window.html')) {
    return 'document-window';
  }
  return 'primary-app';
}

function getWriterEligibility(state) {
  const eligibility = normalizeOptionalString(state?.writerProfile?.writerEligibility, 32);
  if (
    eligibility === 'canonical'
    || eligibility === 'follower-only'
    || eligibility === 'provisional-candidate'
    || eligibility === 'never'
    || eligibility === 'unavailable'
  ) {
    return eligibility;
  }
  const role = getSiyuanAppSurfaceRole(state);
  if (role === 'primary-app') {
    return 'canonical';
  }
  if (role === 'document-window') {
    return 'follower-only';
  }
  if (role === 'auxiliary') {
    return 'never';
  }
  return 'unknown';
}

function isNormalSiyuanAppSurface(state) {
  const role = getSiyuanAppSurfaceRole(state);
  return role === 'primary-app' || role === 'document-window';
}

function getWriterLeaseSurfaceScore(state) {
  const role = getSiyuanAppSurfaceRole(state);
  if (role === 'primary-app') {
    return 30;
  }
  if (role === 'document-window') {
    return 25;
  }
  if (role === 'active-frontend') {
    return 22;
  }
  if (role === 'auxiliary') {
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

function getWriterLeaseOwnerAgeMs(activeLease, at) {
  const ownerChangedAt = Number(activeLease?.ownerChangedAt)
    || Number(activeLease?.acquiredAt)
    || Number(activeLease?.lastHeartbeatAt)
    || at;
  return Math.max(0, at - ownerChangedAt);
}

function isStaleNormalAppOwnerReclaimable(activeLease, named, at) {
  const ownerRole = getSiyuanAppSurfaceRole(activeLease);
  const requesterRole = getSiyuanAppSurfaceRole(named);
  if (ownerRole !== 'document-window' || requesterRole !== 'document-window') {
    return false;
  }
  if (getWriterLeaseOwnerAgeMs(activeLease, at) < WRITER_LEASE_STALE_OWNER_RECLAIM_GRACE_MS) {
    return false;
  }
  const ownerVisibilityState = normalizeOptionalString(activeLease.visibilityState, 32);
  const ownerDocumentHasFocus = normalizeDocumentHasFocus(activeLease.documentHasFocus);
  return ownerVisibilityState === 'hidden' || ownerDocumentHasFocus === false;
}

function isLeaseReclaimableByVisibleRequester(activeLease, named, at) {
  if (!activeLease || !isRequesterVisible(named)) {
    return false;
  }
  const requesterEligibility = getWriterEligibility(named);
  if (requesterEligibility === 'follower-only' || requesterEligibility === 'never' || requesterEligibility === 'unavailable') {
    return false;
  }
  const requesterRole = getSiyuanAppSurfaceRole(named);
  const ownerRole = getSiyuanAppSurfaceRole(activeLease);
  const requesterIsNormalApp = requesterRole === 'primary-app' || requesterRole === 'document-window';
  if (ownerRole === 'primary-app') {
    return false;
  }
  if (requesterRole === 'primary-app' && (ownerRole === 'document-window' || ownerRole === 'auxiliary')) {
    return true;
  }
  if (ownerRole === 'document-window') {
    return isStaleNormalAppOwnerReclaimable(activeLease, named, at);
  }
  if (requesterIsNormalApp && isAuxiliarySiyuanSurface(activeLease.locationHref)) {
    return true;
  }
  if (!activeLease.visibilityState || activeLease.visibilityState === 'hidden') {
    return true;
  }
  return getWriterLeaseForegroundScore(named) > getWriterLeaseForegroundScore(activeLease);
}

function getWriterIneligibleReason(named) {
  const eligibility = getWriterEligibility(named);
  if (eligibility === 'follower-only') {
    return 'writer unavailable: current runtime profile is follower-only';
  }
  if (eligibility === 'provisional-candidate') {
    return 'writer unavailable: current runtime profile is provisional-candidate';
  }
  if (eligibility === 'never') {
    return 'writer unavailable: current runtime profile is never eligible';
  }
  if (eligibility === 'unavailable') {
    return 'writer unavailable: current runtime profile is unavailable';
  }
  return null;
}

function isHiddenCanonicalPrimaryEmptyLeaseRecoveryRequester(named) {
  if (!isRequesterHidden(named)) {
    return false;
  }
  const writerProfile = normalizeWriterProfile(named.writerProfile);
  return writerProfile?.surfaceRole === 'primary-app'
    && writerProfile.writerEligibility === 'canonical';
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

async function broadcastQueueProjectionIdentityChanged(event) {
  try {
    await siyuan.rpc.broadcast('memo.queueProjection.identityChanged', event);
  } catch (error) {
    await siyuan.logger.warn('[SiYuanMemo kernel] failed to broadcast queue projection identity', String(error));
  }
}

async function queueProjectionPublishIdentityChanged(params) {
  const at = nowMs();
  const broadcast = normalizeQueueProjectionIdentityBroadcast(params);
  await broadcastQueueProjectionIdentityChanged(broadcast);
  return buildOkEnvelope({ broadcast }, at);
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

function hasAgentMcpRegisterApi() {
  return typeof siyuan.mcp?.registerTool === 'function';
}

function hasAgentMcpUnregisterApi() {
  return typeof siyuan.mcp?.unregisterTool === 'function';
}

function buildAgentMcpInputSchema(toolName) {
  return {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: AGENT_MCP_TOOL_ACTIONS[toolName] || [],
        description: `SiYuanMemo ${toolName} action. Must be non-empty so Agent confirmation remains meaningful.`,
      },
    },
    required: ['action'],
  };
}

function buildAgentMcpToolConfig(toolName) {
  const descriptions = {
    memo_query: 'Read SiYuanMemo learning overview and bounded queue diagnostics.',
    memo_card: 'Inspect cards and perform controlled card writes from explicit payloads.',
    memo_review: 'Assist the active review card without submitting feedback or scheduler decisions.',
    memo_ui: 'Open or focus SiYuanMemo frontend surfaces through live UI context.',
  };
  return {
    title: toolName,
    description: descriptions[toolName] || `SiYuanMemo ${toolName}`,
    inputSchema: buildAgentMcpInputSchema(toolName),
  };
}

function buildAgentMcpErrorEnvelope(code, message, status = 'validation-error') {
  return {
    ok: false,
    status,
    error: {
      code,
      message,
    },
  };
}

function validateAgentMcpToolAction(toolName, args) {
  const action = String(args?.action ?? '').trim();
  if (!action) {
    return buildAgentMcpErrorEnvelope('VALIDATION_ERROR', `${toolName} requires non-empty action`);
  }
  const blockedActions = AGENT_MCP_BLOCKED_ACTIONS[toolName] || [];
  if (blockedActions.includes(action)) {
    return buildAgentMcpErrorEnvelope(
      'UNSUPPORTED_OPERATION',
      `${toolName} cannot submit feedback, grade, answer, or commit scheduler decisions`,
      'unsupported-operation',
    );
  }
  const allowedActions = AGENT_MCP_TOOL_ACTIONS[toolName] || [];
  if (!allowedActions.includes(action)) {
    return buildAgentMcpErrorEnvelope(
      'UNSUPPORTED_OPERATION',
      `${toolName} action is unsupported: ${action}`,
      'unsupported-operation',
    );
  }
  return null;
}

function normalizeAgentMcpArgs(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {};
  }
  return args;
}

async function handleAgentMcpToolCall(toolName, rawArgs) {
  const args = normalizeAgentMcpArgs(rawArgs);
  const validationError = validateAgentMcpToolAction(toolName, args);
  if (validationError) {
    return validationError;
  }

  const commandId = createCommandId();
  const submitted = await writerSubmitCommand({
    instanceId: 'kernel-agent-mcp',
    commandId,
    idempotencyKey: `agent-tool:${toolName}:${commandId}`,
    method: 'agent.tool.execute',
    params: {
      tool: toolName,
      args,
      source: 'mcp',
    },
  });
  if (submitted.ok !== true) {
    return {
      ok: false,
      status: 'unavailable',
      error: {
        code: 'WRITER_RELAY_UNAVAILABLE',
        message: submitted.error?.message || 'Agent MCP writer relay unavailable',
      },
    };
  }

  const waited = await waitForPrivateCommandResult(commandId);
  if (waited.statusCode !== 200) {
    return waited.result;
  }
  return waited.result;
}

async function registerAgentMcpTools() {
  if (!hasAgentMcpRegisterApi()) {
    await siyuan.logger.info('[SiYuanMemo kernel] Agent MCP unavailable: siyuan.mcp.registerTool missing');
    return;
  }
  for (const toolName of AGENT_MCP_TOOL_NAMES) {
    await siyuan.mcp.registerTool(
      toolName,
      buildAgentMcpToolConfig(toolName),
      async (args) => handleAgentMcpToolCall(toolName, args),
    );
    registeredAgentMcpTools.add(toolName);
  }
}

async function unregisterAgentMcpTools() {
  if (!hasAgentMcpUnregisterApi()) {
    registeredAgentMcpTools.clear();
    return;
  }
  for (const toolName of Array.from(registeredAgentMcpTools)) {
    await siyuan.mcp.unregisterTool(toolName);
    registeredAgentMcpTools.delete(toolName);
  }
}

function buildCapabilities() {
  return {
    version: 9,
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
      'identity.acquireInitializationFence',
      'identity.releaseInitializationFence',
      'network.fetchExternal',
      'agent.mcp.memo_query',
      'agent.mcp.memo_card',
      'agent.mcp.memo_review',
      'agent.mcp.memo_ui',
      'private.http.status',
      'private.http.command',
    ],
    storage: 'siyuan.storage',
    rpc: 'json-rpc-2.0',
    writesSiyuanMemoDb: false,
    kernelNetworkProxy: true,
    privateHttp: Boolean(siyuan.server?.private?.http),
    privateSse: false,
    agentMcp: {
      available: hasAgentMcpRegisterApi(),
      registeredTools: Array.from(registeredAgentMcpTools),
      reason: hasAgentMcpRegisterApi() ? null : 'siyuan.mcp.registerTool missing',
    },
    writerLease: {
      defaultTtlMs: WRITER_LEASE_DEFAULT_TTL_MS,
      minTtlMs: WRITER_LEASE_MIN_TTL_MS,
      maxTtlMs: WRITER_LEASE_MAX_TTL_MS,
      payloadFields: ['leaseEpoch', 'ownerChangedAt'],
    },
    identityInitializationFence: {
      defaultTtlMs: IDENTITY_INITIALIZATION_FENCE_DEFAULT_TTL_MS,
      minTtlMs: IDENTITY_INITIALIZATION_FENCE_MIN_TTL_MS,
      maxTtlMs: IDENTITY_INITIALIZATION_FENCE_MAX_TTL_MS,
    },
  };
}

async function postSiyuanKernelApi(path, payload) {
  const response = await siyuan.client.fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload || {}),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.code !== 0) {
    throw new Error(`kernel api ${path} failed: http=${response.status} code=${json?.code ?? 'unknown'} msg=${json?.msg || ''}`);
  }
  return json.data;
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
    if (!isLeaseReclaimableByVisibleRequester(activeLease, named, at)) {
      return buildUnavailableEnvelope(
        `writer lease held by another instance: ${activeLease.instanceId}`,
        activeLease,
        at,
      );
    }
  }

  if (!activeLease) {
    const ineligibleReason = getWriterIneligibleReason(named);
    if (ineligibleReason) {
      return buildUnavailableEnvelope(
        ineligibleReason,
        null,
        at,
      );
    }
  }

  if (!activeLease && isRequesterHidden(named) && !isHiddenCanonicalPrimaryEmptyLeaseRecoveryRequester(named)) {
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
      pendingCommandCount: countDispatchableWriterCommands(instanceId, at),
    }, at);
  }

  return buildOkEnvelope({
    command: null,
    pendingCommandCount: countDispatchableWriterCommands(instanceId, at),
  }, at);
}

function countDispatchableWriterCommands(instanceId, at) {
  let count = 0;
  for (const pending of writerCommandsPending.values()) {
    if (pending.writerInstanceId !== instanceId) {
      continue;
    }
    if (Number(pending.inFlightUntil || 0) > at) {
      continue;
    }
    count++;
  }
  return count;
}

async function networkFetchExternal(params) {
  try {
    const named = toObjectParams(params);
    const requestId = normalizeOptionalString(named.requestId, 128) || `network-${nowMs()}`;
    const url = normalizeUrl(named.url);
    const headers = normalizeHeaderRecord(named.headers);
    const proxyPath = `/api/network/proxy?u=${base64UrlEncode(url)}&h=${base64UrlEncode(JSON.stringify(toProxyHeaderRecord(headers)))}`;
    const requestInit = {
      method: normalizeHttpMethod(named.method),
      headers: {},
    };
    if (named.body !== undefined && named.body !== null) {
      requestInit.headers['Content-Type'] = headers['Content-Type'] || headers['content-type'] || 'application/json';
      requestInit.body = String(named.body);
    }
    const response = await siyuan.client.fetch(proxyPath, requestInit);
    const body = await response.text();
    return {
      requestId,
      status: Number(response.status) || 0,
      headers: normalizeHeaderRecord(response.headers),
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown network.fetchExternal failure');
    throw new Error(message || 'unknown network.fetchExternal failure');
  }
}

function jsonHttpResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': ['application/json; charset=utf-8'],
    },
    body: {
      data: {
        type: 'JSON',
        data,
      },
    },
  };
}

async function readJsonRequestBody(request) {
  const body = request?.request?.body;
  const raw = body?.data ? await body.data.text() : '';
  const text = String(raw || '').trim();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

function buildPrivateCapabilityResult() {
  return {
    available: true,
    reason: null,
    kernelSidecarAvailable: true,
    backendWorkerAvailable: true,
    writerAvailable: true,
    methodAllowed: true,
  };
}

function normalizePrivateCommandPayload(payload) {
  const commandId = normalizeOptionalString(payload.requestId, 128) || createCommandId();
  const idempotencyKey = normalizeOptionalString(payload.idempotencyKey, 256) || commandId;
  const callerIntent = normalizeOptionalString(payload.callerIntent, 256) || 'kernel-private-http';
  return {
    commandId,
    idempotencyKey,
    params: {
      requestId: commandId,
      method: 'private.command.execute',
      callerIntent,
      idempotencyKey,
      capabilityResult: buildPrivateCapabilityResult(),
      params: payload.params && typeof payload.params === 'object'
        ? payload.params
        : {
          operation: payload.operation,
          request: payload.request,
          checkedAt: payload.checkedAt,
        },
      auditContext: payload.auditContext && typeof payload.auditContext === 'object'
        ? payload.auditContext
        : { source: 'kernel-private-http' },
    },
  };
}

async function waitForPrivateCommandResult(commandId, timeoutMs = PRIVATE_COMMAND_WAIT_TIMEOUT_MS) {
  const deadline = nowMs() + timeoutMs;
  while (nowMs() <= deadline) {
    const result = writerGetCommandResult({ commandId });
    if (result.ok === true && result.status === 'completed') {
      return { statusCode: 200, result: result.result };
    }
    if (result.ok === true && result.status === 'failed') {
      return {
        statusCode: 503,
        result: {
          ok: false,
          error: result.error || { code: 'BACKEND_UNAVAILABLE', message: 'private command failed' },
        },
      };
    }
    if (typeof setTimeout !== 'function') {
      break;
    }
    await delayMs(PRIVATE_COMMAND_POLL_INTERVAL_MS);
  }
  return {
    statusCode: 503,
    result: {
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: `private command timed out: ${commandId}`,
      },
    },
  };
}

async function handlePrivateHttp(request) {
  const method = String(request?.request?.method || '').toUpperCase();
  const path = String(request?.context?.path || request?.url?.path || '').replace(/\/+$/g, '') || '/';
  if (method === 'GET' && (path === '/status' || path === '/')) {
    return jsonHttpResponse(200, {
      ok: true,
      runtime: 'siyuanmemo-kernel-private-http',
      health: buildHealth(),
      capabilities: buildCapabilities(),
      writerLease: cloneLease(getActiveLease()),
    });
  }
  if (method === 'POST' && path === '/command') {
    const payload = await readJsonRequestBody(request);
    const command = normalizePrivateCommandPayload(payload);
    const submitted = await writerSubmitCommand({
      instanceId: 'kernel-private-http',
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      method: 'private.command.execute',
      params: command.params,
    });
    if (submitted.ok !== true) {
      return jsonHttpResponse(503, submitted);
    }
    const waited = await waitForPrivateCommandResult(command.commandId);
    return jsonHttpResponse(waited.statusCode, waited.result);
  }
  return jsonHttpResponse(404, {
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: `Unsupported private route: ${method} ${path}`,
    },
  });
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
  await siyuan.rpc.bind('identity.acquireInitializationFence', async (params) => identityAcquireInitializationFence(params), 'Serialize Truth Device Identity authority initialization across frontend origins.');
  await siyuan.rpc.bind('identity.releaseInitializationFence', async (params) => identityReleaseInitializationFence(params), 'Release Truth Device Identity authority initialization fence.');
  await siyuan.rpc.bind('queueProjection.publishIdentityChanged', async (params) => queueProjectionPublishIdentityChanged(params), 'Relay queue projection identity changes to active frontend instances.');
  await siyuan.rpc.bind('network.fetchExternal', async (params) => networkFetchExternal(params), 'Fetch external HTTP endpoint through kernel network proxy.');
  await registerAgentMcpTools();
  if (siyuan.server?.private?.http) {
    siyuan.server.private.http.handler = handlePrivateHttp;
  }
};

siyuan.plugin.lifecycle.onrunning = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] running');
};

siyuan.plugin.lifecycle.onunload = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] unloading');
  identityInitializationFence = null;
  await unregisterAgentMcpTools();
};
