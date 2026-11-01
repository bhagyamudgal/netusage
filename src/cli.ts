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

/** Fixed width of every terminal bar, identical piped or not. */
export const BAR_WIDTH = 20;

/** Render a fraction 0-1 as a fixed-width block bar, clamping outside input. */
export function bar(fraction: number, width: number): string {
  if (width <= 0) {
    return "";
  }
  const size = Math.floor(width);
  const clamped = Number.isNaN(fraction) ? 0 : Math.min(1, Math.max(0, fraction));
  const filled = Math.round(clamped * size);
  return "█".repeat(filled) + " ".repeat(size - filled);
}

/** Render one bucket as up/down shares scaled to the cycle maximum. */
export function splitBar(up: number, down: number, maxTotal: number, width: number): string {
  if (width <= 0) {
    return "";
  }
  const size = Math.floor(width);
  const safeUp = up > 0 ? up : 0;
  const safeDown = down > 0 ? down : 0;
  const total = safeUp + safeDown;
  if (!(maxTotal > 0) || total <= 0) {
    return " ".repeat(size);
  }
  const filled = Math.min(size, Math.round((total / maxTotal) * size));
  const upLength = Math.round((safeUp / total) * filled);
  return "█".repeat(upLength) + "░".repeat(filled - upLength) + " ".repeat(size - filled);
}

/** Render bucket totals as one stacked bar, glyph per bucket in legend order. */
export function stackedBar(values: number[], width: number): string {
  const glyphs = ["█", "▓", "▒", "░"];
  if (width <= 0) {
    return "";
  }
  const size = Math.floor(width);
  const safe = values.map(function (value) {
    return value > 0 ? value : 0;
  });
  const total = safe.reduce(function (sum, value) {
    return sum + value;
  }, 0);
  if (total <= 0) {
    return " ".repeat(size);
  }
  const exact = safe.map(function (value) {
    return (value / total) * size;
  });
  const lengths = exact.map(function (part) {
    return Math.floor(part);
  });
  const remainder =
    size -
    lengths.reduce(function (sum, part) {
      return sum + part;
    }, 0);
  const order = exact
    .map(function (part, index) {
      return { frac: part - Math.floor(part), index };
    })
    .sort(function (first, second) {
      return second.frac - first.frac;
    });
  for (let rank = 0; rank < remainder; rank += 1) {
    const slot = order[rank % order.length];
    if (slot !== undefined && lengths[slot.index] !== undefined) {
      lengths[slot.index] += 1;
    }
  }
  return lengths
    .map(function (length, index) {
      const glyph = glyphs[index % glyphs.length];
      return glyph === undefined ? "" : glyph.repeat(length);
    })
    .join("");
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
    const buckets = [entry.wifi.direct, entry.wifi.vpn, entry.hotspot.direct, entry.hotspot.vpn];
    const names = ["wifi/direct", "wifi/vpn", "hotspot/direct", "hotspot/vpn"];
    const maxTotal = Math.max(
      ...buckets.map(function (bucket) {
        return bucket.up + bucket.down;
      }),
    );
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index];
      const name = names[index];
      if (bucket === undefined || name === undefined) {
        continue;
      }
      console.log(`  ${name} bar [${splitBar(bucket.up, bucket.down, maxTotal, BAR_WIDTH)}]`);
    }
    const combinedValues = buckets.map(function (bucket) {
      return bucket.up + bucket.down;
    });
    console.log(`  combined bar [${stackedBar(combinedValues, BAR_WIDTH)}]`);
    console.log("  legend up=█ down=░ combined: █=wifi/direct ▓=wifi/vpn ▒=hotspot/direct ░=hotspot/vpn");
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
