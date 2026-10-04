import { describe, expect, it } from "vitest";

import {
  countByDiscipline,
  filterWorkItems,
  formatMoneyTl,
  formatPrice,
  formatPriceUpdated,
  formatStandardRate,
  formatWholeNumber,
  isPriceStale,
  refPriceDateLabel,
  sortByPozNo,
} from "./work-item-model";
import { BETON, DEMIR, D_DUV, D_KAB, KAT_BOTH, KAT_DATE_ONLY, SIVA } from "./work-item-fixtures";

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

  it("Bakanlık no (source_code) ile arar; null güvenli ('15.100' → kalem bulunur)", () => {
    const withSource = [BETON, KAT_BOTH, KAT_DATE_ONLY];
    expect(filterWorkItems(withSource, { query: "15.100", disciplineId: null }).map((i) => i.id)).toEqual(["i-kb"]);
    expect(filterWorkItems(withSource, { query: "15.100.1001", disciplineId: null }).map((i) => i.id)).toEqual(["i-kb"]);
    // source_code null/undefined olan kalemler "null" / "undefined" metniyle eşleşmez
    expect(filterWorkItems(withSource, { query: "null", disciplineId: null })).toEqual([]);
    expect(filterWorkItems(withSource, { query: "undefined", disciplineId: null })).toEqual([]);
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

  it("formatMoneyTl: TD tl(v) — '₺' boşluksuz + 2 haneli kuruş; null → —", () => {
    expect(formatMoneyTl("73982140")).toBe("₺73.982.140,00");
    expect(formatMoneyTl("61250000.50")).toBe("₺61.250.000,50");
    expect(formatMoneyTl(null)).toBe("—");
  });

  it("formatWholeNumber: TD nf(v) — kuruşsuz, binlik nokta, yarım sıfırdan uzağa (Intl halfExpand); null → —", () => {
    expect(formatWholeNumber("5044.0000")).toBe("5.044");
    expect(formatWholeNumber("360.4999")).toBe("360");
    expect(formatWholeNumber("1234.5")).toBe("1.235");
    expect(formatWholeNumber("-0.5")).toBe("-1");
    expect(formatWholeNumber("12345678901234567.5")).toBe("12.345.678.901.234.568");
    expect(formatWholeNumber(null)).toBe("—");
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
});

describe("refPriceDateLabel — T47 'Bakanlık · GG.AA.YYYY' (üç durum)", () => {
  it("kod + tarih → 'Bakanlık · 01.01.2026'", () => {
    expect(refPriceDateLabel(KAT_BOTH)).toBe("Bakanlık · 01.01.2026");
  });

  it("kod YOK, tarih var → yalnız tarih", () => {
    expect(refPriceDateLabel(KAT_DATE_ONLY)).toBe("01.01.2026");
    expect(refPriceDateLabel({ source_code: "", ref_price_date: "2026-01-01" })).toBe("01.01.2026");
  });

  it("tarih YOK → null (satır basılmaz); kod olsa bile", () => {
    expect(refPriceDateLabel(BETON)).toBeNull();
    expect(refPriceDateLabel({ source_code: "15.100.1001", ref_price_date: null })).toBeNull();
  });
});
