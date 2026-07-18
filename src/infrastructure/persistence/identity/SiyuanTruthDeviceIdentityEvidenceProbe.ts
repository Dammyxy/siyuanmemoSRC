import type {
  TruthDeviceIdentityEvidenceProbePort,
  TruthDeviceIdentityInstallationEvidence,
} from '@/application/ports/TruthDeviceIdentityPort';
import type { IFileService } from '@/infrastructure/services/FileService';
import {
  TRUTH_DEVICE_IDENTITY_PREVIOUS_AUTHORITY_FILE,
} from './SiyuanConfTruthDeviceIdentityAuthorityStore';
import { TRUTH_DEVICE_ID_LOCAL_STATE_PATH } from './BrowserTruthDeviceIdentityCaches';

type IdentityEvidenceFilePort = Pick<
  IFileService,
  'hasPluginDataEntries' | 'readTempLocalJSON' | 'readInstallationIdentityText'
>;

export class SiyuanTruthDeviceIdentityEvidenceProbe implements TruthDeviceIdentityEvidenceProbePort {
  constructor(
    private readonly fileService: IdentityEvidenceFilePort,
    private readonly now: () => number = Date.now,
  ) {}

  async probeEvidence(): Promise<TruthDeviceIdentityInstallationEvidence> {
    if (
      !this.fileService.hasPluginDataEntries
      || !this.fileService.readTempLocalJSON
      || !this.fileService.readInstallationIdentityText
    ) {
      return {
        status: 'unavailable',
        reasons: [],
        checkedAt: this.now(),
        error: 'installation identity evidence APIs unavailable',
      };
    }

    try {
      const [truth, delta, tempIdentity, previousAuthority] = await Promise.all([
        this.fileService.hasPluginDataEntries('truth'),
        this.fileService.hasPluginDataEntries('sqlite-delta/v2'),
        this.fileService.readTempLocalJSON<unknown>(TRUTH_DEVICE_ID_LOCAL_STATE_PATH),
        this.fileService.readInstallationIdentityText(TRUTH_DEVICE_IDENTITY_PREVIOUS_AUTHORITY_FILE),
      ]);
      const reasons: string[] = [];
      if (truth) reasons.push('canonical-truth-or-frontier');
      if (delta) reasons.push('sqlite-delta');
      if (tempIdentity != null) reasons.push('temp-local-identity');
      if (previousAuthority != null) reasons.push('previous-authority-recovery-evidence');
      return {
        status: reasons.length > 0 ? 'non-empty' : 'empty',
        reasons,
        checkedAt: this.now(),
        error: null,
      };
    } catch (error) {
      return {
        status: 'unavailable',
        reasons: [],
        checkedAt: this.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
