import { describe, expect, test } from "bun:test";
import { billingCycleStart, cycleKeyFor } from "../src/cycle";

describe("billingCycleStart", () => {
  test("maps Nov 3 to the Oct 4 cycle", () => {
    expect(billingCycleStart(new Date(2026, 10, 3, 12)).getTime()).toBe(new Date(2026, 9, 4).getTime());
  });

  test("maps Nov 4 onto itself", () => {
    expect(billingCycleStart(new Date(2026, 10, 4, 12)).getTime()).toBe(new Date(2026, 10, 4).getTime());
  });

  test("keeps the 4th itself at local midnight", () => {
    const start = billingCycleStart(new Date(2026, 10, 4, 15, 30));
    expect(start.getDate()).toBe(4);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });

  test("wraps Jan 2 into Dec 4 of the prior year", () => {
    expect(billingCycleStart(new Date(2026, 0, 2, 12)).getTime()).toBe(new Date(2025, 11, 4).getTime());
  });

  test("keys cycles by local cycle-start date", () => {
    expect(cycleKeyFor(new Date(2026, 10, 3, 12))).toBe("2026-10-04");
  });
});
