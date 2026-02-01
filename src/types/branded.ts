/**
 * Branded Types Module
 * 
 * Provides type-safe ID handling using the Branded Type pattern.
 * Branded Types prevent accidental mixing of different ID types at compile time.
 * 
 * ## Design Principles
 * - **Type safety**: Different ID types cannot be mixed at compile time
 * - **Zero runtime cost**: Branding is purely a compile-time construct
 * - **Explicit conversion**: IDs must be created through factory functions
 * - **Nominal typing**: IDs are distinguished by their brand, not their structure
 * 
 * ## Usage Examples
 * 
 * ### Basic Usage
 * ```typescript
 * // Create IDs using factory functions
 * const blockId = createBlockID('20240101120000-abc123');
 * const cardId = createCardID('card-456');
 * 
 * // Type-safe function calls
 * function getBlock(id: BlockID): Block {
 *   // ...
 * }
 * 
 * getBlock(blockId);  // ✅ OK
 * getBlock(cardId);   // ❌ Compile error: CardID is not assignable to BlockID
 * getBlock('20240101120000-abc123');  // ❌ Compile error: string is not assignable to BlockID
 * ```
 * 
 * ### With Interfaces
 * ```typescript
 * interface QueueItem {
 *   blockID: BlockID;
 *   // ...
 * }
 * 
 * interface ReviewCard extends QueueItem {
 *   cardID: CardID;
 *   // ...
 * }
 * ```
 * 
 * ### Type Guards
 * ```typescript
 * function isBlockID(value: string): value is BlockID {
 *   // Validate format if needed
 *   return /^\d{14}-[a-z0-9]{7}$/.test(value);
 * }
 * 
 * const id = '20240101120000-abc123';
 * if (isBlockID(id)) {
 *   const blockId: BlockID = id;  // Safe cast after validation
 * }
 * ```
 * 
 * ## Requirement Validation
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
 * - 10.1: THE System SHALL define BlockID as a branded string type
 * - 10.2: THE System SHALL define CardID as a branded string type
 * - 10.3: WHEN calling functions with ID parameters, THE System SHALL enforce correct ID types at compile time
 * - 10.4: THE System SHALL provide factory functions to create branded IDs from strings
 * - 10.5: THE System SHALL prevent passing CardID where BlockID is expected and vice versa
 * 
 * @module branded
 */

/**
 * Branded Type for Block IDs
 * 
 * Represents a unique identifier for a SiYuan block.
 * The brand prevents mixing BlockID with other string types.
 * 
 * ## Format
 * SiYuan block IDs typically follow the format: `YYYYMMDDHHMMSS-xxxxxxx`
 * where `xxxxxxx` is a 7-character alphanumeric string.
 * 
 * @example
 * ```typescript
 * const blockId: BlockID = createBlockID('20240101120000-abc123');
 * ```
 */
export type BlockID = string & { readonly __brand: 'BlockID' };

/**
 * Branded Type for Card IDs
 * 
 * Represents a unique identifier for a flashcard.
 * The brand prevents mixing CardID with other string types.
 * 
 * ## Format
 * Card IDs can be any string format, but are typically UUIDs or
 * sequential identifiers.
 * 
 * @example
 * ```typescript
 * const cardId: CardID = createCardID('card-123');
 * ```
 */
export type CardID = string & { readonly __brand: 'CardID' };

/**
 * Branded Type for Xiuyuan IDs
 * 
 * Represents a unique identifier for a Xiuyuan (card source).
 * The brand prevents mixing XiuyuanID with other string types.
 * 
 * ## Format
 * Xiuyuan IDs are typically UUIDs or sequential identifiers.
 * 
 * @example
 * ```typescript
 * const xiuyuanId: XiuyuanID = createXiuyuanID('xiuyuan-789');
 * ```
 */
export type XiuyuanID = string & { readonly __brand: 'XiuyuanID' };

/**
 * Creates a BlockID from a string
 * 
 * Factory function to create a branded BlockID from a raw string.
 * This is the only safe way to create a BlockID.
 * 
 * ## Validation
 * This function does NOT validate the format of the ID.
 * If you need validation, use a type guard function first.
 * 
 * @param id - The raw string ID
 * @returns A branded BlockID
 * 
 * @example
 * ```typescript
 * const blockId = createBlockID('20240101120000-abc123');
 * ```
 */
export function createBlockID(id: string): BlockID {
    return id as BlockID;
}

/**
 * Creates a CardID from a string
 * 
 * Factory function to create a branded CardID from a raw string.
 * This is the only safe way to create a CardID.
 * 
 * @param id - The raw string ID
 * @returns A branded CardID
 * 
 * @example
 * ```typescript
 * const cardId = createCardID('card-456');
 * ```
 */
export function createCardID(id: string): CardID {
    return id as CardID;
}

/**
 * Creates a XiuyuanID from a string
 * 
 * Factory function to create a branded XiuyuanID from a raw string.
 * This is the only safe way to create a XiuyuanID.
 * 
 * @param id - The raw string ID
 * @returns A branded XiuyuanID
 * 
 * @example
 * ```typescript
 * const xiuyuanId = createXiuyuanID('xiuyuan-789');
 * ```
 */
export function createXiuyuanID(id: string): XiuyuanID {
    return id as XiuyuanID;
}

/**
 * Unwraps a BlockID to a raw string
 * 
 * Converts a branded BlockID back to a plain string.
 * Use this when you need to pass the ID to APIs that expect strings.
 * 
 * @param id - The branded BlockID
 * @returns The raw string ID
 * 
 * @example
 * ```typescript
 * const blockId = createBlockID('20240101120000-abc123');
 * const rawId = unwrapBlockID(blockId);  // '20240101120000-abc123'
 * ```
 */
export function unwrapBlockID(id: BlockID): string {
    return id as string;
}

/**
 * Unwraps a CardID to a raw string
 * 
 * Converts a branded CardID back to a plain string.
 * Use this when you need to pass the ID to APIs that expect strings.
 * 
 * @param id - The branded CardID
 * @returns The raw string ID
 * 
 * @example
 * ```typescript
 * const cardId = createCardID('card-456');
 * const rawId = unwrapCardID(cardId);  // 'card-456'
 * ```
 */
export function unwrapCardID(id: CardID): string {
    return id as string;
}

/**
 * Unwraps a XiuyuanID to a raw string
 * 
 * Converts a branded XiuyuanID back to a plain string.
 * Use this when you need to pass the ID to APIs that expect strings.
 * 
 * @param id - The branded XiuyuanID
 * @returns The raw string ID
 * 
 * @example
 * ```typescript
 * const xiuyuanId = createXiuyuanID('xiuyuan-789');
 * const rawId = unwrapXiuyuanID(xiuyuanId);  // 'xiuyuan-789'
 * ```
 */
export function unwrapXiuyuanID(id: XiuyuanID): string {
    return id as string;
}

/**
 * Type guard to check if a string is a valid BlockID format
 * 
 * Validates that a string matches the expected SiYuan block ID format.
 * Use this before creating a BlockID from untrusted input.
 * 
 * @param value - The string to validate
 * @returns True if the string is a valid BlockID format
 * 
 * @example
 * ```typescript
 * const id = '20240101120000-abc123';
 * if (isValidBlockIDFormat(id)) {
 *   const blockId = createBlockID(id);  // Safe
 * }
 * ```
 */
export function isValidBlockIDFormat(value: string): boolean {
    // SiYuan block ID format: YYYYMMDDHHMMSS-xxxxxxx
    return /^\d{14}-[a-z0-9]{7}$/.test(value);
}

/**
 * Converts an array of strings to an array of BlockIDs
 * 
 * Convenience function to convert multiple strings to BlockIDs at once.
 * 
 * @param ids - Array of raw string IDs
 * @returns Array of branded BlockIDs
 * 
 * @example
 * ```typescript
 * const blockIds = createBlockIDs(['20240101120000-abc123', '20240101120001-def456']);
 * ```
 */
export function createBlockIDs(ids: string[]): BlockID[] {
    return ids.map(createBlockID);
}

/**
 * Converts an array of strings to an array of CardIDs
 * 
 * Convenience function to convert multiple strings to CardIDs at once.
 * 
 * @param ids - Array of raw string IDs
 * @returns Array of branded CardIDs
 * 
 * @example
 * ```typescript
 * const cardIds = createCardIDs(['card-1', 'card-2', 'card-3']);
 * ```
 */
export function createCardIDs(ids: string[]): CardID[] {
    return ids.map(createCardID);
}

/**
 * Converts an array of strings to an array of XiuyuanIDs
 * 
 * Convenience function to convert multiple strings to XiuyuanIDs at once.
 * 
 * @param ids - Array of raw string IDs
 * @returns Array of branded XiuyuanIDs
 * 
 * @example
 * ```typescript
 * const xiuyuanIds = createXiuyuanIDs(['xiuyuan-1', 'xiuyuan-2']);
 * ```
 */
export function createXiuyuanIDs(ids: string[]): XiuyuanID[] {
    return ids.map(createXiuyuanID);
}
