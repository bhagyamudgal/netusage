export type AppError = {
  code: string;
  message: string;
  cause?: unknown;
};

type Result<T> = {
  data: T | null;
  error: AppError | null;
};

function toError(error: unknown, code: string): AppError {
  if (error instanceof Error) {
    return { code, message: error.message, cause: error };
  }
  return { code, message: String(error), cause: error };
}

/** Runs an async fn and returns a {data, error} tuple-style result instead of throwing. */
export async function tryCatch<T>(fn: Promise<T> | (() => Promise<T>), code = "UNKNOWN"): Promise<Result<T>> {
  try {
    const data = typeof fn === "function" ? await fn() : await fn;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: toError(error, code) };
  }
}

/** Runs a sync fn and returns a {data, error} tuple-style result instead of throwing. */
export function tryCatchSync<T>(fn: () => T, code = "UNKNOWN"): Result<T> {
  try {
    return { data: fn(), error: null };
  } catch (error) {
    return { data: null, error: toError(error, code) };
  }
}
