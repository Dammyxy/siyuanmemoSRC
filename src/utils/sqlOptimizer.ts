/**
 * SQL 查询优化工具
 * 
 * 提供常见的 SQL 查询优化模式和工具函数
 */

import { createLogger } from './logger';
import { PerformanceMonitor } from './performance';

const logger = createLogger('SQLOptimizer');

/**
 * SQL 转义
 */
export function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * 构建 IN 子句
 * 
 * @param ids ID 列表
 * @param escape 是否转义
 * @returns IN 子句字符串
 * 
 * @example
 * ```typescript
 * const inClause = buildInClause(['id1', 'id2', 'id3']);
 * // 结果: "'id1','id2','id3'"
 * ```
 */
export function buildInClause(ids: string[], escape = true): string {
  if (ids.length === 0) return "''";
  
  if (escape) {
    return ids.map(id => `'${escapeSQL(id)}'`).join(',');
  }
  
  return ids.map(id => `'${id}'`).join(',');
}

/**
 * 分批执行 SQL 查询
 * 
 * 避免 IN 子句过长导致的性能问题
 * 
 * @param ids ID 列表
 * @param queryFn 查询函数
 * @param batchSize 批次大小
 * @returns 合并后的查询结果
 * 
 * @example
 * ```typescript
 * const results = await batchSQLQuery(
 *   blockIds,
 *   async (batch) => {
 *     const inClause = buildInClause(batch);
 *     return await sql(`SELECT * FROM blocks WHERE id IN (${inClause})`);
 *   },
 *   200
 * );
 * ```
 */
export async function batchSQLQuery<T>(
  ids: string[],
  queryFn: (batch: string[]) => Promise<T[]>,
  batchSize = 200
): Promise<T[]> {
  if (ids.length === 0) return [];

  return PerformanceMonitor.measure('batchSQLQuery', async () => {
    const results: T[] = [];

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const batchResults = await queryFn(batch);
      results.push(...batchResults);
    }

    logger.debug(`Batch query completed: ${ids.length} items in ${Math.ceil(ids.length / batchSize)} batches`);
    return results;
  });
}

/**
 * 优化的字段选择
 * 
 * 避免 SELECT *，只查询需要的字段
 * 
 * @param fields 字段列表
 * @returns 字段字符串
 * 
 * @example
 * ```typescript
 * const fields = selectFields(['id', 'content', 'type']);
 * // 结果: "id, content, type"
 * ```
 */
export function selectFields(fields: string[]): string {
  return fields.join(', ');
}

/**
 * 构建 WHERE 条件
 * 
 * @param conditions 条件对象
 * @returns WHERE 子句
 * 
 * @example
 * ```typescript
 * const where = buildWhere({
 *   type: 'concept',
 *   status: 'active'
 * });
 * // 结果: "type = 'concept' AND status = 'active'"
 * ```
 */
export function buildWhere(conditions: Record<string, string | number | boolean>): string {
  const clauses = Object.entries(conditions).map(([key, value]) => {
    if (typeof value === 'string') {
      return `${key} = '${escapeSQL(value)}'`;
    }
    return `${key} = ${value}`;
  });

  return clauses.join(' AND ');
}

/**
 * SQL 查询构建器
 * 
 * 提供链式 API 构建 SQL 查询
 * 
 * @example
 * ```typescript
 * const query = new SQLBuilder()
 *   .select(['id', 'content', 'type'])
 *   .from('blocks')
 *   .where('type', 'concept')
 *   .whereIn('id', blockIds)
 *   .limit(100)
 *   .build();
 * ```
 */
export class SQLBuilder {
  private selectClause: string[] = ['*'];
  private fromClause = '';
  private whereClauses: string[] = [];
  private joinClauses: string[] = [];
  private orderByClause = '';
  private limitClause = '';
  private offsetClause = '';

  select(fields: string[]): this {
    this.selectClause = fields;
    return this;
  }

  from(table: string): this {
    this.fromClause = table;
    return this;
  }

  where(field: string, value: string | number | boolean): this {
    if (typeof value === 'string') {
      this.whereClauses.push(`${field} = '${escapeSQL(value)}'`);
    } else {
      this.whereClauses.push(`${field} = ${value}`);
    }
    return this;
  }

  whereIn(field: string, values: string[]): this {
    if (values.length > 0) {
      const inClause = buildInClause(values);
      this.whereClauses.push(`${field} IN (${inClause})`);
    }
    return this;
  }

  whereLike(field: string, pattern: string): this {
    this.whereClauses.push(`${field} LIKE '${escapeSQL(pattern)}'`);
    return this;
  }

  whereRaw(clause: string): this {
    this.whereClauses.push(clause);
    return this;
  }

  innerJoin(table: string, on: string): this {
    this.joinClauses.push(`INNER JOIN ${table} ON ${on}`);
    return this;
  }

  leftJoin(table: string, on: string): this {
    this.joinClauses.push(`LEFT JOIN ${table} ON ${on}`);
    return this;
  }

  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClause = `ORDER BY ${field} ${direction}`;
    return this;
  }

  limit(count: number): this {
    this.limitClause = `LIMIT ${count}`;
    return this;
  }

  offset(count: number): this {
    this.offsetClause = `OFFSET ${count}`;
    return this;
  }

  build(): string {
    const parts: string[] = [];

    // SELECT
    parts.push(`SELECT ${this.selectClause.join(', ')}`);

    // FROM
    if (!this.fromClause) {
      throw new Error('FROM clause is required');
    }
    parts.push(`FROM ${this.fromClause}`);

    // JOIN
    if (this.joinClauses.length > 0) {
      parts.push(this.joinClauses.join(' '));
    }

    // WHERE
    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join(' AND ')}`);
    }

    // ORDER BY
    if (this.orderByClause) {
      parts.push(this.orderByClause);
    }

    // LIMIT
    if (this.limitClause) {
      parts.push(this.limitClause);
    }

    // OFFSET
    if (this.offsetClause) {
      parts.push(this.offsetClause);
    }

    return parts.join(' ');
  }
}

/**
 * SQL 查询性能分析
 * 
 * 检测常见的性能问题
 * 
 * @param query SQL 查询
 * @returns 性能建议
 */
export function analyzeSQLPerformance(query: string): {
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // 检查 SELECT *
  if (/SELECT\s+\*/i.test(query)) {
    issues.push('使用了 SELECT *');
    suggestions.push('只查询需要的字段，避免传输不必要的数据');
  }

  // 检查 LIKE '%xxx%'
  if (/LIKE\s+'%[^']+%'/i.test(query)) {
    issues.push('使用了前后通配符的 LIKE');
    suggestions.push('考虑使用全文搜索或只使用后缀通配符');
  }

  // 检查 OR 条件
  if (/\sOR\s/i.test(query)) {
    issues.push('使用了 OR 条件');
    suggestions.push('考虑使用 IN 或 UNION 替代 OR');
  }

  // 检查子查询
  const subqueryCount = (query.match(/SELECT/gi) || []).length - 1;
  if (subqueryCount > 2) {
    issues.push(`包含 ${subqueryCount} 个子查询`);
    suggestions.push('考虑使用 JOIN 替代嵌套子查询');
  }

  // 检查 DISTINCT
  if (/SELECT\s+DISTINCT/i.test(query)) {
    issues.push('使用了 DISTINCT');
    suggestions.push('检查是否可以通过优化查询避免重复数据');
  }

  return { issues, suggestions };
}

/**
 * 查询性能监控装饰器
 * 
 * @param threshold 性能阈值（毫秒）
 */
export function monitorSQLPerformance(threshold = 100) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const start = performance.now();
      try {
        return await originalMethod.apply(this, args);
      } finally {
        const duration = performance.now() - start;
        if (duration > threshold) {
          logger.warn(
            `SQL query in ${target.constructor.name}.${propertyKey} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
          );
        }
      }
    };

    return descriptor;
  };
}
