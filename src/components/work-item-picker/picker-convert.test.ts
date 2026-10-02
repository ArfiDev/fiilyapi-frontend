// @vitest-environment node
//
// TKL-F5.4 · DÖNÜŞTÜRME hedefi (dördüncü): kural + metin + tavan + gövde + kolon bekçileri. Gövde HTTP DEĞİL, yerel satır girdisidir.
import { describe, expect, it } from "vitest";

import { BETON, DEMIR, LAST_SZL, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { compareDecimalStrings } from "@/lib/decimal";

import { pickerColumns } from "./picker-columns";
import {
  MAX_BULK_ITEMS,
  blockReasonText,
  buildPickerRows,
  resolveSelection,
  selectionLimit,
  setQuantity,
  setUnitPrice,
  toggleRow,
  totalAmount,
  type PickerGroup,
  type PickerInputs,
  type PickerRow,
} from "./picker-model";
import { CONTRACT_RULES, CONVERT_RULES, OFFER_RULES, TEMPLATE_RULES } from "./picker-rules";
import { CONTRACT_PICKER_TARGET, CONVERT_PICKER_TARGET, OFFER_PICKER_TARGET, TEMPLATE_PICKER_TARGET } from "./picker-target";

const NO_INPUTS: PickerInputs = new Map();
const group = (id: string, name: string, items: PickerGroup["items"]): PickerGroup => ({ id, name, sort_order: 0, items });
const counted = (count: number): PickerGroup["items"] =>
  Array.from({ length: count }, (_, i) => ({ code: `C-${i}`, catalog_item_id: `c-${i}`, sort_order: i }));
const excluded = (count: number): PickerGroup["items"] =>
  Array.from({ length: count }, (_, i) => ({ code: `X-${i}`, catalog_item_id: `x-${i}`, sort_order: i, isExcluded: true }));

function rowOf(item: typeof BETON, groups: PickerGroup[] = []): PickerRow {
  return buildPickerRows([item], groups, CONVERT_RULES)[0] as PickerRow;
}

describe("CONVERT_RULES (fiyatlı mod)", () => {
  it("priced + fiyat ZORUNLU + kod çakışması engel DEĞİL + yerel gruplar", () => {
    expect(CONVERT_RULES.entryMode).toBe("priced");
    expect(CONVERT_RULES.isPriceRequired).toBe(true);
    expect(CONVERT_RULES.blocksOnCodeCollision).toBe(false);
    expect(CONVERT_RULES.usesLocalGroups).toBe(true);
  });

  it("🔴 'Listede var' gerekçesi + 2000 kalem tavanı metni (convert-validate ile aynı)", () => {
    expect(CONVERT_RULES.linkedLabel).toBe("Listede var");
    expect(CONVERT_RULES.maxTotalItems).toBe(2000);
    expect(CONVERT_RULES.totalCapMessage).toBe("En fazla 2000 kalem dönüştürülebilir");
  });

  it("🔴 diğer hedeflerin kuralları DEĞİŞMEDİ (yerel grup yalnız şablon + dönüştürme)", () => {
    expect([CONTRACT_RULES, OFFER_RULES, TEMPLATE_RULES].map((rules) => rules.usesLocalGroups)).toEqual([false, false, true]);
    expect([CONTRACT_RULES, OFFER_RULES].map((rules) => rules.maxTotalItems)).toEqual([null, null]);
    expect(CONTRACT_RULES.linkedLabel).toBe("Sözleşmede var");
    expect(OFFER_RULES.linkedLabel).toBe("Teklifte var");
  });
});

describe("CONVERT_PICKER_TARGET metinleri", () => {
  it("başlık, alt metin, süzgeç, kolon başlığı, Σ; manuel ekleme bağlantısı YOK", () => {
    expect(CONVERT_PICKER_TARGET.title).toBe("Katalogdan Kalem Ekle");
    expect(CONVERT_PICKER_TARGET.subtitle).toBe("İş Kalemi Kataloğu'ndan sözleşmeye kalem ekle");
    expect(CONVERT_PICKER_TARGET.hideLabel).toBe("Listede olanları gizle");
    expect(CONVERT_PICKER_TARGET.priceHeader).toBe("Birim fiyat");
    expect(CONVERT_PICKER_TARGET.totalLabel).toBe("Eklenecek Tutar");
    expect(CONVERT_PICKER_TARGET.manualAddLabel).toBe("");
  });
});

describe("kolonlar (🔴 priced hedeflerin kolonu dönüştürmeyle DEĞİŞMEZ)", () => {
  it("sözleşme, teklif ve dönüştürme aynı sekiz kolon; yalnız fiyat başlığı hedefe göre", () => {
    const head = ["Poz No", "Tanım", "Birim", "Ref. fiyat", "Son fiyat", "Miktar"];
    expect(pickerColumns("priced", CONTRACT_PICKER_TARGET.priceHeader)).toEqual([...head, "Birim fiyat", "Tutar"]);
    expect(pickerColumns("priced", OFFER_PICKER_TARGET.priceHeader)).toEqual([...head, "Maliyet B.F.", "Tutar"]);
    expect(pickerColumns("priced", CONVERT_PICKER_TARGET.priceHeader)).toEqual([...head, "Birim fiyat", "Tutar"]);
    expect(pickerColumns("selectOnly", TEMPLATE_PICKER_TARGET.priceHeader)).toEqual(head.slice(0, 5));
  });
});

describe("'Listede var · {grup}' (dahil YA DA çıkarılmış satır)", () => {
  it("katalog kalemi listede varsa seçilemez; gerekçe grup adıyla; kod çakışması engel DEĞİL", () => {
    const groups = [
      group("g:1", "KABA İNŞAAT", [{ code: BETON.poz_no, catalog_item_id: BETON.id, sort_order: 0 }]),
      group("g:2", "İNCE", [{ code: "X", catalog_item_id: DEMIR.id, sort_order: 0, isExcluded: true }, { code: SIVA.poz_no, catalog_item_id: "baska", sort_order: 1 }]),
    ];
    const beton = rowOf(BETON, groups);
    expect(beton.block).toEqual({ kind: "linked", groupName: "KABA İNŞAAT" });
    expect(blockReasonText(beton.block!, CONVERT_RULES)).toBe("Listede var · KABA İNŞAAT");
    expect(rowOf(DEMIR, groups).block).toEqual({ kind: "linked", groupName: "İNCE" });
    expect(rowOf(SIVA, groups).block).toBeNull();
  });
});

describe("tavan: dönüştürme YALNIZ 2000 − DAHİL kalem (tek seferlik 200 sınırı YOK — F5.4b)", () => {
  it("🔴 boş listede 2000 (tek seferde 200 DEĞİL) + dönüştürme metni", () => {
    expect(selectionLimit(CONVERT_RULES, [])).toEqual({ max: 2000, message: "En fazla 2000 kalem dönüştürülebilir" });
  });
  it("🔴 dahil kalem 2000'e yaklaşınca tavan düşer ve dönüştürme metni basılır", () => {
    expect(selectionLimit(CONVERT_RULES, [group("g", "A", counted(1990))])).toEqual({
      max: 10,
      message: "En fazla 2000 kalem dönüştürülebilir",
    });
    expect(selectionLimit(CONVERT_RULES, [group("g", "A", counted(2000))]).max).toBe(0);
    expect(selectionLimit(CONVERT_RULES, [group("g", "A", counted(2500))]).max).toBe(0);
  });
  it("🔴 ÇIKARILMIŞ satırlar tavana sayılmaz (yalnız dahil olan gövdeye girer)", () => {
    expect(selectionLimit(CONVERT_RULES, [group("g", "A", [...counted(1990), ...excluded(500)])]).max).toBe(10);
    expect(selectionLimit(CONVERT_RULES, [group("g", "A", [...counted(100), ...excluded(900)])]).max).toBe(1900);
  });
  it("🔴 sözleşme/teklif hedefinde tek seferde 200 AYNEN kalır (yalnız yerel gövdeli priced hedef kalkar)", () => {
    expect(selectionLimit(CONTRACT_RULES, [])).toEqual({ max: MAX_BULK_ITEMS, message: "Tek seferde en fazla 200 poz eklenebilir" });
    expect(selectionLimit(OFFER_RULES, [])).toEqual({ max: MAX_BULK_ITEMS, message: "Tek seferde en fazla 200 kalem eklenebilir" });
  });
  it("diğer hedefler değişmedi: sözleşme/teklif 200, şablon 1000 − mevcut", () => {
    expect(selectionLimit(CONTRACT_RULES, [group("g", "A", counted(1500))]).max).toBe(200);
    expect(selectionLimit(OFFER_RULES, [group("g", "A", counted(1500))]).max).toBe(200);
    expect(selectionLimit(TEMPLATE_RULES, [group("g", "A", counted(990))]).max).toBe(10);
  });
});

describe("yeni grup adı sınırı (hedef bazlı)", () => {
  it("🔴 dönüştürme 200 (backend grup adı); sözleşme/teklif/şablonun mevcut 2000'i DEĞİŞMEZ", () => {
    expect(CONVERT_RULES.groupNameMax).toBe(200);
    expect([CONTRACT_RULES, OFFER_RULES, TEMPLATE_RULES].map((rules) => rules.groupNameMax)).toEqual([2000, 2000, 2000]);
  });
});

describe("Σ tutar: dönüştürmede SATIR BAŞI ROUND_HALF_UP (tabloyla kuruşu kuruşuna aynı)", () => {
  const entries = [LAST_SZL, SIVA].map((item) => ({ item, quantity: "0.005", unitPrice: "1.00" }));
  it("🔴 iki satır 0,005 × 1,00: dönüştürme 0,02 (her satır 0,01)", () => {
    expect(compareDecimalStrings(totalAmount(entries, CONVERT_RULES), "0.02")).toBe(0);
  });
  it("🔴 diğer hedeflerin Σ'sı DEĞİŞMEZ: toplamda yuvarlanır (0,010 → ekranda ₺0,01); kural verilmezse de aynı", () => {
    expect(compareDecimalStrings(totalAmount(entries, CONTRACT_RULES), "0.01")).toBe(0);
    expect(compareDecimalStrings(totalAmount(entries, OFFER_RULES), "0.01")).toBe(0);
    expect(compareDecimalStrings(totalAmount(entries), "0.01")).toBe(0);
  });
});

describe("doğrulama: miktar BOŞ + zorunlu, birim fiyat zorunlu", () => {
  it("🔴 seçili ama miktarsız satır sorunlu ('Miktar girin'); gövdeye girmez", () => {
    const row = rowOf(LAST_SZL);
    const inputs = toggleRow(NO_INPUTS, row, true);
    const { entries, problems } = resolveSelection([row], inputs, CONVERT_RULES);
    expect(entries).toEqual([]);
    expect(problems[0]?.message).toBe("Miktar girin");
  });
  it("🔴 birim fiyat boşsa sorunlu ('Birim fiyat girin'); referans/son fiyat yoksa öneri de boş", () => {
    const row = rowOf({ ...BETON, ref_price: null });
    const inputs = setQuantity(toggleRow(NO_INPUTS, row, true), row, "2");
    expect(resolveSelection([row], inputs, CONVERT_RULES).problems[0]?.message).toBe("Birim fiyat girin");
  });
  it("B.F. 0 serbest (backend ≥ 0); miktar 0 reddedilir", () => {
    const row = rowOf(BETON);
    const zeroPrice = setUnitPrice(setQuantity(toggleRow(NO_INPUTS, row, true), row, "2"), row, "0");
    expect(resolveSelection([row], zeroPrice, CONVERT_RULES).problems).toEqual([]);
    const zeroQty = setQuantity(toggleRow(NO_INPUTS, row, true), row, "0");
    expect(resolveSelection([row], zeroQty, CONVERT_RULES).problems[0]?.message).toBe("Miktar 0'dan büyük olmalı");
  });
});

describe("buildBody: HTTP gövdesi DEĞİL, yerel satır girdisi", () => {
  it("🔴 {groupId, entries:[{item, quantity, unitPrice}]} — snake_case alan / offer_item_id / sort_order YOK", () => {
    const row = rowOf(LAST_SZL);
    const inputs = setQuantity(toggleRow(NO_INPUTS, row, true), row, "12,5");
    const { entries } = resolveSelection([row], inputs, CONVERT_RULES);
    const body = CONVERT_PICKER_TARGET.buildBody(entries, "g:g-kaba", 99);
    expect(body).toEqual({ groupId: "g:g-kaba", entries: [{ item: LAST_SZL, quantity: "12.5", unitPrice: "3410.00" }] });
    expect(JSON.stringify(body)).not.toMatch(/offer_item_id|catalog_item_id|group_id|sort_order|unit_price/);
  });
});
