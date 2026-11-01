import { BILLING_DAY } from "./config";
import { classifyNetwork, detectProton, isFullTunnel } from "./classify";
import { parseIbn, parseRoutes, runNetstat } from "./netstat";
import { cycleKeyFor } from "./cycle";
import { computeDelta } from "./delta";
import { ensureCycleEntry, loadUsage, saveUsage } from "./store";

/** Up/down byte deltas for one sample. */
export type DeltaTotals = {
  up: number;
  down: number;
};

/** VPN and direct shares of one sample. */
export type SplitResult = {
  vpn: DeltaTotals;
  direct: DeltaTotals;
};

/** Split an en0 delta under the full-tunnel rule, capping split-tunnel VPN at the en0 delta. */
export function splitUsage(en0: DeltaTotals, proton: DeltaTotals, fullTunnel: boolean): SplitResult {
  if (fullTunnel) {
    return {
      vpn: { up: en0.up, down: en0.down },
      direct: { up: 0, down: 0 },
    };
  }
  const vpn: DeltaTotals = {
    up: Math.min(proton.up, en0.up),
    down: Math.min(proton.down, en0.down),
  };
  return {
    vpn,
    direct: { up: en0.up - vpn.up, down: en0.down - vpn.down },
  };
}

/** Record one sample into the current billing cycle, always advancing baselines first. */
export async function sample(): Promise<void> {
  const usage = await loadUsage();
  const raw = runNetstat();
  const interfaces = parseIbn(raw.ibn);
  const routes = parseRoutes(raw.routes);
  const protonUtun = detectProton(raw.ibn);
  const network = classifyNetwork(routes);
  const en0Now = interfaces.get("en0");
  const protonNow = protonUtun === null ? undefined : interfaces.get(protonUtun);
  const previousEn0 = usage.baselines.en0;
  const previousProton = usage.baselines.proton;
  const en0Delta: DeltaTotals = {
    up: en0Now ? computeDelta(previousEn0?.obytes, en0Now.obytes) : 0,
    down: en0Now ? computeDelta(previousEn0?.ibytes, en0Now.ibytes) : 0,
  };
  const protonDelta: DeltaTotals = {
    up: protonNow ? computeDelta(previousProton?.obytes, protonNow.obytes) : 0,
    down: protonNow ? computeDelta(previousProton?.ibytes, protonNow.ibytes) : 0,
  };
  if (en0Now) {
    usage.baselines.en0 = { ibytes: en0Now.ibytes, obytes: en0Now.obytes };
  }
  if (protonNow) {
    usage.baselines.proton = { ibytes: protonNow.ibytes, obytes: protonNow.obytes };
  }
  if (network !== "wifi" && network !== "hotspot") {
    await saveUsage(usage);
    return;
  }
  if (!en0Now) {
    await saveUsage(usage);
    return;
  }
  const split = splitUsage(en0Delta, protonDelta, isFullTunnel(routes, protonUtun));
  const entry = ensureCycleEntry(usage, cycleKeyFor(new Date(), BILLING_DAY));
  entry[network].direct.up += split.direct.up;
  entry[network].direct.down += split.direct.down;
  entry[network].vpn.up += split.vpn.up;
  entry[network].vpn.down += split.vpn.down;
  await saveUsage(usage);
}

/** Print every cycle newest-first with GB totals per network and kind. */
export async function report(): Promise<void> {
  const usage = await loadUsage();
  const keys = Object.keys(usage.cycles).sort().reverse();
  for (const key of keys) {
    const entry = usage.cycles[key];
    if (entry === undefined) {
      continue;
    }
    console.log(`Cycle ${key}`);
    for (const network of ["wifi", "hotspot"] as const) {
      for (const kind of ["direct", "vpn"] as const) {
        const totals = entry[network][kind];
        console.log(`  ${network}/${kind} up ${toGB(totals.up)} down ${toGB(totals.down)}`);
      }
    }
    const wifi = addTotals(entry.wifi.direct, entry.wifi.vpn);
    const hotspot = addTotals(entry.hotspot.direct, entry.hotspot.vpn);
    const direct = addTotals(entry.wifi.direct, entry.hotspot.direct);
    const vpn = addTotals(entry.wifi.vpn, entry.hotspot.vpn);
    const combined = addTotals(wifi, hotspot);
    console.log(`  wifi total up ${toGB(wifi.up)} down ${toGB(wifi.down)}`);
    console.log(`  hotspot total up ${toGB(hotspot.up)} down ${toGB(hotspot.down)}`);
    console.log(`  direct total up ${toGB(direct.up)} down ${toGB(direct.down)}`);
    console.log(`  vpn total up ${toGB(vpn.up)} down ${toGB(vpn.down)}`);
    console.log(`  combined total up ${toGB(combined.up)} down ${toGB(combined.down)}`);
  }
}

/** Run the sample or report command selected from argv. */
export async function runCli(argv: string[]): Promise<void> {
  const command = argv[0];
  if (command === "sample") {
    await sample();
    return;
  }
  if (command === "report") {
    await report();
    return;
  }
  console.error("Usage: cli.ts <sample|report>");
  process.exitCode = 1;
}

if (import.meta.main) {
  await runCli(process.argv.slice(2));
}

function toGB(bytes: number): string {
  return `${(bytes / 1000000000).toFixed(2)} GB`;
}

function addTotals(first: DeltaTotals, second: DeltaTotals): DeltaTotals {
  return { up: first.up + second.up, down: first.down + second.down };
}
