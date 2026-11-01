import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyUsage, ensureCycleEntry, loadUsage, saveUsage } from "../src/store";
import type { Usage } from "../src/store";

async function tempFile(name: string): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), "netusage-store-"));
  return { dir, file: join(dir, name) };
}

describe("store", () => {
  test("roundtrips baselines and cycles", async () => {
    const { file } = await tempFile("usage.json");
    const usage = createEmptyUsage();
    usage.baselines.en0 = { ibytes: 1000, obytes: 2000 };
    const entry = ensureCycleEntry(usage, "2026-10-04");
    entry.wifi.direct.up += 10;
    entry.wifi.direct.down += 20;
    await saveUsage(usage, file);
    await expect(loadUsage(file)).resolves.toEqual(usage);
  });

  test("throws on corrupt content instead of resetting", async () => {
    const { file } = await tempFile("usage.json");
    await writeFile(file, "{not json", "utf8");
    await expect(loadUsage(file)).rejects.toThrow();
    await writeFile(file, JSON.stringify({ version: 1, baselines: {}, cycles: { bogus: 1 } }), "utf8");
    await expect(loadUsage(file)).rejects.toThrow();
  });

  test("saves atomically with no temp leftovers", async () => {
    const { dir, file } = await tempFile("usage.json");
    const usage: Usage = createEmptyUsage();
    await saveUsage(usage, file);
    expect(await readdir(dir)).toEqual(["usage.json"]);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(usage);
  });

  test("honors the NETUSAGE_PATH override", async () => {
    const { file } = await tempFile("override.json");
    const previous = process.env.NETUSAGE_PATH;
    process.env.NETUSAGE_PATH = file;
    try {
      await saveUsage(createEmptyUsage());
      await expect(loadUsage()).resolves.toEqual(createEmptyUsage());
    } finally {
      if (previous === undefined) {
        delete process.env.NETUSAGE_PATH;
      } else {
        process.env.NETUSAGE_PATH = previous;
      }
    }
  });
});
