/**
 * @file result.ts
 * @brief Immutable success and failure records for fallible engine calls.
 */

/** @brief Success or failure returned by fallible engine calls. */
export type Result<T> = Ok<T> | Err;

/** @brief A successful result. */
export interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}

/** @brief A failed result with a description of the first problem found. */
export interface Err {
    readonly ok: false;
    readonly error: string;
}

/** @brief Freeze a success record without copying or freezing its value. */
export function ok<T>(value: T): Ok<T> {
    return Object.freeze({ ok: true, value });
}

/** @brief Freeze a failure record containing the supplied diagnostic. */
export function err(error: string): Err {
    return Object.freeze({ ok: false, error });
}
