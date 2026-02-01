/**
 * Result Type Module
 * 
 * Provides a unified error handling pattern using the Result type.
 * This pattern forces explicit handling of both success and failure cases,
 * eliminating silent failures and improving code reliability.
 * 
 * ## Design Principles
 * - **Explicit error handling**: Callers must handle both success and error cases
 * - **Type safety**: TypeScript ensures all cases are handled at compile time
 * - **No exceptions**: Errors are values, not thrown exceptions
 * - **Composable**: Results can be chained and transformed
 * 
 * ## Requirement Validation
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 * - 8.1: THE System SHALL use Result type pattern for operations that can fail
 * - 8.2: WHEN an operation succeeds, THE System SHALL return { ok: true, value: T }
 * - 8.3: WHEN an operation fails, THE System SHALL return { ok: false, error: Error }
 * - 8.4: THE System SHALL force callers to explicitly handle both success and error cases
 * - 8.5: THE System SHALL eliminate silent failures that hide errors from users
 * 
 * @module result
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
}

export function err<E = Error>(error: E): Result<never, E> {
    return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
    return result.ok === true;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
    return result.ok === false;
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    if (result.ok) {
        return ok(fn(result.value));
    }
    return result as Result<U, E>;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    if (isErr(result)) {
        return err(fn(result.error));
    }
    return result;
}

export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
    if (result.ok) {
        return fn(result.value);
    }
    return result as Result<U, E>;
}

export function unwrap<T, E>(result: Result<T, E>): T {
    if (isOk(result)) {
        return result.value;
    }
    throw result.error;
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    if (result.ok) {
        return result.value;
    }
    return defaultValue;
}

export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
    const values: T[] = [];
    for (const result of results) {
        if (!result.ok) {
            return result as Result<T[], E>;
        }
        values.push(result.value);
    }
    return ok(values);
}

