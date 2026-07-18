import {
  TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
  TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
  type TruthDeviceIdentityAuthorityEnvelopeContract,
  type TruthDeviceIdentityCacheDiagnosticContract,
  type TruthDeviceIdentityCacheKind,
  type TruthDeviceIdentityInstallationEvidenceContract,
  type TruthDeviceIdentityRecordContract,
  type TruthDeviceIdentityResolutionStatus,
  type TruthDeviceIdentityVerifiedSource,
} from '../../../packages/contracts/src/backend-rpc';

export const TRUTH_DEVICE_IDENTITY_VERSION = TRUTH_DEVICE_IDENTITY_RECORD_VERSION;
export const TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION = TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION;

export type TruthDeviceIdentityRecord = TruthDeviceIdentityRecordContract;
export type TruthDeviceIdentityAuthorityEnvelope = TruthDeviceIdentityAuthorityEnvelopeContract;
export type TruthDeviceIdentityCacheDiagnostic = TruthDeviceIdentityCacheDiagnosticContract;
export type { TruthDeviceIdentityCacheKind };
export type TruthDeviceIdentityInstallationEvidence = TruthDeviceIdentityInstallationEvidenceContract;
export type TruthDeviceIdentityStatus = TruthDeviceIdentityResolutionStatus;
export type TruthDeviceIdentityVerifiedResolutionSource = TruthDeviceIdentityVerifiedSource;

export interface TruthDeviceIdentityAuthorityPort {
  readAuthority(): Promise<unknown | null>;
  readPreviousAuthority(): Promise<unknown | null>;
  publishAuthority(envelope: TruthDeviceIdentityAuthorityEnvelope): Promise<void>;
}

export interface TruthDeviceIdentityCachePort {
  readonly kind: TruthDeviceIdentityCacheKind;
  readCache(): Promise<unknown | null>;
  writeCache(record: TruthDeviceIdentityRecord): Promise<void>;
  clearCache(): Promise<void>;
}

export interface TruthDeviceIdentityEvidenceProbePort {
  probeEvidence(): Promise<TruthDeviceIdentityInstallationEvidence>;
}

export interface TruthDeviceIdentityInitializationFencePort {
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
}
