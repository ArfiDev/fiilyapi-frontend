import { describe, it, expect } from "vitest";

import type { SiteDiaryEntryDetail, SiteDiaryLineRead } from "@/lib/api/hooks/useSiteDiary";

import {
  buildDiaryLineTree,
  buildSectionPickerOptions,
  diaryQuantityDecimal,
  type DiaryTreeBoqItem,
  type DiaryTreeLine,
  type DiaryTreeSection,
} from "./diary-lines-tree";
import { addDiaryLines, diaryFormFromEntry, emptyDiaryForm, removeDiaryLine, type DiaryFormState } from "./form-state";

// PLN-F2.2 · Yapılan Miktarlar ağacı (spec §3.14 G1–G8, Ek Formlar M1–M4).

function line(overrides: Partial<SiteDiaryLineRead> = {}): SiteDiaryLineRead {
  return {
    id: "l-1",
    boq_item_id: "duv",
    section_id: null,
    // DET-1.1 sözleşmesi: satır bölüm ADINI da taşır (zorunlu, `section_id` null ise null).
    section_name: null,
    code: "DUV.01.01",
    description: "Tuğla duvar",
    unit: "m²",
    unit_price: "420.00",
    quantity: "0.000",
    cumulative_quantity: "200.000",
    leaf_cumulative_quantity: "0.000",
    planned_quantity: "500.000",
    remaining_quantity: "500.000",
    overrun_reason: null,
    line_amount: "0.00",
    ...overrides,
  };
}

const SECTIONS: DiaryTreeSection[] = [
  { id: "k610", name: "Kat 6–10", code: "K610", sort_order: 3 },
  { id: "k15", name: "Kat 1–5", code: "K15", sort_order: 2 },
  { id: "tml", name: "Temel & Bodrum", code: "TML", sort_order: 1 },
];

const BOQ: DiaryTreeBoqItem[] = [
  { id: "kab", code: "KAB.01.01", description: "Kalıp", unit: "m²", unit_price: "185.00", unallocated_quantity: "0" },
  { id: "duv", code: "DUV.01.01", description: "Tuğla duvar", unit: "m²", unit_price: "420.00", unallocated_quantity: "500" },
];

function formFor(lines: SiteDiaryLineRead[], patch: Partial<DiaryFormState> = {}): DiaryFormState {
  const seeded = diaryFormFromEntry({ ...entryShell(), lines });
  return { ...seeded, ...patch };
}

/** Satırlar DIŞINDAKİ tam detay zarfı — `lines` her testte ayrıca verilir. */
function entryShell(): Omit<SiteDiaryEntryDetail, "lines"> {
  return {
    id: "d-1",
    site_id: "s-1",
    project_id: "p-1",
    entry_date: "2026-09-24",
    section_id: null,
    weather: null,
    work_done: null,
    chief_note: null,
    safety_meeting_held: false,
    ppe_checked: false,
    has_incident: false,
    incident_note: null,
    worker_counts: [],
    status: "draft",
    submitted_at: null,
    created_by: "u-2",
    created_at: "2026-09-24T08:00:00Z",
    updated_at: "2026-09-24T09:00:00Z",
    lines_total: "0.00",
    worker_total: 0,
    // DET-1.B salt-okunur detay alanları — başlıksız taslak: gönderen yok, kilit yok.
    site_name: "A-Blok Şantiyesi",
    project_name: "Güneşkent",
    section_name: null,
    created_by_name: "Mühendis",
    submitted_by: null,
    submitted_by_name: null,
    locked: false,
    lock_report_date: null,
    prev_id: null,
    next_id: null,
    prev_entry_date: null,
    next_entry_date: null,
  } satisfies Omit<SiteDiaryEntryDetail, "lines">;
}

const TUGLA = [
  line({ id: "u", section_id: null, quantity: "20.000", leaf_cumulative_quantity: "20.000", planned_quantity: "500.000", remaining_quantity: "480.000", line_amount: "8400.00" }),
  line({ id: "s", section_id: "k610", quantity: "52.000", leaf_cumulative_quantity: "200.000", planned_quantity: "4400.000", remaining_quantity: "4200.000", line_amount: "21840.00" }),
];

describe("buildDiaryLineTree · G1 ağaç + G2 başlık toplamı", () => {
  it("kalem BOQ sırasıyla gelir; Bölümsüz ÖNCE, bölümler sort_order'la", () => {
    const lines = [TUGLA[1], TUGLA[0], line({ id: "t", section_id: "tml", quantity: "1", leaf_cumulative_quantity: "1", planned_quantity: "10" })];
    const tree = buildDiaryLineTree({ lines, form: formFor(lines), boqItems: BOQ, sections: SECTIONS });

    expect(tree.map((group) => group.code)).toEqual(["KAB.01.01", "DUV.01.01"]);
    expect(tree[1].leaves.map((leaf) => leaf.label)).toEqual(["Bölümsüz", "Temel & Bodrum", "Kat 6–10"]);
  });

  it("M3: başlık = bölüm satırlarının toplamı (Bugün 72 · Kümülatif 220 · Planlı 4.900 · Kalan 4.680 · ₺ 30.240)", () => {
    const tree = buildDiaryLineTree({ lines: TUGLA, form: formFor(TUGLA), boqItems: BOQ, sections: SECTIONS });

    expect(tree[1].totals).toEqual({
      today: "72.000",
      cumulative: "220.000",
      planned: "4900.000",
      remaining: "4680.000",
      amount: "30240.00",
    });
  });

  it("G4: satırı olmayan (tam tahsisli) kalem başlık olarak basılır, yaprağı yok, Bölümsüz'ü yok", () => {
    const tree = buildDiaryLineTree({ lines: TUGLA, form: formFor(TUGLA), boqItems: BOQ, sections: SECTIONS });

    expect(tree[0]).toMatchObject({ code: "KAB.01.01", leaves: [], hasUnsectioned: false });
  });

  it("BOQ okunamazsa ağaç satırlardan kurulur (satır kaybolmaz)", () => {
    const tree = buildDiaryLineTree({ lines: TUGLA, form: formFor(TUGLA), boqItems: [], sections: SECTIONS });

    expect(tree).toHaveLength(1);
    expect(tree[0].leaves).toHaveLength(2);
  });

  it("öksüz satır (boq_item_id null) kendi grubunda, kaldırılamaz", () => {
    const lines = [line({ id: "o", boq_item_id: null })];
    const tree = buildDiaryLineTree({ lines, form: emptyDiaryForm("2026-09-24"), boqItems: [], sections: SECTIONS });

    expect(tree[0].isOrphan).toBe(true);
    expect(tree[0].leaves[0].isRemovable).toBe(false);
  });
});

describe("buildDiaryLineTree · G8 anında önizleme + M4 aşım", () => {
  it("yazılan miktar kümülatif/kalanı ANINDA günceller (kayıtlı kümülatif − kayıtlı bugün + yazılan)", () => {
    const form = formFor(TUGLA, { quantities: { "duv|": "20", "duv|k610": "60" } });
    const leaf = buildDiaryLineTree({ lines: TUGLA, form, boqItems: BOQ, sections: SECTIONS })[1].leaves[1];

    expect(leaf.cumulative).toBe("208.000");
    expect(leaf.remaining).toBe("4192.000");
  });

  it("geçersiz hücrede önizleme kayıttaki değerde kalır", () => {
    const form = formFor(TUGLA, { quantities: { "duv|": "20", "duv|k610": "abc" } });
    const leaf = buildDiaryLineTree({ lines: TUGLA, form, boqItems: BOQ, sections: SECTIONS })[1].leaves[1];

    expect(leaf.cumulative).toBe("200.000");
    expect(leaf.todayValue).toBeNull();
  });

  it("kümülatif planlıyı aşarsa aşım + fazla miktar (1.212 / 1.200 → +12)", () => {
    const lines = [line({ section_id: "k15", quantity: "22", leaf_cumulative_quantity: "1212", planned_quantity: "1200" })];
    const leaf = buildDiaryLineTree({ lines, form: formFor(lines), boqItems: [], sections: SECTIONS })[0].leaves[0];

    expect(leaf.isOverrun).toBe(true);
    expect(leaf.overrunExcess).toBe("12");
    expect(leaf.remaining).toBe("-12");
  });

  it("planlıya tam eşit kümülatif aşım DEĞİLDİR", () => {
    const lines = [line({ section_id: "k15", quantity: "0", leaf_cumulative_quantity: "1200", planned_quantity: "1200" })];
    const leaf = buildDiaryLineTree({ lines, form: formFor(lines), boqItems: [], sections: SECTIONS })[0].leaves[0];

    expect(leaf.isOverrun).toBe(false);
  });

  it("G5: tahsissiz (planlı 0) EKLENMİŞ bölüme girilen her miktar aşımdır", () => {
    const form = addDiaryLines(formFor(TUGLA), [{ boqItemId: "duv", sectionId: "tml", plannedQuantity: "0" }]);
    const withQty = { ...form, quantities: { ...form.quantities, "duv|tml": "12" } };
    const leaf = buildDiaryLineTree({ lines: TUGLA, form: withQty, boqItems: BOQ, sections: SECTIONS })[1].leaves.find(
      (row) => row.sectionId === "tml",
    );

    expect(leaf).toMatchObject({ isAdded: true, isRemovable: true, isOverrun: true, overrunExcess: "12", amount: null });
  });
});

describe("buildDiaryLineTree · G3 kaldırma kuralları", () => {
  it("Bölümsüz iskelet kaldırılamaz; bölümlü satır kaldırılabilir", () => {
    const [group] = buildDiaryLineTree({ lines: TUGLA, form: formFor(TUGLA), boqItems: [], sections: SECTIONS });

    expect(group.leaves.map((leaf) => [leaf.label, leaf.isRemovable])).toEqual([
      ["Bölümsüz", false],
      ["Kat 6–10", true],
    ]);
  });

  it("kaldırılan satır ağaçta YOKTUR", () => {
    const form = removeDiaryLine(formFor(TUGLA), "duv|k610");
    const [group] = buildDiaryLineTree({ lines: TUGLA, form, boqItems: [], sections: SECTIONS });

    expect(group.leaves.map((leaf) => leaf.label)).toEqual(["Bölümsüz"]);
  });

  it("G4: menüden eklenen (kaydedilmemiş) Bölümsüz kaldırılabilir", () => {
    const form = addDiaryLines(emptyDiaryForm("2026-09-24"), [{ boqItemId: "kab", sectionId: null, plannedQuantity: "0" }]);
    const [group] = buildDiaryLineTree({ lines: [], form, boqItems: BOQ, sections: SECTIONS });

    expect(group.leaves[0]).toMatchObject({ label: "Bölümsüz", isAdded: true, isRemovable: true });
  });
});

describe("buildSectionPickerOptions · M1", () => {
  it("tahsisli üstte, tahsissiz 'planlı 0' altta, eklenmiş pasif; Bölümsüz iskelet varken menüde Bölümsüz yok", () => {
    const [group] = buildDiaryLineTree({ lines: TUGLA, form: formFor(TUGLA), boqItems: [], sections: SECTIONS });
    const options = buildSectionPickerOptions(group, SECTIONS, [
      { section_id: "k610", quantity: "4400" },
      { section_id: "k15", quantity: "4600" },
    ]);

    expect(options.unsectioned).toBeNull();
    expect(options.allocated.map((option) => [option.label, option.planned, option.isPresent])).toEqual([
      ["Kat 1–5", "4600", false],
      ["Kat 6–10", "4400", true],
    ]);
    expect(options.unallocated.map((option) => [option.label, option.planned])).toEqual([["Temel & Bodrum", "0"]]);
  });

  it("G4: iskeletsiz kalemde 'Tahsis dışı · Bölümsüz' tahsis dışı kalanla açılır", () => {
    const tree = buildDiaryLineTree({ lines: [], form: emptyDiaryForm("2026-09-24"), boqItems: BOQ, sections: SECTIONS });
    const options = buildSectionPickerOptions(tree[0], SECTIONS, []);

    expect(options.unsectioned).toMatchObject({ label: "Bölümsüz", planned: "0", sectionId: null });
  });

  it("arama ad/kod içinde TR küçük harfle süzer", () => {
    const tree = buildDiaryLineTree({ lines: TUGLA, form: formFor(TUGLA), boqItems: [], sections: SECTIONS });
    const options = buildSectionPickerOptions(tree[0], SECTIONS, [], "tml");

    expect(options.unallocated.map((option) => option.label)).toEqual(["Temel & Bodrum"]);
    expect(options.allocated).toEqual([]);
  });
});

describe("diaryQuantityDecimal", () => {
  it("boş 0, TR virgülü nokta, negatif/anlamsız null", () => {
    expect(diaryQuantityDecimal("")).toBe("0");
    expect(diaryQuantityDecimal("2,5")).toBe("2.5");
    expect(diaryQuantityDecimal("-1")).toBeNull();
    expect(diaryQuantityDecimal("x")).toBeNull();
  });
});

// GKS-F1.2a · önizleme: kimliksiz (kaydedilmemiş) iskelet satırı AYNI kurucudan geçer.
function withoutId(source: SiteDiaryLineRead): DiaryTreeLine {
  const copy: Partial<SiteDiaryLineRead> = { ...source };
  delete copy.id;
  return copy as DiaryTreeLine;
}

function previewLine(overrides: Partial<SiteDiaryLineRead> = {}): DiaryTreeLine {
  return withoutId(line(overrides));
}

describe("buildDiaryLineTree · GKS-F1.2a kimliksiz önizleme satırı", () => {
  it("kimliksiz satırlarla ağaç kurulur ve anahtarlar kayıtlı satırlarla AYNIDIR", () => {
    const saved = buildDiaryLineTree({ lines: TUGLA, form: formFor(TUGLA), boqItems: BOQ, sections: SECTIONS });
    const preview = buildDiaryLineTree({
      lines: TUGLA.map(withoutId),
      form: formFor(TUGLA),
      boqItems: BOQ,
      sections: SECTIONS,
    });

    expect(preview.flatMap((group) => group.leaves.map((leaf) => leaf.key))).toEqual(
      saved.flatMap((group) => group.leaves.map((leaf) => leaf.key)),
    );
    expect(preview.find((group) => group.boqItemId === "duv")?.leaves.map((leaf) => leaf.key)).toEqual(["duv|", "duv|k610"]);
  });

  it("kimliksiz ÖKSÜZ satırlar sıra numarasıyla ayrı anahtar alır (çakışmaz)", () => {
    const lines = [previewLine({ boq_item_id: null }), previewLine({ boq_item_id: null, code: "X" })];
    const tree = buildDiaryLineTree({ lines, form: emptyDiaryForm("2026-09-24"), boqItems: [], sections: SECTIONS });

    expect(tree.map((group) => group.key)).toEqual(["orphan:0", "orphan:1"]);
  });

  it("kimlikli öksüz satırın anahtarı bugünkü gibi `orphan:<id>`", () => {
    const lines = [line({ id: "o", boq_item_id: null })];
    const tree = buildDiaryLineTree({ lines, form: emptyDiaryForm("2026-09-24"), boqItems: [], sections: SECTIONS });

    expect(tree[0].key).toBe("orphan:o");
  });

  it("isPreview: iskelet bölüm satırı KALDIRILAMAZ; kayıtlı akışta kaldırılabilir (değişmez)", () => {
    const lines = TUGLA.map(withoutId);
    const [preview] = buildDiaryLineTree({ lines, form: formFor(TUGLA), boqItems: [], sections: SECTIONS, isPreview: true });
    const [saved] = buildDiaryLineTree({ lines: TUGLA, form: formFor(TUGLA), boqItems: [], sections: SECTIONS });

    expect(preview.leaves.map((leaf) => [leaf.label, leaf.isRemovable])).toEqual([
      ["Bölümsüz", false],
      ["Kat 6–10", false],
    ]);
    expect(saved.leaves.map((leaf) => [leaf.label, leaf.isRemovable])).toEqual([
      ["Bölümsüz", false],
      ["Kat 6–10", true],
    ]);
  });

  it("isPreview: yalnız `addedLines` (+ Bölüm) kaldırılabilir", () => {
    const lines = TUGLA.map(withoutId);
    const form = addDiaryLines(formFor(TUGLA), [{ boqItemId: "duv", sectionId: "k15", plannedQuantity: "0" }]);
    const [group] = buildDiaryLineTree({ lines, form, boqItems: [], sections: SECTIONS, isPreview: true });

    expect(group.leaves.map((leaf) => [leaf.label, leaf.isAdded, leaf.isRemovable])).toEqual([
      ["Bölümsüz", false, false],
      ["Kat 1–5", true, true],
      ["Kat 6–10", false, false],
    ]);
  });
});
