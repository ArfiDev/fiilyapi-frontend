import { siteDiaryLineKey } from "@/lib/api/hooks/site-diary-save-bodies";

import type { DiaryAddedLine, DiaryFormState } from "./form-state";

/**
 * GKS-F1.2a · önizleme geçişlerinin SAF kararları (React yok).
 *
 * Önizlemede (kayıtsız gün) bölüm/tarih değişince iskelet yeniden çekilir ve
 * satır anahtarları değişir; formda girilmiş satır verisi varsa kullanıcıya
 * sorulur (Ü3). Kayıtlı taslakta başlık bölümü değişince önizlemede olup
 * kayıtta olmayan kalemler sorulur (Ü5).
 */

function isFilled(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

/**
 * Formda girilmiş SATIR verisi taşıyan satır sayısı (onay metnindeki `{n}`):
 * dolu miktar hücresi, dolu gerekçe ya da eklenen satır olan DISTINCT
 * anahtarlar. İşçi/başlık alanları sayılmaz (bölüm değişince kaybolmazlar).
 */
export function countEnteredPreviewData(form: DiaryFormState): number {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(form.quantities)) if (isFilled(value)) keys.add(key);
  for (const [key, value] of Object.entries(form.overrunReasons)) if (isFilled(value)) keys.add(key);
  for (const line of form.addedLines) keys.add(siteDiaryLineKey(line.boqItemId, line.sectionId));
  return keys.size;
}

export function hasEnteredPreviewData(form: DiaryFormState): boolean {
  return countEnteredPreviewData(form) > 0;
}

/**
 * Ü5 — eksik anahtarlar = önizleme − kayıtlı satırlar − eklenenler. Çıktı
 * `addDiaryLines` girdisidir (`plannedQuantity` önizlemenin planlısı). Öksüz
 * (kalemsiz) önizleme satırı adreslenemez, atlanır; tekrar eden anahtar bir kez.
 */
export function missingSkeletonLines(
  skeleton: readonly { boq_item_id: string | null; section_id?: string | null; planned_quantity?: string | null }[],
  entryLines: readonly { boq_item_id: string | null; section_id?: string | null }[],
  added: readonly DiaryAddedLine[],
): DiaryAddedLine[] {
  const known = new Set<string>();
  for (const line of entryLines) {
    if (line.boq_item_id !== null) known.add(siteDiaryLineKey(line.boq_item_id, line.section_id));
  }
  for (const line of added) known.add(siteDiaryLineKey(line.boqItemId, line.sectionId));

  const missing: DiaryAddedLine[] = [];
  for (const line of skeleton) {
    if (line.boq_item_id === null) continue;
    const key = siteDiaryLineKey(line.boq_item_id, line.section_id);
    if (known.has(key)) continue;
    known.add(key);
    missing.push({
      boqItemId: line.boq_item_id,
      sectionId: line.section_id ?? null,
      plannedQuantity: line.planned_quantity ?? null,
    });
  }
  return missing;
}
