export const CARD_DELETE_INTENTS = {
  localTombstone: 'local-tombstone',
  nativeHardDelete: 'native-hard-delete',
} as const;

export type CardDeleteIntent = typeof CARD_DELETE_INTENTS[keyof typeof CARD_DELETE_INTENTS];
export type NativeHardDeleteOwnershipProof = 'siyuanmemo-owned';

export interface CardDeleteIntentOptions {
  deleteIntent?: CardDeleteIntent;
  confirmDangerousNativeDelete?: boolean;
  ownershipProof?: NativeHardDeleteOwnershipProof;
  requestedBy?: string;
}

export function normalizeCardDeleteIntent(value: unknown): CardDeleteIntent {
  return value === CARD_DELETE_INTENTS.nativeHardDelete
    ? CARD_DELETE_INTENTS.nativeHardDelete
    : CARD_DELETE_INTENTS.localTombstone;
}

export function isNativeHardDeleteIntent(value: unknown): boolean {
  return normalizeCardDeleteIntent(value) === CARD_DELETE_INTENTS.nativeHardDelete;
}

export function isCardDeleteIntentOptions(value: unknown): value is CardDeleteIntentOptions {
  return typeof value === 'object' && value !== null && !(value instanceof Date);
}

export function hasNativeHardDeleteAuthorization(value: unknown): boolean {
  if (!isCardDeleteIntentOptions(value) || !isNativeHardDeleteIntent(value.deleteIntent)) {
    return false;
  }

  return value.confirmDangerousNativeDelete === true
    || value.ownershipProof === 'siyuanmemo-owned';
}
