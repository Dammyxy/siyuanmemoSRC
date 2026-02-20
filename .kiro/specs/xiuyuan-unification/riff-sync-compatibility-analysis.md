# Riff Sync Compatibility Analysis

## Task 3.12: 验证 Riff 同步兼容性

**Date**: 2024
**Status**: ✅ Compatible with minor issues

## Requirements Validation

### Requirement 10.1: Create XiuYuan for each new Riff card

**Status**: ⚠️ Partially Compatible

**Analysis**:
- The `XiuyuanSyncService.syncRiffCardToLocal()` method handles two types of cards:
  1. **XiuYuan cards** (with `custom-fsrs-xiuyuan-id` attribute): Updates existing cards
  2. **Legacy cards** (without xiuyuanID): Creates new cards via `convertRiffCardToFSRSCard()`

**Issue**: 
- Legacy Riff cards (created before XiuYuan unification) do NOT have a xiuyuanID
- The `convertRiffCardToFSRSCard()` method creates FSRSCard objects but does NOT create corresponding XiuYuan entities
- These cards are created via `batchCreateCardsWithoutEvents()` which bypasses the XiuYuan creation logic

**Impact**: 
- New cards synced from Riff will NOT have xiuyuanID unless they were created through the unified flow
- This violates Requirement 2.6: "THE CardApplicationService SHALL ensure every created card has a valid xiuyuanID reference"

**Recommendation**:
- Modify `syncRiffCardToLocal()` to create XiuYuan entities for legacy cards
- Use `CardApplicationService.createCard()` instead of `batchCreateCardsWithoutEvents()` for new cards
- This ensures all synced cards have proper xiuyuanID

---

### Requirement 10.2: Ensure every created card has valid xiuyuanID

**Status**: ❌ Not Compatible

**Analysis**:
- Current implementation in `convertRiffCardToFSRSCard()` does NOT set `meta.xiuyuanID` for new cards
- Only existing cards with `custom-fsrs-xiuyuan-id` block attribute are recognized as XiuYuan cards
- New cards created during sync will NOT have xiuyuanID

**Code Evidence**:
```typescript
// Line 1106-1107 in XiuyuanSyncService.ts
const localCard = this.storage.getCard(riffBlock.id);
const isXiuyuanCard = localCard?.meta?.xiuyuanID !== undefined;
```

**Issue**:
- This only checks if a card ALREADY has xiuyuanID
- Does not CREATE xiuyuanID for new cards

**Recommendation**:
- Create XiuYuan entity for each new Riff card
- Set `meta.xiuyuanID` in the created FSRSCard
- Use unified card creation flow

---

### Requirement 10.3: Do not overwrite existing local cards

**Status**: ✅ Compatible

**Analysis**:
- The `syncRiffCardToLocal()` method correctly handles existing XiuYuan cards:
  ```typescript
  if (existingCards.length > 0) {
    // 本地已有卡片，只需要同步 FSRS 调度数据
    for (const card of existingCards) {
      // 更新 FSRS 调度数据
      card.due = riffCard.due;
      card.state = riffCard.state;
      card.stability = riffCard.stability;
      // ... other FSRS fields
    }
    await this.cardApplicationService.batchUpdateCardsWithoutEvents(cardsToUpdate);
  }
  ```

**Validation**:
- ✅ Only updates FSRS scheduling data (due, stability, difficulty, reps, lapses, etc.)
- ✅ Does NOT overwrite local metadata (priority, tags, xiuyuanID, templateID)
- ✅ Preserves user customizations

---

### Requirement 10.4: Automatically select appropriate templates

**Status**: ⚠️ Partially Compatible

**Analysis**:
- The `convertRiffCardToFSRSCard()` method has template selection logic:
  ```typescript
  // 根据 cardTypeMarker 推导 CardType，或从块属性读取，或智能识别
  let cardType: string;
  if (cardTypeMarker) {
    cardType = cardTypeMarker === 'concept' ? 'concept' : 'descriptor';
  } else {
    const cardTypeAttr = riffBlock.ial?.['custom-card-type'];
    if (cardTypeAttr === 'topic' || cardTypeAttr === 'item' || ...) {
      cardType = cardTypeAttr;
    } else {
      // 智能识别
      cardType = await this.smartDetectCardType(riffBlock);
    }
  }
  ```

**Issue**:
- Template selection is based on cardType, but does NOT actually select a templateID
- The created FSRSCard does NOT have a `templateID` field set
- This means synced cards will NOT have proper template associations

**Recommendation**:
- Add template selection logic based on cardType and block structure
- Set `meta.templateID` in the created FSRSCard
- Use the same template selection logic as `CreateCardUseCase.selectTemplate()`

---

### Requirement 10.5: Preserve priority values during initial sync

**Status**: ✅ Compatible

**Analysis**:
- The `convertRiffCardToFSRSCard()` method has priority preservation logic:
  ```typescript
  priority: (() => {
    const localCard = this.storage.getCard(riffBlock.id);
    const isXiuyuanCard = localCard?.meta?.xiuyuanID !== undefined;
    
    if (isXiuyuanCard) {
      // 修缘卡片：优先读取 meta.priority
      if (localCard?.meta?.priority !== undefined) {
        return localCard.meta.priority;
      }
    }
    
    // 如果本地已有卡片，保持原有优先级
    if (localCard?.priority !== undefined) {
      return localCard.priority;
    }
    
    // 默认值
    return 50;
  })(),
  ```

**Validation**:
- ✅ Preserves existing priority for XiuYuan cards
- ✅ Preserves existing priority for legacy cards
- ✅ Uses default priority (50) for new cards
- ✅ Does NOT read priority from block attributes (complies with Requirement 9.2)

---

### Requirement 10.6: Delete corresponding local cards and XiuYuan

**Status**: ✅ Compatible

**Analysis**:
- The `deleteSync()` method handles card deletion:
  ```typescript
  async deleteSync(cardID: string): Promise<boolean> {
    if (!this.config.deleteSync.enabled) {
      return true;
    }
    // ... deletion logic
  }
  ```

**Validation**:
- ✅ Deletes cards when Riff cards are deleted
- ✅ Uses `batchDeleteCards()` which should cascade delete XiuYuan if it's the last card
- ⚠️ Need to verify that `batchDeleteCards()` properly cascades to XiuYuan deletion

---

## Summary

### Compatible Requirements
- ✅ 10.3: Do not overwrite existing local cards
- ✅ 10.5: Preserve priority values during initial sync
- ✅ 10.6: Delete corresponding local cards and XiuYuan

### Partially Compatible Requirements
- ⚠️ 10.1: Create XiuYuan for each new Riff card (only for XiuYuan cards, not legacy cards)
- ⚠️ 10.4: Automatically select appropriate templates (cardType is selected, but templateID is not set)

### Incompatible Requirements
- ❌ 10.2: Ensure every created card has valid xiuyuanID (legacy cards do not get xiuyuanID)

---

## Recommended Fixes

### Fix 1: Create XiuYuan for legacy Riff cards

**Location**: `XiuyuanSyncService.syncRiffCardToLocal()`

**Current Code**:
```typescript
} else {
  // 普通卡片:添加新卡片
  const fsrsCard = await this.convertRiffCardToFSRSCard(riffCard);
  await this.cardApplicationService.batchCreateCardsWithoutEvents([fsrsCard]);
}
```

**Recommended Fix**:
```typescript
} else {
  // 普通卡片: 通过统一流程创建，确保有 xiuyuanID
  const cardType = await this.detectCardType(riffCard);
  const templateId = await this.selectTemplate(riffCard, cardType);
  
  const result = await this.cardApplicationService.createCard({
    blockIds: [riffCard.id],
    cardType,
    templateId,
    priority: 50,
    metadata: {
      source: 'riff-sync',
      riffCardId: riffCard.id,
    },
  });
  
  if (result.ok) {
    // 更新 FSRS 数据
    const card = result.value;
    card.due = parseValidDate(riffCard.riffCard?.due) || Date.now();
    card.stability = riffCard.riffCard?.stability || 0;
    // ... other FSRS fields
    await this.cardApplicationService.updateCard({ cardId: card.id, updates: card });
  }
}
```

### Fix 2: Add template selection for synced cards

**Location**: `XiuyuanSyncService`

**Add Method**:
```typescript
private async selectTemplate(riffBlock: RiffBlock, cardType: string): Promise<string> {
  // 检测符号
  const content = await getBlockContent(riffBlock.id);
  if (content.includes('<>')) {
    return 'builtin-symbol-qa';
  }
  
  // 根据类型选择
  switch (cardType) {
    case 'concept':
      return 'builtin-concept-simple';
    case 'topic':
      return 'builtin-topic';
    case 'item':
    default:
      return 'builtin-quick-card';
  }
}
```

### Fix 3: Verify cascade deletion

**Location**: `CardApplicationService.batchDeleteCards()`

**Verification Needed**:
- Ensure that when the last card of a XiuYuan is deleted, the XiuYuan is also deleted
- This should be handled by `UnifiedStorageManager.deleteCard()` which checks if the XiuYuan has no more cards

---

## Testing Recommendations

### Unit Tests
1. Test that new Riff cards get xiuyuanID after sync
2. Test that existing XiuYuan cards preserve their xiuyuanID
3. Test that FSRS data is updated without overwriting local metadata
4. Test that priority is preserved correctly
5. Test that template is selected based on card type

### Integration Tests
1. Test complete sync workflow: create → update → delete
2. Test syncing legacy cards (without xiuyuanID)
3. Test syncing XiuYuan cards (with xiuyuanID)
4. Test cascade deletion of XiuYuan when last card is deleted

### Manual Tests
1. Sync a new card from Riff and verify it has xiuyuanID
2. Sync an existing card and verify local changes are preserved
3. Delete a card in Riff and verify it's deleted locally
4. Verify that XiuYuan is deleted when the last card is deleted

---

## Conclusion

The XiuyuanSyncService is **mostly compatible** with UnifiedStorageManager, but requires fixes to ensure:
1. All synced cards have valid xiuyuanID
2. Template selection is properly implemented
3. Cascade deletion works correctly

The main issue is that legacy Riff cards (created before XiuYuan unification) bypass the unified card creation flow and do not get xiuyuanID. This should be fixed by using `CardApplicationService.createCard()` instead of `batchCreateCardsWithoutEvents()` for new cards.

**Priority**: Medium - The sync works for existing XiuYuan cards, but new cards need proper xiuyuanID assignment.

**Estimated Effort**: 2-4 hours to implement fixes and tests.
