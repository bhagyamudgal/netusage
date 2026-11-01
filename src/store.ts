import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { USAGE_PATH } from "./config";

const counterSchema = z.object({
  ibytes: z.number().int().nonnegative(),
  obytes: z.number().int().nonnegative(),
});

const totalsSchema = z.object({
  up: z.number().nonnegative(),
  down: z.number().nonnegative(),
});

const bucketSchema = z.object({
  direct: totalsSchema,
  vpn: totalsSchema,
});

const cycleEntrySchema = z.object({
  wifi: bucketSchema,
  hotspot: bucketSchema,
});

const usageSchema = z.object({
  version: z.literal(1),
  baselines: z.object({
    en0: counterSchema.optional(),
    proton: counterSchema.optional(),
  }),
  cycles: z.record(z.string(), cycleEntrySchema),
});

/** Raw interface byte counters for one interface. */
export type Counter = z.infer<typeof counterSchema>;

/** Accumulated up/down bytes for one network and kind. */
export type Totals = z.infer<typeof totalsSchema>;

/** One billing cycle of accumulated usage. */
export type CycleEntry = z.infer<typeof cycleEntrySchema>;

/** Persisted usage document. */
export type Usage = z.infer<typeof usageSchema>;

/** Usage file path, honoring the NETUSAGE_PATH test override. */
export function resolveUsagePath(): string {
  const override = process.env.NETUSAGE_PATH;
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return USAGE_PATH;
}

/** Fresh document for first run; baselines stay absent until the first sample lands. */
export function createEmptyUsage(): Usage {
  return { version: 1, baselines: {}, cycles: {} };
}

/** Load and validate the usage document, throwing on corrupt content instead of resetting it. */
export async function loadUsage(filePath: string = resolveUsagePath()): Promise<Usage> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return createEmptyUsage();
    }
    throw error;
  }
  return usageSchema.parse(JSON.parse(raw));
}

/** Persist the usage document atomically through a temp file plus rename. */
export async function saveUsage(usage: Usage, filePath: string = resolveUsagePath()): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(usage, null, 2), "utf8");
  await rename(tmp, filePath);
}

/** Fetch the entry for a cycle key, creating a zeroed one on first use. */
export function ensureCycleEntry(usage: Usage, cycleKey: string): CycleEntry {
  const existing = usage.cycles[cycleKey];
  if (existing !== undefined) {
    return existing;
  }
  const entry: CycleEntry = {
    wifi: {
      direct: { up: 0, down: 0 },
      vpn: { up: 0, down: 0 },
    },
    hotspot: {
      direct: { up: 0, down: 0 },
      vpn: { up: 0, down: 0 },
    },
  };
  usage.cycles[cycleKey] = entry;
  return entry;
}

function isMissingFile(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if (!("code" in error)) {
    return false;
  }
  return error.code === "ENOENT";
}
