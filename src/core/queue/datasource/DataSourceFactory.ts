/**
 * Data Source Factory
 *
 * Factory class for creating appropriate data sources based on configuration mode.
 * This factory implements the Factory Pattern to encapsulate data source creation logic
 * and provide a clean interface for mode-based data source selection.
 * 
 * ## Supported Modes
 * 
 * ### Advanced Mode
 * - Uses LocalStorageDataSource for direct memory access
 * - Provides high-performance, offline-capable card access
 * - Suitable for users with local scheduler (FSRS/SM-15/A-Factor)
 * - Data is synced in background via HybridSyncService
 * 
 * ### Simple Mode
 * - Uses RiffDataSource for real-time API access
 * - Fetches cards directly from Riff system
 * - Suitable for users who prefer Riff's native scheduler
 * - No local sync required
 * 
 * ## Architecture
 * ```
 * Configuration (RiffIntegrationConfig)
 *   ↓
 * DataSourceFactory.createDataSource()
 *   ↓
 * ┌─────────────────┬─────────────────┐
 * │ Advanced Mode   │ Simple Mode     │
 * ├─────────────────┼─────────────────┤
 * │ LocalStorage    │ RiffDataSource  │
 * │ DataSource      │                 │
 * └─────────────────┴─────────────────┘
 * ```
 * 
 * @example
 * ```typescript
 * // Create data source for advanced mode
 * const dataSource = DataSourceFactory.createDataSource(
 *   { mode: 'advanced', ... },
 *   storageManager,
 *   schedulerRouter
 * );
 * 
 * // Create data source for simple mode
 * const dataSource = DataSourceFactory.createDataSource(
 *   { mode: 'simple', ... },
 *   storageManager,
 *   schedulerRouter
 * );
 * ```
 * 
 * @see LocalStorageDataSource
 * @see RiffDataSource
 * @see RiffIntegrationConfig
 */

import { LocalStorageDataSource } from './LocalStorageDataSource';
import { RiffDataSource } from './RiffDataSource';
import type { IDataSource } from './IDataSource';
import type { QueueItem } from '../types';
import type { StorageManager } from '../../storage/manager';
import type { SchedulerRouter } from '../../scheduler/SchedulerRouter';
import type { RiffIntegrationConfig } from '@/types/settings';
import { BUILTIN_DECK_ID } from '../../siyuan/riff';

/**
 * Factory class for creating data sources based on configuration mode
 * 
 * This factory provides a centralized location for data source creation logic,
 * making it easy to switch between different data source implementations based
 * on the user's configuration.
 * 
 * ## Design Principles
 * - **Single Responsibility**: Only responsible for creating data sources
 * - **Open/Closed**: Easy to extend with new data source types
 * - **Dependency Injection**: All dependencies passed as parameters
 * - **Type Safety**: Full TypeScript type checking
 * 
 * ## Mode Detection Logic
 * The factory uses the `mode` field in RiffIntegrationConfig to determine
 * which data source to create:
 * - `mode: 'advanced'` → LocalStorageDataSource
 * - `mode: 'simple'` → RiffDataSource
 * 
 * ## Performance Characteristics
 * 
 * | Mode     | Data Source           | Read Speed | Offline | Network |
 * |----------|-----------------------|------------|---------|---------|
 * | Advanced | LocalStorageDataSource| < 1ms      | ✅ Yes  | ❌ No   |
 * | Simple   | RiffDataSource        | 50-200ms   | ❌ No   | ✅ Yes  |
 * 
 * @public
 */
export class DataSourceFactory {
  /**
   * Creates a data source based on configuration mode
   * 
   * This is the primary factory method that determines which data source
   * implementation to instantiate based on the provided configuration.
   * 
   * ## Advanced Mode Configuration
   * When `config.mode === 'advanced'`, creates a LocalStorageDataSource with:
   * - **Filter**: Only cards with `due <= Date.now()` (due cards only)
   * - **Sort**: By priority (ascending order, lower priority first)
   * - **SchedulerRouter**: For accurate nextDues prediction
   * - **Plugin**: For accessing configuration (e.g., dayStartHour)
   * 
   * ## Simple Mode Configuration
   * When `config.mode === 'simple'`, creates a RiffDataSource with:
   * - **Mode**: 'due-only' (fetch only due cards from Riff API)
   * - **DeckId**: BUILTIN_DECK_ID (default Riff deck)
   * - **Storage**: For caching and local data merging
   * - **SchedulerRouter**: For nextDues prediction
   * 
   * ## Error Handling
   * - If config is invalid, defaults to advanced mode
   * - If storage is missing, creates data source without storage (degraded mode)
   * - If schedulerRouter is missing, creates data source without prediction
   * 
   * ## Dependencies
   * - **storage**: Required for both modes (LocalStorage reads from it, Riff caches to it)
   * - **schedulerRouter**: Optional but recommended for accurate nextDues prediction
   * - **plugin**: Optional but recommended for accessing custom configuration (e.g., dayStartHour)
   * 
   * @param config - Riff integration configuration containing mode selection
   * @param storage - Storage manager for accessing local cards
   * @param schedulerRouter - Optional scheduler for predicting next review times
   * @param plugin - Optional plugin instance for accessing configuration
   * @returns Data source instance appropriate for the configured mode
   * 
   * @example
   * ```typescript
   * // Advanced mode - direct local storage access
   * const advancedSource = DataSourceFactory.createDataSource(
   *   { mode: 'advanced', useLocalScheduler: true, ... },
   *   storageManager,
   *   schedulerRouter,
   *   plugin
   * );
   * 
   * // Simple mode - Riff API access
   * const simpleSource = DataSourceFactory.createDataSource(
   *   { mode: 'simple', useLocalScheduler: false, ... },
   *   storageManager,
   *   schedulerRouter
   * );
   * 
   * // Without scheduler (degraded mode)
   * const degradedSource = DataSourceFactory.createDataSource(
   *   { mode: 'advanced', ... },
   *   storageManager,
   *   undefined,
   *   plugin
   * );
   * ```
   * 
   * @public
   * @static
   */
  static createDataSource(
    config: RiffIntegrationConfig,
    storage: StorageManager,
    schedulerRouter?: SchedulerRouter,
    plugin?: any
  ): IDataSource<QueueItem> {
    // Mode detection: advanced or simple
    if (config.mode === 'advanced') {
      // Advanced Mode: Use LocalStorageDataSource
      // - Direct memory access for maximum performance
      // - Filter only due cards (due <= now)
      // - Sort by priority (lower priority first)
      // - Use SchedulerRouter for accurate nextDues prediction
      // - Use plugin for accessing custom configuration
      console.log('[DataSourceFactory] Creating LocalStorageDataSource for advanced mode');
      
      return new LocalStorageDataSource({
        storage,
        filter: (card) => card.due <= Date.now(),
        sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
        schedulerRouter,
        plugin  // 🆕 传递 plugin 实例
      });
    } else {
      // Simple Mode: Use RiffDataSource
      // - Real-time API access to Riff system
      // - Fetch only due cards from Riff API
      // - Use storage for caching and local data merging
      // - Use SchedulerRouter for nextDues prediction
      console.log('[DataSourceFactory] Creating RiffDataSource for simple mode');
      
      return new RiffDataSource({
        deckId: BUILTIN_DECK_ID,
        mode: 'due-only',
        storage,
        schedulerRouter
      });
    }
  }
}
