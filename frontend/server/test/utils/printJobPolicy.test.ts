import { describe, it, expect } from "vitest";
import { MAX_PRINT_ATTEMPTS, nextStateAfterPrintFailure } from "../../utils/printJobPolicy";

describe("nextStateAfterPrintFailure", () => {
  it("requeues with incremented attempts below max", () => {
    expect(nextStateAfterPrintFailure(0)).toEqual({
      status: "pending",
      attempts: 1,
    });
    expect(nextStateAfterPrintFailure(1)).toEqual({
      status: "pending",
      attempts: 2,
    });
  });

  it("marks failed on the last allowed attempt", () => {
    expect(nextStateAfterPrintFailure(2)).toEqual({
      status: "failed",
      attempts: MAX_PRINT_ATTEMPTS,
    });
  });
});
