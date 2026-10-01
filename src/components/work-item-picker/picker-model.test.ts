import { describe, expect, it } from "vitest";

import type { EmployerContractItemsResponse } from "@/lib/api/hooks/useContract";
import type { WorkItemRead } from "@/lib/api/models";
import {
  BETON,
  DEMIR,
  D_DUV,
  D_KAB,
  LAST_EMPTY,
  LAST_MASKED,
  LAST_SZL,
  SIVA,
} from "@/components/work-item-catalog/work-item-fixtures";

import { validateEmployerUnitPriceField, validateQuantityField } from "@/components/contract-item-form/validate";

import {
  blockReasonText,
  buildBulkBody,
  buildPickerRows,
  defaultGroupId,
  filterRows,
  groupByDiscipline,
  isPickerInputsDirty,
  MAX_BULK_ITEMS,
  resolveSelection,
  resolveTargetGroup,
  setQuantity,
  setUnitPrice,
  suggestUnitPrice,
  toggleRow,
  toggleRows,
  totalAmount,
  validateRow,
  type PickerInputs,
  type PickerRow,
} from "./picker-model";

const NO_INPUTS: PickerInputs = new Map();

type Groups = EmployerContractItemsResponse["groups"];

function contractItem(over: { id: string; code: string; catalog_item_id: string | null; sort_order?: number }) {
  return { description: "x", unit: "m³", quantity: "1", unit_price: "1", sort_order: 0, ...over };
}

/** Sözleşmede: BETON katalogdan BAĞLI (kodu değiştirilmiş), bağsız bir kalem DEMIR'in poz no'sunu taşıyor. */
const GROUPS = [
  {
    id: "g-1",
    name: "KABA İNŞAAT",
    sort_order: 1,
    items: [
      contractItem({ id: "c-1", code: "ÖZEL-1", catalog_item_id: BETON.id }),
      contractItem({ id: "c-2", code: DEMIR.poz_no, catalog_item_id: null }),
    ],
  },
] as unknown as Groups;

function rowOf(item: WorkItemRead, groups: Groups = GROUPS): PickerRow {
  const row = buildPickerRows([item], groups)[0];
  if (!row) throw new Error("satır yok");
  return row;
}

describe("buildPickerRows — seçilebilirlik", () => {
  const rows = buildPickerRows([BETON, DEMIR, SIVA], GROUPS);

  it("sözleşmede BAĞLI kalem seçilemez; gerekçe grup adını taşır (kod değişmiş olsa da)", () => {
    expect(rows[0]?.block).toEqual({ kind: "linked", groupName: "KABA İNŞAAT" });
    expect(blockReasonText({ kind: "linked", groupName: "KABA İNŞAAT" })).toBe("Sözleşmede var · KABA İNŞAAT");
  });

  it("bağsız ama aynı poz no'lu sözleşme kalemi varsa seçilemez (kod çakışması)", () => {
    expect(rows[1]?.block).toEqual({ kind: "code" });
    expect(blockReasonText({ kind: "code" })).toBe("Bu poz no sözleşmede başka bir kalemde kullanılıyor");
  });

  it("sözleşmede izi olmayan kalem seçilebilir", () => {
    expect(rows[2]?.block).toBeNull();
  });

  it("hem bağlı hem aynı kodlu ise gerekçe 'bağlı'dır", () => {
    const groups = [
      { id: "g", name: "G", sort_order: 0, items: [contractItem({ id: "c", code: BETON.poz_no, catalog_item_id: BETON.id })] },
    ] as unknown as Groups;
    expect(rowOf(BETON, groups).block).toEqual({ kind: "linked", groupName: "G" });
  });

  // TKL-F2.4.1 DÜŞÜK-5: backend `list_employer_item_codes` `code.in_(...)` ile BİREBİR karşılaştırır ve gövdede
  // kodu kırpmaz (şema `str_strip_whitespace` taşımaz) → istemci de birebir: harf/boşluk farkı çakışma DEĞİLDİR
  // (istemci sahte engel koyarsa kullanıcı sunucunun kabul edeceği pozu ekleyemez).
  it("poz no karşılaştırması backend gibi BİREBİR: harf/boşluk farkı çakışma sayılmaz", () => {
    const withCode = (code: string) =>
      [{ id: "g", name: "G", sort_order: 0, items: [contractItem({ id: "c", code, catalog_item_id: null })] }] as unknown as Groups;
    expect(rowOf(SIVA, withCode(SIVA.poz_no.toLowerCase())).block).toBeNull();
    expect(rowOf(SIVA, withCode(` ${SIVA.poz_no} `)).block).toBeNull();
    expect(rowOf(SIVA, withCode(SIVA.poz_no)).block).toEqual({ kind: "code" });
  });

  it("seçilemeyen satır işaretlenemez: toggleRow ve toggleRows onu atlar", () => {
    const [linked, code, free] = rows as [PickerRow, PickerRow, PickerRow];
    expect(toggleRow(NO_INPUTS, linked, true).get(BETON.id)?.selected).toBeUndefined();
    const all = toggleRows(NO_INPUTS, [linked, code, free], true);
    expect([...all.keys()]).toEqual([SIVA.id]);
  });

  it("miktar yazmak da seçilemeyen satırı seçmez", () => {
    const [linked] = rows as [PickerRow];
    expect(setQuantity(NO_INPUTS, linked, "5").get(BETON.id)?.selected ?? false).toBe(false);
  });
});

describe("suggestUnitPrice — son fiyat → referans → boş", () => {
  it("son fiyat varsa o (TR biçimi)", () => {
    expect(suggestUnitPrice(LAST_SZL)).toBe("3.410,00");
  });
  it("son fiyat yoksa referans fiyat", () => {
    expect(suggestUnitPrice(BETON)).toBe("1.250,50");
    expect(suggestUnitPrice(LAST_EMPTY)).toBe("100,00");
  });
  it("ikisi de yoksa ya da MASKELİYSE (limited) boş — uydurulmaz", () => {
    expect(suggestUnitPrice(SIVA)).toBe("");
    expect(suggestUnitPrice(LAST_MASKED)).toBe("");
  });
  it("öneri yazım kuralıyla GERİ okunur: kayıpsız aynı sayı", () => {
    for (const item of [LAST_SZL, BETON, LAST_EMPTY]) {
      const row = rowOf(item, [] as unknown as Groups);
      const inputs = setQuantity(NO_INPUTS, row, "1");
      const { entries } = resolveSelection([row], inputs);
      expect(entries[0]?.unitPrice).toBe(item.last_price?.price ?? item.ref_price);
    }
  });
});

describe("seçim modeli", () => {
  const row = rowOf(SIVA);
  const betonFree = rowOf(BETON, [] as unknown as Groups);

  it("onay kutusu seçer ve boş B.F.'yi öneriyle doldurur; kaldırınca gövdeden düşer ama değerler silinmez", () => {
    const on = toggleRow(NO_INPUTS, betonFree, true);
    expect(on.get(BETON.id)).toEqual({ selected: true, quantity: "", unitPrice: "1.250,50" });
    const typed = setQuantity(on, betonFree, "2");
    const off = toggleRow(typed, betonFree, false);
    expect(off.get(BETON.id)).toEqual({ selected: false, quantity: "2", unitPrice: "1.250,50" });
    expect(resolveSelection([betonFree], off).entries).toEqual([]);
    expect(resolveSelection([betonFree], off).selectedCount).toBe(0);
  });

  it("miktar yazınca satır OTOMATİK seçilir (ilk yazımda öneri dolar); silince seçim kalır", () => {
    const next = setQuantity(NO_INPUTS, betonFree, "4");
    expect(next.get(BETON.id)).toEqual({ selected: true, quantity: "4", unitPrice: "1.250,50" });
    expect(setQuantity(next, betonFree, "").get(BETON.id)?.selected).toBe(true);
  });

  it("kullanıcının yazdığı B.F. öneriyle EZİLMEZ", () => {
    const priced = setUnitPrice(NO_INPUTS, betonFree, "999,00");
    expect(priced.get(BETON.id)?.selected).toBe(false);
    const selected = toggleRow(priced, betonFree, true);
    expect(selected.get(BETON.id)?.unitPrice).toBe("999,00");
    expect(setQuantity(priced, betonFree, "1").get(BETON.id)?.unitPrice).toBe("999,00");
  });

  it("B.F. önerisi olmayan kalemde (maskeli/fiyatsız) kutu boş kalır", () => {
    expect(toggleRow(NO_INPUTS, row, true).get(SIVA.id)?.unitPrice).toBe("");
  });

  it("girdi haritası DEĞİŞTİRİLMEZ (yeni harita döner)", () => {
    const before = new Map<string, never>() as PickerInputs;
    toggleRow(before, betonFree, true);
    setQuantity(before, betonFree, "3");
    expect(before.size).toBe(0);
  });

  it("toggleRows yalnız verilen seçilebilir satırları açar/kapatır", () => {
    const a = rowOf(BETON, [] as unknown as Groups);
    const b = rowOf(SIVA);
    const on = toggleRows(NO_INPUTS, [a, b], true);
    expect(on.get(BETON.id)?.selected).toBe(true);
    expect(on.get(SIVA.id)?.selected).toBe(true);
    const off = toggleRows(on, [a], false);
    expect(off.get(BETON.id)?.selected).toBe(false);
    expect(off.get(SIVA.id)?.selected).toBe(true);
  });
});

describe("validateRow — tek ilk hata (§6 ÜS-F2-25)", () => {
  const v = (quantity: string, unitPrice: string) => validateRow({ quantity, unitPrice });

  it("geçerli satır → null (B.F. 0 serbest: backend unit_price ≥ 0)", () => {
    expect(v("480", "3.320,00")).toBeNull();
    expect(v("1,5", "0")).toBeNull();
  });
  it("miktar önce, fiyat sonra", () => {
    expect(v("", "")).toBe("Miktar girin");
    expect(v("   ", "")).toBe("Miktar girin");
    expect(v("0", "10")).toBe("Miktar 0'dan büyük olmalı");
    expect(v("0,000", "10")).toBe("Miktar 0'dan büyük olmalı");
    expect(v("5", "")).toBe("Birim fiyat girin");
    expect(v("5", "  ")).toBe("Birim fiyat girin");
  });
  // TKL-F2.4.1 DÜŞÜK-8: "-1" ve "₺1.850,00" "girin" diyordu (dolu alan için yanıltıcı). Metinler
  // `contract-item-form/validate.ts`teki ONAYLI metinlerle birebir; drift bekçisi aşağıda doğrudan karşılaştırır.
  it("dolu ama okunamayan değer 'girin' DEMEZ: sayı olmalı / negatif olamaz", () => {
    expect(v("abc", "5")).toBe("Miktar sayı olmalıdır.");
    expect(v("5", "x")).toBe("Birim Fiyat sayı olmalıdır.");
    expect(v("5", "₺1.850,00")).toBe("Birim Fiyat sayı olmalıdır.");
    expect(v("-1", "5")).toBe("Miktar 0'dan büyük olmalı");
    expect(v("5", "-1")).toBe("Birim Fiyat negatif olamaz.");
    expect(v("5", "-1,50")).toBe("Birim Fiyat negatif olamaz.");
    expect(v("5", "-")).toBe("Birim Fiyat sayı olmalıdır.");
  });
  it("metinler validate.ts ile aynı kalır (drift bekçisi)", () => {
    expect(v("5", "x")).toBe(validateEmployerUnitPriceField("x")?.message);
    expect(v("5", "-1")).toBe(validateEmployerUnitPriceField("-1")?.message);
    expect(v("x", "5")).toBe(validateQuantityField("x")?.message);
  });
  it("T30 belirsizliği hem miktarda hem fiyatta REDDEDİLİR", () => {
    expect(v("1.5", "10")).toBe("Ondalık için virgül kullanın (ör. 28,50)");
    expect(v("5", "28.5")).toBe("Ondalık için virgül kullanın (ör. 28,50)");
    expect(v("5", "1.50")).toBe("Ondalık için virgül kullanın (ör. 28,50)");
  });
  it("hane sınırları: miktar 3 kesir / 11 tam, fiyat 2 kesir / 16 tam", () => {
    expect(v("1,2345", "1")).toBe("En fazla 3 ondalık");
    expect(v("1,2340", "1")).toBeNull();
    expect(v("123456789012", "1")).toBe("En fazla 11 basamak");
    expect(v("12345678901", "1")).toBeNull();
    expect(v("1", "1,234")).toBe("En fazla 2 ondalık");
    expect(v("1", "12345678901234567")).toBe("En fazla 16 basamak");
    expect(v("1", "1234567890123456")).toBeNull();
  });
});

describe("resolveSelection + totalAmount", () => {
  const a = rowOf(BETON, [] as unknown as Groups);
  const b = rowOf(DEMIR, [] as unknown as Groups);
  const c = rowOf(SIVA);

  it("yalnız seçili + geçerli satırlar girer; hatalı seçili satır problems'e düşer; seçili sayısı ikisini sayar", () => {
    let inputs = setQuantity(NO_INPUTS, a, "2");
    inputs = setQuantity(inputs, b, "1.5"); // belirsiz
    const res = resolveSelection([a, b, c], inputs);
    expect(res.entries.map((e) => e.item.id)).toEqual([BETON.id]);
    expect(res.problems.map((p) => [p.row.item.id, p.message])).toEqual([
      [DEMIR.id, "Ondalık için virgül kullanın (ör. 28,50)"],
    ]);
    expect(res.selectedCount).toBe(2);
  });

  it("değerler kayıpsız ondalık METİN olarak çözülür", () => {
    let inputs = setQuantity(NO_INPUTS, a, "1.500");
    inputs = setUnitPrice(inputs, a, "28.500,75");
    expect(resolveSelection([a], inputs).entries).toEqual([
      { item: BETON, quantity: "1500", unitPrice: "28500.75" },
    ]);
  });

  it("sıra = verilen satır sırası (çağıran poz no sırasında verir)", () => {
    const inputs = setQuantity(setQuantity(NO_INPUTS, b, "1"), a, "1");
    expect(resolveSelection([a, b], inputs).entries.map((e) => e.item.poz_no)).toEqual(["KAB-0001", "KAB-0002"]);
  });

  it("Σ KAYIPSIZ: 0,1 × 3 = 0.3 (float 0.30000000000000004 değil)", () => {
    const entries = [{ item: BETON, quantity: "0.1", unitPrice: "3" }];
    expect(totalAmount(entries)).toBe("0.3");
    const many = [
      { item: BETON, quantity: "0.1", unitPrice: "1" },
      { item: DEMIR, quantity: "0.2", unitPrice: "1" },
    ];
    expect(totalAmount(many)).toBe("0.3");
  });

  it("Σ büyük tutarda kayıpsız ve kuruş hassasiyetli", () => {
    const entries = [
      { item: BETON, quantity: "480.125", unitPrice: "3320.37" },
      { item: DEMIR, quantity: "1500", unitPrice: "28500.75" },
    ];
    expect(totalAmount(entries)).toBe("44345317.64625");
  });

  it("boş seçimde Σ = 0", () => {
    expect(totalAmount([])).toBe("0");
  });
});

describe("buildBulkBody — toplu ucun gövdesi (§2.3)", () => {
  const entries = [
    { item: BETON, quantity: "480", unitPrice: "3320.00" },
    { item: SIVA, quantity: "12.5", unitPrice: "100.50" },
  ];

  it("kopyalanan alanlar: code=poz_no, description=name, unit=uom, catalog_item_id=id; hedef grup", () => {
    const body = buildBulkBody(entries, "g-9", 4);
    expect(body.items[0]).toEqual({
      group_id: "g-9",
      code: "KAB-0001",
      description: "Beton döküm",
      unit: "m³",
      quantity: "480",
      unit_price: "3320.00",
      sort_order: 4,
      catalog_item_id: BETON.id,
    });
  });

  it("sort_order ardışık (taban + sıra)", () => {
    expect(buildBulkBody(entries, "g", 7).items.map((i) => i.sort_order)).toEqual([7, 8]);
  });

  it("sayılar dot-decimal METİN (number değil)", () => {
    for (const item of buildBulkBody(entries, "g", 0).items) {
      expect(typeof item.quantity).toBe("string");
      expect(typeof item.unit_price).toBe("string");
    }
  });

  it("her kalem catalog_item_id taşır (bağ yalnız bu uçta kurulur)", () => {
    expect(buildBulkBody(entries, "g", 0).items.map((i) => i.catalog_item_id)).toEqual([BETON.id, SIVA.id]);
  });

  it("MAX_BULK_ITEMS 200 (openapi maxItems ile bekçi: picker-limits.test.ts)", () => {
    expect(MAX_BULK_ITEMS).toBe(200);
  });
});

describe("filterRows", () => {
  const rows = buildPickerRows([BETON, DEMIR, SIVA], GROUPS);
  const base = { query: "", disciplineId: null, hideInContract: false };

  it("tr-TR arama: 'İ' → i, 'I' → ı (poz no ve tanımda)", () => {
    expect(filterRows(rows, { ...base, query: "İÇ SIVA" }).map((r) => r.item.id)).toEqual([SIVA.id]);
    expect(filterRows(rows, { ...base, query: "iç sıva" }).map((r) => r.item.id)).toEqual([SIVA.id]);
    expect(filterRows(rows, { ...base, query: "kab-0002" }).map((r) => r.item.id)).toEqual([DEMIR.id]);
    // ASCII 'i' ile yazılan "IC" tr-TR'de "ıc"dir: "İç" ile eşleşmez
    expect(filterRows(rows, { ...base, query: "IC SIVA" })).toEqual([]);
  });

  it("disiplin süzgeci", () => {
    expect(filterRows(rows, { ...base, disciplineId: D_DUV.id }).map((r) => r.item.id)).toEqual([SIVA.id]);
    expect(filterRows(rows, { ...base, disciplineId: D_KAB.id })).toHaveLength(2);
  });

  it("'sözleşmede olanları gizle': bağlı VE kod çakışmalı satırlar düşer", () => {
    expect(filterRows(rows, { ...base, hideInContract: true }).map((r) => r.item.id)).toEqual([SIVA.id]);
    expect(filterRows(rows, base)).toHaveLength(3);
  });
});

describe("groupByDiscipline", () => {
  it("disiplin sırasına göre bölümler, her bölümde poz no sırası; listede olmayan disiplin sona", () => {
    const rows = buildPickerRows([SIVA, DEMIR, BETON], [] as unknown as Groups);
    const sections = groupByDiscipline(rows, [D_KAB, D_DUV]);
    expect(sections.map((s) => s.discipline.code)).toEqual(["KAB", "DUV"]);
    expect(sections[0]?.rows.map((r) => r.item.poz_no)).toEqual(["KAB-0001", "KAB-0002"]);
    const unknown = groupByDiscipline(rows, [D_DUV]);
    expect(unknown.map((s) => s.discipline.code)).toEqual(["DUV", "KAB"]);
  });
});

describe("resolveTargetGroup — hedef grup TÜRETİLMİŞ değer (TKL-F2.4.1 ORTA-2)", () => {
  const NEW = "__new__";
  const created = { id: "g-new", name: "YENİ" };

  it("seçili grup hâlâ listede ise o grup", () => {
    expect(resolveTargetGroup("g-1", GROUPS, null)).toBe("g-1");
    expect(resolveTargetGroup("g-new", [] as unknown as Groups, created)).toBe("g-new");
  });
  it("seçili grup artık YOKSA (422 tazelemesi silmiş) varsayılan = sort_order en büyük grup", () => {
    const two = [
      { id: "g-a", name: "A", sort_order: 1, items: [] },
      { id: "g-b", name: "B", sort_order: 2, items: [] },
    ] as unknown as Groups;
    expect(resolveTargetGroup("g-silinmis", two, null)).toBe("g-b");
    expect(defaultGroupId(two)).toBe("g-b");
    expect(resolveTargetGroup("g-silinmis", [] as unknown as Groups, null)).toBe(NEW);
  });
  it("açılmış grup varken '+ Yeni Grup' seçimi o gruba çözülür (ikinci grup açılmaz)", () => {
    expect(resolveTargetGroup(NEW, [] as unknown as Groups, created)).toBe("g-new");
    expect(resolveTargetGroup("g-silinmis", [] as unknown as Groups, created)).toBe("g-new");
  });
  it("açılmış grup yoksa '+ Yeni Grup' kalır", () => {
    expect(resolveTargetGroup(NEW, GROUPS, null)).toBe(NEW);
  });
});

describe("isPickerInputsDirty — yalnız B.F. yazılan satır da kirlidir (TKL-F2.4.1 DÜŞÜK-7)", () => {
  const row = rowOf(SIVA, [] as unknown as Groups);

  it("boş girdi temiz", () => {
    expect(isPickerInputsDirty([row], NO_INPUTS)).toBe(false);
  });
  it("yalnız birim fiyat yazıldı → kirli", () => {
    expect(isPickerInputsDirty([row], setUnitPrice(NO_INPUTS, row, "25,00"))).toBe(true);
  });
  it("yalnız miktar yazıldı / seçildi → kirli", () => {
    expect(isPickerInputsDirty([row], setQuantity(NO_INPUTS, row, "2"))).toBe(true);
    expect(isPickerInputsDirty([row], toggleRow(NO_INPUTS, row, true))).toBe(true);
  });
  it("seç-sonra-kaldır: otomatik dolan ÖNERİ fiyatı tek başına kirli saymaz", () => {
    const priced = rowOf(LAST_SZL, [] as unknown as Groups);
    const toggled = toggleRow(toggleRow(NO_INPUTS, priced, true), priced, false);
    expect(toggled.get(LAST_SZL.id)?.unitPrice).toBe("3.410,00");
    expect(isPickerInputsDirty([priced], toggled)).toBe(false);
  });
});
