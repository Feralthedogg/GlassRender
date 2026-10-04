/** Success or failure returned by fallible engine calls. */
export type Result<T> = Ok<T> | Err;

/** A successful result. */
export interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}

/** A failed result with a description of the first problem found. */
export interface Err {
    readonly ok: false;
    readonly error: string;
}

/**
 * Wrap a value as a successful result.
 * @param value Produced value.
 * @returns Frozen success record.
 */
export function ok<T>(value: T): Ok<T> {
    return Object.freeze({ ok: true, value });
}

/**
 * Build a failed result.
 * @param error Description of the failure.
 * @returns Frozen failure record.
 */
export function err(error: string): Err {
    return Object.freeze({ ok: false, error });
}
