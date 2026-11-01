import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bar, report, splitBar, splitUsage, stackedBar } from "../src/cli";
import { createEmptyUsage, ensureCycleEntry, saveUsage } from "../src/store";

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

describe("bar", () => {
  test("renders empty, half, and full widths", () => {
    expect(bar(0, 4)).toBe("    ");
    expect(bar(0.5, 4)).toBe("██  ");
    expect(bar(1, 4)).toBe("████");
  });

  test("clamps outside input", () => {
    expect(bar(2, 4)).toBe("████");
    expect(bar(-0.5, 4)).toBe("    ");
  });
});

describe("splitBar", () => {
  test("splits up and down within the scaled width", () => {
    expect(splitBar(1, 3, 4, 8)).toBe("██░░░░░░");
  });

  test("scales to the cycle maximum", () => {
    expect(splitBar(1, 1, 4, 8)).toBe("██░░    ");
  });

  test("renders empty when nothing accumulated", () => {
    expect(splitBar(0, 0, 0, 4)).toBe("    ");
  });
});

describe("stackedBar", () => {
  test("stacks four buckets by share", () => {
    expect(stackedBar([4, 0, 2, 2], 20)).toBe("██████████▒▒▒▒▒░░░░░");
  });

  test("renders empty when nothing accumulated", () => {
    expect(stackedBar([0, 0, 0, 0], 4)).toBe("    ");
  });
});

describe("report", () => {
  test("prints totals and bars for one synthetic cycle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "netusage-cli-"));
    const file = join(dir, "usage.json");
    const usage = createEmptyUsage();
    const entry = ensureCycleEntry(usage, "2026-11-01");
    entry.wifi.direct.up = 1000000000;
    entry.wifi.direct.down = 3000000000;
    entry.hotspot.direct.up = 1000000000;
    entry.hotspot.direct.down = 1000000000;
    entry.hotspot.vpn.down = 2000000000;
    await saveUsage(usage, file);
    const previous = process.env.NETUSAGE_PATH;
    process.env.NETUSAGE_PATH = file;
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = function (...args: unknown[]): void {
      lines.push(args.join(" "));
    };
    try {
      await report();
    } finally {
      console.log = originalLog;
      if (previous === undefined) {
        delete process.env.NETUSAGE_PATH;
      } else {
        process.env.NETUSAGE_PATH = previous;
      }
    }
    expect(lines).toEqual([
      "Cycle 2026-11-01",
      "  wifi/direct up 1.00 GB down 3.00 GB",
      "  wifi/vpn up 0.00 GB down 0.00 GB",
      "  hotspot/direct up 1.00 GB down 1.00 GB",
      "  hotspot/vpn up 0.00 GB down 2.00 GB",
      "  wifi total up 1.00 GB down 3.00 GB",
      "  hotspot total up 1.00 GB down 3.00 GB",
      "  direct total up 2.00 GB down 4.00 GB",
      "  vpn total up 0.00 GB down 2.00 GB",
      "  combined total up 2.00 GB down 6.00 GB",
      "  wifi/direct bar [█████░░░░░░░░░░░░░░░]",
      "  wifi/vpn bar [                    ]",
      "  hotspot/direct bar [█████░░░░░          ]",
      "  hotspot/vpn bar [░░░░░░░░░░          ]",
      "  combined bar [██████████▒▒▒▒▒░░░░░]",
      "  legend up=█ down=░ combined: █=wifi/direct ▓=wifi/vpn ▒=hotspot/direct ░=hotspot/vpn",
    ]);
    expect(lines.join("\n")).not.toContain("\u001b");
  });
});
