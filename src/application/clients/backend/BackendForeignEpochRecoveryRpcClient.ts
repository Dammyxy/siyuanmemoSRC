import type {
  BackendForeignEpochRecoveryApplyRequest,
  BackendForeignEpochRecoveryApplyResult,
  BackendForeignEpochRecoveryPreviewRequest,
  BackendForeignEpochRecoveryPreviewResult,
  BackendForeignEpochRecoveryStatusRequest,
  BackendForeignEpochRecoveryStatusResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export class BackendForeignEpochRecoveryRpcClient {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  preview(
    request: BackendForeignEpochRecoveryPreviewRequest = {},
  ): Promise<BackendForeignEpochRecoveryPreviewResult> {
    return this.rpcCaller.call('recovery.foreignEpoch.preview', request);
  }

  apply(
    request: BackendForeignEpochRecoveryApplyRequest,
  ): Promise<BackendForeignEpochRecoveryApplyResult> {
    return this.rpcCaller.call('recovery.foreignEpoch.apply', request);
  }

  status(
    request: BackendForeignEpochRecoveryStatusRequest = {},
  ): Promise<BackendForeignEpochRecoveryStatusResult> {
    return this.rpcCaller.call('recovery.foreignEpoch.status', request);
  }
}
