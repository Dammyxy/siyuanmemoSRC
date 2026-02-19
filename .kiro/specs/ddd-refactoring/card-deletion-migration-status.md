# Card Deletion Migration Status

## Overview

This document tracks the migration of card deletion functionality from direct service calls to the new DDD architecture using `CardApplicationService.deleteCard()`.

**Last Updated**: Task 15.3 execution
**Status**: Partially Complete - Core deletion migrated, some legacy paths remain

---

## Migration Summary

### ✅ Migrated to CardApplicationService

#### 1. BlockMenuHandler (`src/services/BlockMenuHandler.ts`)

**Status**: ✅ Fully migrated with fallback

**Migration Details**:
- Line ~300-335: Uses `CardApplicationService.deleteCard()` when ApplicationContext is available
- Falls back to `batchDelete()` for backward compatibility
- Properly handles success/failure counts
- Shows appropriate user messages

**Code Pattern**:
```typescript
const cardService = this.getCardService();
if (cardService) {
  // New architecture: Use CardApplicationService
  const result = await cardService.deleteCard({ cardId: card.id });
} else {
  // Old architecture: Fallback to batchDelete
  const deleted = await batchDelete(blockIds, this.deps.storage);
}
```

#### 2. SRSBrowser Datasources

**Status**: ✅ Migrated (Task 15.2)

**Files**:
- `src/ui/browser/datasource/FinalDrillDataSource.ts`
- `src/ui/browser/datasource/FilterGroupDataSource.ts`
- `src/ui/browser/datasource/IncrementalLearningDataSource.ts`
- `src/ui/browser/datasource/RetrievalDataSource.ts`

**Note**: These datasources use `queue.removeCard()` which removes cards from queues, not permanent deletion. This is different from card deletion and doesn't need migration.

---

## 🔄 Partially Migrated / Infrastructure Code

### 1. batchDelete Function (`src/ui/browser/browserService.ts`)

**Status**: Infrastructure function, used as fallback

**Location**: Line ~1169-1190

**Current Implementation**:
- Uses `StorageManager.deleteCards(blockIds)`
- Updates card cache
- Returns count of deleted cards

**Migration Notes**:
- This is a utility function used by legacy code paths
- BlockMenuHandler uses it as fallback when ApplicationContext is not available
- Should remain for backward compatibility during migration period
- Can be deprecated once all callers are migrated

**Direct Calls From**:
- `BlockMenuHandler.ts` (line ~328) - As fallback only

### 2. StorageManager.deleteCards (`src/core/storage/manager.ts`)

**Status**: Low-level infrastructure, used by both old and new architecture

**Location**: Line ~193-233

**Responsibilities**:
1. Removes cards from local storage
2. Saves changes
3. Removes cards from Riff deck
4. Unmarks blocks as cards

**Migration Notes**:
- This is the actual implementation layer
- Used by both `batchDelete()` and potentially by Repository layer
- Should remain as infrastructure
- May be wrapped by Repository pattern in future

---

## ❌ Not Yet Migrated (Active Direct Calls)

### 1. CardService (`src/services/CardService.ts`)

**Status**: ❌ Legacy service, still using direct calls

**Location**: Line ~150-180

**Current Implementation**:
```typescript
await unmarkBlockAsCard(blockId);
this.plugin.storage.removeCard(cardId);
await this.plugin.storage.saveCards();
```

**Migration Strategy**:
- This is an old service that may be deprecated
- Check if it's still actively used
- If used, migrate to use CardApplicationService
- If not used, mark for removal in cleanup phase

**Usage Analysis Needed**:
- Search for `CardService` instantiation
- Check if `handleBlockIconClick` is still called
- Determine if this can be removed entirely

### 2. XiuyuanService.deleteXiuyuan (`src/core/xiuyuan/service.ts`)

**Status**: ❌ Legacy service, direct storage manipulation

**Location**: Line ~730-780

**Current Implementation**:
```typescript
// Deletes FSRSCards directly
for (const mapping of mappings) {
  this.storageManager.removeCard(mapping.cardID);
}
// Removes from Riff
await riffAPI.removeRiffCards(riffAPI.BUILTIN_DECK_ID, [representativeBlockID]);
// Clears block attributes
await setBlockAttrs(representativeBlockID, { ... });
// Deletes Xiuyuan
this.storage.deleteXiuyuan(id);
```

**Migration Strategy**:
- This service handles Xiuyuan-level deletion (deletes all cards in a Xiuyuan)
- Should be migrated to use Repository pattern
- May need a new use case: `DeleteXiuyuanUseCase`
- Or extend `DeleteCardUseCase` to handle Xiuyuan deletion

**Complexity**: High - involves multiple data sources and cleanup

### 3. HybridSyncService (`src/services/HybridSyncService.ts`)

**Status**: ❌ Sync service using direct storage calls

**Locations**:
- Line ~292: `this.storage.removeCard(card.id)` - During sync cleanup
- Line ~407: `this.storage.removeCard(card.id)` - Deleting cards not in Riff

**Current Implementation**:
```typescript
for (const card of cardsToDelete) {
  this.storage.removeCard(card.id);
  deletedCount++;
}
```

**Migration Strategy**:
- Sync operations may need batch deletion
- Consider adding `deleteCards(cardIds: string[])` to CardApplicationService
- Or use individual `deleteCard()` calls in a loop
- Need to handle sync-specific logic (don't sync deletions back to Riff)

**Priority**: Medium - sync is important but less frequently used

### 4. AdvancedDataRouter (`src/routers/AdvancedDataRouter.ts`)

**Status**: ❌ Router using direct storage calls

**Location**: Line ~189-192

**Current Implementation**:
```typescript
async deleteCard(cardId: string): Promise<void> {
  this.storage.removeCard(cardId);
  await this.storage.saveCards();
}
```

**Migration Strategy**:
- This router is part of the data routing layer
- Should delegate to CardApplicationService
- May need to inject ApplicationContext or CardApplicationService

**Priority**: Medium - part of data access layer

### 5. Queue removeCard Methods

**Status**: ⚠️ Different concern - queue management, not card deletion

**Locations**:
- `src/queues/FinalDrillQueue.ts` (line ~272)
- `src/queues/BaseReviewQueue.ts` (line ~357)
- Various datasources (MenuActions, FinalDrillDataSource, etc.)

**Current Implementation**:
```typescript
await this.removeCard(cardId);  // Removes from queue, not deletes card
```

**Migration Notes**:
- These methods remove cards from review queues, not delete them permanently
- This is queue management, not card deletion
- **No migration needed** - different concern
- Keep as-is for queue functionality

---

## Migration Blockers

### 1. Batch Deletion Support

**Issue**: CardApplicationService only supports single card deletion

**Current API**:
```typescript
deleteCard(command: DeleteCardCommand): Promise<Result<void>>
```

**Needed**:
```typescript
deleteCards(commands: DeleteCardCommand[]): Promise<Result<DeleteCardsResult>>
```

**Impact**:
- HybridSyncService needs batch deletion
- batchDelete function can't be fully replaced

**Solution**:
- Add batch deletion method to CardApplicationService
- Or: Use Promise.all() with individual deleteCard() calls
- Consider transaction support for atomicity

### 2. Xiuyuan-Level Deletion

**Issue**: No use case for deleting entire Xiuyuan (all cards)

**Current**: XiuyuanService.deleteXiuyuan() handles this

**Needed**:
- `DeleteXiuyuanUseCase` or
- Extend `DeleteCardUseCase` to handle Xiuyuan deletion

**Complexity**:
- Must delete all cards in Xiuyuan
- Must clean up Xiuyuan metadata
- Must handle Riff synchronization
- Must clear block attributes

### 3. Sync-Specific Deletion Logic

**Issue**: HybridSyncService has special deletion requirements

**Requirements**:
- Batch deletion for efficiency
- Don't trigger sync events (avoid infinite loops)
- Handle partial failures gracefully

**Solution**:
- Add sync-aware deletion flag to DeleteCardCommand
- Or: Create separate SyncApplicationService with its own deletion logic

---

## Recommended Migration Order

### Phase 1: Complete Core Migration (Priority: High)
- [x] Migrate BlockMenuHandler (Task 15.1) ✅
- [x] Migrate SRSBrowser datasources (Task 15.2) ✅
- [x] Document remaining direct calls (Task 15.3) ✅

### Phase 2: Extend CardApplicationService (Priority: High)
- [ ] Add batch deletion support
  - `deleteCards(commands: DeleteCardCommand[])`
  - Handle partial failures
  - Return detailed results
- [ ] Add Xiuyuan deletion support
  - Create `DeleteXiuyuanUseCase`
  - Or extend `DeleteCardUseCase`

### Phase 3: Migrate Remaining Services (Priority: Medium)
- [ ] Migrate CardService
  - Check if still used
  - If yes, migrate to CardApplicationService
  - If no, mark for removal
- [ ] Migrate AdvancedDataRouter
  - Inject CardApplicationService
  - Delegate deletion calls
- [ ] Migrate HybridSyncService
  - Use batch deletion API
  - Handle sync-specific logic

### Phase 4: Migrate XiuyuanService (Priority: Medium)
- [ ] Migrate XiuyuanService.deleteXiuyuan()
  - Use new DeleteXiuyuanUseCase
  - Or use Repository pattern
- [ ] Update all callers of deleteXiuyuan()

### Phase 5: Cleanup (Priority: Low)
- [ ] Deprecate batchDelete function
  - Add deprecation warning
  - Update all callers
- [ ] Remove unused services
  - CardService (if not used)
- [ ] Update documentation

---

## Testing Strategy

### Unit Tests Needed
- [x] DeleteCardUseCase ✅
- [x] CardApplicationService.deleteCard() ✅
- [ ] Batch deletion (when implemented)
- [ ] Xiuyuan deletion (when implemented)

### Integration Tests Needed
- [x] End-to-end card deletion ✅
- [ ] Batch deletion workflow
- [ ] Xiuyuan deletion workflow
- [ ] Sync service deletion

### Manual Tests Needed
- [~] Delete card from block menu (Task 15.4)
- [~] Delete card from SRS Browser (Task 15.4)
- [ ] Delete multiple cards (batch)
- [ ] Delete Xiuyuan (all cards)
- [ ] Sync service cleanup

---

## Direct Call Inventory

### Functions That Delete Cards

| Function | Location | Type | Status |
|----------|----------|------|--------|
| `CardApplicationService.deleteCard()` | `application/services/CardApplicationService.ts` | ✅ New Architecture | Implemented |
| `batchDelete()` | `ui/browser/browserService.ts:1169` | 🔄 Infrastructure | Used as fallback |
| `StorageManager.deleteCards()` | `core/storage/manager.ts:193` | 🔄 Infrastructure | Low-level implementation |
| `StorageManager.removeCard()` | `core/storage/manager.ts` | 🔄 Infrastructure | Low-level implementation |
| `unmarkBlockAsCard()` | `core/siyuan/block.ts:56` | 🔄 Infrastructure | Block attribute cleanup |

### Services That Call Delete Functions

| Service | Method | Calls | Status |
|---------|--------|-------|--------|
| BlockMenuHandler | handleDeleteCard | `CardApplicationService.deleteCard()` or `batchDelete()` | ✅ Migrated |
| CardService | handleBlockIconClick | `unmarkBlockAsCard()` + `storage.removeCard()` | ❌ Not migrated |
| XiuyuanService | deleteXiuyuan | `storageManager.removeCard()` + Riff API | ❌ Not migrated |
| HybridSyncService | syncFromRiff | `storage.removeCard()` | ❌ Not migrated |
| AdvancedDataRouter | deleteCard | `storage.removeCard()` | ❌ Not migrated |

### Queue Operations (Not Card Deletion)

| Queue | Method | Purpose | Migration Needed? |
|-------|--------|---------|-------------------|
| FinalDrillQueue | removeCard | Remove from queue | ❌ No - different concern |
| BaseReviewQueue | removeCard | Remove from queue | ❌ No - different concern |
| IncrementalLearningQueue | removeCard | Remove from queue | ❌ No - different concern |
| RetrievalPracticeQueue | removeCard | Remove from queue | ❌ No - different concern |

---

## TODO Comments to Add

### CardService.ts (Line ~150)
```typescript
// TODO: [DDD Migration] This service uses direct storage calls.
// Consider migrating to CardApplicationService.deleteCard() or deprecating this service.
// Check if handleBlockIconClick is still actively used before migration.
```

### XiuyuanService.ts (Line ~730)
```typescript
// TODO: [DDD Migration] This method uses direct storage manipulation.
// Should be migrated to use Repository pattern and DeleteXiuyuanUseCase.
// Complexity: High - involves multiple data sources and cleanup.
```

### HybridSyncService.ts (Line ~292, ~407)
```typescript
// TODO: [DDD Migration] Sync service uses direct storage calls.
// Needs batch deletion support in CardApplicationService.
// Consider sync-specific deletion logic to avoid infinite loops.
```

### AdvancedDataRouter.ts (Line ~189)
```typescript
// TODO: [DDD Migration] Router uses direct storage calls.
// Should delegate to CardApplicationService.deleteCard().
// Inject ApplicationContext or CardApplicationService.
```

### browserService.ts (Line ~1169)
```typescript
// TODO: [DDD Migration] This function is used as fallback during migration.
// Can be deprecated once all callers are migrated to CardApplicationService.
// Currently used by: BlockMenuHandler (fallback path)
```

---

## Notes

1. **Queue Operations vs Card Deletion**: Many `removeCard()` calls are for queue management, not permanent deletion. These don't need migration.

2. **Backward Compatibility**: BlockMenuHandler maintains fallback to `batchDelete()` for compatibility during migration.

3. **Infrastructure Layer**: `StorageManager.deleteCards()` and `unmarkBlockAsCard()` are low-level infrastructure and should remain.

4. **Batch Operations**: Need to add batch deletion support to CardApplicationService for efficient multi-card deletion.

5. **Xiuyuan Deletion**: Deleting a Xiuyuan (which deletes all its cards) needs a dedicated use case.

6. **Sync Considerations**: Sync service deletions may need special handling to avoid triggering sync events.

---

## Related Files

### New Architecture (DDD)
- `src/application/services/CardApplicationService.ts` - Application service
- `src/application/usecases/card/DeleteCardUseCase.ts` - Use case
- `src/core/xiuyuan/domain/services/CardDeletionService.ts` - Domain service
- `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` - Repository

### Migrated
- `src/services/BlockMenuHandler.ts` - ✅ Uses CardApplicationService
- `src/ui/browser/datasource/*.ts` - ✅ Queue operations (not deletion)

### Not Yet Migrated
- `src/services/CardService.ts` - ❌ Direct storage calls
- `src/core/xiuyuan/service.ts` - ❌ Direct storage calls
- `src/services/HybridSyncService.ts` - ❌ Direct storage calls
- `src/routers/AdvancedDataRouter.ts` - ❌ Direct storage calls

### Infrastructure
- `src/ui/browser/browserService.ts` - batchDelete function
- `src/core/storage/manager.ts` - StorageManager implementation
- `src/core/siyuan/block.ts` - Block attribute operations
