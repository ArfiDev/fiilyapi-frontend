import { describe, expect, it } from "vitest";

import {
  buildAllocationBody,
  columnTotals,
  draftFromView,
  invalidCellCount,
  isDraftDirty,
  rowKey,
  rowRemaining,
  setCell,
  setRule,
  hiddenAllocated,
  stripValues,
  toggleCode,
} from "./allocation-model";
import {
  GROUP_KAB,
  LEAF_BETON,
  LEAF_KALIP,
  P_EMRE,
  P_MEHMET,
  P_RECEP,
  SUB_KAYA,
  dayView,
} from "./diary-fixtures";

const MEHMET = rowKey("personnel", P_MEHMET);
const EMRE = rowKey("personnel", P_EMRE);
const RECEP = rowKey("personnel", P_RECEP);
const KAYA = rowKey("subcontractor", SUB_KAYA);

describe("draftFromView — sunucu dağılımı → düzenlenebilir taslak", () => {
  it("kodlar kuralıyla, hücreler TR metniyle, gerekçe boş dize", () => {
    const draft = draftFromView(dayView());
    expect(draft.codes).toEqual([
      { node_id: GROUP_KAB, rule: "prorata_by_daily_qty" },
      { node_id: LEAF_KALIP, rule: "direct" },
    ]);
    expect(draft.cells[MEHMET]).toEqual({ [LEAF_KALIP]: "9" });
    expect(draft.cells[EMRE]).toEqual({ [GROUP_KAB]: "9" });
    expect(draft.reason).toBe("");
  });
});

describe("buildAllocationBody — PUT TAM DEĞİŞTİRME gövdesi", () => {
  it("dokunulmamış satırların hücreleri DE gider (kısmi küme = veri kaybı)", () => {
    const view = dayView();
    const edited = setCell(draftFromView(view), RECEP, LEAF_KALIP, "8");
    const body = buildAllocationBody(edited, view.rows);
    expect(body.cells).toEqual([
      { row: { kind: "personnel", ref_id: P_MEHMET }, node_id: LEAF_KALIP, hours: "9" },
      { row: { kind: "personnel", ref_id: P_EMRE }, node_id: GROUP_KAB, hours: "9" },
      { row: { kind: "personnel", ref_id: P_RECEP }, node_id: LEAF_KALIP, hours: "8" },
    ]);
    expect(body.codes).toEqual(edited.codes);
  });

  it("boş/0 hücre, listede olmayan kodun hücresi ve artık olmayan satır GİTMEZ", () => {
    const view = dayView();
    let draft = setCell(draftFromView(view), EMRE, LEAF_KALIP, "0");
    draft = setCell(draft, "personnel:yok", LEAF_KALIP, "3");
    draft = setCell(draft, RECEP, "l:kaldirilmis:none", "2");
    const body = buildAllocationBody(draft, view.rows);
    expect(body.cells.map((c) => c.row.ref_id)).toEqual([P_MEHMET, P_EMRE]);
  });

  it("gerekçe kırpılır; boşsa null", () => {
    const view = dayView();
    const draft = { ...draftFromView(view), reason: "  yardımcılar temizlikte " };
    expect(buildAllocationBody(draft, view.rows).unallocated_reason).toBe("yardımcılar temizlikte");
    expect(buildAllocationBody(draftFromView(view), view.rows).unallocated_reason).toBeNull();
  });
});

describe("kod listesi", () => {
  it("toggleCode ekler (varsayılan kuralla) ve çıkarır; hücreler korunur, gövdeye girmez", () => {
    const view = dayView();
    const added = toggleCode(draftFromView(view), LEAF_BETON, "direct");
    expect(added.codes.map((c) => c.node_id)).toEqual([GROUP_KAB, LEAF_KALIP, LEAF_BETON]);
    const removed = toggleCode(added, LEAF_KALIP, "direct");
    expect(removed.codes.map((c) => c.node_id)).toEqual([GROUP_KAB, LEAF_BETON]);
    expect(removed.cells[MEHMET]).toEqual({ [LEAF_KALIP]: "9" });
    expect(buildAllocationBody(removed, view.rows).cells.map((c) => c.node_id)).toEqual([GROUP_KAB]);
  });

  it("setRule yalnız hedef kodun kuralını değiştirir (girdi değişmez)", () => {
    const draft = draftFromView(dayView());
    const next = setRule(draft, GROUP_KAB, "direct");
    expect(next.codes[0]).toEqual({ node_id: GROUP_KAB, rule: "direct" });
    expect(draft.codes[0].rule).toBe("prorata_by_daily_qty");
  });
});

describe("önizleme toplamları (yalnız düzenlenen hücreler; motor değerleri backend'den)", () => {
  it("rowRemaining = puantaj saati − satırın hücreleri", () => {
    const view = dayView();
    const draft = draftFromView(view);
    expect(rowRemaining(draft, view.rows[0])).toBe(200); // 11 − 9
    expect(rowRemaining(setCell(draft, MEHMET, GROUP_KAB, "3"), view.rows[0])).toBe(-100);
  });

  it("columnTotals kod başına toplar", () => {
    const view = dayView();
    const draft = setCell(draftFromView(view), RECEP, LEAF_KALIP, "8");
    expect(columnTotals(draft, view.rows)).toEqual({ [GROUP_KAB]: 900, [LEAF_KALIP]: 1700 });
  });

  it("stripValues: temiz taslakta BACKEND toplamları, kirlide önizleme; taşeron = firma satırları", () => {
    const view = dayView();
    const clean = draftFromView(view);
    expect(stripValues(view, clean, false)).toEqual({
      source: 8400,
      allocated: 1800,
      unallocated: 6600,
      subcontractor: 5600,
    });
    const dirty = setCell(clean, KAYA, LEAF_KALIP, "56");
    expect(stripValues(view, dirty, true)).toEqual({
      source: 8400,
      allocated: 7400,
      unallocated: 1000,
      subcontractor: 5600,
    });
  });
});

describe("stripValues — kısıtlı kullanıcı (backend allocated_hours TÜM disiplinleri içerir, tablo yalnız görünen hücreleri)", () => {
  // Kaynak 84 a-s; görünen hücreler 9 + 9 = 18; başka disiplin 12 → sunucu allocated 30, unallocated 54.
  const restricted = () =>
    dayView({ totals: { source_hours: "84.00", allocated_hours: "30.00", unallocated_hours: "54.00" } });

  it("hiddenAllocated = allocated_hours − Σ görünen sunucu hücreleri", () => {
    expect(hiddenAllocated(restricted())).toBe(1200);
  });

  it("atamasız (tutarlı veri): hidden 0 ve stripValues davranışı DEĞİŞMEZ", () => {
    const view = dayView();
    expect(hiddenAllocated(view)).toBe(0);
    const clean = draftFromView(view);
    expect(stripValues(view, clean, false)).toEqual({ source: 8400, allocated: 1800, unallocated: 6600, subcontractor: 5600 });
    expect(stripValues(view, clean, true)).toEqual({ source: 8400, allocated: 1800, unallocated: 6600, subcontractor: 5600 });
  });

  it("atamasız + puantajdan düşmüş satırın hücresi (view.rows'ta yok): hidden 0, değerler eskisiyle aynı", () => {
    const orphan = { kind: "personnel" as const, ref_id: "dddddddd-0000-4000-8000-0000000000ff", node_id: LEAF_KALIP, hours: "3.00" };
    const base = dayView();
    const view = dayView({
      cells: [...base.cells, orphan],
      totals: { source_hours: "84.00", allocated_hours: "21.00", unallocated_hours: "63.00" },
    });
    expect(hiddenAllocated(view)).toBe(0);
    const clean = draftFromView(view);
    // Temiz: sunucu değerleri; kirli: yalnız satırı olan hücreler (eski davranış, yetim hücre sayılmaz).
    expect(stripValues(view, clean, false)).toMatchObject({ allocated: 2100, unallocated: 6300 });
    expect(stripValues(view, clean, true)).toMatchObject({ allocated: 1800, unallocated: 6600 });
  });

  it("veri tutarsızsa (allocated < görünen) hidden negatif OLMAZ", () => {
    const view = dayView({ totals: { source_hours: "84.00", allocated_hours: "10.00", unallocated_hours: "74.00" } });
    expect(hiddenAllocated(view)).toBe(0);
  });

  it("temiz taslak sunucu değerleri; dokunulup AYNI değere dönen kirli taslakta Dağıtılmamış AYNI", () => {
    const view = restricted();
    const clean = draftFromView(view);
    const cleanStrip = stripValues(view, clean, false);
    expect(cleanStrip).toMatchObject({ allocated: 3000, unallocated: 5400 });
    const touched = setCell(setCell(clean, MEHMET, LEAF_KALIP, "10"), MEHMET, LEAF_KALIP, "9");
    expect(stripValues(view, touched, true)).toEqual(cleanStrip);
  });

  it("bir hücre +1 a-s değişince Dağıtılmamış tam 1 a-s azalır (Dağıtılan 1 artar)", () => {
    const view = restricted();
    const clean = stripValues(view, draftFromView(view), false);
    const plusOne = stripValues(view, setCell(draftFromView(view), MEHMET, LEAF_KALIP, "10"), true);
    expect(plusOne.unallocated).toBe(clean.unallocated - 100);
    expect(plusOne.allocated).toBe(clean.allocated + 100);
  });
});

describe("kirlilik ve geçersizlik", () => {
  it("isDraftDirty gövde düzeyinde karşılaştırır ('9' ile '9,0' aynı)", () => {
    const view = dayView();
    const base = draftFromView(view);
    expect(isDraftDirty(setCell(base, MEHMET, LEAF_KALIP, "9,0"), base, view.rows)).toBe(false);
    expect(isDraftDirty(setCell(base, MEHMET, LEAF_KALIP, "8"), base, view.rows)).toBe(true);
    expect(isDraftDirty({ ...base, reason: "x" }, base, view.rows)).toBe(true);
  });

  it("invalidCellCount geçersiz metinleri sayar", () => {
    const draft = setCell(draftFromView(dayView()), RECEP, LEAF_KALIP, "abc");
    expect(invalidCellCount(draft)).toBe(1);
  });
});
