import { describe, it, expect } from "vitest";

import { emptyDiaryForm, type DiaryFormState } from "./form-state";
import {
  countEnteredDateData,
  countEnteredPreviewData,
  hasEnteredPreviewData,
  hasEnteredWorkerData,
  missingSkeletonLines,
} from "./preview-transition";

// GKS-F1.2a · önizleme geçişlerinin saf kararları (Ü3 sayım · Ü5 eksik anahtar).

function formWith(patch: Partial<DiaryFormState>): DiaryFormState {
  return { ...emptyDiaryForm("2026-09-24"), ...patch };
}

describe("countEnteredPreviewData / hasEnteredPreviewData", () => {
  it("boş formda 0 ve false", () => {
    expect(countEnteredPreviewData(emptyDiaryForm("2026-09-24"))).toBe(0);
    expect(hasEnteredPreviewData(emptyDiaryForm("2026-09-24"))).toBe(false);
  });

  it("boşluktan ibaret miktar/gerekçe girilmiş sayılmaz", () => {
    expect(countEnteredPreviewData(formWith({ quantities: { "a|": "  ", "b|": "" }, overrunReasons: { "a|": " " } }))).toBe(0);
  });

  it("dolu miktar, dolu gerekçe ve eklenen satır sayılır", () => {
    const form = formWith({
      quantities: { "a|": "5", "b|k1": "0" },
      overrunReasons: { "c|": "Ek kat" },
      addedLines: [{ boqItemId: "d", sectionId: "k2", plannedQuantity: "0" }],
    });

    expect(countEnteredPreviewData(form)).toBe(4);
    expect(hasEnteredPreviewData(form)).toBe(true);
  });

  it("aynı satırın miktarı + gerekçesi + eklenmişliği TEK satır sayılır", () => {
    const form = formWith({
      quantities: { "a|k1": "5" },
      overrunReasons: { "a|k1": "x" },
      addedLines: [{ boqItemId: "a", sectionId: "k1", plannedQuantity: "0" }],
    });

    expect(countEnteredPreviewData(form)).toBe(1);
  });

  it("yalnız işçi/başlık alanları girilmiş olması satır verisi SAYILMAZ", () => {
    expect(countEnteredPreviewData(formWith({ workDone: "x", workerCounts: { "general|Usta": "3" } }))).toBe(0);
  });
});

describe("missingSkeletonLines · Ü5 eksik anahtarlar", () => {
  const skeleton = [
    { boq_item_id: "duv", section_id: "k1", planned_quantity: "100.000" },
    { boq_item_id: "duv", section_id: "k2", planned_quantity: null },
    { boq_item_id: "kab", section_id: "k1", planned_quantity: "40.000" },
    { boq_item_id: null, section_id: null, planned_quantity: "1.000" },
  ];

  it("önizleme − kayıtlı satırlar − eklenenler; addDiaryLines girdisi biçiminde", () => {
    const missing = missingSkeletonLines(
      skeleton,
      [{ boq_item_id: "duv", section_id: "k1" }],
      [{ boqItemId: "kab", sectionId: "k1", plannedQuantity: "0" }],
    );

    expect(missing).toEqual([{ boqItemId: "duv", sectionId: "k2", plannedQuantity: null }]);
  });

  it("hepsi kayıtlıysa boş döner; kayıtlı Bölümsüz (null) bölüm anahtarıyla karışmaz", () => {
    expect(
      missingSkeletonLines(
        [{ boq_item_id: "duv", section_id: null, planned_quantity: "5.000" }],
        [{ boq_item_id: "duv", section_id: null }],
        [],
      ),
    ).toEqual([]);
    expect(
      missingSkeletonLines(
        [{ boq_item_id: "duv", section_id: "k1", planned_quantity: "5.000" }],
        [{ boq_item_id: "duv", section_id: null }],
        [],
      ),
    ).toEqual([{ boqItemId: "duv", sectionId: "k1", plannedQuantity: "5.000" }]);
  });

  it("kayıtta olmayan bölüm satırı section_id undefined gelse de Bölümsüz sayılır", () => {
    expect(
      missingSkeletonLines([{ boq_item_id: "duv", section_id: undefined, planned_quantity: "5" }], [{ boq_item_id: "duv", section_id: null }], []),
    ).toEqual([]);
  });

  it("önizlemede aynı anahtar iki kez gelse bir kez döner", () => {
    const twice = [skeleton[0], skeleton[0]];

    expect(missingSkeletonLines(twice, [], [])).toHaveLength(1);
  });
});

describe("GKS-F1.5 · countEnteredDateData (tarih diyaloğunun sayımı: satır + işçi)", () => {
  it("boş formda 0", () => {
    expect(countEnteredDateData(emptyDiaryForm("2026-09-24"))).toBe(0);
  });

  it("satır sayımı countEnteredPreviewData ile AYNI başlar; işçi satırları üstüne eklenir", () => {
    const lines = formWith({ quantities: { "a|": "5" }, overrunReasons: { "c|": "x" } });
    expect(countEnteredDateData(lines)).toBe(countEnteredPreviewData(lines));
    expect(countEnteredPreviewData(lines)).toBe(2);
    const withWorkers = { ...lines, workerCounts: { "firm|sub-1": "4" } };
    expect(countEnteredDateData(withWorkers)).toBe(3);
    expect(countEnteredPreviewData(withWorkers)).toBe(2);
  });

  it("dolu işçi sayısı, dolu saat ve eklenen firma; aynı firma TEK satır (distinct)", () => {
    const form = formWith({
      workerCounts: { "firm|sub-1": "4", "firm|sub-2": "  " },
      workerHours: { "firm|sub-1": "8", "firm|sub-3": "9" },
      addedFirms: [
        { subcontractorId: "sub-1", trade: "A" },
        { subcontractorId: "sub-4", trade: "D" },
      ],
    });
    // sub-1 (sayı+saat+eklenmiş) · sub-3 (saat) · sub-4 (eklenmiş); sub-2 boş → sayılmaz
    expect(countEnteredDateData(form)).toBe(3);
  });

  it("yalnız işçi girilmişse de > 0", () => {
    expect(countEnteredDateData(formWith({ workerCounts: { "firm|s": "1" } }))).toBe(1);
    expect(hasEnteredWorkerData(formWith({ workerCounts: { "firm|s": "1" } }))).toBe(true);
    expect(hasEnteredWorkerData(emptyDiaryForm("2026-09-24"))).toBe(false);
  });
});
