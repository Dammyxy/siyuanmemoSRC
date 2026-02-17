# Data Source Layer - Legacy Architecture

⚠️ **DEPRECATED**: This directory contains the legacy data source architecture that is no longer used in production.

## Current Status

- **Status**: Deprecated and not used
- **Replacement**: `src/routers/AdvancedDataRouter.ts` + `UnifiedDataSourceManager`
- **Reason**: Kept for backward compatibility and testing purposes only

## Files in This Directory

### Core Files (Deprecated)

- `RiffDataSource.ts` - Fetches cards from Riff API (deprecated)
- `LocalStorageDataSource.ts` - Fetches cards from local storage (deprecated)
- `DataSourceFactory.ts` - Factory for creating data sources (deprecated)
- `HybridDataSource.ts` - Combines multiple data sources (deprecated)
- `StorageDataSource.ts` - Storage-based data source (deprecated)
- `GroupDataSource.ts` - Group-based data source (deprecated)

### Interface Files

- `IDataSource.ts` - Data source interface (still used by legacy code)
- `ObservableDataSource.ts` - Observable pattern base class (still used by legacy code)

## Why Deprecated?

The old queue architecture (`src/core/queue/strategies/`) has been replaced by the new unified architecture:

```
Old Architecture (Deprecated):
  RetrievalPracticeQueue → RiffDataSource → Riff API
  LeechQueue → RiffDataSource → Riff API
  FilterGroupQueue → GroupDataSource → Storage

New Architecture (Current):
  UnifiedDataSourceManager → AdvancedDataRouter → StorageManager
```

## New Architecture

The new architecture uses:

1. **AdvancedDataRouter** (`src/routers/AdvancedDataRouter.ts`)
   - Direct access to `StorageManager`
   - No caching (always fetches latest data)
   - Simpler and more maintainable

2. **UnifiedDataSourceManager** (`src/managers/UnifiedDataSourceManager.ts`)
   - Manages all queues
   - Provides unified interface

3. **Browser Data Sources** (`src/ui/browser/datasource/`)
   - `RetrievalDataSource.ts`
   - `DeckDataSource.ts`
   - `FilterGroupDataSource.ts`
   - etc.

## Migration Status

- ✅ New architecture fully implemented
- ✅ Old queues marked as `@deprecated`
- ✅ Old data sources marked as `@deprecated`
- ✅ Tests still pass (for backward compatibility)
- ⏳ Waiting for complete removal in future version

## For Developers

### If You Need to Modify Data Access Logic

**DO NOT** modify files in this directory. Instead:

1. Modify `src/routers/AdvancedDataRouter.ts` for core data access
2. Modify `src/ui/browser/datasource/*` for browser-specific data sources
3. Modify `src/managers/UnifiedDataSourceManager.ts` for queue management

### If You See Import Errors

If you see imports from this directory in new code, it's likely a mistake. Replace with:

```typescript
// ❌ Old (deprecated)
import { RiffDataSource } from '@/core/queue/datasource/RiffDataSource';

// ✅ New (current)
import { AdvancedDataRouter } from '@/routers/AdvancedDataRouter';
```

### Running Tests

Tests for this directory still exist and should pass:

```bash
npm test -- datasource
```

These tests ensure backward compatibility and help prevent regressions.

## Timeline

- **2024-Q1**: New architecture implemented
- **2024-Q2**: Old queues marked as deprecated
- **2024-Q3**: Old data sources marked as deprecated (current)
- **2024-Q4**: Planned removal of old architecture

## Questions?

If you have questions about the architecture migration, see:

- `docs/MIGRATION_GUIDE.md` (if exists)
- `src/routers/README.md` (if exists)
- Ask the team lead
