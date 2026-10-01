import { describe, expect, it } from "vitest";

import {
  countByDiscipline,
  filterWorkItems,
  formatPrice,
  formatPriceUpdated,
  formatStandardRate,
  isPriceStale,
  sortByPozNo,
  tabCounts,
} from "./work-item-model";
import { BETON, DEMIR, D_DUV, D_KAB, SIVA } from "./work-item-fixtures";

describe("sortByPozNo — poz no'ya göre (KIK:247)", () => {
  it("disiplin koduna sonra sıraya göre dizer; girdiyi değiştirmez", () => {
    const input = [SIVA, DEMIR, BETON];
    const sorted = sortByPozNo(input);
    expect(sorted.map((i) => i.poz_no)).toEqual(["DUV-0001", "KAB-0001", "KAB-0002"]);
    expect(input.map((i) => i.poz_no)).toEqual(["DUV-0001", "KAB-0002", "KAB-0001"]);
  });

  it("5 haneye taşan sıra sayısal sıralanır (KAB-9999 < KAB-10000)", () => {
    const wide = { ...BETON, id: "i-w", poz_no: "KAB-10000" };
    const narrow = { ...BETON, id: "i-n", poz_no: "KAB-9999" };
    expect(sortByPozNo([wide, narrow]).map((i) => i.poz_no)).toEqual(["KAB-9999", "KAB-10000"]);
  });
});

describe("filterWorkItems — poz no + tarif, tr-TR (KIK:243-246)", () => {
  const all = [BETON, DEMIR, SIVA];

  it("boş arama + disiplin yok → hepsi", () => {
    expect(filterWorkItems(all, { query: "", disciplineId: null })).toHaveLength(3);
  });

  it("poz no ile arar", () => {
    const hit = filterWorkItems(all, { query: "duv-00", disciplineId: null });
    expect(hit.map((i) => i.id)).toEqual(["i-siv"]);
  });

  it("tarifle arar; 'İ'/'ı' tr-TR küçük harfle eşleşir (İç sıva ← 'iç')", () => {
    expect(filterWorkItems(all, { query: "iç sıva", disciplineId: null }).map((i) => i.id)).toEqual(["i-siv"]);
    expect(filterWorkItems(all, { query: "  İÇ  ", disciplineId: null }).map((i) => i.id)).toEqual(["i-siv"]);
  });

  it("disiplin çipi süzer", () => {
    const hit = filterWorkItems(all, { query: "", disciplineId: D_KAB.id });
    expect(hit.map((i) => i.id)).toEqual(["i-bet", "i-dem"]);
  });

  it("arama ve disiplin birlikte uygulanır", () => {
    expect(filterWorkItems(all, { query: "demir", disciplineId: D_DUV.id })).toEqual([]);
  });
});

describe("countByDiscipline — çip sayıları istemcide", () => {
  it("disiplin kimliğine göre sayar", () => {
    const counts = countByDiscipline([BETON, DEMIR, SIVA]);
    expect(counts.get(D_KAB.id)).toBe(2);
    expect(counts.get(D_DUV.id)).toBe(1);
  });
});

describe("isPriceStale — 182 gün eşiği (KIK:240 `> 182`)", () => {
  const NOW = new Date("2026-10-01T12:00:00Z");

  it("tam 182 gün önce → turuncu DEĞİL", () => {
    expect(isPriceStale("2026-04-02T09:00:00Z", NOW)).toBe(false);
  });

  it("183 gün önce → turuncu", () => {
    expect(isPriceStale("2026-04-01T09:00:00Z", NOW)).toBe(true);
  });

  it("fiyat tarihi yoksa (NULL) turuncu değil", () => {
    expect(isPriceStale(null, NOW)).toBe(false);
  });

  it("bugün güncellenmiş fiyat turuncu değil", () => {
    expect(isPriceStale("2026-10-01T08:00:00Z", NOW)).toBe(false);
  });
});

describe("biçimleyiciler — kayıpsız, tr-TR", () => {
  it("formatPrice: binlik nokta, 2 ondalık; null → —", () => {
    expect(formatPrice("1250.50")).toBe("1.250,50");
    expect(formatPrice("28000")).toBe("28.000,00");
    expect(formatPrice("0")).toBe("0,00");
    expect(formatPrice("12345678901234.56")).toBe("12.345.678.901.234,56");
    expect(formatPrice(null)).toBe("—");
  });

  it("formatStandardRate: en az 2, en çok 4 ondalık, sondaki sıfır atılır (kayıp yok)", () => {
    expect(formatStandardRate("1.8000")).toBe("1,80");
    expect(formatStandardRate("0.1234")).toBe("0,1234");
    expect(formatStandardRate("11.5000")).toBe("11,50");
  });

  it("formatPriceUpdated: GG.AA.YYYY (İstanbul günü); null → —", () => {
    expect(formatPriceUpdated("2026-09-01T09:00:00Z")).toBe("01.09.2026");
    expect(formatPriceUpdated(null)).toBe("—");
  });
});

describe("kaydedilmemiş yeni satırlar sayaçlara girer (KIK:277-279)", () => {
  it("countByDiscipline ek disiplin kimliklerini sayar", () => {
    const counts = countByDiscipline([BETON, SIVA], ["d-kab", "d-kab", "d-duv"]);
    expect(counts.get("d-kab")).toBe(3);
    expect(counts.get("d-duv")).toBe(2);
  });

  it("tabCounts kalem sayacına yeni satırları ekler; birim/disiplin sayacı değişmez", () => {
    expect(tabCounts([BETON, DEMIR, SIVA], [D_KAB, D_DUV], 2)).toEqual({ items: 5, disciplines: 2, units: 3 });
  });
});

describe("tabCounts — ÜS-9 sayaçları", () => {
  it("İş Kalemleri = kalem sayısı · Disiplinler = disiplin sayısı · Birimler = farklı birim", () => {
    expect(tabCounts([BETON, DEMIR, SIVA], [D_KAB, D_DUV])).toEqual({ items: 3, disciplines: 2, units: 3 });
    expect(tabCounts([BETON, BETON], [D_KAB])).toEqual({ items: 2, disciplines: 1, units: 1 });
  });
});
