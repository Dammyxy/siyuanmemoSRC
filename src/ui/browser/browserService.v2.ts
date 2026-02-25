/**
 * browserService v2 compatibility facade.
 *
 * DDD normalization:
 * - Keep a single browser service implementation source of truth.
 * - Preserve legacy import paths while avoiding duplicate maintenance.
 */
export * from './browserService';
