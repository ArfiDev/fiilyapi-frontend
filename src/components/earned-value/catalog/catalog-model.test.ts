import { describe, it, expect } from "vitest";

import type { EvCatalogItemRead } from "@/lib/api/models";
import { EMPTY_CELL } from "@/lib/format";

import {
  canAdoptActual,
  countByDiscipline,
  diffBand,
  filterCatalogItems,
  formatDiffPercent,
  siteDeviationRatio,
  summarizeCatalog,
} from "./catalog-model";

function item(overrides: Partial<EvCatalogItemRead> = {}): EvCatalogItemRead {
  return {
    id: "i-1",
    poz_no: "KAB-0001",
    discipline: { id: "d-kab", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" },
    name: "Beton döküm",
    uom: "m³",
    standard_unit_mhr: "1.8000",
    default_contractor_type: "own",
    description: null,
    standard_updated_at: "2026-03-14T09:00:00Z",
    used_by_site_count: 0,
    actual: { avg: null, min: null, max: null, site_count: 0, sites: [] },
    diff_pct: null,
    ...overrides,
  };
}

describe("diffBand — sabit ±%10 (K4), GÖSTERİLEN 1 ondalıklı değere uygulanır", () => {
  it("veri yoksa none", () => {
    expect(diffBand(null)).toBe("none");
  });

  it("+%10,0 sınırda NORMAL (KAT:449 `d > 10` kesin büyük)", () => {
    expect(diffBand("0.1")).toBe("normal");
    expect(diffBand("-0.1")).toBe("normal");
  });

  it("gösterilen değer %10,1 ise büyük fark: pozitif over (kırmızı), negatif under (yeşil)", () => {
    expect(diffBand("0.101")).toBe("over");
    expect(diffBand("-0.101")).toBe("under");
  });

  it("ham 0,10049 → gösterilen %10,0 → normal (renk ile metin çelişmez)", () => {
    expect(diffBand("0.10049")).toBe("normal");
    expect(formatDiffPercent("0.10049")).toBe("+%10,0");
  });

  it("ham 0,10050 → gösterilen %10,1 → over", () => {
    expect(diffBand("0.1005")).toBe("over");
  });
});

describe("formatDiffPercent — KAT:448 `+%13,9` / `−%5,0` biçimi", () => {
  it("işaret yüzde işaretinden önce, 1 ondalık", () => {
    expect(formatDiffPercent("0.13888")).toBe("+%13,9");
    expect(formatDiffPercent("-0.05")).toBe("−%5,0");
  });

  it("yuvarlanınca sıfırsa işaretsiz", () => {
    expect(formatDiffPercent("0.0004")).toBe("%0,0");
  });

  it("veri yoksa boş hücre", () => {
    expect(formatDiffPercent(null)).toBe(EMPTY_CELL);
  });
});

describe("siteDeviationRatio — şantiye oranının standarttan farkı (KAT:488)", () => {
  it("(oran − standart) ÷ standart", () => {
    expect(Number(siteDeviationRatio("2.12", "1.8"))).toBeCloseTo(0.177778, 5);
  });

  it("standart sıfırsa null (sıfıra bölme — §3.6)", () => {
    expect(siteDeviationRatio("2", "0")).toBeNull();
  });
});

describe("filterCatalogItems", () => {
  const items = [
    item({ id: "a", name: "İç sıva", discipline: { id: "d-duv", code: "DUV", name: "Duvar", color: "#93c5fd" }, diff_pct: "0.12" }),
    item({ id: "b", name: "Beton döküm", diff_pct: "0.05" }),
    item({ id: "c", name: "Kalıp", diff_pct: null }),
  ];

  it("arama Türkçe harf duyarsızdır (İ/i)", () => {
    expect(filterCatalogItems(items, { query: "iç", disciplineId: null, onlyBig: false }).map((i) => i.id)).toEqual(["a"]);
    expect(filterCatalogItems(items, { query: "BETON", disciplineId: null, onlyBig: false }).map((i) => i.id)).toEqual(["b"]);
  });

  it("disiplin süzgeci", () => {
    expect(filterCatalogItems(items, { query: "", disciplineId: "d-kab", onlyBig: false }).map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("yalnız farkı büyük olanlar: veri olmayan ve normal satırlar düşer", () => {
    expect(filterCatalogItems(items, { query: "", disciplineId: null, onlyBig: true }).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("summarizeCatalog / countByDiscipline", () => {
  it("üst çiplerin sayıları: toplam, gerçekleşen verili, büyük fark, tamamlanan şantiye (tekil)", () => {
    const site = (id: string) => ({ site_id: id, site_name: id, end_date: null, qty: "1", rate: "1" });
    const items = [
      item({ id: "a", diff_pct: "0.2", actual: { avg: "2", min: "2", max: "2", site_count: 2, sites: [site("s1"), site("s2")] } }),
      item({ id: "b", diff_pct: "0.01", actual: { avg: "1", min: "1", max: "1", site_count: 1, sites: [site("s2")] } }),
      item({ id: "c" }),
    ];
    expect(summarizeCatalog(items)).toEqual({ total: 3, withActual: 2, bigDiff: 1, completedSites: 2 });
  });

  it("disiplin başına iş tipi sayısı", () => {
    const counts = countByDiscipline([item({ id: "a" }), item({ id: "b" })]);
    expect(counts.get("d-kab")).toBe(2);
    expect(counts.get("yok")).toBeUndefined();
  });
});

describe("canAdoptActual — ↺ yalnız ortalama varken ve fark sıfır değilken (KAT:487)", () => {
  it("ortalama yoksa (B1) görünmez", () => {
    expect(canAdoptActual(item())).toBe(false);
  });

  it("ortalama var, fark ≠ 0 → görünür", () => {
    expect(canAdoptActual(item({ diff_pct: "0.14", actual: { avg: "2.05", min: "1.94", max: "2.12", site_count: 3, sites: [] } }))).toBe(true);
  });

  it("gösterilen fark %0,0 ise görünmez", () => {
    expect(canAdoptActual(item({ diff_pct: "0.0001", actual: { avg: "1.8", min: "1.8", max: "1.8", site_count: 1, sites: [] } }))).toBe(false);
  });
});
