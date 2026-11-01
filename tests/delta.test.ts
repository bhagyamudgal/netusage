import { describe, expect, test } from "bun:test";
import { computeDelta } from "../src/delta";

describe("computeDelta", () => {
  test("returns zero when no previous sample exists", () => {
    expect(computeDelta(undefined, 12345)).toBe(0);
  });

  test("returns zero when the counter reset below the previous value", () => {
    expect(computeDelta(9999, 12)).toBe(0);
  });

  test("returns the difference for a normal increase", () => {
    expect(computeDelta(100, 160)).toBe(60);
  });

  test("returns zero when the counter is unchanged", () => {
    expect(computeDelta(50, 50)).toBe(0);
  });
});
