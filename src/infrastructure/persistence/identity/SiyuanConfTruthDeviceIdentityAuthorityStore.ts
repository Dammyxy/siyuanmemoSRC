import {
  TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION,
  TRUTH_DEVICE_IDENTITY_VERSION,
  type TruthDeviceIdentityAuthorityEnvelope,
  type TruthDeviceIdentityAuthorityPort,
} from '@/application/ports/TruthDeviceIdentityPort';
import type { IFileService } from '@/infrastructure/services/FileService';

export const TRUTH_DEVICE_IDENTITY_AUTHORITY_FILE = 'truth-device-identity.v1.json';
export const TRUTH_DEVICE_IDENTITY_PREVIOUS_AUTHORITY_FILE = 'truth-device-identity.previous.v1.json';
export const TRUTH_DEVICE_IDENTITY_AUTHORITY_PATH = `/conf/siyuan-plugin-siyuanmemo/${TRUTH_DEVICE_IDENTITY_AUTHORITY_FILE}`;

type IdentityAuthorityFilePort = Pick<
  IFileService,
  'readInstallationIdentityText' | 'writeInstallationIdentityText'
>;

function authorityError(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

function parseAuthorityText(text: string | null): unknown | null {
  if (text == null) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentity(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const deviceId = typeof value.deviceId === 'string' ? value.deviceId.trim() : '';
  const identityEpoch = typeof value.identityEpoch === 'string' ? value.identityEpoch.trim() : '';
  return value.version === TRUTH_DEVICE_IDENTITY_VERSION
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(deviceId)
    && !deviceId.includes('..')
    && identityEpoch.length > 0
    && (value.hostFingerprint === null || typeof value.hostFingerprint === 'string')
    && Number.isFinite(value.createdAt)
    && Number.isFinite(value.lastSeenAt);
}

export function isTruthDeviceIdentityAuthorityEnvelope(
  value: unknown,
): value is TruthDeviceIdentityAuthorityEnvelope {
  if (!isRecord(value) || value.version !== TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION) {
    return false;
  }
  const revision = Number(value.revision);
  const previousRevision = value.previousRevision;
  const publishedAt = Number(value.publishedAt);
  return Number.isSafeInteger(revision)
    && revision > 0
    && (previousRevision === null || (Number.isSafeInteger(previousRevision) && Number(previousRevision) > 0))
    && Number.isFinite(publishedAt)
    && publishedAt > 0
    && isIdentity(value.identity);
}

function sameEnvelope(
  left: TruthDeviceIdentityAuthorityEnvelope,
  right: TruthDeviceIdentityAuthorityEnvelope,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameIdentity(
  left: TruthDeviceIdentityAuthorityEnvelope,
  right: TruthDeviceIdentityAuthorityEnvelope,
): boolean {
  return left.identity.deviceId === right.identity.deviceId
    && left.identity.identityEpoch === right.identity.identityEpoch;
}

export class SiyuanConfTruthDeviceIdentityAuthorityStore implements TruthDeviceIdentityAuthorityPort {
  constructor(private readonly fileService: IdentityAuthorityFilePort) {}

  async readAuthority(): Promise<unknown | null> {
    if (!this.fileService.readInstallationIdentityText) {
      throw authorityError('TRUTH_DEVICE_IDENTITY_AUTHORITY_UNAVAILABLE', 'installation identity read API unavailable');
    }
    return parseAuthorityText(
      await this.fileService.readInstallationIdentityText(TRUTH_DEVICE_IDENTITY_AUTHORITY_FILE),
    );
  }

  async readPreviousAuthority(): Promise<unknown | null> {
    if (!this.fileService.readInstallationIdentityText) {
      throw authorityError('TRUTH_DEVICE_IDENTITY_AUTHORITY_UNAVAILABLE', 'previous identity read API unavailable');
    }
    return parseAuthorityText(
      await this.fileService.readInstallationIdentityText(TRUTH_DEVICE_IDENTITY_PREVIOUS_AUTHORITY_FILE),
    );
  }

  async publishAuthority(envelope: TruthDeviceIdentityAuthorityEnvelope): Promise<void> {
    if (!isTruthDeviceIdentityAuthorityEnvelope(envelope)) {
      throw authorityError('TRUTH_DEVICE_IDENTITY_AUTHORITY_INVALID', 'refusing to publish invalid authority envelope');
    }
    if (!this.fileService.writeInstallationIdentityText || !this.fileService.readInstallationIdentityText) {
      throw authorityError('TRUTH_DEVICE_IDENTITY_AUTHORITY_UNAVAILABLE', 'installation identity write API unavailable');
    }

    const current = await this.readAuthority();
    if (current != null) {
      if (!isTruthDeviceIdentityAuthorityEnvelope(current)) {
        throw authorityError('TRUTH_DEVICE_IDENTITY_AUTHORITY_INVALID', 'existing authority is invalid');
      }
      if (envelope.previousRevision !== current.revision || envelope.revision !== current.revision + 1) {
        throw authorityError(
          'TRUTH_DEVICE_IDENTITY_AUTHORITY_REVISION_CONFLICT',
          `expected revision ${current.revision + 1} after ${current.revision}`,
        );
      }
      await this.fileService.writeInstallationIdentityText(
        TRUTH_DEVICE_IDENTITY_PREVIOUS_AUTHORITY_FILE,
        JSON.stringify(current, null, 2),
      );
    } else {
      const previous = await this.readPreviousAuthority();
      if (previous == null) {
        if (envelope.revision !== 1 || envelope.previousRevision !== null) {
          throw authorityError('TRUTH_DEVICE_IDENTITY_AUTHORITY_REVISION_CONFLICT', 'first authority must use revision 1');
        }
      } else {
        if (!isTruthDeviceIdentityAuthorityEnvelope(previous)) {
          throw authorityError('TRUTH_DEVICE_IDENTITY_AUTHORITY_INVALID', 'previous authority is invalid');
        }
        if (
          envelope.previousRevision !== previous.revision
          || envelope.revision !== previous.revision + 1
          || !sameIdentity(envelope, previous)
        ) {
          throw authorityError(
            'TRUTH_DEVICE_IDENTITY_AUTHORITY_REVISION_CONFLICT',
            `recovered authority must continue previous revision ${previous.revision} with the same identity`,
          );
        }
      }
    }

    await this.fileService.writeInstallationIdentityText(
      TRUTH_DEVICE_IDENTITY_AUTHORITY_FILE,
      JSON.stringify(envelope, null, 2),
    );
    const persisted = await this.readAuthority();
    if (!isTruthDeviceIdentityAuthorityEnvelope(persisted) || !sameEnvelope(persisted, envelope)) {
      throw authorityError('TRUTH_DEVICE_IDENTITY_AUTHORITY_VERIFICATION_FAILED', 'authority read-back mismatch');
    }
  }
}
