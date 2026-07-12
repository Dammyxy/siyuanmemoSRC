import { describe, expect, it } from 'vitest';
import { classifyWorkerStartupStorageEvidence } from '../WorkerStartupStorageEvidence';

describe('classifyWorkerStartupStorageEvidence', () => {
  it('classifies verified canonical evidence and a missing temp projection as rebuilding', () => {
    const evidence = classifyWorkerStartupStorageEvidence({
      now: 1_700_000_000_000,
      identity: {
        deviceId: 'device-local',
        identityEpoch: 'epoch-local',
      },
      truth: {
        manifestCount: 2,
        segmentCount: 4,
        currentGenerationId: 'generation-current',
        previousGenerationId: 'generation-previous',
        selectedGenerationId: 'generation-current',
        generationFallbackReason: null,
        validationError: null,
        quarantinedPaths: [],
      },
      delta: {
        files: 3,
        entries: 8,
        checkpoint: {
          clearedAt: 1_699_000_000_000,
          coveredSegmentPaths: ['sqlite-delta/v2/sealed-1.msgpack'],
          reason: 'storage.projection.rebuild.startup',
        },
        truthCoverageFrontier: 6,
        uncoveredMutationCount: 2,
        validationError: null,
      },
      projection: {
        status: 'missing',
        byteLength: 0,
        reason: 'temp-projection-missing',
      },
    });

    expect(evidence).toEqual({
      version: 1,
      classifiedAt: 1_700_000_000_000,
      identity: {
        status: 'verified',
        deviceId: 'device-local',
        identityEpoch: 'epoch-local',
        reason: null,
      },
      manifests: {
        status: 'verified',
        count: 2,
        reason: null,
      },
      generations: {
        status: 'verified',
        currentGenerationId: 'generation-current',
        previousGenerationId: 'generation-previous',
        selectedGenerationId: 'generation-current',
        reason: null,
      },
      truthSegments: {
        status: 'verified',
        count: 4,
        reason: null,
      },
      deltaCoverage: {
        status: 'verified',
        files: 3,
        entries: 8,
        truthCoverageFrontier: 6,
        uncoveredMutationCount: 2,
        reason: null,
      },
      checkpoint: {
        status: 'verified',
        clearedAt: 1_699_000_000_000,
        coveredSegmentPaths: ['sqlite-delta/v2/sealed-1.msgpack'],
        reason: 'storage.projection.rebuild.startup',
      },
      temporarySqlite: {
        status: 'missing',
        byteLength: 0,
        reason: 'temp-projection-missing',
      },
      recoveryState: {
        version: 1,
        status: 'rebuilding-projection',
        code: null,
        lastVerifiedGenerationId: 'generation-current',
        replayFromJournalSequence: 7,
        quarantinedPaths: [],
        disabledCapabilities: [
          'formal-writes',
          'review',
          'sync-upload',
        ],
        diagnosticReason: 'temp-projection-missing',
        updatedAt: 1_700_000_000_000,
      },
    });
  });

  it('enters read-only recovery when canonical truth or uncovered delta is invalid', () => {
    const evidence = classifyWorkerStartupStorageEvidence({
      now: 1_700_000_000_000,
      identity: {
        deviceId: 'device-local',
        identityEpoch: 'epoch-local',
      },
      truth: {
        manifestCount: 1,
        segmentCount: 1,
        currentGenerationId: 'generation-current',
        previousGenerationId: 'generation-previous',
        selectedGenerationId: 'generation-previous',
        generationFallbackReason: null,
        validationError: 'TRUTH_VALIDATION_FAILED: canonical segment checksum mismatch',
        quarantinedPaths: ['truth/card-memory-facts/corrupt.msgpack'],
      },
      delta: {
        files: 1,
        entries: 1,
        checkpoint: null,
        truthCoverageFrontier: 4,
        uncoveredMutationCount: 1,
        validationError: 'SQLite delta segment checksum mismatch: sqlite-delta/v2/open.msgpack',
        quarantinedPaths: ['sqlite-delta/v2/open.msgpack'],
      },
      projection: {
        status: 'present',
        byteLength: 4096,
        reason: null,
      },
    });

    expect(evidence.recoveryState).toEqual({
      version: 1,
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      lastVerifiedGenerationId: 'generation-previous',
      replayFromJournalSequence: 5,
      quarantinedPaths: [
        'truth/card-memory-facts/corrupt.msgpack',
        'sqlite-delta/v2/open.msgpack',
      ],
      disabledCapabilities: [
        'formal-writes',
        'review',
        'card-edit',
        'queue-edit',
        'maintenance',
        'sync-upload',
        'truth-promotion',
        'truth-compaction',
      ],
      diagnosticReason: [
        'TRUTH_VALIDATION_FAILED: canonical segment checksum mismatch',
        'SQLite delta segment checksum mismatch: sqlite-delta/v2/open.msgpack',
      ].join('; '),
      updatedAt: 1_700_000_000_000,
    });
  });

  it('keeps transient identity authority unavailable distinct from invalid canonical evidence', () => {
    const evidence = classifyWorkerStartupStorageEvidence({
      now: 1_700_000_000_000,
      identity: {
        deviceId: null,
        identityEpoch: null,
        disposition: {
          version: 1,
          status: 'read-only-authority-unavailable',
          writable: false,
          retryable: true,
          deviceId: null,
          identityEpoch: null,
          source: 'unavailable',
          reason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
        },
      },
      truth: {
        manifestCount: 0,
        segmentCount: 0,
        currentGenerationId: null,
        previousGenerationId: null,
        selectedGenerationId: null,
        generationFallbackReason: null,
        validationError: null,
        quarantinedPaths: [],
      },
      delta: {
        files: 0,
        entries: 0,
        checkpoint: null,
        truthCoverageFrontier: null,
        uncoveredMutationCount: null,
        validationError: null,
        quarantinedPaths: [],
      },
      projection: {
        status: 'missing',
        byteLength: 0,
        reason: null,
      },
    });

    expect(evidence.identity).toMatchObject({
      status: 'unavailable',
      reason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
    });
    expect(evidence.recoveryState).toMatchObject({
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      diagnosticReason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
    });
  });

  it('classifies durable identity recovery as storage recovery rather than missing identity', () => {
    const evidence = classifyWorkerStartupStorageEvidence({
      now: 1_700_000_000_000,
      identity: {
        deviceId: 'device-conflict',
        identityEpoch: 'epoch-conflict',
        disposition: {
          version: 1,
          status: 'read-only-recovery-required',
          writable: false,
          retryable: false,
          deviceId: 'device-conflict',
          identityEpoch: 'epoch-conflict',
          source: 'identity-recovery-required',
          reason: 'identity authority copies disagree',
        },
      },
      truth: {
        manifestCount: 0,
        segmentCount: 0,
        currentGenerationId: null,
        previousGenerationId: null,
        selectedGenerationId: null,
        generationFallbackReason: null,
        validationError: null,
        quarantinedPaths: [],
      },
      delta: {
        files: 0,
        entries: 0,
        checkpoint: null,
        truthCoverageFrontier: null,
        uncoveredMutationCount: null,
        validationError: null,
        quarantinedPaths: [],
      },
      projection: {
        status: 'present',
        byteLength: 1024,
        reason: null,
      },
    });

    expect(evidence.identity).toMatchObject({
      status: 'invalid',
      deviceId: 'device-conflict',
      identityEpoch: 'epoch-conflict',
      reason: 'identity authority copies disagree',
    });
    expect(evidence.recoveryState).toMatchObject({
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      diagnosticReason: 'identity authority copies disagree',
    });
  });

  it('treats partial identity continuity as recovery-required evidence', () => {
    const evidence = classifyWorkerStartupStorageEvidence({
      now: 1_700_000_000_000,
      identity: {
        deviceId: 'device-without-epoch',
        identityEpoch: null,
      },
      truth: {
        manifestCount: 0,
        segmentCount: 0,
        currentGenerationId: null,
        previousGenerationId: null,
        selectedGenerationId: null,
        generationFallbackReason: null,
        validationError: null,
        quarantinedPaths: [],
      },
      delta: {
        files: 0,
        entries: 0,
        checkpoint: null,
        truthCoverageFrontier: null,
        uncoveredMutationCount: null,
        validationError: null,
        quarantinedPaths: [],
      },
      projection: {
        status: 'present',
        byteLength: 1024,
        reason: null,
      },
    });

    expect(evidence.identity).toMatchObject({
      status: 'invalid',
      deviceId: 'device-without-epoch',
      identityEpoch: null,
      reason: 'storage identity requires both deviceId and identityEpoch',
    });
    expect(evidence.recoveryState).toMatchObject({
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      diagnosticReason: 'storage identity requires both deviceId and identityEpoch',
    });
  });
});
