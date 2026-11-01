import { describe, expect, test } from "bun:test";
import { splitUsage } from "../src/cli";

describe("splitUsage", () => {
  test("attributes the whole interface to VPN on full tunnel", () => {
    expect(splitUsage({ up: 100, down: 200 }, { up: 5, down: 5 }, true)).toEqual({
      vpn: { up: 100, down: 200 },
      direct: { up: 0, down: 0 },
    });
  });

  test("splits VPN and direct on split tunnel", () => {
    expect(splitUsage({ up: 100, down: 200 }, { up: 30, down: 40 }, false)).toEqual({
      vpn: { up: 30, down: 40 },
      direct: { up: 70, down: 160 },
    });
  });

  test("caps VPN at the interface delta", () => {
    expect(splitUsage({ up: 50, down: 60 }, { up: 500, down: 600 }, false)).toEqual({
      vpn: { up: 50, down: 60 },
      direct: { up: 0, down: 0 },
    });
  });
});
