# Card Creation Migration Status

## Overview

This document tracks the migration of card creation functionality from direct service calls to the new DDD architecture using `CardApplicationService`.

**Last Updated**: Task 14.3 execution
**Status**: In Progress - Template-based creation not yet migrated

---

## Migration Summary

### ✅ Migrated to CardApplicationService

**None yet** - BlockMenuHandler and DialogManager have infrastructure in place but are not actively using CardApplicationService for card creation.

### 🔄 Partially Migrated (Infrastructure Ready)

#### 1. BlockMenuHandler (`src/services/BlockMenuHandler.ts`)

**Status**: Has `getCardService()` helper method but not actively using it

**Current Direct Calls**:
- Line ~950: `createDefaultCard()` + `StorageManager.setCard()` for concept cards in `makeConceptAndAddToRoam()`
- Line ~850: Calls `createListTemplateCards()` from `@/core/xiuyuan/listTemplate`

**Migration Notes**:
- Has `getCardService()` method to access CardApplicationService
- Has `setApplicationContext()` method for dependency injection
- TODO comment at line ~950 mentions future migration to CardApplicationService
- Concept card creation needs a dedicated template (e.g., `builtin-concept-simple`)

#### 2. DialogManager (`src/application/managers/DialogManager.ts`)

**Status**: Has TODO comment but still using XiuyuanService

**Current Direct Calls**:
- Line ~464: `xiuyuanService.createFromBlocks()` for template-based card creation

**Migration Notes**:
- TODO comment at line 459: "Phase 4 Task 14.3 - 迁移到 CardApplicationService"
- Reason for not migrating yet:
  1. Template card creation involves complex field mapping
  2. CardApplicationService doesn't support template functionality yet
  3. Need to extend CreateCardCommand and CreateCardUseCase to support templates

---

## ❌ Not Yet Migrated (Active Direct Calls)

### 1. AutoCardHandler (`src/services/handlers/AutoCardHandler.ts`)

**Direct Calls to XiuyuanService.createFromBlocks()**:

| Line | Template | Purpose | Notes |
|------|----------|---------|-------|
| ~661 | `builtin-quick-bidirectional` | Quick bidirectional cards | Uses `<>` marker |
| ~778 | Dynamic temp template | Concept-definition cards | Creates temp template first |
| ~801 | `builtin-concept-definition` | Single concept definition | Standard template |
| ~961 | `builtin-concept-descriptor` | Concept descriptor cards | Links to existing concept |
| ~1203 | Dynamic temp template | Custom field mapping | Creates temp template first |
| ~1316 | `builtin-list-item` | List template cards | Multiple child items |

**Migration Strategy**:
- All calls use template-based creation
- Need to extend CardApplicationService to support:
  - Template selection
  - Field mapping
  - Dynamic template creation
  - Multiple card generation from single template

### 2. TransactionObserver (`src/core/box/TransactionObserver.ts`)

**Direct Calls**:
- Line ~340: `xiuyuanService.createFromBlocks()` for list template cards
  - Template: `builtin-list-item`
  - Used in transaction monitoring for automatic card creation

**Migration Strategy**:
- Similar to AutoCardHandler - needs template support
- Part of automatic card creation workflow

### 3. XiuyuanService (`src/core/xiuyuan/service.ts`)

**Direct Calls to Storage**:
- Line ~446: `this.storage.createXiuyuan()` - Creates Xiuyuan aggregate
- Line ~561: `this.storageManager.setCard()` - Creates FSRSCard

**Migration Notes**:
- This is the core service that implements template-based card creation
- Should eventually be replaced by domain services in the new architecture
- Currently used by all other components

### 4. MigrationService (`src/services/MigrationService.ts`)

**Direct Calls**:
- Line ~104: `this.storageManager.setCard()` - Updates card blockId during migration

**Migration Strategy**:
- This is a one-time migration utility
- Low priority for migration
- Can remain using direct storage access

### 5. List Template Helper (`src/core/xiuyuan/listTemplate.ts`)

**Direct Calls**:
- Line ~243: `storageManager.setCard()` - Creates FSRSCard for list items

**Migration Strategy**:
- Helper function for list template card creation
- Should be migrated along with template support in CardApplicationService

---

## Migration Blockers

### 1. Template Support Not Implemented

**Issue**: CardApplicationService doesn't support template-based card creation

**Required Changes**:
1. Extend `CreateCardCommand` to include:
   - `templateId?: string`
   - `fieldMapping?: Record<string, string>`
   - `generateMultiple?: boolean`

2. Extend `CreateCardUseCase` to:
   - Load template definition
   - Map fields to blocks
   - Generate multiple cards from single template
   - Handle card rules (front/back fields)

3. Add template management to CardApplicationService:
   - `createFromTemplate(command: CreateFromTemplateCommand)`
   - Template validation
   - Field mapping validation

### 2. Dynamic Template Creation

**Issue**: Some workflows create temporary templates on-the-fly

**Examples**:
- AutoCardHandler creates temp templates for custom field mappings
- Templates are registered with `xiuyuanService.createTemplate()`

**Required Changes**:
- Add template creation to CardApplicationService
- Or: Pre-register all needed templates at startup

### 3. Multiple Card Generation

**Issue**: Templates can generate multiple cards from a single Xiuyuan

**Example**: `builtin-quick-bidirectional` creates 2 cards (forward + reverse)

**Required Changes**:
- CreateCardUseCase should return array of cards
- Handle card rule iteration
- Generate unique card IDs for each rule

---

## Recommended Migration Order

### Phase 1: Simple Card Creation (Priority: High)
- [ ] Migrate concept card creation in BlockMenuHandler
  - Create `builtin-concept-simple` template
  - Use CardApplicationService.createCard()
  - Remove direct `createDefaultCard()` calls

### Phase 2: Template Support (Priority: High)
- [ ] Implement template support in CardApplicationService
  - Extend CreateCardCommand
  - Extend CreateCardUseCase
  - Add template loading and validation

### Phase 3: Migrate Template-Based Creation (Priority: Medium)
- [ ] Migrate DialogManager template card creation
- [ ] Migrate AutoCardHandler calls
- [ ] Migrate TransactionObserver calls
- [ ] Migrate list template helper

### Phase 4: Cleanup (Priority: Low)
- [ ] Remove or deprecate XiuyuanService.createFromBlocks()
- [ ] Update MigrationService (if needed)
- [ ] Remove direct storage access patterns

---

## Testing Strategy

### Unit Tests Needed
- [ ] Template loading and validation
- [ ] Field mapping validation
- [ ] Multiple card generation
- [ ] Dynamic template creation

### Integration Tests Needed
- [ ] End-to-end template card creation
- [ ] Concept card creation workflow
- [ ] List template card creation
- [ ] Bidirectional card creation

### Manual Tests Needed
- [ ] Create card from each template type
- [ ] Verify card data in storage
- [ ] Verify Riff synchronization
- [ ] Verify block attributes

---

## Notes

1. **Backward Compatibility**: Old code paths must continue working during migration
2. **Gradual Migration**: Migrate one component at a time, test thoroughly
3. **Template Registry**: Consider centralizing template definitions
4. **Error Handling**: Ensure proper error messages for template-related failures
5. **Documentation**: Update user docs when migration is complete

---

## Related Files

- `src/application/services/CardApplicationService.ts` - Target service
- `src/application/usecases/card/CreateCardUseCase.ts` - Core use case
- `src/core/xiuyuan/service.ts` - Current implementation
- `src/services/BlockMenuHandler.ts` - Partially ready
- `src/application/managers/DialogManager.ts` - Has TODO comment
- `src/services/handlers/AutoCardHandler.ts` - Heavy template user
- `src/core/box/TransactionObserver.ts` - Automatic creation
