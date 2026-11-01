import { homedir } from "node:os";
import { join } from "node:path";

/** Parse a 1-28 billing day, falling back to 1 on missing or invalid input. */
export function parseBillingDay(raw: string | undefined): number {
  if (raw === undefined || raw.length === 0) {
    return 1;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 28) {
    return 1;
  }
  return parsed;
}

/** Parse a positive sample interval in seconds, falling back to 60. */
export function parseIntervalSec(raw: string | undefined): number {
  if (raw === undefined || raw.length === 0) {
    return 60;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 60;
  }
  return parsed;
}

/** Resolve optional text config, falling back when unset or empty. */
export function parseText(raw: string | undefined, fallback: string): string {
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  return raw;
}

/** First day of the billing cycle, local time. */
export const BILLING_DAY = parseBillingDay(process.env.NETUSAGE_BILLING_DAY);

/** Default gateway address that identifies the iPhone USB hotspot network. */
export const HOTSPOT_GATEWAY = parseText(process.env.NETUSAGE_HOTSPOT_GATEWAY, "172.20.10.1");

/** Carrier-grade NAT range treated as direct traffic. */
export const TAILSCALE_CIDR = parseText(process.env.NETUSAGE_TAILSCALE_CIDR, "100.64.0.0/10");

/** Seconds between launchd samples. */
export const SAMPLE_INTERVAL_SEC = parseIntervalSec(process.env.NETUSAGE_INTERVAL_SEC);

/** JSON store path, honoring the NETUSAGE_PATH override. */
export const USAGE_PATH = parseText(
  process.env.NETUSAGE_PATH,
  join(homedir(), ".netusage", "usage.json"),
);

/** Sampler log path. */
export const ERROR_LOG = join(homedir(), ".netusage", "error.log");
