import { homedir } from "node:os";
import { join } from "node:path";

export const BILLING_DAY = 4;
export const HOTSPOT_GATEWAY = "172.20.10.1";
export const TAILSCALE_CIDR = "100.64.0.0/10";
export const SAMPLE_INTERVAL_SEC = 60;

function resolveHomePath(...parts: string[]): string {
  return join(homedir(), ...parts);
}

export const USAGE_PATH = resolveHomePath(".netusage", "usage.json");
export const ERROR_LOG = resolveHomePath(".netusage", "error.log");
