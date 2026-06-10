import { describe, expect, it } from 'vitest';
import { BACKEND_RPC_METHODS } from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS,
  createBackendRpcHandlerRegistry,
  findDuplicateBackendRpcHandlerMethods,
  validateBackendRpcHandlerRegistry,
} from '../rpc/BackendRpcRegistry';

describe('BackendRpcRegistry foundation', () => {
  it('registers exactly one current handler owner for every backend RPC method', () => {
    expect(validateBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS)).toEqual([]);

    const registry = createBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS);
    expect(registry.handlersByMethod.size).toBe(BACKEND_RPC_METHODS.length);
    expect(BACKEND_RPC_METHODS.every((method) => registry.handlersByMethod.has(method))).toBe(true);
  });

  it('rejects duplicate handler registrations for one backend RPC method', () => {
    const duplicateEntry = {
      ...BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS[0],
      owner: 'duplicate-current-family',
    };
    const entries = [
      ...BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS,
      duplicateEntry,
    ];

    expect(findDuplicateBackendRpcHandlerMethods(entries)).toEqual([{
      type: 'duplicate-method',
      method: 'system.health',
      owners: ['BackendCoreRpcAdapter', 'duplicate-current-family'],
    }]);
    expect(() => createBackendRpcHandlerRegistry(entries))
      .toThrow('Duplicate backend RPC handler registration: system.health');
  });

  it('reports family mismatches instead of hiding incorrect family ownership', () => {
    const mismatchedEntry = {
      ...BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS[0],
      family: 'browser' as const,
    };

    expect(validateBackendRpcHandlerRegistry([
      mismatchedEntry,
      ...BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS.slice(1),
    ])).toEqual([{
      type: 'family-mismatch',
      method: 'system.health',
      expectedFamily: 'core',
      actualFamily: 'browser',
      owners: ['BackendCoreRpcAdapter'],
    }]);
  });
});
