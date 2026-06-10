import { describe, expect, it } from 'vitest';
import {
  BACKEND_RPC_METHODS,
  BACKEND_RPC_METHOD_CONTRACT_BY_METHOD,
} from '../../../../packages/contracts/src/backend-rpc';
import { LEGACY_BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS } from '../../../../worker/bootstrap/rpc/BackendRpcRegistry';
import { SRS_BACKEND_CLIENT_METHOD_CATALOG } from '../backendRpcClientCatalog';

describe('SrsBackendClient method catalog', () => {
  it('maps every client-exposed backend RPC method to a registered worker handler', () => {
    const registeredMethods = new Set(
      LEGACY_BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS.map((entry) => entry.method),
    );
    const exposedMethods = new Set(SRS_BACKEND_CLIENT_METHOD_CATALOG.map((entry) => entry.rpcMethod));

    expect([...exposedMethods].filter((method) => !BACKEND_RPC_METHODS.includes(method))).toEqual([]);
    expect([...exposedMethods].filter((method) => !registeredMethods.has(method))).toEqual([]);

    const facadeMethods = BACKEND_RPC_METHODS.filter((method) => (
      BACKEND_RPC_METHOD_CONTRACT_BY_METHOD[method].clientExposure === 'facade'
    ));
    expect(facadeMethods.filter((method) => !exposedMethods.has(method))).toEqual([]);
  });

  it('keeps catalog family metadata aligned with the backend RPC contract catalog', () => {
    expect(SRS_BACKEND_CLIENT_METHOD_CATALOG.map((entry) => ({
      rpcMethod: entry.rpcMethod,
      family: entry.family,
    }))).toEqual(SRS_BACKEND_CLIENT_METHOD_CATALOG.map((entry) => ({
      rpcMethod: entry.rpcMethod,
      family: BACKEND_RPC_METHOD_CONTRACT_BY_METHOD[entry.rpcMethod].family,
    })));
  });
});
