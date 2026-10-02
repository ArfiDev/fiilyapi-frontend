import { describe, expect, it } from "vitest";

import { makeItem, makeManualItem, makeUnpricedItem, makeUnquantifiedItem } from "./offer-item-fixtures";
import {
  amountText,
  catalogResetBody,
  cellText,
  cellTone,
  commitCell,
  generalProfitResetBody,
  isCatalogResetAllowed,
  isOfferPriceEnabled,
  isQuantityMissing,
  isUnpriced,
  offerPriceHint,
  type CellContext,
} from "./offer-item-cells";

const ITEM = makeItem({ id: "it-1" });

function ctx(over: Partial<CellContext> = {}): CellContext {
  return { item: ITEM, revisionOverheadPct: "12.00", revisionProfitPct: "15.00", catalogUnitMhr: "1.8000", ...over };
}
const withItem = (item: CellContext["item"]) => ctx({ item });

describe("cellText — sunucu değeri → hücre metni (T30 gösterimi, kayıpsız)", () => {
  it("miktar: binlik nokta, kesir virgül; null → boş (B5: miktar null olabilir)", () => {
    expect(cellText("quantity", withItem(makeItem({ id: "x", quantity: "1250.000" })))).toBe("1.250");
    expect(cellText("quantity", withItem(makeItem({ id: "x", quantity: "2.125" })))).toBe("2,125");
    expect(cellText("quantity", withItem(makeItem({ id: "x", quantity: null })))).toBe("");
  });

  it("A-s en az 2 kesir hanesiyle (mockup nf(as,2)); 4 haneli değer kaybolmaz", () => {
    expect(cellText("unitMhr", ctx())).toBe("1,80");
    expect(cellText("unitMhr", withItem(makeItem({ id: "x", unit_mhr: "0.3333" })))).toBe("0,3333");
  });

  it("maliyet ve teklif B.F.: 2 kesir; fiyatsızda boş", () => {
    expect(cellText("costUnitPrice", withItem(makeItem({ id: "x", cost_unit_price: "1250.00" })))).toBe("1.250,00");
    expect(cellText("offerUnitPrice", ctx())).toBe("128,80");
    expect(cellText("costUnitPrice", withItem(makeUnpricedItem({ id: "x" })))).toBe("");
    expect(cellText("offerUnitPrice", withItem(makeUnpricedItem({ id: "x" })))).toBe("");
  });

  it("gider %: kalem değeri yoksa REVİZYON geneli gösterilir; kalem değeri varsa o", () => {
    expect(cellText("overheadPct", ctx())).toBe("12");
    expect(cellText("overheadPct", withItem(makeItem({ id: "x", overhead_pct: "10.50" })))).toBe("10,5");
  });

  it("kâr %: kalem → genel; ELLE B.F. varken TÜREV kâr (internal.profit_pct) gösterilir", () => {
    expect(cellText("profitPct", ctx())).toBe("15");
    expect(cellText("profitPct", withItem(makeItem({ id: "x", profit_pct: "20.00" })))).toBe("20");
    expect(cellText("profitPct", withItem(makeManualItem({ id: "x" })))).toBe("33,93");
    const noProfit = makeManualItem({
      id: "x",
      internal: { cost: "0.00", man_hours: "1.0000", overhead: "0.00", profit: "0.00", profit_pct: null },
    });
    expect(cellText("profitPct", withItem(noProfit))).toBe("");
  });
});

describe("commitCell — hücre → PATCH gövdesi tablosu (plan §3.2, her satır)", () => {
  describe("miktar", () => {
    it("geçerli değer {quantity} gider (metin, kayıpsız)", () => {
      expect(commitCell("quantity", "25", ctx())).toEqual({ kind: "patch", body: { quantity: "25" } });
      expect(commitCell("quantity", "1.500,5", ctx())).toEqual({ kind: "patch", body: { quantity: "1500.5" } });
    });
    it("0 / boş / belirsiz nokta / 4 kesir hane / negatif → istek UÇMAZ, sebep döner", () => {
      expect(commitCell("quantity", "0", ctx())).toEqual({ kind: "error", message: "Miktar 0'dan büyük olmalı" });
      expect(commitCell("quantity", "1.5", ctx())).toEqual({
        kind: "error",
        message: "Ondalık için virgül kullanın (ör. 28,50)",
      });
      expect(commitCell("quantity", "1,2345", ctx())).toEqual({ kind: "error", message: "En fazla 3 ondalık" });
      expect(commitCell("quantity", "-5", ctx())).toEqual({ kind: "error", message: "Miktar 0'dan büyük olmalı" });
      expect(commitCell("quantity", "abc", ctx())).toEqual({ kind: "error", message: "Miktar sayı olmalıdır." });
    });
    it("aynı sayı (başka yazımla da) ve dokunulmayan hücre → noop", () => {
      expect(commitCell("quantity", "10", ctx())).toEqual({ kind: "noop" });
      expect(commitCell("quantity", "10,0", ctx())).toEqual({ kind: "noop" });
      expect(commitCell("quantity", undefined, ctx())).toEqual({ kind: "noop" });
    });
    it("B5 ileri uyum: miktarı null kalemde miktar yazmak {quantity} gönderir", () => {
      const nullQuantity = withItem(makeItem({ id: "x", quantity: null }));
      expect(commitCell("quantity", "4", nullQuantity)).toEqual({ kind: "patch", body: { quantity: "4" } });
      // Dokunulmayan boş hücre (blur) hata DEĞİL: istek uçmaz, uyarı satır düzeyinde (isQuantityMissing).
      expect(commitCell("quantity", "", nullQuantity)).toEqual({ kind: "noop" });
    });
  });

  describe("A-s / birim", () => {
    it("{unit_mhr}; 0, boş, 5 kesir hane → hata; aynı sayı noop", () => {
      expect(commitCell("unitMhr", "2,5", ctx())).toEqual({ kind: "patch", body: { unit_mhr: "2.5" } });
      expect(commitCell("unitMhr", "0", ctx())).toEqual({ kind: "error", message: "A-s 0'dan büyük olmalı" });
      expect(commitCell("unitMhr", "", ctx())).toEqual({ kind: "error", message: "A-s girin" });
      expect(commitCell("unitMhr", "1,23456", ctx())).toEqual({ kind: "error", message: "En fazla 4 ondalık" });
      expect(commitCell("unitMhr", "1,8", ctx())).toEqual({ kind: "noop" });
    });
  });

  describe("maliyet B.F.", () => {
    it("değer {cost_unit_price}; 0 geçerli (fiyat 0 ≠ fiyatsız); boş → açık null (temizle)", () => {
      expect(commitCell("costUnitPrice", "1.300,50", ctx())).toEqual({
        kind: "patch",
        body: { cost_unit_price: "1300.50" },
      });
      expect(commitCell("costUnitPrice", "0", ctx())).toEqual({ kind: "patch", body: { cost_unit_price: "0" } });
      expect(commitCell("costUnitPrice", "", ctx())).toEqual({ kind: "patch", body: { cost_unit_price: null } });
    });
    it("zaten boşken boş bırakmak → noop; negatif/yazı → hata; 3 kesir hane → hata", () => {
      expect(commitCell("costUnitPrice", "", withItem(makeUnpricedItem({ id: "x" })))).toEqual({ kind: "noop" });
      expect(commitCell("costUnitPrice", "-5", ctx())).toEqual({ kind: "error", message: "Maliyet B.F. negatif olamaz." });
      expect(commitCell("costUnitPrice", "abc", ctx())).toEqual({ kind: "error", message: "Maliyet B.F. sayı olmalıdır." });
      expect(commitCell("costUnitPrice", "1,234", ctx())).toEqual({ kind: "error", message: "En fazla 2 ondalık" });
    });
  });

  describe("gider %", () => {
    it("değer {overhead_pct}; kalemde değer varken boş → null (genele dön); kalemde yokken boş → noop", () => {
      expect(commitCell("overheadPct", "10", ctx())).toEqual({ kind: "patch", body: { overhead_pct: "10" } });
      expect(commitCell("overheadPct", "", withItem(makeItem({ id: "x", overhead_pct: "10.00" })))).toEqual({
        kind: "patch",
        body: { overhead_pct: null },
      });
      expect(commitCell("overheadPct", "", ctx())).toEqual({ kind: "noop" });
    });
    it("aralık 0–100, en çok 2 kesir; genel değerin AYNISI yazmak noop (kalemde null kalır)", () => {
      expect(commitCell("overheadPct", "101", ctx())).toEqual({ kind: "error", message: "0–100 arasında olmalı" });
      expect(commitCell("overheadPct", "12,345", ctx())).toEqual({ kind: "error", message: "En çok 2 ondalık hane" });
      expect(commitCell("overheadPct", "12", ctx())).toEqual({ kind: "noop" });
    });
  });

  describe("kâr % — 🔴 kâr yazmak elle B.F. kilidini KALDIRIR", () => {
    it("değer yazınca {profit_pct, offer_unit_price: null} gider (kilit kalkar)", () => {
      expect(commitCell("profitPct", "20", ctx())).toEqual({
        kind: "patch",
        body: { profit_pct: "20", offer_unit_price: null },
      });
    });
    it("elle B.F. varken de aynı gövde (kilidi açan şey kâr yazımıdır)", () => {
      expect(commitCell("profitPct", "20", withItem(makeManualItem({ id: "x" })))).toEqual({
        kind: "patch",
        body: { profit_pct: "20", offer_unit_price: null },
      });
    });
    it("elle B.F. kilidi varken görünen TÜREV değeri yeniden yazmak kilidi korur (noop)", () => {
      expect(commitCell("profitPct", "33,93", withItem(makeManualItem({ id: "x" })))).toEqual({ kind: "noop" });
    });
    it("kilitliyken türevle sayısal olarak AYNI ama başka yazım → kilidi açma niyeti: gövde gider", () => {
      expect(commitCell("profitPct", "33,930", withItem(makeManualItem({ id: "x" })))).toEqual({
        kind: "patch",
        body: { profit_pct: "33.93", offer_unit_price: null },
      });
    });
    it("boş → ikisi de null; hiçbiri yokken noop; aralık 0–999,99", () => {
      expect(commitCell("profitPct", "", withItem(makeItem({ id: "x", profit_pct: "20.00" })))).toEqual({
        kind: "patch",
        body: { profit_pct: null, offer_unit_price: null },
      });
      expect(commitCell("profitPct", "", withItem(makeManualItem({ id: "x" })))).toEqual({
        kind: "patch",
        body: { profit_pct: null, offer_unit_price: null },
      });
      expect(commitCell("profitPct", "", ctx())).toEqual({ kind: "noop" });
      expect(commitCell("profitPct", "1000", ctx())).toEqual({ kind: "error", message: "0–999,99 arasında olmalı" });
      expect(commitCell("profitPct", "999,99", ctx())).toEqual({
        kind: "patch",
        body: { profit_pct: "999.99", offer_unit_price: null },
      });
    });
    it("🔴 '↺ genel' ikisini null'lar", () => {
      expect(generalProfitResetBody()).toEqual({ profit_pct: null, offer_unit_price: null });
    });
  });

  describe("teklif B.F.", () => {
    it("🔴 SO-4: maliyet boşken kapalı — hücre yazımı istek UÇURMAZ", () => {
      const unpriced = withItem(makeUnpricedItem({ id: "x" }));
      expect(isOfferPriceEnabled(unpriced.item)).toBe(false);
      expect(commitCell("offerUnitPrice", "150", unpriced)).toEqual({ kind: "error", message: "Önce maliyet girin" });
      expect(isOfferPriceEnabled(ITEM)).toBe(true);
    });
    it("değer {offer_unit_price}; boş → null (kilit kalkar); kilit yokken boş → noop; aynı sayı noop", () => {
      expect(commitCell("offerUnitPrice", "150", ctx())).toEqual({ kind: "patch", body: { offer_unit_price: "150" } });
      expect(commitCell("offerUnitPrice", "", withItem(makeManualItem({ id: "x" })))).toEqual({
        kind: "patch",
        body: { offer_unit_price: null },
      });
      expect(commitCell("offerUnitPrice", "", ctx())).toEqual({ kind: "noop" });
      expect(commitCell("offerUnitPrice", "128,80", ctx())).toEqual({ kind: "noop" });
    });
    it("negatif/yazı → hata; 3 kesir hane → hata", () => {
      expect(commitCell("offerUnitPrice", "-1", ctx())).toEqual({ kind: "error", message: "Teklif B.F. negatif olamaz." });
      expect(commitCell("offerUnitPrice", "x", ctx())).toEqual({ kind: "error", message: "Teklif B.F. sayı olmalıdır." });
      expect(commitCell("offerUnitPrice", "1,234", ctx())).toEqual({ kind: "error", message: "En fazla 2 ondalık" });
    });
    it("hesaplanan değeri (128,80) elle yazmak noop — kilit YANLIŞLIKLA kurulmaz", () => {
      expect(commitCell("offerUnitPrice", "128,80", ctx())).toEqual({ kind: "noop" });
    });
  });
});

describe("A-s ≠ katalog → '↺ kat.' (T10)", () => {
  it("katalogdan farklıysa override tonu; aynı sayı başka yazımda ('1.80' ↔ '1.8000') genel", () => {
    expect(cellTone("unitMhr", ctx())).toBe("general");
    expect(cellTone("unitMhr", ctx({ item: makeItem({ id: "x", unit_mhr: "2.5000" }) }))).toBe("override");
    expect(cellTone("unitMhr", ctx({ item: makeItem({ id: "x", unit_mhr: "1.80" }) }))).toBe("general");
  });
  it("katalogda bulunamayan kalemde (kısıtlı liste) karşılaştırma YOK → genel", () => {
    expect(cellTone("unitMhr", ctx({ catalogUnitMhr: null, item: makeItem({ id: "x", unit_mhr: "9.0000" }) }))).toBe(
      "general",
    );
  });
  it("'↺ kat.' gövdesi katalog değerini AYNEN yazar", () => {
    expect(catalogResetBody("1.8000")).toEqual({ unit_mhr: "1.8000" });
  });
});

describe("ton (genel oran / kalemde elle değiştirildi / eksik)", () => {
  it("gider: kalem değeri varsa override", () => {
    expect(cellTone("overheadPct", ctx())).toBe("general");
    expect(cellTone("overheadPct", ctx({ item: makeItem({ id: "x", overhead_pct: "10.00" }) }))).toBe("override");
  });
  it("kâr: kalem değeri YA DA elle B.F. varsa override", () => {
    expect(cellTone("profitPct", ctx())).toBe("general");
    expect(cellTone("profitPct", ctx({ item: makeItem({ id: "x", profit_pct: "20.00" }) }))).toBe("override");
    expect(cellTone("profitPct", ctx({ item: makeManualItem({ id: "x" }) }))).toBe("override");
  });
  it("teklif B.F.: elle varsa override; maliyet B.F.: fiyatsızsa missing", () => {
    expect(cellTone("offerUnitPrice", ctx())).toBe("general");
    expect(cellTone("offerUnitPrice", ctx({ item: makeManualItem({ id: "x" }) }))).toBe("override");
    expect(cellTone("costUnitPrice", ctx())).toBe("general");
    expect(cellTone("costUnitPrice", ctx({ item: makeUnpricedItem({ id: "x" }) }))).toBe("missing");
  });
});

describe("teklif B.F. alt satırı (TD:380)", () => {
  it("hesaplanan / elle · kâr %x / önce maliyet girin", () => {
    expect(offerPriceHint(ctx())).toBe("hesaplanan");
    expect(offerPriceHint(ctx({ item: makeManualItem({ id: "x" }) }))).toBe("elle · kâr %33,93");
    expect(offerPriceHint(ctx({ item: makeUnpricedItem({ id: "x" }) }))).toBe("önce maliyet girin");
  });
});

describe("satır durumu", () => {
  it("fiyatsız = sunucunun `priced` bayrağı (maskeli maliyet null'u fiyatsız SAYILMAZ)", () => {
    expect(isUnpriced(makeUnpricedItem({ id: "x" }))).toBe(true);
    expect(isUnpriced(ITEM)).toBe(false);
    const masked = makeItem({ id: "x", cost_unit_price: null, customer: { unit_price: null, amount: null } });
    expect(isUnpriced(masked)).toBe(false);
  });
  it("tutar: kayıpsız ₺ biçimi; fiyatsız ve miktarı null kalemde '—' (B5 yeri)", () => {
    expect(amountText(ITEM)).toBe("₺1.288,00");
    expect(amountText(makeUnpricedItem({ id: "x" }))).toBe("—");
    expect(amountText(makeItem({ id: "x", quantity: null, customer: { unit_price: "128.80", amount: null } }))).toBe("—");
  });
  it("🔴 F4.2b miktar eksik mi: YALNIZ sunucunun `quantified` bayrağı (finance maskesi quantity'yi null yapsa da)", () => {
    expect(isQuantityMissing(makeUnquantifiedItem({ id: "x" }))).toBe(true);
    expect(isQuantityMissing(ITEM)).toBe(false);
    // finance maskesi: miktar null ama quantified=true → miktarsız DEĞİL
    expect(isQuantityMissing(makeItem({ id: "m", quantity: null, quantified: true }))).toBe(false);
    // bayrak false iken miktar dolu görünse bile bayrak karar verir (tek karar noktası)
    expect(isQuantityMissing(makeItem({ id: "n", quantified: false }))).toBe(true);
  });
  it("🔴 F4.2 dolu miktarı boşaltmak istemci hatası 'Miktar boşaltılamaz' (SO-24); a-s için 'girin' kalır", () => {
    expect(commitCell("quantity", "", ctx())).toEqual({ kind: "error", message: "Miktar boşaltılamaz" });
    expect(commitCell("unitMhr", "", ctx())).toEqual({ kind: "error", message: "A-s girin" });
  });
});

/* ─── TKL-F3.6.1 ─────────────────────────────────────────────────────────────────────────────────── */
const negativeManual = makeManualItem({
  id: "neg",
  offer_unit_price: "95.00",
  customer: { unit_price: "95.00", amount: "950.00" },
  internal: { cost: "1000.00", man_hours: "18.0000", overhead: "120.00", profit: "-170.00", profit_pct: "-5.00" },
});
const zeroCostManual = makeManualItem({
  id: "zero",
  cost_unit_price: "0.00",
  internal: { cost: "0.00", man_hours: "1.0000", overhead: "0.00", profit: "0.00", profit_pct: null },
});

describe("madde 8 — türev kâr T30 Türkçe biçim", () => {
  it("🔴 negatif türev kâr virgüllü: hücre '-5', ipucu 'elle · kâr %-5,00' (noktalı '-5.00' DEĞİL)", () => {
    expect(cellText("profitPct", withItem(negativeManual))).toBe("-5");
    expect(offerPriceHint(withItem(negativeManual))).toBe("elle · kâr %-5,00");
  });

  it("🔴 maliyet 0 iken türev kâr yok → ipucu 'elle · kâr —' (sarkık '%' DEĞİL)", () => {
    expect(offerPriceHint(withItem(zeroCostManual))).toBe("elle · kâr —");
  });

  it("negatif türev kâr hücresi AYNEN geri yazılırsa kilit korunur (noop); yeni değer kilidi açar", () => {
    expect(commitCell("profitPct", "-5", withItem(negativeManual))).toEqual({ kind: "noop" });
    expect(commitCell("profitPct", "7", withItem(negativeManual))).toEqual({
      kind: "patch",
      body: { profit_pct: "7", offer_unit_price: null },
    });
  });
});

describe("madde 9 — teklif B.F. no-op GÖSTERİLEN değerle", () => {
  it("🔴 hesaplanan 128,80 gösterilirken '128,8' / '128,80' / '128,800' KİLİT KURMAZ (noop)", () => {
    for (const text of ["128,8", "128,80", "128,800"]) {
      expect(commitCell("offerUnitPrice", text, ctx())).toEqual({ kind: "noop" });
    }
  });

  it("farklı değer kilit kurar; elle B.F.'nin aynı sayısı noop (mevcut)", () => {
    expect(commitCell("offerUnitPrice", "128,9", ctx())).toEqual({ kind: "patch", body: { offer_unit_price: "128.90" } });
    expect(commitCell("offerUnitPrice", "150,0", withItem(makeManualItem({ id: "x" })))).toEqual({ kind: "noop" });
  });
});

describe("madde 10 — elle B.F. varken maliyeti silmek istemcide engellenir (SO-4 ters yön)", () => {
  it("🔴 elle B.F. + maliyet boşaltma → hata, istek YOK", () => {
    expect(commitCell("costUnitPrice", "", withItem(makeManualItem({ id: "x" })))).toEqual({
      kind: "error",
      message: "Önce teklif B.F.'yi temizleyin",
    });
  });

  it("elle B.F. yoksa maliyet silme mevcut davranış (açık null); maliyet zaten boşsa noop; maliyet DEĞİŞTİRME serbest", () => {
    expect(commitCell("costUnitPrice", "", ctx())).toEqual({ kind: "patch", body: { cost_unit_price: null } });
    expect(commitCell("costUnitPrice", "", withItem(makeUnpricedItem({ id: "x" })))).toEqual({ kind: "noop" });
    expect(commitCell("costUnitPrice", "200", withItem(makeManualItem({ id: "x" })))).toEqual({
      kind: "patch",
      body: { cost_unit_price: "200" },
    });
  });
});

describe("madde 16 — '↺ kat.' değeri teklif a-s sınırını aşıyorsa kapalı", () => {
  it("🔴 ≤ 1.000.000 ve ≤ 4 kesir izinli; aşan/fazla kesirli değer KAPALI", () => {
    expect(isCatalogResetAllowed("1.8000")).toBe(true);
    expect(isCatalogResetAllowed("1000000.0000")).toBe(true);
    expect(isCatalogResetAllowed("1000000.0001")).toBe(false);
    expect(isCatalogResetAllowed("2000000")).toBe(false);
    expect(isCatalogResetAllowed("1.23456")).toBe(false);
  });
});
