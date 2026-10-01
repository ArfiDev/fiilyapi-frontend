import { describe, expect, it } from "vitest";

import {
  buildWorkItemCreateBody,
  buildWorkItemUpdateBody,
  emptyWorkItemForm,
  firstWorkItemError,
  isWorkItemFormDirty,
  workItemFormFromItem,
  type WorkItemFormState,
} from "./work-item-form";
import { BETON, D_KAB, SIVA } from "./work-item-fixtures";

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
