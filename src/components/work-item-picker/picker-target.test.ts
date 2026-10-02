import { describe, expect, it } from "vitest";

import { BETON, DEMIR, LAST_SZL, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import {
  blockReasonText,
  buildPickerRows,
  resolveSelection,
  setQuantity,
  setUnitPrice,
  toggleRow,
  totalAmount,
  unpricedCount,
  validateRow,
  type PickerGroup,
  type PickerInputs,
  type PickerRow,
} from "./picker-model";
import { CONTRACT_PICKER_TARGET, OFFER_PICKER_TARGET } from "./picker-target";

const NO_INPUTS: PickerInputs = new Map();
const OFFER_GROUPS: PickerGroup[] = [
  {
    id: "g-1",
    name: "KABA İNŞAAT",
    sort_order: 0,
    items: [
      { code: BETON.poz_no, catalog_item_id: BETON.id, sort_order: 3 },
      // Aynı poz no'lu ama BAŞKA katalog kalemine bağlı satır (teklifte kod çakışması engel DEĞİL).
      { code: SIVA.poz_no, catalog_item_id: "baska-kalem", sort_order: 4 },
    ],
  },
];

function offerRow(item: (typeof BETON), groups: PickerGroup[] = []): PickerRow {
  return buildPickerRows([item], groups, OFFER_PICKER_TARGET)[0] as PickerRow;
}

/** Satırı seç + miktar yaz (+ isteğe bağlı fiyat metni) → teklif gövdesi. */
function offerBody(row: PickerRow, price?: string, groupId = "g-9", base = 5) {
  let inputs = toggleRow(NO_INPUTS, row, true);
  inputs = setQuantity(inputs, row, "2,5");
  if (price !== undefined) inputs = setUnitPrice(inputs, row, price);
  const { entries, problems } = resolveSelection([row], inputs, OFFER_PICKER_TARGET);
  expect(problems).toEqual([]);
  return OFFER_PICKER_TARGET.buildBody(entries, groupId, base);
}

describe("teklif hedefi — metinler (plan §3.1 tablosu + ÜS-F3-18)", () => {
  it("başlık, alt metin, bant, süzgeç, fiyat kolonu, Σ, altbilgi bağlantısı", () => {
    expect(OFFER_PICKER_TARGET.title).toBe("Katalogdan Kalem Ekle");
    expect(OFFER_PICKER_TARGET.subtitle).toBe("İş Kalemi Kataloğu'ndan teklife kalem ekle");
    expect(OFFER_PICKER_TARGET.noteLead).toBe("Poz no, tarif, birim ve adam-saat katalogdan kopyalanır.");
    expect(OFFER_PICKER_TARGET.noteRest).toBe(
      " Maliyet son fiyattan, yoksa referans fiyattan önerilir; teklifte değiştirilebilir, katalog değişmez.",
    );
    expect(OFFER_PICKER_TARGET.hideLabel).toBe("Teklifte olanları gizle");
    expect(OFFER_PICKER_TARGET.priceHeader).toBe("Maliyet B.F.");
    expect(OFFER_PICKER_TARGET.totalLabel).toBe("Eklenecek maliyet");
    expect(OFFER_PICKER_TARGET.manualAddLabel).toBe("Katalogda yok mu? Kataloğa yeni kalem ekle");
  });

  it("sözleşme hedefi F2 metinlerini AYNEN korur", () => {
    expect(CONTRACT_PICKER_TARGET.title).toBe("Katalogdan Poz Ekle");
    expect(CONTRACT_PICKER_TARGET.hideLabel).toBe("Sözleşmede olanları gizle");
    expect(CONTRACT_PICKER_TARGET.priceHeader).toBe("Birim fiyat");
    expect(CONTRACT_PICKER_TARGET.totalLabel).toBe("Eklenecek Tutar");
    expect(CONTRACT_PICKER_TARGET.manualAddLabel).toBe("Katalogda yok mu? Elle poz ekle");
    expect(CONTRACT_PICKER_TARGET.isPriceRequired).toBe(true);
  });
});

describe("teklif hedefi — seçilemezlik", () => {
  it("🔴 teklifte zaten olan katalog kalemi kapalı: 'Teklifte var · {grup}'", () => {
    const row = offerRow(BETON, OFFER_GROUPS);
    expect(row.block).toEqual({ kind: "linked", groupName: "KABA İNŞAAT" });
    expect(blockReasonText(row.block as NonNullable<PickerRow["block"]>, OFFER_PICKER_TARGET)).toBe(
      "Teklifte var · KABA İNŞAAT",
    );
  });

  it("teklifte poz no çakışması engel DEĞİL (poz no kopyadır; yalnız katalog bağı sayılır)", () => {
    expect(offerRow(SIVA, OFFER_GROUPS).block).toBeNull();
  });

  it("sözleşme hedefinde aynı gruplar kod çakışmasını ENGELLER (F2 davranışı)", () => {
    const row = buildPickerRows([SIVA], OFFER_GROUPS, CONTRACT_PICKER_TARGET)[0] as PickerRow;
    expect(row.block).toEqual({ kind: "code" });
  });
});

describe("teklif hedefi — fiyat kuralı (maliyet B.F. isteğe bağlı, T31)", () => {
  it("boş maliyet GEÇERLİ; sözleşmede aynı boş değer hata", () => {
    expect(validateRow({ quantity: "2", unitPrice: "" }, OFFER_PICKER_TARGET)).toBeNull();
    expect(validateRow({ quantity: "2", unitPrice: "" }, CONTRACT_PICKER_TARGET)).toBe("Birim fiyat girin");
  });

  it("dolu ama hatalı maliyet teklif metniyle reddedilir; miktar yine zorunlu", () => {
    expect(validateRow({ quantity: "2", unitPrice: "abc" }, OFFER_PICKER_TARGET)).toBe("Maliyet B.F. sayı olmalıdır.");
    expect(validateRow({ quantity: "2", unitPrice: "-5" }, OFFER_PICKER_TARGET)).toBe("Maliyet B.F. negatif olamaz.");
    expect(validateRow({ quantity: "", unitPrice: "" }, OFFER_PICKER_TARGET)).toBe("Miktar girin");
  });

  it("boş maliyetli satır girer; fiyatı null; Σ yalnız dolu satırları sayar, fiyatsız sayısı ayrı", () => {
    const priced = offerRow(BETON);
    const unpriced = offerRow(SIVA);
    let inputs = setQuantity(NO_INPUTS, priced, "2");
    inputs = setQuantity(inputs, unpriced, "3");
    inputs = setUnitPrice(inputs, unpriced, "");
    const { entries, problems } = resolveSelection([priced, unpriced], inputs, OFFER_PICKER_TARGET);
    expect(problems).toEqual([]);
    expect(entries.map((e) => e.unitPrice)).toEqual(["1250.50", null]);
    expect(totalAmount(entries)).toBe("2501.00");
    expect(unpricedCount(entries)).toBe(1);
  });
});

describe("teklif hedefi — gövde (plan §3.1: dokunulmamış maliyet gövdede YOK)", () => {
  it("🔴 öneriye DOKUNULMAMIŞSA cost_unit_price alanı HİÇ gönderilmez (sunucu suggest_cost uygular)", () => {
    const item = offerBody(offerRow(BETON)).items[0] as Record<string, unknown>;
    expect("cost_unit_price" in item).toBe(false);
    const last = offerBody(offerRow(LAST_SZL)).items[0] as Record<string, unknown>;
    expect("cost_unit_price" in last).toBe(false);
  });

  it("🔴 kullanıcı DEĞİŞTİRİRSE açık değer gider (metin, kayıpsız)", () => {
    const item = offerBody(offerRow(BETON), "999,00").items[0];
    expect(item?.cost_unit_price).toBe("999.00");
  });

  it("🔴 önerili satırda kutuyu SİLERSE açık null gider (boş maliyet isteği)", () => {
    const item = offerBody(offerRow(BETON), "").items[0] as Record<string, unknown>;
    expect("cost_unit_price" in item).toBe(true);
    expect(item.cost_unit_price).toBeNull();
  });

  it("öneri yoksa (ref/son null) boş bırakmak alanı atlar; yazılan değer açık gider", () => {
    const blank = offerBody(offerRow(SIVA)).items[0] as Record<string, unknown>;
    expect("cost_unit_price" in blank).toBe(false);
    expect(offerBody(offerRow(SIVA), "10").items[0]?.cost_unit_price).toBe("10");
  });

  it("öneriyle sayısal olarak AYNI ama başka yazım ('1250,5') da dokunulmamış sayılır (gövde sade)", () => {
    const item = offerBody(offerRow(BETON), "1250,5").items[0] as Record<string, unknown>;
    expect("cost_unit_price" in item).toBe(false);
  });

  it("kopyalanan alanlar GÖNDERİLMEZ; katalog bağı, grup, miktar, sıra gider; unit_mhr YOK", () => {
    const body = offerBody(offerRow(BETON), undefined, "g-9", 5);
    expect(body.items[0]).toEqual({ catalog_item_id: BETON.id, group_id: "g-9", quantity: "2.5", sort_order: 5 });
    const two = (() => {
      const rows = [offerRow(BETON), offerRow(DEMIR)];
      let inputs = NO_INPUTS;
      for (const row of rows) inputs = setQuantity(inputs, row, "1");
      return OFFER_PICKER_TARGET.buildBody(resolveSelection(rows, inputs, OFFER_PICKER_TARGET).entries, "g", 7);
    })();
    expect(two.items.map((i) => i.sort_order)).toEqual([7, 8]);
    for (const item of two.items) {
      expect("unit_mhr" in item).toBe(false);
      expect(typeof item.quantity).toBe("string");
    }
  });
});
