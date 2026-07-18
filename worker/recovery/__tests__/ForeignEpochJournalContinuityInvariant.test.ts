import { describe, expect, it } from 'vitest';
import type { WorkerTruthPromotionJournalEntry } from '../../truth/WorkerTruthPromotionModule';
import { FOREIGN_EPOCH_JOURNAL_CONTINUITY_INCIDENT_FIXTURE } from '../__fixtures__/foreignEpochJournalContinuityIncident';
import {
  assertImmutableMutationIdentity,
  canonicalRecoveryJson,
  hashRecoveryContent,
  snapshotImmutableMutationIdentity,
} from '../ForeignEpochJournalContinuityInvariant';

function incidentEntry(): WorkerTruthPromotionJournalEntry {
  return structuredClone(FOREIGN_EPOCH_JOURNAL_CONTINUITY_INCIDENT_FIXTURE.journal.entries[0]);
}

describe('ForeignEpochJournalContinuityInvariant', () => {
  it('canonicalizes object keys before hashing recovery evidence', async () => {
    expect(canonicalRecoveryJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    await expect(hashRecoveryContent({ b: 2, a: 1 })).resolves.toBe(
      await hashRecoveryContent({ a: 1, b: 2 }),
    );
  });

  it('captures every immutable mutation identity dimension from the redacted incident', async () => {
    const snapshot = await snapshotImmutableMutationIdentity(incidentEntry());

    expect(snapshot).toMatchObject({
      mutationId: 'mutation-sequence-404-redacted',
      family: 'review',
      deviceId: 'device-incident-redacted',
      identityEpoch: 'epoch-f771-redacted',
      journalSequence: 404,
      idempotencyKeyHashes: [expect.stringMatching(/^sha256:[a-f0-9]{64}$/)],
    });
    expect(snapshot.envelopeHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.payloadHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.requiredTruthOutputsHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.durabilityReceiptIdentityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('allows receipt progress while preserving durability receipt identity', async () => {
    const before = incidentEntry();
    const after = incidentEntry();
    after.durabilityReceipt.stage = 'truth-committed';
    after.durabilityReceipt.truthGenerationId = 'truth-generation-404-redacted';
    after.durabilityReceipt.retry.attemptCount = 2;
    after.durabilityReceipt.updatedAt += 1_000;

    const expected = await snapshotImmutableMutationIdentity(before);
    const actual = await snapshotImmutableMutationIdentity(after);
    expect(() => assertImmutableMutationIdentity(expected, actual)).not.toThrow();
  });

  it.each([
    ['mutationId', (entry: WorkerTruthPromotionJournalEntry) => { entry.mutationEnvelope.mutationId = 'rewritten'; }],
    ['deviceId', (entry: WorkerTruthPromotionJournalEntry) => { entry.mutationEnvelope.deviceId = 'other-device'; }],
    ['identityEpoch', (entry: WorkerTruthPromotionJournalEntry) => { entry.mutationEnvelope.identityEpoch = 'other-epoch'; }],
    ['journalSequence', (entry: WorkerTruthPromotionJournalEntry) => { entry.mutationEnvelope.journalSequence = 405; }],
    ['createdAt', (entry: WorkerTruthPromotionJournalEntry) => { entry.mutationEnvelope.createdAt += 1; }],
    ['payload', (entry: WorkerTruthPromotionJournalEntry) => { entry.mutationEnvelope.operations[0].row!.rating = 4; }],
    ['requiredTruthOutputs', (entry: WorkerTruthPromotionJournalEntry) => { entry.mutationEnvelope.requiredTruthOutputs[0].family = 'rewritten'; }],
    ['idempotencyKey', (entry: WorkerTruthPromotionJournalEntry) => { entry.mutationEnvelope.operations[0].row!.commit_idempotency_key = 'rewritten'; }],
    ['durabilityReceiptIdentity', (entry: WorkerTruthPromotionJournalEntry) => { entry.durabilityReceipt.journalSequence = 405; }],
  ])('rejects a changed immutable %s dimension', async (_label, mutate) => {
    const before = incidentEntry();
    const after = incidentEntry();
    mutate(after);

    const expected = await snapshotImmutableMutationIdentity(before);
    const actual = await snapshotImmutableMutationIdentity(after);
    expect(() => assertImmutableMutationIdentity(expected, actual)).toThrow('RECOVERY_MUTATION_IDENTITY_CHANGED');
  });
});
