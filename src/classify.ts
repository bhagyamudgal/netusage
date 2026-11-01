import { BILLING_DAY, HOTSPOT_GATEWAY } from "./config";
import type { RouteEntry } from "./netstat";

export type NetworkKind = "wifi" | "hotspot" | "offline";

export function isTailscaleIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 100 && b >= 64 && b <= 127;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

/** Finds the ProtonVPN utun: a utun iface whose ibn output has an IPv4 row outside the Tailscale range. */
export function detectProton(ibnOutput: string): string | null {
  const ipv4ByIface = new Map<string, string[]>();
  for (const line of ibnOutput.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 4 || fields[0] === "Name") continue;
    const name = fields[0];
    const network = fields[2] ?? "";
    const address = fields[3] ?? "";
    if (!name.startsWith("utun")) continue;
    if (network.startsWith("<Link#")) continue;
    if (!isIpv4(address)) continue;
    const list = ipv4ByIface.get(name) ?? [];
    list.push(address);
    ipv4ByIface.set(name, list);
  }
  for (const [name, ips] of ipv4ByIface) {
    if (ips.some((ip) => !isTailscaleIp(ip))) return name;
  }
  return null;
}

/** Classifies the network from the en0 default row, scoped or primary, preferring the no-I row. */
export function classifyNetwork(routes: RouteEntry[]): NetworkKind {
  const en0Defaults = routes.filter(
    (r) => (r.destination === "default" || r.gateway === "default") && r.netif === "en0",
  );
  const chosen = en0Defaults.find((r) => !r.flags.includes("I")) ?? en0Defaults[0];
  if (!chosen) return "offline";
  if (chosen.gateway === HOTSPOT_GATEWAY) return "hotspot";
  return "wifi";
}

/** Reports true when the primary default route (no I flag) exits via the Proton utun. */
export function isFullTunnel(routes: RouteEntry[], protonUtun: string | null): boolean {
  if (protonUtun === null) return false;
  const scoped = routes.filter((r) => r.destination === "default");
  const primary = scoped.find((r) => !r.flags.includes("I")) ?? scoped[0];
  if (!primary) return false;
  return primary.netif === protonUtun;
}

export function isBillingDay(date: Date): boolean {
  return date.getDate() === BILLING_DAY;
}
