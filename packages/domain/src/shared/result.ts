export type Success<Value> = Readonly<{
  ok: true;
  value: Value;
}>;

export type Failure<ErrorValue> = Readonly<{
  ok: false;
  error: ErrorValue;
}>;

export type Result<Value, ErrorValue> = Success<Value> | Failure<ErrorValue>;

export const success = <Value>(value: Value): Success<Value> => Object.freeze({ ok: true, value });

export const failure = <ErrorValue>(error: ErrorValue): Failure<ErrorValue> =>
  Object.freeze({ error, ok: false });
