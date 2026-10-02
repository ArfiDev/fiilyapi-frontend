// @vitest-environment node
//
// TKL-F3.6.1 madde 3 — teklif hedefinin hane sınırları KALEM TABLOSUYLA aynıdır (backend `offer_schemas.py`:
// miktar ≤ 1e9 / 3 kesir · maliyet ≤ 1e12 / 2 kesir). Sözleşme sınırları (11/16 tam basamak) DEĞİŞMEZ.
import { describe, expect, it } from "vitest";

import { commitCell, type CellContext } from "@/components/offers/offer-item-cells";
import { makeItem } from "@/components/offers/offer-item-fixtures";

import { validateRow } from "./picker-model";
import { CONTRACT_RULES, OFFER_RULES } from "./picker-rules";

const offer = (quantity: string, unitPrice: string) => validateRow({ quantity, unitPrice }, OFFER_RULES);
const contract = (quantity: string, unitPrice: string) => validateRow({ quantity, unitPrice }, CONTRACT_RULES);

describe("teklif seçici — miktar sınırı (≤ 1.000.000.000, 3 kesir)", () => {
  it("🔴 5.000.000.000 REDDEDİLİR (bulk 422 olmasın)", () => {
    expect(offer("5.000.000.000", "")).toBe("En fazla 1.000.000.000");
  });
  it("tam sınır (1.000.000.000) ve altı geçer; sınırı aşan en küçük değer reddedilir", () => {
    expect(offer("1.000.000.000", "")).toBeNull();
    expect(offer("1.000.000.000,001", "")).toBe("En fazla 1.000.000.000");
    expect(offer("999.999.999,999", "")).toBeNull();
  });
  it("4. kesir hanesi reddedilir (mevcut metin)", () => {
    expect(offer("1,2345", "")).toBe("En fazla 3 ondalık");
  });
  it("0 ve negatif reddedilir (mevcut metinler)", () => {
    expect(offer("0", "")).toBe("Miktar 0'dan büyük olmalı");
    expect(offer("-3", "")).toBe("Miktar 0'dan büyük olmalı");
  });
});

describe("teklif seçici — maliyet B.F. sınırı (≤ 1.000.000.000.000, 2 kesir)", () => {
  it("🔴 50.000.000.000.000 REDDEDİLİR", () => {
    expect(offer("1", "50.000.000.000.000")).toBe("En fazla 1.000.000.000.000");
  });
  it("tam sınır geçer; sınırı aşan en küçük değer reddedilir; boş geçerli (fiyatsız kalem)", () => {
    expect(offer("1", "1.000.000.000.000")).toBeNull();
    expect(offer("1", "1.000.000.000.000,01")).toBe("En fazla 1.000.000.000.000");
    expect(offer("1", "")).toBeNull();
  });
  it("3. kesir hanesi reddedilir", () => {
    expect(offer("1", "1,234")).toBe("En fazla 2 ondalık");
  });
});

describe("hata metni kalem tablosuyla AYNI (tek kaynak)", () => {
  const ctx: CellContext = {
    item: makeItem({ id: "i-1", quantity: "2.000" }),
    revisionOverheadPct: "12.00",
    revisionProfitPct: "15.00",
    catalogUnitMhr: null,
  };
  const tableMessage = (field: "quantity" | "costUnitPrice", text: string) => {
    const result = commitCell(field, text, ctx);
    return result.kind === "error" ? result.message : null;
  };

  it("miktar: seçici = tablo (aşım ve kesir)", () => {
    expect(offer("5.000.000.000", "")).toBe(tableMessage("quantity", "5.000.000.000"));
    expect(offer("1,2345", "")).toBe(tableMessage("quantity", "1,2345"));
  });
  it("maliyet: seçici = tablo (aşım ve kesir)", () => {
    expect(offer("1", "50.000.000.000.000")).toBe(tableMessage("costUnitPrice", "50.000.000.000.000"));
    expect(offer("1", "1,234")).toBe(tableMessage("costUnitPrice", "1,234"));
  });
});

describe("sözleşme hedefi — mevcut sınırlar AYNEN (F2)", () => {
  it("miktar 11 tam basamak, fiyat 16 tam basamak; 1e9/1e12 aşımı sözleşmede GEÇER", () => {
    expect(contract("5.000.000.000", "50.000.000.000.000")).toBeNull();
    expect(contract("100.000.000.000", "1")).toBe("En fazla 11 basamak");
    expect(contract("1", "10.000.000.000.000.000")).toBe("En fazla 16 basamak");
    expect(contract("1,2345", "1")).toBe("En fazla 3 ondalık");
  });
});
