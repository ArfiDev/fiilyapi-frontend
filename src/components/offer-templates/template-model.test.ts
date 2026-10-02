import { describe, expect, it } from "vitest";

import type { WorkItemRead } from "@/lib/api/models";

import { makeTemplateListItem } from "./template-fixtures";
import {
  catalogPriceCell,
  formatAsPerUnit,
  formatUpdatedDate,
  groupCode,
  resolveSelectedId,
  searchTemplates,
} from "./template-model";

const catalog = (overrides: Partial<WorkItemRead>) => overrides as WorkItemRead;

describe("searchTemplates (istemci, tr-TR küçük harf)", () => {
  const items = [
    makeTemplateListItem({ id: "a", name: "Isı yalıtımı İŞLERİ" }),
    makeTemplateListItem({ id: "b", name: "Konut · kaba inşaat" }),
  ];

  it("'İ' ve 'I' Türkçe kurala göre küçülür: 'işleri' bulur, 'isi' bulmaz", () => {
    expect(searchTemplates(items, "işleri").map((t) => t.id)).toEqual(["a"]);
    expect(searchTemplates(items, "ISI").map((t) => t.id)).toEqual(["a"]);
    expect(searchTemplates(items, "iSİ")).toEqual([]);
  });

  it("boş arama hepsini, sırayı koruyarak döner", () => {
    expect(searchTemplates(items, "  ").map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("formatUpdatedDate (İstanbul saat dilimi, GG.AA.YYYY)", () => {
  it("UTC 21:30 İstanbul'da ertesi gündür", () => {
    expect(formatUpdatedDate("2026-09-12T21:30:00Z")).toBe("13.09.2026");
  });

  it("ofsetsiz zaman damgası UTC sayılır", () => {
    expect(formatUpdatedDate("2026-09-12T21:30:00")).toBe("13.09.2026");
  });

  it("gün içi saat aynı günde kalır", () => {
    expect(formatUpdatedDate("2026-09-12T09:30:00Z")).toBe("12.09.2026");
  });
});

describe("resolveSelectedId (ÜS-F4-2)", () => {
  const items = [makeTemplateListItem({ id: "x" }), makeTemplateListItem({ id: "y" })];

  it("URL'deki kimlik listedeyse o", () => expect(resolveSelectedId(items, "y")).toBe("y"));
  it("yoksa/bilinmiyorsa ilk şablon (varsayılan önce sıralı gelir)", () => {
    expect(resolveSelectedId(items, null)).toBe("x");
    expect(resolveSelectedId(items, "silindi")).toBe("x");
  });
  it("liste boşsa null", () => expect(resolveSelectedId([], "y")).toBeNull());
});

describe("groupCode", () => {
  it("sıra = harf: A, B … Z, AA", () => {
    expect([0, 1, 25, 26, 27].map(groupCode)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });
});

describe("catalogPriceCell (T38 / ÜS-F4-5)", () => {
  it("son fiyat varsa ₺ + kuruşlu", () => {
    expect(catalogPriceCell(catalog({ last_price: { price: "3250.00" } as never, ref_price: "3000.00" }))).toEqual({
      kind: "price",
      text: "₺3.250,00",
    });
  });

  it("son fiyat yoksa gri 'Ref ₺…'", () => {
    expect(catalogPriceCell(catalog({ last_price: null, ref_price: "3000.5" }))).toEqual({ kind: "ref", text: "Ref ₺3.000,50" });
  });

  it("ikisi de yoksa ya da katalogda bulunamadıysa '—'", () => {
    expect(catalogPriceCell(catalog({ last_price: null, ref_price: null }))).toEqual({ kind: "none", text: "—" });
    expect(catalogPriceCell(undefined)).toEqual({ kind: "none", text: "—" });
  });
});

describe("formatAsPerUnit", () => {
  it("2 ondalık, Türkçe virgül; yoksa '—'", () => {
    expect(formatAsPerUnit(catalog({ standard_unit_mhr: "0.85" }))).toBe("0,85");
    expect(formatAsPerUnit(catalog({ standard_unit_mhr: "11.5" }))).toBe("11,50");
    expect(formatAsPerUnit(undefined)).toBe("—");
  });
});
