import { describe, expect, test } from "bun:test";
import { classifyNetwork, detectProton, isFullTunnel } from "../src/classify";
import { parseRoutes } from "../src/netstat";
import {
  IBN_FIXTURE,
  ROUTES_FULL_TUNNEL_FIXTURE,
  ROUTES_HOTSPOT_FIXTURE,
  ROUTES_OFFLINE_FIXTURE,
  ROUTES_WIFI_FIXTURE,
} from "./fixtures";

describe("detectProton", () => {
  test("finds utun with non-tailscale ipv4, ignores tailscale and system utuns", () => {
    expect(detectProton(IBN_FIXTURE)).toBe("utun5");
  });

  test("returns null when only tailscale and system utuns exist", () => {
    const output = `Name  Mtu  Network  Address  Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
utun0  1500  <Link#19>  0  0  0  1  0  80  0
utun9  1500  <Link#25>  0  0  0  5  0  400  0
utun9  1380  100.115.92.48  100.115.92.48  10  0  1000  8  0  800  0`;
    expect(detectProton(output)).toBeNull();
  });
});

describe("classifyNetwork", () => {
  test("wifi for non-hotspot gateway on en0", () => {
    expect(classifyNetwork(parseRoutes(ROUTES_WIFI_FIXTURE))).toBe("wifi");
  });

  test("hotspot for 172.20.10.1 on en0", () => {
    expect(classifyNetwork(parseRoutes(ROUTES_HOTSPOT_FIXTURE))).toBe("hotspot");
  });

  test("offline when no default on en0", () => {
    expect(classifyNetwork(parseRoutes(ROUTES_OFFLINE_FIXTURE))).toBe("offline");
  });
});

describe("isFullTunnel", () => {
  test("false for split tunnel wifi fixture", () => {
    expect(isFullTunnel(parseRoutes(ROUTES_WIFI_FIXTURE), "utun5")).toBe(false);
  });

  test("true when primary default exits via proton utun", () => {
    expect(isFullTunnel(parseRoutes(ROUTES_FULL_TUNNEL_FIXTURE), "utun5")).toBe(true);
  });

  test("false when proton utun is null", () => {
    expect(isFullTunnel(parseRoutes(ROUTES_WIFI_FIXTURE), null)).toBe(false);
  });
});
