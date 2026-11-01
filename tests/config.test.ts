import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseBillingDay, parseIntervalSec, parseText } from "../src/config";

const repoRoot = join(import.meta.dir, "..");

type ExpectedConfig = {
  BILLING_DAY: number;
  HOTSPOT_GATEWAY: string;
  TAILSCALE_CIDR: string;
  SAMPLE_INTERVAL_SEC: number;
  USAGE_PATH: string;
};

function baseEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("NETUSAGE_")) {
      out[key] = value;
    }
  }
  return out;
}

function expectResolved(extraEnv: Record<string, string>, expected: ExpectedConfig): void {
  const code = `import { BILLING_DAY, HOTSPOT_GATEWAY, TAILSCALE_CIDR, SAMPLE_INTERVAL_SEC, USAGE_PATH } from "./src/config.ts"; console.log(JSON.stringify({ BILLING_DAY, HOTSPOT_GATEWAY, TAILSCALE_CIDR, SAMPLE_INTERVAL_SEC, USAGE_PATH }));`;
  const proc = Bun.spawnSync([process.execPath, "-e", code], {
    cwd: repoRoot,
    env: { ...baseEnv(), ...extraEnv },
  });
  expect(proc.exitCode).toBe(0);
  const raw = proc.stdout;
  if (raw === undefined) {
    throw new Error("subprocess produced no stdout");
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
  expect(parsed).toEqual(expected);
}

function defaults(): ExpectedConfig {
  return {
    BILLING_DAY: 1,
    HOTSPOT_GATEWAY: "172.20.10.1",
    TAILSCALE_CIDR: "100.64.0.0/10",
    SAMPLE_INTERVAL_SEC: 60,
    USAGE_PATH: join(homedir(), ".netusage", "usage.json"),
  };
}

describe("config", () => {
  test("resolves built-in defaults when env is unset", () => {
    expectResolved({}, defaults());
  });

  test("applies env overrides", () => {
    expectResolved(
      {
        NETUSAGE_BILLING_DAY: "15",
        NETUSAGE_HOTSPOT_GATEWAY: "192.168.1.1",
        NETUSAGE_TAILSCALE_CIDR: "10.0.0.0/8",
        NETUSAGE_INTERVAL_SEC: "30",
        NETUSAGE_PATH: "/tmp/netusage-test-usage.json",
      },
      {
        BILLING_DAY: 15,
        HOTSPOT_GATEWAY: "192.168.1.1",
        TAILSCALE_CIDR: "10.0.0.0/8",
        SAMPLE_INTERVAL_SEC: 30,
        USAGE_PATH: "/tmp/netusage-test-usage.json",
      },
    );
  });

  test("falls back on invalid billing day and interval", () => {
    expectResolved(
      { NETUSAGE_BILLING_DAY: "99", NETUSAGE_INTERVAL_SEC: "0" },
      defaults(),
    );
    expectResolved(
      { NETUSAGE_BILLING_DAY: "abc", NETUSAGE_INTERVAL_SEC: "-5" },
      defaults(),
    );
    expectResolved(
      { NETUSAGE_BILLING_DAY: "", NETUSAGE_HOTSPOT_GATEWAY: "" },
      defaults(),
    );
  });

  test("parse helpers accept valid input and reject the rest", () => {
    expect(parseBillingDay(undefined)).toBe(1);
    expect(parseBillingDay("")).toBe(1);
    expect(parseBillingDay("0")).toBe(1);
    expect(parseBillingDay("29")).toBe(1);
    expect(parseBillingDay("abc")).toBe(1);
    expect(parseBillingDay("15")).toBe(15);
    expect(parseIntervalSec(undefined)).toBe(60);
    expect(parseIntervalSec("0")).toBe(60);
    expect(parseIntervalSec("abc")).toBe(60);
    expect(parseIntervalSec("30")).toBe(30);
    expect(parseText(undefined, "d")).toBe("d");
    expect(parseText("", "d")).toBe("d");
    expect(parseText("x", "d")).toBe("x");
  });
});
