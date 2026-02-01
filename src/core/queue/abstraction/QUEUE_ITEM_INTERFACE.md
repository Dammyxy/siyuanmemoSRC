# QueueItem Base Interface

## Overview

The `QueueItem` interface is the foundational type for all items managed by the queue system. It defines the minimum required fields that every queue item must have, with the `blockID` field being mandatory to ensure proper identification and tracking.

## Purpose

1. **Type Safety**: Provides compile-time type checking to prevent missing required fields
2. **Consistency**: Ensures all queue items have a consistent base structure
3. **Flexibility**: Allows optional fields for different queue types while maintaining a common foundation
4. **Extensibility**: Supports custom metadata through the `meta` field

## Requirements

**Validates: Requirement 6.1**
> THE System SHALL define a QueueItem interface requiring blockID field

## Interface Definition

```typescript
export interface QueueItem {
  // Identity Fields (Required)
  cardID: string;
  blockID: string;    // ← Required field (Requirement 6.1)
  deckID: string;
  priority: number;
  
  // Riff Native Fields (Optional)
  nextDues?: Record<1 | 2 | 3 | 4, string>;
  
  // FSRS Scheduling Fields (Optional)
  state?: number;
  stability?: number;
  difficulty?: number;
  reps?: number;
  lapses?: number;
  lastReview?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  
  // Extension Fields (Optional)
  updatedAt?: number;
  meta?: Record<string, unknown>;
}
```

## Required Fields

### blockID (Required)

The `blockID` field is **mandatory** for all queue items. This ensures:

- **Unique Identification**: Every item can be uniquely identified in the SiYuan notes system
- **Tracking**: Items can be tracked throughout their lifecycle
- **Data Integrity**: Prevents orphaned or unidentifiable items
- **Type Safety**: TypeScript enforces this requirement at compile time

```typescript
// ✅ Valid - has blockID
const validItem: QueueItem = {
  cardID: 'card-123',
  blockID: 'block-123',  // Required!
  deckID: 'deck-123',
  priority: 50,
};

// ❌ Invalid - missing blockID (TypeScript error)
const invalidItem: QueueItem = {
  cardID: 'card-123',
  // blockID: missing!  // Compile error!
  deckID: 'deck-123',
  priority: 50,
};
```

## Usage Examples

### Basic Queue Item

```typescript
import type { QueueItem } from '../types';

// Create a minimal queue item
const item: QueueItem = {
  cardID: 'card-123',
  blockID: 'block-123',
  deckID: 'deck-123',
  priority: 50,
};
```

### Queue Item with FSRS Scheduling

```typescript
// Create a queue item with FSRS scheduling information
const scheduledItem: QueueItem = {
  cardID: 'card-456',
  blockID: 'block-456',
  deckID: 'deck-123',
  priority: 50,
  
  // FSRS fields
  state: 2,              // CardState.Review
  stability: 10.5,
  difficulty: 5.2,
  reps: 3,
  lapses: 0,
  lastReview: Date.now() - 86400000,  // 1 day ago
  elapsedDays: 1,
  scheduledDays: 3,
};
```

### Queue Item with Custom Metadata

```typescript
// Create a queue item with custom metadata
const itemWithMeta: QueueItem = {
  cardID: 'card-789',
  blockID: 'block-789',
  deckID: 'deck-123',
  priority: 50,
  
  // Custom metadata
  meta: {
    source: 'manual-import',
    tags: ['important', 'review-soon'],
    customField: 'custom value',
  },
};
```

### Using QueueItem in Functions

```typescript
// Function that requires QueueItem
function processItem(item: QueueItem): void {
  console.log(`Processing block: ${item.blockID}`);
  
  // blockID is guaranteed to exist
  if (item.state !== undefined) {
    console.log(`Card state: ${item.state}`);
  }
}

// Function that works with arrays of QueueItems
function getBlockIDs(items: QueueItem[]): string[] {
  return items.map(item => item.blockID);
}
```

## Relationship with Other Interfaces

### ReviewCard

`ReviewCard` extends `QueueItem` and makes all FSRS scheduling fields required:

```typescript
export interface ReviewCard extends QueueItem {
  blockID: string;      // Still required
  due: number;          // Now required (was optional in QueueItem)
  lapses: number;       // Now required
  state: CardState;     // Now required
  stability: number;    // Now required
  difficulty: number;   // Now required
  // ... other required fields
}
```

### Generic Queue Interfaces

Queue interfaces use `QueueItem` as a type constraint:

```typescript
// Future implementation (Phase 1, Task 5.2)
interface IQueue<TItem extends QueueItem> {
  next(): Promise<TItem | null>;
  getAllCards(): Promise<TItem[]>;
}
```

## Design Decisions

### Why is blockID Required?

1. **System Integration**: SiYuan notes uses block IDs as the primary identifier
2. **Data Consistency**: Every queue item must be traceable to a source block
3. **Error Prevention**: Compile-time enforcement prevents missing IDs
4. **Future-Proofing**: Supports future features that rely on block identification

### Why are FSRS Fields Optional?

1. **Flexibility**: Not all queue types need FSRS scheduling (e.g., neural roam)
2. **Progressive Enhancement**: Items can start minimal and add fields as needed
3. **Backward Compatibility**: Existing code can gradually adopt FSRS fields
4. **Type Hierarchy**: Specific interfaces like `ReviewCard` can make fields required

### Why Include a Meta Field?

1. **Extensibility**: Allows custom data without modifying the base interface
2. **Plugin Support**: Third-party plugins can add custom fields
3. **Future Features**: New features can use meta without breaking changes
4. **Type Safety**: Still maintains type safety through `Record<string, unknown>`

## Testing

The interface is validated through comprehensive unit tests:

```typescript
// See: src/core/queue/__tests__/QueueItem.test.ts

describe('QueueItem Interface', () => {
  it('should require blockID field', () => {
    const item: QueueItem = {
      cardID: 'card-123',
      blockID: 'block-123',  // Required
      deckID: 'deck-123',
      priority: 50,
    };
    
    expect(item.blockID).toBe('block-123');
  });
});
```

## Future Enhancements

### Phase 2: Branded Types (Task 11)

In Phase 2, the `blockID` field will be upgraded to use Branded Types for additional type safety:

```typescript
// Future implementation
type BlockID = string & { readonly __brand: 'BlockID' };

export interface QueueItem {
  blockID: BlockID;  // Branded type prevents mixing with other string types
  // ... other fields
}
```

This will prevent accidentally passing a `cardID` where a `blockID` is expected.

## References

- **Requirement 6.1**: QueueItem interface requiring blockID field
- **Design Document**: Section 2 - Type Safety Interfaces
- **Test File**: `src/core/queue/__tests__/QueueItem.test.ts`
- **Related Interfaces**: `ReviewCard`, `IQueue`, `ISequencer`

## See Also

- [Trait Pattern](./TRAIT_PATTERN.md) - How queues implement optional capabilities
- [Observer Pattern](./OBSERVER_PATTERN.md) - How data changes are propagated
- [Queue Strategy](./Strategy.ts) - How queues implement different behaviors
