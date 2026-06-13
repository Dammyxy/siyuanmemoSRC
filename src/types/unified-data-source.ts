/**
 * Compatibility barrel for unified data-source contracts.
 *
 * New code should prefer the caller-oriented modules under
 * `@/types/unified-data-source/*`. Keep this path available while callers
 * migrate in bounded slices.
 */

export * from './unified-data-source/browser-contracts';
export * from './unified-data-source/data-router';
export * from './unified-data-source/errors';
export * from './unified-data-source/manager-facade';
export * from './unified-data-source/neural-roam-session';
export * from './unified-data-source/queue-core';
export * from './unified-data-source/queue-projection';
