import { describe, expect, it } from "vitest";

import { buildRouteTree, resolveHrefIn } from "@/components/shell/route-tree.testkit";

import {
  BALANCE_SHEET_URL,
  CASH_FLOW_URL,
  FINANCIAL_NAV_HEADING,
  FINANCIAL_STATEMENTS_URL,
  FINANCIAL_SUB_NAV,
  financialNavItemHref,
} from "./financial-statements-nav-config";

describe("Mali Tablolar segment yapılandırması — BL:24-31 kaynaklı", () => {
  it("grup başlığı BL:25'in metnidir", () => {
    expect(FINANCIAL_NAV_HEADING).toBe("Mali");
  });

  it("alt sekmeler mockup'ın SIRASIYLA üç tanedir (BL:28-30)", () => {
    expect(FINANCIAL_SUB_NAV.map((i) => i.label)).toEqual([
      "Gelir Tablosu",
      "Bilanço",
      "Nakit Akışı",
    ]);
  });

  it("`Bilanço` ve `Nakit Akışı` EXACT bağlantıdır, `Gelir Tablosu` DEĞİLDİR", () => {
    expect(FINANCIAL_SUB_NAV[1]).toMatchObject({
      kind: "link",
      href: BALANCE_SHEET_URL,
      exact: true,
    });
    expect(FINANCIAL_SUB_NAV[2]).toMatchObject({
      kind: "link",
      href: CASH_FLOW_URL,
      exact: true,
    });
    // 🔴 F-MT2 K3 — `disabled` DEĞİL, üst öğeyi (kök ekranı) YANSITAN işaretçi.
    expect(FINANCIAL_SUB_NAV[0]).toEqual({
      kind: "mirror",
      label: "Gelir Tablosu",
      mirrorsHref: FINANCIAL_STATEMENTS_URL,
    });
  });

  it("`financialNavItemHref` her iki `kind` için de DOĞRU hedefi döner", () => {
    for (const item of FINANCIAL_SUB_NAV) {
      const expected = item.kind === "mirror" ? item.mirrorsHref : item.href;
      expect(financialNavItemHref(item)).toBe(expected);
    }
  });
});

describe("kırık link koruması — yüzey nav bekçisine KAYDEDİLİR", () => {
  const ROUTE_TREE = buildRouteTree();
  // 🔴 Yansıtıcı `Gelir Tablosu` (BL:28) bu kümeye GİRMEZ — o bir `link`
  // değildir, hiç çözümlenmez (hedefi zaten üst öğenin href'idir).
  const LINKS = FINANCIAL_SUB_NAV.filter((item) => item.kind === "link");

  /**
   * Küme SAYILIDIR: sessizce büyüyemez, çünkü aşağıdaki iddia beklenen
   * kümeyi ölçülenle TAM eşitler.
   */
  const PENDING_ROUTE_HREFS = new Set<string>([]);

  it("hiçbir bağlantı dinamik bir segmente ya da hiçliğe düşmez", () => {
    for (const item of LINKS) {
      const result = resolveHrefIn(ROUTE_TREE, item.href, false);
      expect(
        result.kind === "static" || result.kind === "catch-all",
        `"${item.label}" (${item.href}) geçersiz: ${JSON.stringify(result)}`,
      ).toBe(true);
    }
  });

  it("🔴 BU dilimin açtığı yol GERÇEK statik rotadır (catch-all DEĞİL)", () => {
    // Bir sekme LİNK'e çevrilip rotası açılmazsa kullanıcı "açıldı" sanılan
    // boş bir ComingSoon ekranı görür (F-MU2 dersi).
    expect(resolveHrefIn(ROUTE_TREE, BALANCE_SHEET_URL, false)).toEqual({
      kind: "static",
    });
    expect(resolveHrefIn(ROUTE_TREE, CASH_FLOW_URL, false)).toEqual({
      kind: "static",
    });
  });

  it("bekleyen rotalar SAYILIDIR — sessizce büyüyemez", () => {
    const pending = LINKS.filter(
      (item) => resolveHrefIn(ROUTE_TREE, item.href, false).kind !== "static",
    ).map((item) => item.href);
    expect(new Set(pending)).toEqual(PENDING_ROUTE_HREFS);
  });
});
