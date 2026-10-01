import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";
import {
  parseCellValue,
  QUANTITY_DIGIT_LIMITS,
  QUANTITY_DIGIT_LIMIT_MESSAGE,
  type CellDigitLimits,
  type DigitLimitedRejectionReason,
} from "@/lib/contract-distribution-save";

export type SectionDistributionSave = DeepScale<components["schemas"]["SectionDistributionSave"]>;
export type SectionDistributionCellInput = DeepScale<components["schemas"]["SectionDistributionCellInput"]>;

/**
 * BDG · Bölüm dağılımı kaydetme gövdesi — BİRLEŞTİRME semantiği (sözleşme POZ
 * dağılımıyla aynı): yalnız KİRLİ hücreler, boşaltılan `quantity: null`,
 * `0` görünür ret. Fark: `quantity` ANAHTARI HER ZAMAN gövdededir (backend
 * zorunlu tutar, eksikse 422) ve hane sınırı + hücre tavanı vardır.
 */

/** openapi `SectionDistributionSave.allocations.maxItems` ile AYNI değer (bkz. test). */
export const SECTION_DISTRIBUTION_MAX_CELLS = 20000;

/** Ortak sınır (`QUANTITY_DIGIT_LIMITS`) — ikinci kopya yok. */
export const SECTION_QUANTITY_LIMITS: CellDigitLimits = QUANTITY_DIGIT_LIMITS;

export interface SectionDistributionCellEdit {
  boqItemId: string;
  sectionId: string;
  /** Ham girdi metni. Boş/yalnız boşluk ⇒ bağ koparma (`quantity: null`). */
  value: string;
}

export interface SectionDistributionCellRejection {
  edit: SectionDistributionCellEdit;
  reason: DigitLimitedRejectionReason;
}

export interface SectionDistributionSaveBuild {
  body: SectionDistributionSave;
  rejections: SectionDistributionCellRejection[];
  /** true ⇒ kirli hücre sayısı tavanı aştı; gövde KURULMADI (`allocations` boş). */
  cellLimitExceeded: boolean;
}

export function sectionDistributionCellKey(boqItemId: string, sectionId: string): string {
  return `${boqItemId}|${sectionId}`;
}

export function sectionDistributionRejectionMessage(
  reason: DigitLimitedRejectionReason,
): string {
  if (reason === "zero") {
    return "Miktar 0 olamaz — dağılımı kaldırmak için hücreyi boş bırakın.";
  }
  if (reason === "digits") {
    return QUANTITY_DIGIT_LIMIT_MESSAGE;
  }
  return "Miktar geçerli bir sayı olmalı (negatif değer kabul edilmez).";
}

export function sectionDistributionCellLimitMessage(): string {
  return `Tek seferde en çok ${SECTION_DISTRIBUTION_MAX_CELLS.toLocaleString("tr-TR")} hücre kaydedilebilir.`;
}

/** Kirli hücre haritasından gövde üretir; girdi Map'ine DOKUNMAZ. */
export function buildSectionDistributionSaveBody(
  edits: ReadonlyMap<string, SectionDistributionCellEdit>,
): SectionDistributionSaveBuild {
  if (edits.size > SECTION_DISTRIBUTION_MAX_CELLS) {
    return { body: { allocations: [] }, rejections: [], cellLimitExceeded: true };
  }

  const allocations: SectionDistributionCellInput[] = [];
  const rejections: SectionDistributionCellRejection[] = [];

  for (const edit of edits.values()) {
    const parsed = parseCellValue(edit.value, SECTION_QUANTITY_LIMITS);
    if (parsed.kind === "rejected") {
      rejections.push({ edit, reason: parsed.reason });
      continue;
    }
    allocations.push({
      boq_item_id: edit.boqItemId,
      section_id: edit.sectionId,
      // Anahtar HER ZAMAN var: boşaltma `null`, eksik alan backend'de 422.
      quantity: parsed.kind === "clear" ? null : parsed.quantity,
    });
  }

  return { body: { allocations }, rejections, cellLimitExceeded: false };
}
