/**
 * Migration Utilities
 * 迁移工具集
 * 
 * 导出所有迁移相关的工具和类。
 * 
 * @see .kiro/specs/queue-architecture-migration/requirements.md
 * @see .kiro/specs/queue-architecture-migration/design.md
 */

// Type Converter
export { TypeConverter } from './TypeConverter';

// Error Types
export {
    MigrationError,
    TypeConversionError,
    APICompatibilityError,
    DataIntegrityError,
    QueueStateError,
} from './MigrationErrors';

// Error Handler
export { MigrationErrorHandler } from './MigrationErrorHandler';

// Validation Tools
export {
    StaticCodeAnalyzer,
    AnalysisResult,
} from './StaticCodeAnalyzer';

export {
    DataIntegrityValidator,
    ValidationResult,
    CardValidationError,
    QueueValidationError,
} from './DataIntegrityValidator';
