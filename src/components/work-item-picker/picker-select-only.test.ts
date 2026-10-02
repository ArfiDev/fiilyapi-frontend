import { describe, expect, it } from "vitest";

import { BETON, DEMIR, SIVA } from "@/components/work-item-catalog/work-item-fixtures";
import { MSG_ITEMS_TOO_MANY } from "@/components/offer-templates/template-content";

import { pickerColumns } from "./picker-columns";
import {
  MAX_BULK_ITEMS,
  blockReasonText,
  buildPickerRows,
  resolveSelection,
  selectionLimit,
  toggleRow,
  type PickerGroup,
  type PickerInputs,
  type PickerRow,
} from "./picker-model";
import { CONTRACT_PICKER_TARGET, OFFER_PICKER_TARGET, TEMPLATE_PICKER_TARGET } from "./picker-target";

const NO_INPUTS: PickerInputs = new Map();

function group(id: string, name: string, items: PickerGroup["items"]): PickerGroup {
  return { id, name, sort_order: 0, items };
}

const TEMPLATE_GROUPS: PickerGroup[] = [group("g-1", "Betonarme", [{ code: BETON.poz_no, catalog_item_id: BETON.id, sort_order: 0 }])];

describe("TEMPLATE_PICKER_TARGET — metinler (TKL-F4-PLAN §3)", () => {
  it("başlık, alt metin, bant, süzgeç etiketi, seçilemez gerekçesi AYNEN; mod selectOnly", () => {
    expect(TEMPLATE_PICKER_TARGET.entryMode).toBe("selectOnly");
    expect(TEMPLATE_PICKER_TARGET.title).toBe("Katalogdan Kalem Ekle");
    expect(TEMPLATE_PICKER_TARGET.subtitle).toBe("İş Kalemi Kataloğu'ndan şablona kalem ekle");
    expect(TEMPLATE_PICKER_TARGET.noteLead + TEMPLATE_PICKER_TARGET.noteRest).toBe(
      "Şablonda miktar ve fiyat tutulmaz; kalem seti ve gruplar saklanır.",
    );
    expect(TEMPLATE_PICKER_TARGET.hideLabel).toBe("Şablonda olanları gizle");
    expect(TEMPLATE_PICKER_TARGET.linkedLabel).toBe("Şablonda var");
  });

  it("🔴 sözleşme ve teklif hedefleri 'priced' kalır, bant metinleri değişmez (risk 7)", () => {
    expect(CONTRACT_PICKER_TARGET.entryMode).toBe("priced");
    expect(OFFER_PICKER_TARGET.entryMode).toBe("priced");
    expect(CONTRACT_PICKER_TARGET.noteLead).toBe("Poz no, tanım ve birim katalogdan kopyalanır.");
    expect(OFFER_PICKER_TARGET.noteLead).toBe("Poz no, tarif, birim ve adam-saat katalogdan kopyalanır.");
  });
});

describe("pickerColumns — kolon listesi moddan türer", () => {
  it("priced: Miktar + fiyat başlığı + Tutar VAR", () => {
    expect(pickerColumns("priced", "Maliyet B.F.")).toEqual([
      "Poz No", "Tanım", "Birim", "Ref. fiyat", "Son fiyat", "Miktar", "Maliyet B.F.", "Tutar",
    ]);
  });

  it("selectOnly: Miktar / fiyat / Tutar YOK, katalog bilgisi kalır", () => {
    expect(pickerColumns("selectOnly", "")).toEqual(["Poz No", "Tanım", "Birim", "Ref. fiyat", "Son fiyat"]);
  });
});

describe("şablon hedefi — seçilemezlik", () => {
  it("şablonda olan katalog kalemi kapalı: 'Şablonda var · {grup}'; diğerleri serbest", () => {
    const rows = buildPickerRows([BETON, DEMIR], TEMPLATE_GROUPS, TEMPLATE_PICKER_TARGET);
    expect(rows[0]?.block).toEqual({ kind: "linked", groupName: "Betonarme" });
    expect(blockReasonText(rows[0]?.block as NonNullable<PickerRow["block"]>, TEMPLATE_PICKER_TARGET)).toBe("Şablonda var · Betonarme");
    expect(rows[1]?.block).toBeNull();
  });

  it("poz no çakışması engel DEĞİL (kopya değil bağ kimliği geçerli)", () => {
    const groups = [group("g-1", "A", [{ code: DEMIR.poz_no, catalog_item_id: "baska", sort_order: 0 }])];
    expect(buildPickerRows([DEMIR], groups, TEMPLATE_PICKER_TARGET)[0]?.block).toBeNull();
  });
});

describe("şablon hedefi — seçim ve gövde", () => {
  const rows = buildPickerRows([BETON, DEMIR, SIVA], [], TEMPLATE_PICKER_TARGET);

  it("🔴 miktar/fiyat girilmeden seçilen satır GEÇERLİ: doğrulama yok, sorun yok", () => {
    const inputs = toggleRow(toggleRow(NO_INPUTS, rows[0] as PickerRow, true), rows[2] as PickerRow, true);
    const { entries, problems, selectedCount } = resolveSelection(rows, inputs, TEMPLATE_PICKER_TARGET);
    expect(problems).toEqual([]);
    expect(selectedCount).toBe(2);
    expect(entries.map((entry) => entry.item.id)).toEqual([BETON.id, SIVA.id]);
  });

  it("🔴 priced hedefte aynı seçim miktarsız olduğundan SORUNLU (doğrulama korunur)", () => {
    const inputs = toggleRow(NO_INPUTS, rows[0] as PickerRow, true);
    expect(resolveSelection(rows, inputs, OFFER_PICKER_TARGET).problems).toHaveLength(1);
    expect(resolveSelection(rows, inputs, CONTRACT_PICKER_TARGET).problems).toHaveLength(1);
  });

  it("🔴 buildBody HTTP gövdesi DEĞİL: {groupId, catalogIds} (satır sırası)", () => {
    const inputs = toggleRow(toggleRow(NO_INPUTS, rows[1] as PickerRow, true), rows[0] as PickerRow, true);
    const { entries } = resolveSelection(rows, inputs, TEMPLATE_PICKER_TARGET);
    expect(TEMPLATE_PICKER_TARGET.buildBody(entries, "g-7", 99)).toEqual({ groupId: "g-7", catalogIds: [BETON.id, DEMIR.id] });
  });
});

describe("selectionLimit — tavan", () => {
  it("🔴 şablon: 1000 − mevcut kalem sayısı; metin backend metniyle AYNI", () => {
    const groups = [
      group("g-1", "A", Array.from({ length: 3 }, (_, i) => ({ code: `c${i}`, catalog_item_id: `x${i}`, sort_order: i }))),
      group("g-2", "B", [{ code: "d", catalog_item_id: "y", sort_order: 0 }]),
    ];
    expect(selectionLimit(TEMPLATE_PICKER_TARGET, groups)).toEqual({ max: 996, message: MSG_ITEMS_TOO_MANY });
    expect(selectionLimit(TEMPLATE_PICKER_TARGET, [])).toEqual({ max: 1000, message: MSG_ITEMS_TOO_MANY });
  });

  it("tavan eksiye düşmez", () => {
    const full = [group("g", "A", Array.from({ length: 1001 }, (_, i) => ({ code: `c${i}`, catalog_item_id: `x${i}`, sort_order: i })))];
    expect(selectionLimit(TEMPLATE_PICKER_TARGET, full).max).toBe(0);
  });

  it("🔴 sözleşme/teklif: tek istek tavanı MAX_BULK_ITEMS, mevcut metin AYNEN", () => {
    expect(selectionLimit(CONTRACT_PICKER_TARGET, [])).toEqual({ max: MAX_BULK_ITEMS, message: "Tek seferde en fazla 200 poz eklenebilir" });
    expect(selectionLimit(OFFER_PICKER_TARGET, TEMPLATE_GROUPS)).toEqual({ max: MAX_BULK_ITEMS, message: "Tek seferde en fazla 200 kalem eklenebilir" });
  });
});
