import { describe, it, expect } from "vitest";

import type {
  SiteDiaryEntryDetail,
  SiteDiaryLineRead,
  SiteDiaryWorkerCountRead,
} from "@/lib/api/hooks/useSiteDiary";

import type { DiaryLeafRow } from "./diary-lines-tree";
import {
  buildDiaryCreateBody,
  buildDiaryLinesBody,
  buildDiaryUpdateBody,
  diaryFormFromEntry,
  emptyDiaryForm,
  invalidQuantityIds,
  invalidWorkerCountIds,
  isDiaryFormDirty,
  parseDiaryQuantity,
  addDiaryLines,
  removeDiaryLine,
  addDiaryFirm,
  removeDiaryWorker,
  diaryWeatherError,
  type DiaryFormState,
} from "./form-state";

// F-SD T6 · "Kayıt Gir" formunun saf durumu (T2). Kapsam sınırı (pending
// sızıntısı yok) ve DEĞİŞTİRME semantiği burada kanıtlanır.

function line(overrides: Partial<SiteDiaryLineRead> = {}): SiteDiaryLineRead {
  return {
    id: "l-1",
    boq_item_id: "bi-1",
    code: "03.001",
    description: "C25/30 Beton",
    unit: "m³",
    unit_price: "1520.00",
    quantity: "120.000",
    cumulative_quantity: "900.000",
    line_amount: "182400.00",
    // DET-1.B: bölümsüz satırda bölüm adı `null`.
    section_name: null,
    ...overrides,
  } satisfies SiteDiaryLineRead;
}

function entry(overrides: Partial<SiteDiaryEntryDetail> = {}): SiteDiaryEntryDetail {
  return {
    id: "d-1",
    site_id: "s-1",
    project_id: "p-1",
    entry_date: "2026-07-15",
    section_id: "sec-1",
    weather: "sunny",
    temp_max_c: "28.0",
    work_done: "6. kat döşeme betonu döküldü.",
    chief_note: "Beton pompası sahada.",
    safety_meeting_held: true,
    ppe_checked: true,
    has_incident: false,
    incident_note: null,
    status: "draft",
    submitted_at: null,
    created_by: "u-2",
    created_at: "2026-07-15T08:00:00Z",
    updated_at: "2026-07-15T09:00:00Z",
    lines: [line()],
    worker_counts: [{ id: "w-1", trade: "Kalıpçılar", source: "company", count: 12, subcontractor_name: null }],
    lines_total: "182400.00",
    worker_total: 12,
    dropped_orphan_count: 0,
    // DET-1.B salt-okunur detay alanları — taslak: gönderen yok, kilit yok, komşu yok.
    site_name: "A-Blok Şantiyesi",
    project_name: "Güneşkent Konutları",
    section_name: "Kat 6–10 Kaba İnşaat",
    created_by_name: "Mehmet Demir",
    submitted_by: null,
    submitted_by_name: null,
    locked: false,
    lock_report_date: null,
    prev_id: null,
    next_id: null,
    prev_entry_date: null,
    next_entry_date: null,
    ...overrides,
  } satisfies SiteDiaryEntryDetail;
}

describe("emptyDiaryForm", () => {
  it("tarih dışındaki her alanı boş/kapalı başlatır", () => {
    expect(emptyDiaryForm("2026-08-03")).toEqual({
      entryDate: "2026-08-03",
      sectionId: "",
      weather: "",
      tempMinC: "",
      tempMaxC: "",
      windMs: "",
      workDone: "",
      chiefNote: "",
      safetyMeetingHeld: false,
      ppeChecked: false,
      hasIncident: false,
      incidentNote: "",
      quantities: {},
      overrunReasons: {},
      addedLines: [],
      removedLines: [],
      workerCounts: {},
      workerHours: {},
      addedFirms: [],
      removedWorkers: [],
    });
  });
});

describe("diaryFormFromEntry", () => {
  it("kayıttaki alanları forma taşır", () => {
    const form = diaryFormFromEntry(entry());

    expect(form).toMatchObject({
      entryDate: "2026-07-15",
      sectionId: "sec-1",
      weather: "sunny",
      tempMaxC: "28.0",
      workDone: "6. kat döşeme betonu döküldü.",
      chiefNote: "Beton pompası sahada.",
      safetyMeetingHeld: true,
      ppeChecked: true,
    });
    expect(form.quantities).toEqual({ "bi-1|": "120.000" });
    expect(form.workerCounts).toEqual({ "company|Kalıpçılar": "12" });
  });

  it("null alanları boş dizeye düşürür (kontrollü girdiler `null` almaz)", () => {
    const form = diaryFormFromEntry(
      entry({ section_id: null, section_name: null, weather: null, temp_max_c: null, work_done: null, chief_note: null }),
    );

    expect(form.sectionId).toBe("");
    expect(form.weather).toBe("");
    expect(form.tempMinC).toBe("");
    expect(form.tempMaxC).toBe("");
    expect(form.windMs).toBe("");
    expect(form.workDone).toBe("");
    expect(form.chiefNote).toBe("");
  });

  it("PLN-F2.1: yeni hava alanları (min/max/rüzgâr) forma taşınır", () => {
    const form = diaryFormFromEntry(entry({ temp_min_c: "12.5", temp_max_c: "30.0", wind_ms: "4.5" }));

    expect(form).toMatchObject({ tempMinC: "12.5", tempMaxC: "30.0", windMs: "4.5" });
  });

  it("PLN-F2.2: HER satır (Bölümsüz + bölümlü) kendi anahtarıyla dolar — biri ötekini ezmez", () => {
    const form = diaryFormFromEntry(
      entry({
        lines: [
          line({ quantity: "5.000", section_id: null }),
          line({ id: "l-2", quantity: "12.000", section_id: "sec-9" }),
        ],
      }),
    );

    expect(form.quantities).toEqual({ "bi-1|": "5.000", "bi-1|sec-9": "12.000" });
  });

  it("miktarı 0 olan satırı BOŞ hücre olarak gösterir", () => {
    const form = diaryFormFromEntry(entry({ lines: [line({ quantity: "0.000" })] }));

    expect(form.quantities["bi-1|"]).toBe("");
  });

  it("öksüz satır (boq_item_id null) forma GİRMEZ", () => {
    const form = diaryFormFromEntry(
      entry({ lines: [line(), line({ id: "l-2", boq_item_id: null })] }),
    );

    expect(Object.keys(form.quantities)).toEqual(["bi-1|"]);
  });
});

describe("parseDiaryQuantity", () => {
  it("boş hücre 0'dır", () => {
    expect(parseDiaryQuantity("")).toBe(0);
  });

  it("Türkçe klavyenin virgülünü nokta gibi çevirir", () => {
    expect(parseDiaryQuantity("2,4")).toBe(2.4);
    expect(parseDiaryQuantity("2.4")).toBe(2.4);
  });

  it("negatif ve çevrilemeyen metin null döner (sessizce 0 YAZILMAZ)", () => {
    expect(parseDiaryQuantity("-1")).toBeNull();
    expect(parseDiaryQuantity("abc")).toBeNull();
  });
});

describe("buildDiaryCreateBody", () => {
  it("YALNIZ şemadaki alanları taşır — satır/işçi/durum gövdeye GİRMEZ", () => {
    const form: DiaryFormState = {
      ...emptyDiaryForm("2026-08-03"),
      sectionId: "sec-1",
      weather: "rainy",
      tempMinC: "8",
      tempMaxC: "19,5",
      windMs: "4,5",
      workDone: "  Kalıp söküldü  ",
      chiefNote: "   ",
      safetyMeetingHeld: true,
      quantities: { "bi-1|": "12" },
      workerCounts: { "company|Kalıpçılar": "8" },
    };

    const body = buildDiaryCreateBody(form);

    expect(body).toEqual({
      entry_date: "2026-08-03",
      section_id: "sec-1",
      weather: "rainy",
      temp_min_c: 8,
      temp_max_c: 19.5,
      wind_ms: 4.5,
      work_done: "Kalıp söküldü",
      chief_note: null,
      safety_meeting_held: true,
      ppe_checked: false,
      has_incident: false,
      incident_note: null,
    });
    expect(body).not.toHaveProperty("lines");
    expect(body).not.toHaveProperty("worker_counts");
    expect(body).not.toHaveProperty("status");
  });

  it("bölüm/hava seçilmediyse null gider (alanlar nullable)", () => {
    const body = buildDiaryCreateBody(emptyDiaryForm("2026-08-03"));

    expect(body.section_id).toBeNull();
    expect(body.weather).toBeNull();
    expect(body.temp_min_c).toBeNull();
    expect(body.temp_max_c).toBeNull();
    expect(body.wind_ms).toBeNull();
  });
});

// GKS-F1.2a · POST + lines: önizleme yapraklarından DOKUNULANLAR + tüm eklenenler.
function previewLeaf(overrides: Partial<DiaryLeafRow> = {}): DiaryLeafRow {
  return {
    key: "duv|",
    boqItemId: "duv",
    sectionId: null,
    label: "Bölümsüz",
    sectionCode: null,
    isUnsectioned: true,
    isAdded: false,
    isRemovable: false,
    isOrphan: false,
    todayText: "",
    todayValue: "0",
    cumulative: null,
    planned: null,
    remaining: null,
    isOverrun: false,
    overrunExcess: null,
    amount: null,
    ...overrides,
  };
}

describe("buildDiaryCreateBody · lines (GKS-F1.2a)", () => {
  const leaves = [
    previewLeaf({ key: "duv|", boqItemId: "duv", sectionId: null }),
    previewLeaf({ key: "duv|k1", boqItemId: "duv", sectionId: "k1" }),
    previewLeaf({ key: "kab|k1", boqItemId: "kab", sectionId: "k1" }),
    previewLeaf({ key: "kab|k2", boqItemId: "kab", sectionId: "k2" }),
  ];

  it("dokunulan satırı taşır, dokunulmayanı TAŞIMAZ; section_id null açık yazılır", () => {
    const form: DiaryFormState = {
      ...emptyDiaryForm("2026-08-03"),
      quantities: { "duv|": "12,5", "duv|k1": "" },
      overrunReasons: { "kab|k1": "  Ek kat  " },
    };

    const body = buildDiaryCreateBody(form, leaves);

    expect(body.lines).toEqual([
      { boq_item_id: "duv", section_id: null, quantity: 12.5, overrun_reason: null },
      { boq_item_id: "kab", section_id: "k1", quantity: 0, overrun_reason: "Ek kat" },
    ]);
    expect(body.lines?.[0]).toHaveProperty("section_id", null);
  });

  it("sıfır miktar + boş gerekçe dokunulmamış sayılır", () => {
    const form: DiaryFormState = { ...emptyDiaryForm("2026-08-03"), quantities: { "duv|": "0", "kab|k1": " " } };

    expect(buildDiaryCreateBody(form, leaves).lines).toBeUndefined();
  });

  it("geçersiz hücre (negatif / sayı değil) gövdeye GİRMEZ", () => {
    const form: DiaryFormState = {
      ...emptyDiaryForm("2026-08-03"),
      quantities: { "duv|": "abc", "duv|k1": "-3", "kab|k1": "7" },
      overrunReasons: { "duv|": "gerekçe var ama hücre bozuk" },
    };

    expect(buildDiaryCreateBody(form, leaves).lines).toEqual([
      { boq_item_id: "kab", section_id: "k1", quantity: 7, overrun_reason: null },
    ]);
  });

  it("TÜM eklenen satırlar (miktarsız da) girer; önizleme yaprağıyla aynı anahtar bir kez yazılır", () => {
    const form: DiaryFormState = {
      ...emptyDiaryForm("2026-08-03"),
      quantities: { "kab|k1": "4" },
      addedLines: [
        { boqItemId: "kab", sectionId: "k1", plannedQuantity: "0" },
        { boqItemId: "duv", sectionId: "k2", plannedQuantity: "0" },
      ],
    };

    expect(buildDiaryCreateBody(form, leaves).lines).toEqual([
      { boq_item_id: "kab", section_id: "k1", quantity: 4, overrun_reason: null },
      { boq_item_id: "duv", section_id: "k2", quantity: 0, overrun_reason: null },
    ]);
  });

  it("öksüz yaprak (boq_item_id null) gövdeye girmez", () => {
    const orphan = previewLeaf({ key: "orphan:0", boqItemId: null, isOrphan: true });
    const form: DiaryFormState = { ...emptyDiaryForm("2026-08-03"), quantities: { "orphan:0": "5" } };

    expect(buildDiaryCreateBody(form, [orphan]).lines).toBeUndefined();
  });

  it("previewLeaves verilmezse / boşsa gövde bugünkü gibidir (lines anahtarı YOK)", () => {
    const form: DiaryFormState = { ...emptyDiaryForm("2026-08-03"), quantities: { "duv|": "12" } };

    expect(buildDiaryCreateBody(form)).not.toHaveProperty("lines");
    expect(buildDiaryCreateBody(form, [])).not.toHaveProperty("lines");
  });
});

describe("buildDiaryUpdateBody", () => {
  it("işçi kırılımını DEĞİŞTİRME semantiğiyle gönderir (sıfır satır dışarıda)", () => {
    const form: DiaryFormState = {
      ...diaryFormFromEntry(entry()),
      workerCounts: { "company|Kalıpçılar": "14", "general|Yardımcı": "0" },
    };

    const body = buildDiaryUpdateBody(form, entry());

    expect(body.worker_counts).toEqual([
      { trade: "Kalıpçılar", source: "company", count: 14, subcontractor_id: null, hours: null },
    ]);
  });

  it("PLN-F2.1: kayıttaki FİRMA satırı (kişi × saat) ekranda olmasa da gövdede KORUNUR", () => {
    const detail = entry({
      worker_counts: [
        { id: "w-1", trade: "Kalıpçılar", source: "company", count: 12, subcontractor_id: null, hours: null, subcontractor_name: null },
        { id: "w-2", trade: "Demirciler", source: "subcontractor", count: 6, subcontractor_id: "firm-1", hours: "9.0", subcontractor_name: "Demir Taşeron" },
      ],
    });
    const form: DiaryFormState = {
      ...diaryFormFromEntry(detail),
      workerCounts: { ...diaryFormFromEntry(detail).workerCounts, "company|Kalıpçılar": "13" },
    };

    expect(buildDiaryUpdateBody(form, detail).worker_counts).toEqual([
      { trade: "Kalıpçılar", source: "company", count: 13, subcontractor_id: null, hours: null },
      { trade: "Demirciler", source: "subcontractor", count: 6, subcontractor_id: "firm-1", hours: "9.0" },
    ]);
  });

  it("PLN-F2.1 + CLEAN-B1: hava gövdesi yalnız min/max/rüzgârla gider — eski sıcaklık alanı YOK (backend 422)", () => {
    const form: DiaryFormState = {
      ...diaryFormFromEntry(entry()),
      tempMinC: "11",
      tempMaxC: "24,5",
      windMs: "3",
    };

    const body = buildDiaryUpdateBody(form, entry());

    expect(body).toMatchObject({ temp_min_c: 11, temp_max_c: 24.5, wind_ms: 3 });
    // Anahtar kümesi BİREBİR: tanınmayan her alan (eski sıcaklık dahil) backend'de 422.
    expect(Object.keys(body).sort()).toEqual(
      [
        "chief_note",
        "entry_date",
        "has_incident",
        "incident_note",
        "ppe_checked",
        "safety_meeting_held",
        "section_id",
        "temp_max_c",
        "temp_min_c",
        "weather",
        "wind_ms",
        "work_done",
        "worker_counts",
      ].sort(),
    );
  });

  it("geçersiz işçi hücresi varsa alan HİÇ gönderilmez (mevcut kırılım korunur)", () => {
    const form: DiaryFormState = {
      ...diaryFormFromEntry(entry()),
      workerCounts: { "company|Kalıpçılar": "-2" },
    };

    const body = buildDiaryUpdateBody(form, entry());

    expect(body.worker_counts).toBeUndefined();
  });
});

describe("buildDiaryLinesBody", () => {
  it("kaydın TÜM satırlarını gönderir — boşaltılan hücre 0 olur (sessizce eski değerde kalmaz)", () => {
    const detail = entry({
      lines: [line(), line({ id: "l-2", boq_item_id: "bi-2", quantity: "40.000" })],
    });
    const form: DiaryFormState = {
      ...diaryFormFromEntry(detail),
      quantities: { "bi-1|": "12", "bi-2|": "" },
    };

    expect(buildDiaryLinesBody(detail, form)).toEqual({
      lines: [
        { boq_item_id: "bi-1", section_id: null, quantity: 12, overrun_reason: null },
        { boq_item_id: "bi-2", section_id: null, quantity: 0, overrun_reason: null },
      ],
    });
  });

  it("öksüz satırı (boq_item_id null) gövdeye koymaz — şema zorunlu tutuyor", () => {
    const detail = entry({ lines: [line(), line({ id: "l-2", boq_item_id: null })] });

    expect(buildDiaryLinesBody(detail, diaryFormFromEntry(detail)).lines).toHaveLength(1);
  });

  it("geçersiz hücrede satırın SUNUCUDAKİ miktarı korunur (uydurma 0 yazılmaz)", () => {
    const detail = entry();
    const form: DiaryFormState = { ...diaryFormFromEntry(detail), quantities: { "bi-1|": "abc" } };

    expect(buildDiaryLinesBody(detail, form).lines).toEqual([
      { boq_item_id: "bi-1", section_id: null, quantity: 120, overrun_reason: null },
    ]);
  });

  it("PLN-F2.2: bölümlü satır kendi hücresinden yazılır, aşım gerekçesi formdan gider", () => {
    const detail = entry({
      lines: [
        line({ section_id: null, quantity: "0.000" }),
        line({ id: "l-2", section_id: "sec-9", quantity: "12.000", overrun_reason: "Ek iş emri" }),
      ],
    });
    const seeded = diaryFormFromEntry(detail);
    const form: DiaryFormState = {
      ...seeded,
      quantities: { ...seeded.quantities, "bi-1|": "4", "bi-1|sec-9": "13,5" },
      overrunReasons: { "bi-1|sec-9": "  Revizyon  " },
    };

    expect(buildDiaryLinesBody(detail, form).lines).toEqual([
      { boq_item_id: "bi-1", section_id: null, quantity: 4, overrun_reason: null },
      { boq_item_id: "bi-1", section_id: "sec-9", quantity: 13.5, overrun_reason: "Revizyon" },
    ]);
  });
});

describe("invalidQuantityIds / invalidWorkerCountIds", () => {
  it("geçersiz hücreleri görünür hata için raporlar", () => {
    const form: DiaryFormState = {
      ...emptyDiaryForm("2026-08-03"),
      quantities: { "bi-1|": "12", "bi-2|": "-4" },
      workerCounts: { "company|Kalıpçılar": "3", "general|Yardımcı": "1,5" },
    };

    expect(invalidQuantityIds(form)).toEqual(["bi-2|"]);
    expect(invalidWorkerCountIds(form)).toEqual(["general|Yardımcı"]);
  });
});

describe("isDiaryFormDirty", () => {
  it("kayıttan tohumlanmış form kirli DEĞİLDİR", () => {
    const detail = entry();

    expect(isDiaryFormDirty(detail, diaryFormFromEntry(detail))).toBe(false);
  });

  it("not alanlarında yalnız baştaki/sondaki boşluk farkı kirlilik SAYILMAZ", () => {
    const detail = entry();
    const form: DiaryFormState = {
      ...diaryFormFromEntry(detail),
      workDone: "  6. kat döşeme betonu döküldü.  ",
    };

    expect(isDiaryFormDirty(detail, form)).toBe(false);
  });

  it("sıcaklık aynı sayının farklı yazımıysa kirlilik SAYILMAZ", () => {
    const detail = entry();
    const form: DiaryFormState = { ...diaryFormFromEntry(detail), tempMaxC: "28,0" };

    expect(isDiaryFormDirty(detail, form)).toBe(false);
  });

  it("PLN-F2.1: min sıcaklık ya da rüzgâr değişince kirlidir", () => {
    const detail = entry();

    expect(isDiaryFormDirty(detail, { ...diaryFormFromEntry(detail), tempMinC: "10" })).toBe(true);
    expect(isDiaryFormDirty(detail, { ...diaryFormFromEntry(detail), windMs: "2" })).toBe(true);
  });

  it("miktar hücresi değişince kirlidir (türev sütunları uyarısı açılır)", () => {
    const detail = entry();
    const form: DiaryFormState = {
      ...diaryFormFromEntry(detail),
      quantities: { "bi-1|": "130" },
    };

    expect(isDiaryFormDirty(detail, form)).toBe(true);
  });

  it("işçi hücresi değişince kirlidir", () => {
    const detail = entry();
    const form: DiaryFormState = {
      ...diaryFormFromEntry(detail),
      workerCounts: { "company|Kalıpçılar": "13" },
    };

    expect(isDiaryFormDirty(detail, form)).toBe(true);
  });

  it("İSG anahtarı değişince kirlidir", () => {
    const detail = entry();
    const form: DiaryFormState = { ...diaryFormFromEntry(detail), ppeChecked: false };

    expect(isDiaryFormDirty(detail, form)).toBe(true);
  });
});

describe("PLN-F2.2 · satır ekleme / kaldırma (G3 · G6) — TAM küme", () => {
  function sectioned() {
    return entry({
      lines: [
        line({ section_id: null, quantity: "0.000" }),
        line({ id: "l-2", section_id: "sec-9", quantity: "12.000" }),
        line({ id: "l-3", boq_item_id: "bi-2", section_id: null, quantity: "3.000" }),
      ],
    });
  }

  it("eklenen satır gövdeye `added` olarak girer; kayıttaki satırların HEPSİ korunur", () => {
    const detail = sectioned();
    const form = addDiaryLines(diaryFormFromEntry(detail), [{ boqItemId: "bi-1", sectionId: "sec-7", plannedQuantity: null }]);
    const withQty: DiaryFormState = { ...form, quantities: { ...form.quantities, "bi-1|sec-7": "5" } };

    expect(buildDiaryLinesBody(detail, withQty).lines).toEqual([
      { boq_item_id: "bi-1", section_id: null, quantity: 0, overrun_reason: null },
      { boq_item_id: "bi-1", section_id: "sec-9", quantity: 12, overrun_reason: null },
      { boq_item_id: "bi-2", section_id: null, quantity: 3, overrun_reason: null },
      { boq_item_id: "bi-1", section_id: "sec-7", quantity: 5, overrun_reason: null },
    ]);
  });

  it("kaldırılan kayıtlı satır YALNIZ o satır olarak düşer (kısmi küme değil)", () => {
    const detail = sectioned();
    const form = removeDiaryLine(diaryFormFromEntry(detail), "bi-1|sec-9");

    expect(buildDiaryLinesBody(detail, form).lines).toEqual([
      { boq_item_id: "bi-1", section_id: null, quantity: 0, overrun_reason: null },
      { boq_item_id: "bi-2", section_id: null, quantity: 3, overrun_reason: null },
    ]);
    expect(form.quantities).not.toHaveProperty("bi-1|sec-9");
  });

  it("G3: kayıtlı Bölümsüz iskelet satırı KALDIRILAMAZ (işlem yok sayılır)", () => {
    const detail = sectioned();
    const seeded = diaryFormFromEntry(detail);

    expect(removeDiaryLine(seeded, "bi-1|")).toBe(seeded);
    expect(buildDiaryLinesBody(detail, removeDiaryLine(seeded, "bi-1|")).lines).toHaveLength(3);
  });

  it("henüz kaydedilmemiş eklenen satır kaldırılınca iz bırakmaz (removed'a girmez)", () => {
    const detail = sectioned();
    const added = addDiaryLines(diaryFormFromEntry(detail), [{ boqItemId: "bi-2", sectionId: "sec-9", plannedQuantity: null }]);
    const form = removeDiaryLine(added, "bi-2|sec-9");

    expect(form.addedLines).toEqual([]);
    expect(form.removedLines).toEqual([]);
    expect(isDiaryFormDirty(detail, form)).toBe(false);
  });

  it("kaldırılıp yeniden eklenen kayıtlı satır DÜŞMEZ", () => {
    const detail = sectioned();
    const removed = removeDiaryLine(diaryFormFromEntry(detail), "bi-1|sec-9");
    const readded = addDiaryLines(removed, [{ boqItemId: "bi-1", sectionId: "sec-9", plannedQuantity: null }]);

    expect(readded.removedLines).toEqual([]);
    expect(buildDiaryLinesBody(detail, readded).lines.map((row) => row.section_id)).toContain("sec-9");
  });

  it("ekleme/kaldırma formu kirletir", () => {
    const detail = sectioned();
    const seeded = diaryFormFromEntry(detail);

    expect(isDiaryFormDirty(detail, addDiaryLines(seeded, [{ boqItemId: "bi-1", sectionId: "sec-7", plannedQuantity: null }]))).toBe(true);
    expect(isDiaryFormDirty(detail, removeDiaryLine(seeded, "bi-1|sec-9"))).toBe(true);
  });

  it("aşım gerekçesi değişince kirlidir", () => {
    const detail = sectioned();
    const form: DiaryFormState = { ...diaryFormFromEntry(detail), overrunReasons: { "bi-1|sec-9": "x" } };

    expect(isDiaryFormDirty(detail, form)).toBe(true);
  });
});

describe("PLN-F2.2 · taşeron FİRMA satırları (kişi × saat · G10)", () => {
  const firmRow = {
    id: "w-2",
    trade: "Kaya Duvar",
    source: "subcontractor",
    count: 7,
    subcontractor_id: "firm-1",
    hours: "8.0",
    subcontractor_name: "Kaya Duvar",
  } satisfies SiteDiaryWorkerCountRead;

  it("kayıttaki firma saati forma taşınır", () => {
    const detail = entry({ worker_counts: [firmRow] });

    expect(diaryFormFromEntry(detail).workerHours).toEqual({ "firm|firm-1": "8.0" });
  });

  it("firma satırının kişi + saati formdan gövdeye gider", () => {
    const detail = entry({ worker_counts: [firmRow] });
    const seeded = diaryFormFromEntry(detail);
    const form: DiaryFormState = {
      ...seeded,
      workerCounts: { ...seeded.workerCounts, "firm|firm-1": "5" },
      workerHours: { "firm|firm-1": "9,5" },
    };

    expect(buildDiaryUpdateBody(form, detail).worker_counts).toEqual([
      { trade: "Kaya Duvar", source: "subcontractor", count: 5, subcontractor_id: "firm-1", hours: 9.5 },
    ]);
  });

  it("eklenen firma `added` olarak gider; kaldırılan firma YALNIZ kendisi düşer", () => {
    const detail = entry({
      worker_counts: [{ id: "w-1", trade: "Kalıpçılar", source: "company", count: 12, subcontractor_name: null }, firmRow],
    });
    const withFirm = addDiaryFirm(diaryFormFromEntry(detail), { subcontractorId: "firm-2", trade: "Deniz Tesisat" });
    const form: DiaryFormState = {
      ...removeDiaryWorker(withFirm, "firm|firm-1"),
      workerCounts: { ...withFirm.workerCounts, "firm|firm-2": "4" },
      workerHours: { ...withFirm.workerHours, "firm|firm-2": "8" },
    };

    expect(buildDiaryUpdateBody({ ...form, removedWorkers: ["firm|firm-1"] }, detail).worker_counts).toEqual([
      { trade: "Kalıpçılar", source: "company", count: 12, subcontractor_id: null, hours: null },
      { trade: "Deniz Tesisat", source: "subcontractor", count: 4, subcontractor_id: "firm-2", hours: 8 },
    ]);
  });

  it("geçersiz saat hücresi varsa işçi alanı HİÇ gönderilmez", () => {
    const detail = entry({ worker_counts: [firmRow] });
    const form: DiaryFormState = { ...diaryFormFromEntry(detail), workerHours: { "firm|firm-1": "abc" } };

    expect(buildDiaryUpdateBody(form, detail).worker_counts).toBeUndefined();
    expect(invalidWorkerCountIds(form)).toEqual(["firm|firm-1"]);
  });

  it("saat değişince / firma eklenince kirlidir", () => {
    const detail = entry({ worker_counts: [firmRow] });
    const seeded = diaryFormFromEntry(detail);

    expect(isDiaryFormDirty(detail, { ...seeded, workerHours: { "firm|firm-1": "9" } })).toBe(true);
    expect(isDiaryFormDirty(detail, addDiaryFirm(seeded, { subcontractorId: "firm-3", trade: "X" }))).toBe(true);
    expect(isDiaryFormDirty(detail, removeDiaryWorker(seeded, "firm|firm-1"))).toBe(true);
  });
});

describe("PLN-F2.2 · diaryWeatherError (backend aralıkları)", () => {
  it("boş ve aralık içi geçerli; TR virgülü kabul", () => {
    expect(diaryWeatherError({ ...emptyDiaryForm("2026-09-24"), tempMinC: "17", tempMaxC: "28,5", windMs: "4,2" })).toBeNull();
    expect(diaryWeatherError(emptyDiaryForm("2026-09-24"))).toBeNull();
  });

  it("aralık dışı, iki ondalık ve min > max görünür hatadır", () => {
    expect(diaryWeatherError({ ...emptyDiaryForm("2026-09-24"), tempMaxC: "61" })).toMatch(/Max °C/);
    expect(diaryWeatherError({ ...emptyDiaryForm("2026-09-24"), windMs: "4,25" })).toMatch(/Rüzgâr/);
    expect(diaryWeatherError({ ...emptyDiaryForm("2026-09-24"), tempMinC: "20", tempMaxC: "10" })).toMatch(/büyük olamaz/);
  });
});
