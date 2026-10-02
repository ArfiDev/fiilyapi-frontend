import { describe, expect, it } from "vitest";

import {
  buildWorkItemCreateBody,
  buildWorkItemUpdateBody,
  emptyWorkItemForm,
  firstWorkItemError,
  isWorkItemFormDirty,
  parseRefPriceInput,
  workItemFormFromItem,
  type WorkItemFormState,
} from "./work-item-form";
import { BETON, D_KAB, SIVA } from "./work-item-fixtures";
import { formatPrice } from "./work-item-model";

const VALID: WorkItemFormState = {
  name: "Kolon kalıbı",
  uom: "m²",
  refPrice: "650,00",
  rate: "1,05",
  own: "own",
};

describe("workItemFormFromItem / emptyWorkItemForm", () => {
  it("mevcut kalemi kayıpsız metne çevirir (ondalık virgül, sondaki sıfır korunur)", () => {
    expect(workItemFormFromItem(BETON)).toEqual({
      name: "Beton döküm",
      uom: "m³",
      refPrice: "1250,50",
      rate: "1,80",
      own: "own",
    });
  });

  it("fiyatsız kalem boş fiyat kutusuyla açılır", () => {
    expect(workItemFormFromItem(SIVA).refPrice).toBe("");
    expect(workItemFormFromItem(SIVA).own).toBe("subcon");
  });

  it("yeni form disiplinin varsayılan yükleniciyle başlar", () => {
    expect(emptyWorkItemForm("subcon").own).toBe("subcon");
    expect(emptyWorkItemForm("own").name).toBe("");
  });
});

describe("firstWorkItemError — tek satır, mockup sırası (KIK:263-266)", () => {
  it("sıra: tarif → referans fiyat → A-s", () => {
    const empty = { ...VALID, name: "  ", refPrice: "", rate: "" };
    expect(firstWorkItemError(empty, D_KAB.id)).toEqual({ field: "name", message: "Tarif zorunlu" });
    expect(firstWorkItemError({ ...empty, name: "x" }, D_KAB.id)).toEqual({
      field: "refPrice",
      message: "Referans fiyat girin",
    });
    expect(firstWorkItemError({ ...empty, name: "x", refPrice: "1" }, D_KAB.id)).toEqual({
      field: "rate",
      message: "A-s zorunlu · 0'dan büyük olmalı",
    });
  });

  it("A-s 0 ya da anlamsız → ÜS-7 metni", () => {
    expect(firstWorkItemError({ ...VALID, rate: "0" }, D_KAB.id)?.message).toBe("A-s zorunlu · 0'dan büyük olmalı");
    expect(firstWorkItemError({ ...VALID, rate: "abc" }, D_KAB.id)?.message).toBe("A-s zorunlu · 0'dan büyük olmalı");
  });

  it("A-s sınırları: 4 ondalıktan fazla / 8 basamaktan fazla", () => {
    expect(firstWorkItemError({ ...VALID, rate: "1,12345" }, D_KAB.id)?.message).toBe("En fazla 4 ondalık");
    expect(firstWorkItemError({ ...VALID, rate: "123456789" }, D_KAB.id)?.message).toBe("En fazla 8 basamak");
  });

  it("referans fiyat: negatif/anlamsız → zorunlu metni; 2 ondalıktan fazla; 16 basamaktan fazla", () => {
    expect(firstWorkItemError({ ...VALID, refPrice: "-5" }, D_KAB.id)?.message).toBe("Referans fiyat girin");
    expect(firstWorkItemError({ ...VALID, refPrice: "x" }, D_KAB.id)?.message).toBe("Referans fiyat girin");
    expect(firstWorkItemError({ ...VALID, refPrice: "1,234" }, D_KAB.id)?.message).toBe("En fazla 2 ondalık");
    expect(firstWorkItemError({ ...VALID, refPrice: "12345678901234567" }, D_KAB.id)?.message).toBe(
      "En fazla 16 basamak",
    );
  });

  it("sıfır referans fiyat geçerlidir (backend ≥ 0)", () => {
    expect(firstWorkItemError({ ...VALID, refPrice: "0" }, D_KAB.id)).toBeNull();
  });

  it("disiplin yoksa kayıt engellenir", () => {
    expect(firstWorkItemError(VALID, "")).toEqual({ field: "discipline", message: "Önce disiplin ekleyin" });
  });

  it("geçerli form → hata yok", () => {
    expect(firstWorkItemError(VALID, D_KAB.id)).toBeNull();
  });
});

describe("buildWorkItemCreateBody — poz_no ASLA gövdede değil", () => {
  it("ondalık metin kayıpsız gider (Number() yok)", () => {
    const body = buildWorkItemCreateBody(
      { ...VALID, name: "  Kolon kalıbı ", refPrice: "1.234.567,89", rate: "0,1234" },
      D_KAB.id,
    );
    expect(body).toEqual({
      discipline_id: "d-kab",
      name: "Kolon kalıbı",
      uom: "m²",
      ref_price: "1234567.89",
      standard_unit_mhr: "0.1234",
      default_contractor_type: "own",
    });
    expect(Object.keys(body)).not.toContain("poz_no");
  });

  it("16+2 hanelik fiyat hassasiyeti kaybolmaz", () => {
    const body = buildWorkItemCreateBody({ ...VALID, refPrice: "1234567890123456,78" }, D_KAB.id);
    expect(body.ref_price).toBe("1234567890123456.78");
  });
});

describe("buildWorkItemUpdateBody — yalnız DEĞİŞEN alan", () => {
  const initial = workItemFormFromItem(BETON);

  it("değişiklik yoksa boş gövde", () => {
    expect(buildWorkItemUpdateBody(initial, { ...initial })).toEqual({});
  });

  it("yalnız fiyat değişince yalnız ref_price gider", () => {
    expect(buildWorkItemUpdateBody(initial, { ...initial, refPrice: "1300,00" })).toEqual({ ref_price: "1300.00" });
  });

  it("aynı sayının farklı yazımı (1.250,50 ↔ 1250,50) değişiklik sayılmaz", () => {
    expect(buildWorkItemUpdateBody(initial, { ...initial, refPrice: "1.250,50" })).toEqual({});
    expect(buildWorkItemUpdateBody(initial, { ...initial, rate: "1,8" })).toEqual({});
  });

  it("birden çok değişiklik: ad, birim, A-s, yüklenici", () => {
    const body = buildWorkItemUpdateBody(initial, {
      ...initial,
      name: " Beton ",
      uom: "m²",
      rate: "2,25",
      own: "subcon",
    });
    expect(body).toEqual({
      name: "Beton",
      uom: "m²",
      standard_unit_mhr: "2.25",
      default_contractor_type: "subcon",
    });
  });

  it("poz_no ve discipline_id gövdede ASLA yoktur", () => {
    const body = buildWorkItemUpdateBody(initial, {
      name: "x",
      uom: "kg",
      refPrice: "9",
      rate: "9",
      own: "subcon",
    });
    expect(Object.keys(body)).not.toContain("poz_no");
    expect(Object.keys(body)).not.toContain("discipline_id");
    expect(Object.keys(body)).not.toContain("description");
  });
});

describe("isWorkItemFormDirty", () => {
  const initial = workItemFormFromItem(BETON);

  it("değişmemiş form kirli değil; yazım farkı kirli sayılmaz", () => {
    expect(isWorkItemFormDirty(initial, { ...initial })).toBe(false);
    expect(isWorkItemFormDirty(initial, { ...initial, refPrice: "1.250,50" })).toBe(false);
  });

  it("herhangi bir alan değişince kirli", () => {
    expect(isWorkItemFormDirty(initial, { ...initial, name: "Başka" })).toBe(true);
    expect(isWorkItemFormDirty(initial, { ...initial, own: "subcon" })).toBe(true);
    expect(isWorkItemFormDirty(initial, { ...initial, refPrice: "" })).toBe(true);
  });
});

describe("parseRefPriceInput — Türkçe kural: nokta binlik, virgül ondalık; belirsiz girdi REDDEDİLİR", () => {
  const value = (raw: string) => {
    const parsed = parseRefPriceInput(raw);
    return parsed.kind === "ok" ? parsed.value : parsed.kind;
  };

  it("kullanıcı onaylı örnekler (birebir)", () => {
    expect(value("28.500")).toBe("28500");
    expect(value("28.500,75")).toBe("28500.75");
    expect(value("1.234.567,8")).toBe("1234567.80");
    expect(value("28,5")).toBe("28.50");
    expect(value("28500")).toBe("28500");
    expect(value("28.5")).toBe("ambiguous");
    expect(value("1.50")).toBe("ambiguous");
    expect(value("28.5000")).toBe("ambiguous");
  });

  it("noktalı gruplar (ilk hariç) TAM 3 hane olmalı; diğer her nokta kullanımı belirsiz", () => {
    expect(value("1.234.567")).toBe("1234567");
    // TKL-F2.4.1 YÜKSEK-1: Türkçede ilk grup 1–3 hane olur; "1234.567" geçerli binlik DEĞİLDİR (eskiden 1234567 okunurdu).
    expect(value("1234.567")).toBe("ambiguous");
    expect(value("1.2.3")).toBe("ambiguous");
    expect(value("28.")).toBe("ambiguous");
    expect(value(".500")).toBe("ambiguous");
    expect(value("1.234.5,00")).toBe("ambiguous");
  });

  it("TKL-F1.6-HF: ilk grup 1-3 hane ve '0' ile başlamaz; Türkçede geçersiz binlik belirsizdir", () => {
    for (const raw of ["0.500", "00.500", "1234.567", "0.250", "12345.678"]) {
      expect(value(raw)).toBe("ambiguous");
      expect(firstWorkItemError({ ...VALID, refPrice: raw }, D_KAB.id)?.message).toBe(
        "Ondalık için virgül kullanın (ör. 28,50)",
      );
    }
    expect(value("1.000")).toBe("1000");
    expect(value("0,5")).toBe("0.50");
    expect(value("0")).toBe("0");
  });

  it("boş / anlamsız / negatif / çift virgül → invalid", () => {
    for (const raw of ["", "  ", "abc", "-5", "1,2,3", "28,", ",5", "1 000"]) expect(value(raw)).toBe("invalid");
  });

  it("virgüllü kesir en az 2 haneye tamamlanır; 2'yi aşan SIFIRLAR kayıpsız atılır, anlamlı hane atılmaz", () => {
    expect(value("650,00")).toBe("650.00");
    expect(value("1250,5000")).toBe("1250.50");
    expect(value("1,234")).toBe("1.234");
  });

  it("hata önceliği (tek satır): belirsiz/anlamsız → 2 ondalık → 16 basamak", () => {
    const message = (refPrice: string) => firstWorkItemError({ ...VALID, refPrice }, D_KAB.id)?.message;
    expect(message("28.5")).toBe("Ondalık için virgül kullanın (ör. 28,50)");
    expect(message("1.50")).toBe("Ondalık için virgül kullanın (ör. 28,50)");
    expect(message("28.5000")).toBe("Ondalık için virgül kullanın (ör. 28,50)");
    expect(message("x")).toBe("Referans fiyat girin");
    expect(message("")).toBe("Referans fiyat girin");
    expect(message("1,234")).toBe("En fazla 2 ondalık");
    expect(message("12345678901234567")).toBe("En fazla 16 basamak");
    expect(message("28.500")).toBeUndefined();
  });

  it("gövde (create) kayıpsız ondalık dize taşır", () => {
    const body = (refPrice: string) => buildWorkItemCreateBody({ ...VALID, refPrice }, D_KAB.id).ref_price;
    expect(body("28.500")).toBe("28500");
    expect(body("28.500,75")).toBe("28500.75");
    expect(body("1.234.567,8")).toBe("1234567.80");
    expect(body("28,5")).toBe("28.50");
  });

  it("PATCH da aynı kuralı kullanır", () => {
    const initial = workItemFormFromItem(BETON);
    expect(buildWorkItemUpdateBody(initial, { ...initial, refPrice: "28.500" })).toEqual({ ref_price: "28500" });
  });

  it("A-s kuralı DEĞİŞMEDİ: nokta ondalıktır", () => {
    expect(buildWorkItemCreateBody({ ...VALID, rate: "1.5" }, D_KAB.id).standard_unit_mhr).toBe("1.5");
  });

  it("gidiş-dönüş kayıpsız: görünüm (28.500,00) ve alan metni (28500,00) aynı sayı; değişmeden = istek YOK", () => {
    for (const price of ["1250.50", "28500.00", "1234567890123456.78", "0.50", "7.00", "999.00", "1000.00"]) {
      const form = workItemFormFromItem({ ...BETON, ref_price: price });
      expect(form.refPrice.includes(".")).toBe(false);
      expect(buildWorkItemUpdateBody(form, { ...form })).toEqual({});
      expect(isWorkItemFormDirty(form, { ...form })).toBe(false);
      expect(value(form.refPrice)).toBe(price);
      // tablodaki görünüm metni de aynı sayıyı okur
      expect(buildWorkItemUpdateBody(form, { ...form, refPrice: formatPrice(price) })).toEqual({});
    }
  });
});
