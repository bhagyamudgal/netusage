export type IfaceCounters = {
  ibytes: number;
  obytes: number;
};

export type RouteEntry = {
  destination: string;
  gateway: string;
  netif: string;
  flags: string;
};

/** Parses `netstat -ibn` output, keeping one Link row per iface with right-counted byte columns. */
export function parseIbn(output: string): Map<string, IfaceCounters> {
  const result = new Map<string, IfaceCounters>();
  for (const line of output.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 8 || fields[0] === "Name") continue;
    const name = fields[0];
    const network = fields[2] ?? "";
    const isLinkRow = network.startsWith("<Link#");
    if (!isLinkRow) continue;
    if (result.has(name)) continue;
    const ibytes = Number(fields[fields.length - 5]);
    const obytes = Number(fields[fields.length - 2]);
    if (!Number.isFinite(ibytes) || !Number.isFinite(obytes)) continue;
    result.set(name, { ibytes, obytes });
  }
  return result;
}

/** Parses `netstat -rn -f inet` output into destination route entries. */
export function parseRoutes(output: string): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const line of output.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 4) continue;
    if (fields[0] === "Destination" || fields[0] === "Routing") continue;
    if (fields[0].startsWith("===") || fields[0].startsWith("(")) continue;
    const [destination, gateway, flags, netif] = fields;
    if (!destination || !gateway || !flags || !netif) continue;
    routes.push({ destination, gateway, netif, flags });
  }
  return routes;
}

export type RunNetstatResult = {
  ibn: string;
  routes: string;
};

function runCommand(argv: string[]): string {
  const proc = Bun.spawnSync(argv);
  return proc.stdout.toString();
}

/** Runs netstat for interface counters and IPv4 routes. */
export function runNetstat(): RunNetstatResult {
  const ibn = runCommand(["netstat", "-ibn"]);
  const routes = runCommand(["netstat", "-rn", "-f", "inet"]);
  return { ibn, routes };
}
