import { describe, it, expect } from "vitest";

import {
  buildPivotRows,
  buildLinesSaveBody,
  findOrphanedAllocationCells,
  rowQuantityTotal,
  rowAmountTotal,
  sanitizeQuantityInput,
  normalizePivotRowsForSave,
} from "./pivot";
import type { ContractDistributionResponse } from "@/lib/api/hooks/useContract";
import type { ProgressPaymentLineDetail } from "@/lib/api/hooks/useProgressPayments";

const SITE_A = { id: "site-a", name: "A-Blok" };
const SITE_B = { id: "site-b", name: "B-Blok" };

const ITEM_1 = {
  id: "item-1",
  code: "03.001",
  description: "Kat Döşemesi C25/30",
  unit: "m³",
  quantity: "1500.000",
  unit_price: "1850.00",
  allocations: [
    { site_id: SITE_A.id, quantity: "900.000", boq_item_id: "boq-1" },
    { site_id: SITE_B.id, quantity: "420.000", boq_item_id: "boq-2" },
  ],
  remaining_quantity: "180.000",
};

// item-2 yalnız A-Blok'a dağıtılmış: B-Blok hücresi KAPALI olmalı.
const ITEM_2 = {
  id: "item-2",
  code: "03.002",
  description: "Kolon Betonu C30/37",
  unit: "m³",
  quantity: "300.000",
  unit_price: "2100.00",
  allocations: [{ site_id: SITE_A.id, quantity: "300.000", boq_item_id: "boq-3" }],
  remaining_quantity: "0.000",
};

const DISTRIBUTION: Pick<ContractDistributionResponse, "groups" | "sites"> = {
  sites: [SITE_A, SITE_B],
  groups: [
    { id: "g-1", name: "A — Betonarme İşleri", sort_order: 10, items: [ITEM_1, ITEM_2] },
  ],
};

function line(overrides: Partial<ProgressPaymentLineDetail>): ProgressPaymentLineDetail {
  return {
    id: "line-x",
    contract_item_id: ITEM_1.id,
    site_id: SITE_A.id,
    code: ITEM_1.code,
    description: ITEM_1.description,
    unit: ITEM_1.unit,
    contract_unit_price: ITEM_1.unit_price,
    coefficient: "1.000",
    quantity: "900.000",
    group_name: "A — Betonarme İşleri",
    sort_order: 0,
    // F-P10 T1 devri: `quantity_source` artık İŞVEREN satırında da SUNUCU
    // damgasıdır (SD-2, `ProgressPaymentLineDetail` zorunlu alanı) — taşeron
    // satırıyla aynı desen. Fikstür varsayılanı `manual`.
    quantity_source: "manual",
    adjusted_unit_price: ITEM_1.unit_price,
    line_total: "1665000.00",
    previous_quantity: "0.000",
    previous_amount: "0.00",
    cumulative_quantity: "900.000",
    cumulative_amount: "1665000.00",
    is_price_stale: false,
    ...overrides,
  };
}

describe("buildPivotRows", () => {
  it("her kalem için grup adı + site sayısı kadar hücre üretir", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    expect(rows).toHaveLength(2);
    expect(rows[0].groupName).toBe("A — Betonarme İşleri");
    expect(rows[0].cells).toHaveLength(2);
  });

  it("tahsis VARSA hücre düzenlenebilir ve varsayılan miktar '0'dır", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    const cellA = rows[0].cells.find((c) => c.siteId === SITE_A.id)!;
    expect(cellA.editable).toBe(true);
    expect(cellA.quantity).toBe("0");
  });

  it("tahsis YOKSA hücre kapalıdır (editable false, miktar boş)", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    const item2Row = rows.find((r) => r.item.id === ITEM_2.id)!;
    const cellB = item2Row.cells.find((c) => c.siteId === SITE_B.id)!;
    expect(cellB.editable).toBe(false);
    expect(cellB.quantity).toBe("");
  });

  it("mevcut satır varsa hücre onun miktarıyla önceden doldurulur (edit kipi)", () => {
    const lines = [line({ site_id: SITE_A.id, quantity: "750.500" })];
    const rows = buildPivotRows(DISTRIBUTION, lines);
    const cellA = rows[0].cells.find((c) => c.siteId === SITE_A.id)!;
    // TKL-F8: sunucu "750.500" EKRAN METNİ olarak Türkçe gösterilir.
    expect(cellA.quantity).toBe("750,5");
    expect(cellA.lineTotal).toBe("1665000.00");
  });

  it("0 miktarlı mevcut satır da (silinmiş değil) '0' olarak doldurulur", () => {
    const lines = [line({ site_id: SITE_A.id, quantity: "0" })];
    const rows = buildPivotRows(DISTRIBUTION, lines);
    const cellA = rows[0].cells.find((c) => c.siteId === SITE_A.id)!;
    expect(cellA.quantity).toBe("0");
  });

  // F-P10 T2 · rozet göçü: satır kaynağı SUNUCU damgasıdır (taşeron
  // `th-lines.ts` deseniyle aynı) — oturum-içi türetme yoktur.
  it("hücre kaynağı sunucunun quantity_source damgasını tasir", () => {
    const lines = [line({ site_id: SITE_A.id, quantity_source: "diary" })];
    const rows = buildPivotRows(DISTRIBUTION, lines);
    const cellA = rows[0].cells.find((c) => c.siteId === SITE_A.id)!;
    const cellB = rows[0].cells.find((c) => c.siteId === SITE_B.id)!;
    expect(cellA.quantitySource).toBe("diary");
    // Hiç kaydedilmemiş hücre "elle giriş"tir (taşeron varsayılanıyla aynı).
    expect(cellB.quantitySource).toBe("manual");
  });

  it("contract_item_id null olan (kopmuş) satır pivot'a yerleştirilmez", () => {
    const lines = [line({ contract_item_id: null, site_id: SITE_A.id })];
    const rows = buildPivotRows(DISTRIBUTION, lines);
    const cellA = rows[0].cells.find((c) => c.siteId === SITE_A.id)!;
    // kopmuş satır eşleşmediği için hücre varsayılan "0"a düşer, çökme yok
    expect(cellA.quantity).toBe("0");
  });
});

describe("buildLinesSaveBody — PUT …/lines DEĞİŞTİRME semantiği", () => {
  it("TÜM düzenlenebilir hücreleri içerir (kapalı hücreler HARİÇ)", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    const body = buildLinesSaveBody(rows);
    // item-1: 2 editable hücre, item-2: 1 editable hücre → toplam 3
    expect(body).toHaveLength(3);
    expect(body.some((l) => l.contract_item_id === ITEM_2.id && l.site_id === SITE_B.id)).toBe(
      false,
    );
  });

  it("0 miktarlı hücre gövdeden DÜŞÜRÜLMEZ (0 meşrudur)", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    const body = buildLinesSaveBody(rows);
    const zeroLine = body.find((l) => l.contract_item_id === ITEM_1.id && l.site_id === SITE_A.id);
    expect(zeroLine).toBeDefined();
    expect(zeroLine?.quantity).toBe("0");
  });

  it("aynı (kalem, şantiye) çifti gövdede yalnız BİR kez geçer (Map tekilleştirmesi)", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    // Kasıtlı olarak aynı hücreyi iki kez içeren bozuk bir satır simüle edilir.
    const corrupted = [
      rows[0],
      { ...rows[0], cells: [...rows[0].cells] }, // aynı item-1 tekrar
    ];
    const body = buildLinesSaveBody(corrupted);
    const keys = body.map((l) => `${l.contract_item_id}::${l.site_id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(body.filter((l) => l.contract_item_id === ITEM_1.id && l.site_id === SITE_A.id)).toHaveLength(
      1,
    );
  });

  it("boş pivot → boş gövde (hakedişin tüm satırlarını temizlemek meşru bir istektir)", () => {
    const body = buildLinesSaveBody([]);
    expect(body).toEqual([]);
  });
});

describe("rowQuantityTotal", () => {
  it("düzenlenebilir hücrelerin miktarını kuruş hassasiyetli toplar", () => {
    const lines = [line({ site_id: SITE_A.id, quantity: "900.500" }), line({ site_id: SITE_B.id, quantity: "420.250" })];
    const rows = buildPivotRows(DISTRIBUTION, lines);
    expect(rowQuantityTotal(rows[0])).toBe("1320.75");
  });

  it("hücre metni TÜRKÇE okunur: '1.234,5' + '3,5' = 1238 (nokta-ondalık sanılmaz)", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    const typed = {
      ...rows[0],
      cells: rows[0].cells.map((c) => ({ ...c, quantity: c.siteId === SITE_A.id ? "1.234,5" : "3,5" })),
    };
    expect(rowQuantityTotal(typed)).toBe("1238.0");
  });

  it("okunamayan ('0.500') ve boş hücre 0 sayılır", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    const typed = {
      ...rows[0],
      cells: rows[0].cells.map((c) => ({ ...c, quantity: c.siteId === SITE_A.id ? "0.500" : "" })),
    };
    expect(rowQuantityTotal(typed)).toBe("0");
  });
});

describe("rowAmountTotal", () => {
  it("hiç kaydedilmiş satır yoksa null döner (henüz hesaplanmadı)", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    expect(rowAmountTotal(rows[0])).toBeNull();
  });

  it("kaydedilmiş satırların line_total'larını toplar (yeni çarpma yapmaz)", () => {
    const lines = [
      line({ site_id: SITE_A.id, line_total: "1665000.00" }),
      line({ site_id: SITE_B.id, line_total: "777000.00" }),
    ];
    const rows = buildPivotRows(DISTRIBUTION, lines);
    expect(rowAmountTotal(rows[0])).toBe("2442000.00");
  });
});

// TKL-F8 (T43): İŞVEREN formu artık bu süzgeci KULLANMAZ; yalnız TAŞERON formu tüketicidir
// (TKL-F7 birleşince fonksiyon ve bu blok kalkar). Eski beklenti `"12,5" → "125"` KALDIRILDI: virgül
// Türkçede ondalıktır, silmek sessiz 10× hataydı ("3,5" → 35 kaydı); işveren davranışı artık
// `employer-quantity.test.ts` ve `ProgressPaymentForm.test.tsx` (T30 bloğu) ile korunur.
describe("sanitizeQuantityInput — yalnız taşeron tüketicisi (kontrolcü bulgusu §2)", () => {
  it("rakam/nokta dışı karakterleri süzer", () => {
    expect(sanitizeQuantityInput("12a3")).toBe("123");
    expect(sanitizeQuantityInput("-5")).toBe("5");
    expect(sanitizeQuantityInput("abc")).toBe("");
  });

  it("birden fazla nokta varsa yalnız ilkini korur", () => {
    expect(sanitizeQuantityInput("1.2.3")).toBe("1.23");
  });

  it("geçerli ondalık girişi olduğu gibi bırakır (ara hal '12.' dahil)", () => {
    expect(sanitizeQuantityInput("12.")).toBe("12.");
    expect(sanitizeQuantityInput("900.500")).toBe("900.500");
    expect(sanitizeQuantityInput("")).toBe("");
  });
});

describe("findOrphanedAllocationCells — final inceleme #2 (tahsisi kaldırılmış kayıtlı hücre)", () => {
  it("tahsis YOKSA ve hiç kayıtlı satır da yoksa (normal kapalı hücre) uyarı üretmez", () => {
    const rows = buildPivotRows(DISTRIBUTION);
    // item-2 × B-Blok zaten kapalı VE hiç kaydedilmemiş (mevcut fikstür).
    expect(findOrphanedAllocationCells(rows, DISTRIBUTION.sites)).toEqual([]);
  });

  it("kayıtlı bir satırın tahsisi SONRADAN kaldırılmışsa (allocations'ta yok) hücreyi tespit eder", () => {
    // item-2 önceden B-Blok'a da dağıtılmış gibi bir satır kaydedilmiş, ama
    // güncel `allocations` yalnız A-Blok'u listeliyor (DISTRIBUTION fikstürü)
    // — B-Blok tahsisi sonradan kaldırılmış senaryosu.
    const lines = [
      line({
        contract_item_id: ITEM_2.id,
        site_id: SITE_B.id,
        quantity: "150.000",
        line_total: "315000.00",
      }),
    ];
    const rows = buildPivotRows(DISTRIBUTION, lines);
    const orphaned = findOrphanedAllocationCells(rows, DISTRIBUTION.sites);
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]).toMatchObject({
      siteId: SITE_B.id,
      siteName: SITE_B.name,
      quantity: "150",
    });
    expect(orphaned[0].item.id).toBe(ITEM_2.id);
  });

  it("hücre düzenlenebilirse (tahsis hâlâ varsa) orphan sayılmaz — editable hücreler hiç dahil edilmez", () => {
    const lines = [line({ site_id: SITE_A.id, quantity: "900.000" })];
    const rows = buildPivotRows(DISTRIBUTION, lines);
    // item-1 × A-Blok hâlâ tahsisli (editable:true) — kaydedilmiş olsa da orphan DEĞİL.
    expect(findOrphanedAllocationCells(rows, DISTRIBUTION.sites)).toEqual([]);
  });
});

describe("normalizePivotRowsForSave — kaydetmeden önce Türkçe okuma (TKL-F8)", () => {
  function withQuantities(quantities: Record<string, string>) {
    const rows = buildPivotRows(DISTRIBUTION);
    return rows.map((row) => ({
      ...row,
      cells: row.cells.map((c) => {
        const q = quantities[`${row.item.id}::${c.siteId}`];
        return c.editable && q !== undefined ? { ...c, quantity: q } : c;
      }),
    }));
  }

  const key = (itemId: string, siteId: string) => `${itemId}::${siteId}`;

  it("boş miktarı '0'a çevirir (reddetmez)", () => {
    const { rows, errors } = normalizePivotRowsForSave(
      withQuantities({ [key(ITEM_1.id, SITE_A.id)]: "" }),
    );
    expect(rows[0].cells.find((c) => c.siteId === SITE_A.id)!.quantity).toBe("0");
    expect(errors).toEqual({});
  });

  it("Türkçe metni nokta-ondalık METNE çevirir: '3,5' → '3.5', '1.234,5' → '1234.5', '0,000' → '0'", () => {
    const { rows, errors } = normalizePivotRowsForSave(
      withQuantities({
        [key(ITEM_1.id, SITE_A.id)]: "3,5",
        [key(ITEM_1.id, SITE_B.id)]: "1.234,5",
        [key(ITEM_2.id, SITE_A.id)]: "0,000",
      }),
    );
    expect(rows[0].cells.find((c) => c.siteId === SITE_A.id)!.quantity).toBe("3.5");
    expect(rows[0].cells.find((c) => c.siteId === SITE_B.id)!.quantity).toBe("1234.5");
    expect(rows[1].cells.find((c) => c.siteId === SITE_A.id)!.quantity).toBe("0");
    expect(errors).toEqual({});
  });

  it("belirsiz '0.500' ve fazla ondalık hücre anahtarıyla errors'a düşer", () => {
    const { errors } = normalizePivotRowsForSave(
      withQuantities({
        [key(ITEM_1.id, SITE_A.id)]: "0.500",
        [key(ITEM_1.id, SITE_B.id)]: "1,2345",
      }),
    );
    expect(errors).toEqual({
      [key(ITEM_1.id, SITE_A.id)]: "Ondalık için virgül kullanın (ör. 28,50)",
      [key(ITEM_1.id, SITE_B.id)]: "En fazla 3 ondalık",
    });
  });

  it("kapalı hücreye dokunmaz", () => {
    const { rows, errors } = normalizePivotRowsForSave(buildPivotRows(DISTRIBUTION));
    const cellBLocked = rows[1].cells.find((c) => c.siteId === SITE_B.id)!;
    expect(cellBLocked.editable).toBe(false);
    expect(cellBLocked.quantity).toBe(""); // kapalı hücre okunmaz, "" kalır (zaten gövdeye girmiyor)
    expect(errors).toEqual({});
  });

  it("normalize edilmiş satırlar buildLinesSaveBody'e verildiğinde boş hücre '0' olarak gövdeye girer", () => {
    const blank = buildPivotRows(DISTRIBUTION).map((row) => ({
      ...row,
      cells: row.cells.map((c) => (c.editable ? { ...c, quantity: "" } : c)),
    }));
    const body = buildLinesSaveBody(normalizePivotRowsForSave(blank).rows);
    expect(body.every((l) => l.quantity === "0")).toBe(true);
    expect(body).toHaveLength(3);
  });
});
