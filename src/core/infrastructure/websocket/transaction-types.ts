interface JsonObject {
  [key: string]: unknown;
}

export interface WSMessage {
  cmd: string;
  data?: unknown;
}

export interface DoOperationRecordData extends JsonObject {
  new?: JsonObject;
  old?: JsonObject;
  blockIDs?: string[];
  ids?: string[];
}

export type DoOperationData = DoOperationRecordData | string | unknown[];

export interface DoOperation {
  action: string;
  data?: DoOperationData;
  id: string;
  parentID?: string;
  previousID?: string;
  nextID?: string;
  blockIDs?: string[];
  ids?: string[];
}

export interface Transaction {
  doOperations: DoOperation[];
  undoOperations: DoOperation[] | null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function parseDoOperation(value: unknown): DoOperation | null {
  if (!isObject(value)) {
    return null;
  }

  const action = asString(value.action);
  const data = isObject(value.data) || typeof value.data === 'string'
    ? (value.data as DoOperationData)
    : undefined;
  const recordData = isObject(data) && !Array.isArray(data)
    ? (data as DoOperationRecordData)
    : undefined;
  const id = asString(value.id) ?? '';
  const blockIDs = asStringArray(value.blockIDs) ?? asStringArray(recordData?.blockIDs);
  const ids = asStringArray(value.ids) ?? asStringArray(recordData?.ids);
  if (!action || (!id && !blockIDs && !ids)) {
    return null;
  }

  const parentID = asString(value.parentID) || undefined;
  const previousID = asString(value.previousID) || undefined;
  const nextID = asString(value.nextID) || undefined;

  return {
    action,
    data,
    id,
    parentID,
    previousID,
    nextID,
    blockIDs,
    ids,
  };
}

function parseTransaction(value: unknown): Transaction | null {
  if (!isObject(value)) {
    return null;
  }

  if (!Array.isArray(value.doOperations)) {
    return null;
  }

  const doOperations = value.doOperations
    .map(parseDoOperation)
    .filter((operation): operation is DoOperation => operation !== null);

  const undoOperations = Array.isArray(value.undoOperations)
    ? value.undoOperations
      .map(parseDoOperation)
      .filter((operation): operation is DoOperation => operation !== null)
    : null;

  return {
    doOperations,
    undoOperations,
  };
}

export function parseTransactionsPayload(payload: unknown): Transaction[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map(parseTransaction)
    .filter((transaction): transaction is Transaction => transaction !== null);
}

export function parseWSMessage(rawMessage: unknown): WSMessage | null {
  if (typeof rawMessage !== 'string') {
    return null;
  }

  const parsed = JSON.parse(rawMessage) as unknown;
  if (!isObject(parsed)) {
    return null;
  }

  const cmd = asString(parsed.cmd);
  if (!cmd) {
    return null;
  }

  return {
    cmd,
    data: parsed.data,
  };
}
