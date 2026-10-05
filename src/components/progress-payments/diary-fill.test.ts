import { describe, it, expect } from "vitest";

import {
  DIARY_FILL_EMPTY_TEXT,
  applyEmployerDiarySuggestion,
  applySubcontractorDiarySuggestion,
  buildDiaryFillNotice,
  diaryOverwriteConfirmMessage,
  isNonZeroQuantity,
  type EmployerSuggestionLine,
  type SubcontractorSuggestionLine,
} from "./diary-fill";
import type { PivotRow } from "./pivot";
import type { SubcontractorLineRow } from "./th-lines";

const SITE_A = "site-a";
const SITE_B = "site-b";

function pivotRow(itemId: string, cells: { siteId: string; editable: boolean; quantity: string }[]): PivotRow {
  return {
    item: {
      id: itemId,
      code: itemId,
      description: `${itemId} açıklama`,
      unit: "m³",
      quantity: "100.000",
      unit_price: "10.00",
      allocations: [],
      remaining_quantity: "0.000",
    } as unknown as PivotRow["item"],
    sourceCode: null,
    groupName: "A — Betonarme",
    cells: cells.map((cell) => ({
      ...cell,
      lineTotal: null,
      isSaved: false,
      isPriceStale: null,
      quantitySource: "manual" as const,
    })),
  };
}

function employerLine(itemId: string, siteId: string, quantity: string): EmployerSuggestionLine {
  return { contract_item_id: itemId, site_id: siteId, quantity, coefficient: null };
}

function subcontractorRow(itemId: string, quantity: string): SubcontractorLineRow {
  return {
    itemId,
    code: itemId,
    sourceCode: null,
    description: `${itemId} açıklama`,
    unit: "m²",
    groupName: null,
    sortOrder: 0,
    contractUnitPrice: "10.00",
    quantity,
    quantitySource: "manual",
    lineTotal: null,
  };
}

function subcontractorLine(itemId: string, quantity: string): SubcontractorSuggestionLine {
  return { contract_item_id: itemId, quantity, coefficient: null, sort_order: 0 };
}

describe("isNonZeroQuantity", () => {
  it("sıfır/boş değerleri sıfır sayar (Number kullanmadan)", () => {
    expect(isNonZeroQuantity("")).toBe(false);
    expect(isNonZeroQuantity("0")).toBe(false);
    expect(isNonZeroQuantity("0.000")).toBe(false);
  });

  it("içinde 1-9 rakamı geçen değeri sıfırdan farklı sayar", () => {
    expect(isNonZeroQuantity("0.001")).toBe(true);
    expect(isNonZeroQuantity("120")).toBe(true);
  });
});

describe("applyEmployerDiarySuggestion", () => {
  it("düzenlenebilir hücreyi önerilen miktarla doldurur", () => {
    const rows = [pivotRow("item-1", [{ siteId: SITE_A, editable: true, quantity: "0" }])];

    const result = applyEmployerDiarySuggestion(rows, [employerLine("item-1", SITE_A, "320.000")]);

    expect(result.rows[0].cells[0].quantity).toBe("320");
    expect(result.plan).toEqual({ fillCount: 1, overwriteCount: 0, unmatchedCount: 0 });
  });

  it("girdi satırlarını MUTASYONA UĞRATMAZ (yeni nesne döner)", () => {
    const rows = [pivotRow("item-1", [{ siteId: SITE_A, editable: true, quantity: "0" }])];

    applyEmployerDiarySuggestion(rows, [employerLine("item-1", SITE_A, "5")]);

    expect(rows[0].cells[0].quantity).toBe("0");
  });

  it("öneri Türkçe ekran metnine çevrilir ('1234.500' → '1.234,5'); aynı değer 'değişti' sayılmaz", () => {
    const rows = [
      pivotRow("item-1", [
        { siteId: SITE_A, editable: true, quantity: "0" },
        { siteId: SITE_B, editable: true, quantity: "12,5" },
      ]),
    ];

    const result = applyEmployerDiarySuggestion(rows, [
      employerLine("item-1", SITE_A, "1234.500"),
      employerLine("item-1", SITE_B, "12.500"),
    ]);

    expect(result.rows[0].cells[0].quantity).toBe("1.234,5");
    expect(result.rows[0].cells[1].quantity).toBe("12,5");
    expect(result.plan).toEqual({ fillCount: 1, overwriteCount: 0, unmatchedCount: 0 });
  });

  it("sıfırdan farklı elle girilmiş miktarın üzerine yazmayı SAYAR", () => {
    const rows = [pivotRow("item-1", [{ siteId: SITE_A, editable: true, quantity: "12.5" }])];

    const result = applyEmployerDiarySuggestion(rows, [employerLine("item-1", SITE_A, "320")]);

    expect(result.plan.overwriteCount).toBe(1);
    expect(result.plan.fillCount).toBe(1);
  });

  it("düzenlenemez (tahsissiz) hücreye YAZMAZ, satırı eşleşmeyen sayar", () => {
    const rows = [pivotRow("item-1", [{ siteId: SITE_B, editable: false, quantity: "" }])];

    const result = applyEmployerDiarySuggestion(rows, [employerLine("item-1", SITE_B, "40")]);

    expect(result.rows[0].cells[0].quantity).toBe("");
    expect(result.plan.unmatchedCount).toBe(1);
    expect(result.plan.fillCount).toBe(0);
  });

  it("formda hiç olmayan kaleme gelen öneriyi eşleşmeyen sayar", () => {
    const rows = [pivotRow("item-1", [{ siteId: SITE_A, editable: true, quantity: "0" }])];

    const result = applyEmployerDiarySuggestion(rows, [employerLine("item-9", SITE_A, "40")]);

    expect(result.plan.unmatchedCount).toBe(1);
  });

  it("değer zaten öneriyle aynıysa değişiklik saymaz", () => {
    const rows = [pivotRow("item-1", [{ siteId: SITE_A, editable: true, quantity: "320" }])];

    const result = applyEmployerDiarySuggestion(rows, [employerLine("item-1", SITE_A, "320")]);

    expect(result.plan).toEqual({ fillCount: 0, overwriteCount: 0, unmatchedCount: 0 });
  });
});

describe("applySubcontractorDiarySuggestion", () => {
  it("kalem kimliğinden eşleyip miktarı doldurur", () => {
    const rows = [subcontractorRow("sci-4", "0"), subcontractorRow("sci-5", "0")];

    const result = applySubcontractorDiarySuggestion(rows, [subcontractorLine("sci-4", "60.000")]);

    expect(result.rows[0].quantity).toBe("60");
    expect(result.rows[1].quantity).toBe("0");
    expect(result.plan).toEqual({ fillCount: 1, overwriteCount: 0, unmatchedCount: 0 });
  });

  it("elle girilmiş miktarın üzerine yazmayı sayar", () => {
    const rows = [subcontractorRow("sci-4", "10")];

    const result = applySubcontractorDiarySuggestion(rows, [subcontractorLine("sci-4", "60")]);

    expect(result.plan.overwriteCount).toBe(1);
  });

  it("sözleşmede olmayan kaleme gelen öneriyi eşleşmeyen sayar", () => {
    const rows = [subcontractorRow("sci-4", "0")];

    const result = applySubcontractorDiarySuggestion(rows, [subcontractorLine("sci-9", "60")]);

    expect(result.plan.unmatchedCount).toBe(1);
    expect(result.rows[0].quantity).toBe("0");
  });
});

describe("buildDiaryFillNotice — dürüstlük korkulukları", () => {
  it("öneri boşsa görünür gerekçe ve backend sebebini basar", () => {
    const notice = buildDiaryFillNotice(
      { fillCount: 0, overwriteCount: 0, unmatchedCount: 0 },
      {
        lineCount: 0,
        skippedUnbridgedCount: 0,
        reason: "Proje geneli sözleşmede günlükten doldurma desteklenmiyor.",
      },
    );

    expect(notice.variant).toBe("warning");
    expect(notice.text).toContain(DIARY_FILL_EMPTY_TEXT);
    expect(notice.text).toContain("Proje geneli sözleşmede günlükten doldurma desteklenmiyor.");
  });

  it("atlanan (köprülenmemiş) poz sayısını SESSİZCE YUTMAZ", () => {
    const notice = buildDiaryFillNotice(
      { fillCount: 2, overwriteCount: 0, unmatchedCount: 0 },
      { lineCount: 2, skippedUnbridgedCount: 3, reason: null },
    );

    expect(notice.variant).toBe("warning");
    expect(notice.text).toContain("3 günlük pozu sözleşme kalemine bağlı olmadığı için atlandı");
  });

  it("üzerine yazılan satır sayısını açıkça söyler", () => {
    const notice = buildDiaryFillNotice(
      { fillCount: 2, overwriteCount: 1, unmatchedCount: 0 },
      { lineCount: 2, skippedUnbridgedCount: 0, reason: null },
    );

    expect(notice.text).toContain("2 satır günlük kayıtlardan dolduruldu.");
    expect(notice.text).toContain("1 satırda elle girdiğiniz miktarın üzerine yazıldı.");
    expect(notice.variant).toBe("success");
  });

  it("formda karşılık bulmayan satırları bildirir", () => {
    const notice = buildDiaryFillNotice(
      { fillCount: 1, overwriteCount: 0, unmatchedCount: 2 },
      { lineCount: 3, skippedUnbridgedCount: 0, reason: null },
    );

    expect(notice.variant).toBe("warning");
    expect(notice.text).toContain("Öneriden 2 satır bu formda karşılık bulamadı");
  });
});

describe("diaryOverwriteConfirmMessage", () => {
  it("kaç satırın üzerine yazılacağını söyler", () => {
    expect(diaryOverwriteConfirmMessage(4)).toContain("4 satırda");
    expect(diaryOverwriteConfirmMessage(4)).toContain("ÜZERİNE yazılacak");
  });
});
