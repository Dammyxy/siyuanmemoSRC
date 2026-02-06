/**
 * Diagnostic Types
 * 诊断类型定义
 *
 * 定义所有诊断工具使用的核心接口和类型。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 */

// ============================================================================
// Architecture Scanner Types
// ============================================================================

/**
 * 架构使用类型
 */
export type UsageType = 'import' | 'instantiation' | 'type-annotation';

/**
 * 架构类型
 */
export type ArchitectureType = 'old' | 'new' | 'mixed';

/**
 * 架构使用点
 *
 * 记录代码中使用旧架构或新架构的具体位置。
 */
export interface UsagePoint {
    /** 文件路径 */
    filePath: string;
    /** 行号 */
    lineNumber: number;
    /** 代码片段 */
    codeSnippet: string;
    /** 使用类型 */
    usageType: UsageType;
    /** 架构类型 */
    architecture: ArchitectureType;
    /** 队列类型（可选） */
    queueType?: string;
}

/**
 * 架构扫描结果
 *
 * 包含所有旧架构、新架构和混合使用的使用点。
 */
export interface ArchitectureScanResult {
    /** 旧架构使用点 */
    oldArchitectureUsages: UsagePoint[];
    /** 新架构使用点 */
    newArchitectureUsages: UsagePoint[];
    /** 混合使用点 */
    mixedUsages: UsagePoint[];
    /** 摘要统计 */
    summary: {
        /** 总文件数 */
        totalFiles: number;
        /** 旧架构文件数 */
        oldArchitectureFiles: number;
        /** 新架构文件数 */
        newArchitectureFiles: number;
        /** 混合使用文件数 */
        mixedFiles: number;
    };
}

// ============================================================================
// Interface Validator Types
// ============================================================================

/**
 * 验证错误严重性
 */
export type Severity = 'error' | 'warning';

/**
 * 验证错误
 *
 * 记录接口验证过程中发现的错误。
 */
export interface ValidationError {
    /** 类名 */
    className: string;
    /** 方法名 */
    methodName: string;
    /** 问题描述 */
    issue: string;
    /** 严重性 */
    severity: Severity;
    /** 文件路径 */
    filePath?: string;
    /** 行号 */
    lineNumber?: number;
}

/**
 * 验证警告
 *
 * 记录接口验证过程中发现的警告。
 */
export interface ValidationWarning {
    /** 类名 */
    className: string;
    /** 警告消息 */
    message: string;
    /** 文件路径 */
    filePath?: string;
}

/**
 * 验证结果
 *
 * 包含所有验证错误和警告。
 */
export interface ValidationResult {
    /** 是否有效 */
    isValid: boolean;
    /** 错误列表 */
    errors: ValidationError[];
    /** 警告列表 */
    warnings: ValidationWarning[];
}

// ============================================================================
// API Compatibility Types
// ============================================================================

/**
 * API 方法签名
 */
export interface ApiMethodSignature {
    /** 方法名 */
    name: string;
    /** 参数类型列表（包含可选标记） */
    parameters: string[];
    /** 返回类型 */
    returnType: string;
}

/**
 * API 类签名
 */
export interface ApiClassSignature {
    /** 类名 */
    className: string;
    /** 方法签名列表 */
    methods: ApiMethodSignature[];
    /** 可选：来源文件路径 */
    filePath?: string;
}

/**
 * API 兼容性问题
 */
export interface ApiCompatibilityIssue {
    /** 类名 */
    className: string;
    /** 方法名（类级问题可为空） */
    methodName?: string;
    /** 问题描述 */
    issue: string;
    /** 严重性 */
    severity: Severity;
    /** 旧签名 */
    oldSignature?: string;
    /** 新签名 */
    newSignature?: string;
}

/**
 * API 兼容性检查结果
 */
export interface ApiCompatibilityResult {
    /** 是否兼容（无 error 级别问题） */
    isCompatible: boolean;
    /** 问题列表 */
    issues: ApiCompatibilityIssue[];
    /** 摘要统计 */
    summary: {
        comparedClasses: number;
        comparedMethods: number;
        breakingChanges: number;
        warnings: number;
    };
}

// ============================================================================
// Migration Analyzer Types
// ============================================================================

/**
 * 风险级别
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * 影响级别
 */
export type ImpactLevel = 'low' | 'medium' | 'high';

/**
 * 迁移机会
 *
 * 记录可以安全迁移到新架构的代码位置。
 */
export interface MigrationOpportunity {
    /** 文件路径 */
    filePath: string;
    /** 组件名称 */
    component: string;
    /** 风险级别 */
    risk: RiskLevel;
    /** 影响级别 */
    impact: ImpactLevel;
    /** 优先级（数字越大越优先） */
    priority: number;
    /** 预估工作量 */
    estimatedEffort: string;
    /** 依赖列表 */
    dependencies: string[];
    /** 理由 */
    rationale: string;
}

/**
 * 代码位置
 *
 * 记录必须保留旧架构的代码位置。
 */
export interface CodeLocation {
    /** 文件路径 */
    filePath: string;
    /** 组件名称 */
    component: string;
    /** 理由 */
    rationale: string;
}

/**
 * 依赖项
 *
 * 记录文件之间的依赖关系。
 */
export interface Dependency {
    /** 源文件 */
    from: string;
    /** 目标文件 */
    to: string;
    /** 依赖类型 */
    type: 'import' | 'extend' | 'implement';
}

/**
 * 迁移步骤
 *
 * 记录迁移计划中的一个步骤。
 */
export interface MigrationStep {
    /** 步骤顺序 */
    order: number;
    /** 步骤描述 */
    description: string;
    /** 涉及的文件 */
    files: string[];
    /** 测试策略 */
    testStrategy: string;
    /** 预估时间 */
    estimatedTime: string;
}

/**
 * 迁移计划
 *
 * 包含迁移分析的所有结果。
 */
export interface MigrationPlan {
    /** 可以安全迁移的机会 */
    safeMigrations: MigrationOpportunity[];
    /** 必须保留的代码 */
    mustRemain: CodeLocation[];
    /** 共享依赖 */
    sharedDependencies: Dependency[];
    /** 迁移步骤 */
    migrationSteps: MigrationStep[];
}

// ============================================================================
// Diagnostic Report Types
// ============================================================================

/**
 * 诊断报告
 *
 * 包含所有诊断结果的综合报告。
 */
export interface DiagnosticReport {
    /** 报告时间戳 */
    timestamp: Date;
    /** 摘要 */
    summary: {
        /** 总文件数 */
        totalFiles: number;
        /** 旧架构文件数 */
        oldArchitectureFiles: number;
        /** 新架构文件数 */
        newArchitectureFiles: number;
        /** 混合使用文件数 */
        mixedFiles: number;
        /** 验证错误数 */
        validationErrors: number;
        /** 验证警告数 */
        validationWarnings: number;
    };
    /** 架构使用情况 */
    architectureUsage: {
        /** 旧架构使用点 */
        oldArchitecture: UsagePoint[];
        /** 新架构使用点 */
        newArchitecture: UsagePoint[];
        /** 混合使用点 */
        mixedUsage: UsagePoint[];
    };
    /** 验证结果 */
    validationResults: {
        /** 错误列表 */
        errors: ValidationError[];
        /** 警告列表 */
        warnings: ValidationWarning[];
    };
    /** 迁移计划 */
    migrationPlan: MigrationPlan;
    /** 建议 */
    recommendations: string[];
}
