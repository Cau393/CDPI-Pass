/** Matches `print_jobs.attempts` progression on each failed print ACK. */
export const MAX_PRINT_ATTEMPTS = 3;

export type AfterPrintFailure =
  | { status: "pending"; attempts: number }
  | { status: "failed"; attempts: number };

/**
 * Given `attempts` count on the row before incrementing for this failure,
 * returns the next DB state (requeue as pending or terminal failed).
 */
export function nextStateAfterPrintFailure(attemptsBefore: number): AfterPrintFailure {
  const next = attemptsBefore + 1;
  if (next >= MAX_PRINT_ATTEMPTS) {
    return { status: "failed", attempts: next };
  }
  return { status: "pending", attempts: next };
}
