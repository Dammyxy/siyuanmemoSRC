import {
  TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
  type TruthDeviceIdentityRecordContract,
} from '../../../packages/contracts/src/backend-rpc';

export const TRUTH_DEVICE_IDENTITY_VERSION = TRUTH_DEVICE_IDENTITY_RECORD_VERSION;

export type TruthDeviceIdentityRecord = TruthDeviceIdentityRecordContract;

export interface TruthDeviceIdentityPort {
  readRecord(): Promise<unknown | null>;
  writeRecord(record: TruthDeviceIdentityRecord): Promise<void>;
}
