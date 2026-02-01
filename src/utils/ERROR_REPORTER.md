# Error Reporter

## Overview

The Error Reporter module provides a unified interface for reporting errors to monitoring systems. This allows for centralized error tracking and easier integration with external error monitoring services like Sentry, Rollbar, or custom logging systems.

## Architecture

```
┌─────────────────────────────────────────┐
│         IErrorReporter Interface         │
│  - report(error, context?)               │
└─────────────────┬───────────────────────┘
                  │
                  │ implements
                  │
┌─────────────────▼───────────────────────┐
│      ConsoleErrorReporter (Basic)       │
│  - Logs to console via logger           │
│  - Suitable for development             │
└─────────────────────────────────────────┘

Future implementations could include:
- SentryErrorReporter
- RollbarErrorReporter
- CustomAPIErrorReporter
```

## Usage

### Basic Usage

```typescript
import { defaultErrorReporter } from '@/utils/errorReporter';

try {
  // Some operation that might fail
  await fetchDataFromDatabase();
} catch (error) {
  // Report the error with context
  defaultErrorReporter.report(error as Error, {
    operation: 'fetchDataFromDatabase',
    component: 'DataSource'
  });
}
```

### Creating a Custom Reporter

```typescript
import { IErrorReporter } from '@/utils/errorReporter';

class SentryErrorReporter implements IErrorReporter {
  report(error: Error, context?: Record<string, any>): void {
    // Send to Sentry
    Sentry.captureException(error, {
      extra: context
    });
  }
}

// Use the custom reporter
const reporter = new SentryErrorReporter();
reporter.report(new Error('Something went wrong'), {
  userId: '123',
  operation: 'checkout'
});
```

### Using with DataSource

```typescript
import { defaultErrorReporter } from '@/utils/errorReporter';

class RiffDataSource {
  private errorReporter: IErrorReporter;
  
  constructor(errorReporter: IErrorReporter = defaultErrorReporter) {
    this.errorReporter = errorReporter;
  }
  
  async fetchAll(): Promise<Card[]> {
    try {
      const rows = await sql(`SELECT * FROM cards`);
      return rows.map(row => this.mapRow(row));
    } catch (error) {
      // Report the error
      this.errorReporter.report(error as Error, {
        operation: 'fetchAll',
        component: 'RiffDataSource'
      });
      
      // Return cached data or empty array
      return this.cachedCards || [];
    }
  }
}
```

## Context Information

The `context` parameter is optional but highly recommended. It should contain information that helps diagnose the error:

### Recommended Context Fields

- **operation**: The operation that was being performed (e.g., 'fetchAll', 'removeCards')
- **component**: The component where the error occurred (e.g., 'RiffDataSource', 'PrioritySequencer')
- **timestamp**: When the error occurred (e.g., `Date.now()`)
- **userId**: The user who encountered the error (if applicable)
- **query**: The SQL query that failed (for database errors)
- **params**: The parameters passed to the operation

### Example Context

```typescript
{
  operation: 'batchQuery',
  component: 'BlockMenuHandler',
  timestamp: Date.now(),
  batchSize: 200,
  itemCount: 600,
  query: 'SELECT * FROM cards WHERE block_id IN (...)'
}
```

## Integration with Error Recovery

The error reporter is designed to work with the three-layer error recovery strategy:

```typescript
async fetchAll(): Promise<Card[]> {
  try {
    // Layer 1: Normal database query
    const rows = await sql(`SELECT * FROM cards`);
    this.cachedCards = rows.map(row => this.mapRow(row));
    return this.cachedCards;
  } catch (error) {
    console.error('Database query failed:', error);
    
    // Layer 2: Use cached data
    if (this.cachedCards.length > 0) {
      showNotice('使用缓存数据（数据库暂时不可用）');
      return this.cachedCards;
    }
    
    // Layer 3: Report error and return empty array
    this.errorReporter.report(error as Error, {
      operation: 'fetchAll',
      component: 'RiffDataSource'
    });
    showNotice('加载卡片失败，请稍后重试');
    return [];
  }
}
```

## Testing

The error reporter is fully tested with unit tests covering:

- Basic error reporting
- Error reporting with context
- Handling of edge cases (missing stack traces, empty context, etc.)
- Integration scenarios

See `src/utils/__tests__/errorReporter.test.ts` for examples.

## Future Enhancements

Possible future enhancements include:

1. **External Service Integration**: Add implementations for Sentry, Rollbar, etc.
2. **Error Aggregation**: Group similar errors to reduce noise
3. **Error Rate Limiting**: Prevent flooding the monitoring system
4. **User Feedback**: Allow users to provide additional context when errors occur
5. **Error Recovery Suggestions**: Provide actionable suggestions based on error type

## Related Documentation

- [Architecture Optimization Design](../../../.kiro/specs/architecture-optimization/design.md)
- [Error Recovery Mechanisms](../../../.kiro/specs/architecture-optimization/design.md#错误处理)
- [Logger Utility](./logger.ts)
