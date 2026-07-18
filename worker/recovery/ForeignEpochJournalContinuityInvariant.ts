import {
  canonicalRecoveryJson,
  hashRecoveryContent,
  type BackendForeignEpochRecoveryImmutableMutationIdentity,
} from '../../packages/contracts/src/backend-rpc';
import type { WorkerTruthPromotionJournalEntry } from '../truth/WorkerTruthPromotionModule';

export { canonicalRecoveryJson, hashRecoveryContent };

function collectIdempotencyKeys(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectIdempotencyKeys(entry, output));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (/idempotency/i.test(key) && typeof entry === 'string' && entry.trim()) {
      output.push(entry);
    }
    collectIdempotencyKeys(entry, output);
  }
}

export async function snapshotImmutableMutationIdentity(
  entry: WorkerTruthPromotionJournalEntry,
): Promise<BackendForeignEpochRecoveryImmutableMutationIdentity> {
  const envelope = entry.mutationEnvelope;
  if (!Number.isSafeInteger(envelope.journalSequence) || Number(envelope.journalSequence) < 1) {
    throw new Error('RECOVERY_MUTATION_IDENTITY_INVALID: journal sequence is required');
  }
  const idempotencyKeys: string[] = [];
  collectIdempotencyKeys(envelope, idempotencyKeys);
  const uniqueIdempotencyKeys = Array.from(new Set(idempotencyKeys)).sort();
  return {
    mutationId: envelope.mutationId,
    family: envelope.family,
    deviceId: envelope.deviceId,
    identityEpoch: envelope.identityEpoch,
    journalSequence: envelope.journalSequence!,
    createdAt: envelope.createdAt,
    envelopeHash: await hashRecoveryContent(envelope),
    payloadHash: await hashRecoveryContent({
      affectedAggregates: envelope.affectedAggregates,
      operations: envelope.operations,
    }),
    requiredTruthOutputsHash: await hashRecoveryContent(envelope.requiredTruthOutputs),
    durabilityReceiptIdentityHash: await hashRecoveryContent({
      version: entry.durabilityReceipt.version,
      mutationId: entry.durabilityReceipt.mutationId,
      family: entry.durabilityReceipt.family,
      journalSequence: entry.durabilityReceipt.journalSequence,
      affectedAggregates: entry.durabilityReceipt.affectedAggregates,
      requiredTruthOutputs: entry.durabilityReceipt.requiredTruthOutputs,
    }),
    idempotencyKeyHashes: await Promise.all(uniqueIdempotencyKeys.map(hashRecoveryContent)),
  };
}

export function assertImmutableMutationIdentity(
  expected: BackendForeignEpochRecoveryImmutableMutationIdentity,
  actual: BackendForeignEpochRecoveryImmutableMutationIdentity,
): void {
  for (const field of Object.keys(expected) as Array<keyof BackendForeignEpochRecoveryImmutableMutationIdentity>) {
    if (canonicalRecoveryJson(expected[field]) !== canonicalRecoveryJson(actual[field])) {
      throw new Error(`RECOVERY_MUTATION_IDENTITY_CHANGED: ${field}`);
    }
  }
}
