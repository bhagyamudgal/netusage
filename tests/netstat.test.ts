import { describe, expect, test } from "bun:test";
import { parseIbn, parseRoutes } from "../src/netstat";
import {
  EN0_LINK_ROW,
  IBN_FIXTURE,
  ROUTES_WIFI_FIXTURE,
  UTUN_EMPTY_LINK_ROW,
} from "./fixtures";

describe("parseIbn", () => {
  test("parses en0 link row with right-counted bytes", () => {
    const map = parseIbn(`Name  Mtu  Network  Address  Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll\n${EN0_LINK_ROW}`);
    expect(map.get("en0")).toEqual({ ibytes: 207983672357, obytes: 51621443008 });
  });

  test("parses empty-address link row with NF=10", () => {
    const map = parseIbn(`Name  Mtu  Network  Address  Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll\n${UTUN_EMPTY_LINK_ROW}`);
    expect(map.get("utun0")).toEqual({ ibytes: 0, obytes: 80 });
  });

  test("keeps one row per iface and skips non-link rows", () => {
    const map = parseIbn(IBN_FIXTURE);
    expect(map.get("en0")).toEqual({ ibytes: 207983672357, obytes: 51621443008 });
    expect(map.get("utun9")).toEqual({ ibytes: 0, obytes: 400 });
    expect(map.get("utun5")).toEqual({ ibytes: 0, obytes: 560 });
  });
});

describe("parseRoutes", () => {
  test("parses wifi routes with flags and netif", () => {
    const routes = parseRoutes(ROUTES_WIFI_FIXTURE);
    const primary = routes.find((r) => r.destination === "default" && r.flags === "UGScg");
    expect(primary).toMatchObject({ gateway: "192.168.5.1", netif: "en0", flags: "UGScg" });
  });
});
