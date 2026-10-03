import type { EmployerDiarySuggestion, SubcontractorDiarySuggestion } from "@/lib/api/hooks/useDiarySuggestion";

import { trQuantityInputValue } from "@/components/contracts/employer-item-inline";

import type { PivotRow } from "./pivot";
import type { SubcontractorLineRow } from "./th-lines";

// F-SD T5 · "Günlükten Doldur" (spec §4) SAF mantığı — öneri satırları →
// form satırları. Bileşen/`fetch` YOK: eşleme, üzerine-yazma sayımı ve
// kullanıcıya basılacak Türkçe gerekçe metinleri burada üretilir, böylece
// tamamı testlenebilir.
//
// Uçların kendisi HİÇBİR ŞEY YAZMAZ (openapi: "hiçbir şey yazmaz"); bu modül
// yalnız form state'ini hazırlar, kaydetme mevcut `PUT …/lines` yolundan
// (`buildLinesSaveBody` / `buildSubcontractorLinesSaveBody`) yapılır.

export type EmployerSuggestionLine = EmployerDiarySuggestion["lines"][number];
export type SubcontractorSuggestionLine = SubcontractorDiarySuggestion["lines"][number];

/** Uçların ORTAK zarfı — `useDiaryFill` her iki öneriyi de bu şekilde okur. */
export interface DiarySuggestionEnvelope<TLine> {
  lines: TLine[];
  skipped_unbridged_count: number;
  reason: string | null;
}

export interface DiaryFillPlan {
  /** Öneriden gerçekten forma yazılan hücre/satır sayısı. */
  fillCount: number;
  /** Bunlardan KAÇI kullanıcının daha önce girdiği sıfırdan farklı miktarın üzerine yazıyor. */
  overwriteCount: number;
  /** Öneride gelip formda düzenlenebilir karşılığı OLMAYAN satır sayısı (sessiz yutma yok). */
  unmatchedCount: number;
}

export interface DiaryFillApplication<TRow> {
  rows: TRow[];
  plan: DiaryFillPlan;
}

/** İşveren pivot hücresinin kimliği: (kalem, şantiye) çifti — modül içi eşleme anahtarı. */
function diaryCellKey(contractItemId: string, siteId: string): string {
  return `${contractItemId}::${siteId}`;
}

/**
 * Ondalık string'in sıfırdan farklı olup olmadığı — `Number()` KULLANILMAZ
 * (kuruş hassasiyeti kuralı). "0", "0.000", "" sıfırdır; içinde 1-9 arası
 * bir rakam geçen her değer sıfırdan farklıdır.
 */
export function isNonZeroQuantity(raw: string): boolean {
  return /[1-9]/.test(raw);
}

function nextPlan(plan: DiaryFillPlan, patch: Partial<DiaryFillPlan>): DiaryFillPlan {
  return { ...plan, ...patch };
}

/**
 * İşveren önerisi → pivot satırları. Yalnız DÜZENLENEBİLİR (tahsisli) hücre
 * doldurulur; tahsissiz hücreye yazmak backend'de 422 üretirdi, bu yüzden o
 * satırlar `unmatchedCount`a yazılır ve kullanıcıya söylenir.
 */
export function applyEmployerDiarySuggestion(
  rows: readonly PivotRow[],
  lines: readonly EmployerSuggestionLine[],
): DiaryFillApplication<PivotRow> {
  const suggestionByKey = new Map<string, string>();
  for (const line of lines) {
    // 🔴 TKL-F8: hücre miktarı EKRAN METNİDİR (Türkçe) — öneri de aynı biçime çevrilir.
    suggestionByKey.set(
      diaryCellKey(line.contract_item_id, line.site_id),
      trQuantityInputValue(line.quantity),
    );
  }

  const matchedKeys = new Set<string>();
  let plan: DiaryFillPlan = { fillCount: 0, overwriteCount: 0, unmatchedCount: 0 };

  const nextRows = rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => {
      const key = diaryCellKey(row.item.id, cell.siteId);
      const suggested = suggestionByKey.get(key);
      if (suggested === undefined) return cell;
      if (!cell.editable) return cell;
      matchedKeys.add(key);
      // Değer zaten öneriyle aynı — "değiştirildi" diye sayılmaz.
      if (cell.quantity === suggested) return cell;
      if (isNonZeroQuantity(cell.quantity)) {
        plan = nextPlan(plan, { overwriteCount: plan.overwriteCount + 1 });
      }
      plan = nextPlan(plan, { fillCount: plan.fillCount + 1 });
      return { ...cell, quantity: suggested };
    }),
  }));

  plan = nextPlan(plan, {
    unmatchedCount: [...suggestionByKey.keys()].filter((key) => !matchedKeys.has(key)).length,
  });

  return { rows: nextRows, plan };
}

/**
 * Taşeron önerisi → kalem satırları. Kırılım YOK (şantiye sütunu yok), eşleme
 * doğrudan `contract_item_id` üzerinden yapılır; sözleşmede olmayan kaleme
 * gelen öneri `unmatchedCount`a yazılır.
 */
export function applySubcontractorDiarySuggestion(
  rows: readonly SubcontractorLineRow[],
  lines: readonly SubcontractorSuggestionLine[],
): DiaryFillApplication<SubcontractorLineRow> {
  const suggestionByItemId = new Map<string, string>();
  for (const line of lines) {
    // 🔴 TKL-F7b: satır miktarı EKRAN METNİDİR (Türkçe) — öneri de aynı biçime çevrilir.
    suggestionByItemId.set(line.contract_item_id, trQuantityInputValue(line.quantity));
  }

  const matchedIds = new Set<string>();
  let plan: DiaryFillPlan = { fillCount: 0, overwriteCount: 0, unmatchedCount: 0 };

  const nextRows = rows.map((row) => {
    const suggested = suggestionByItemId.get(row.itemId);
    if (suggested === undefined) return row;
    matchedIds.add(row.itemId);
    if (row.quantity === suggested) return row;
    if (isNonZeroQuantity(row.quantity)) {
      plan = nextPlan(plan, { overwriteCount: plan.overwriteCount + 1 });
    }
    plan = nextPlan(plan, { fillCount: plan.fillCount + 1 });
    return { ...row, quantity: suggested };
  });

  plan = nextPlan(plan, {
    unmatchedCount: [...suggestionByItemId.keys()].filter((id) => !matchedIds.has(id)).length,
  });

  return { rows: nextRows, plan };
}

export interface DiaryFillNotice {
  variant: "success" | "warning";
  text: string;
}

// F-P10 T2 · KARAR S1: eski "kalıcılık notu" (`DIARY_FILL_SOURCE_NOTE`)
// KALDIRILDI. Metin "satır kaynağı elle giriş olarak saklanır; rozet yalnız bu
// oturumda görünür" diyordu — SD-2 sunucu damgasından sonra bu YALAN oldu:
// kaydedilen satırın kaynağını sunucu türetip KALICI olarak damgalıyor.

/** Öneri hiç satır döndürmediğinde basılan Türkçe gerekçe (sessiz boşluk yok). */
export const DIARY_FILL_EMPTY_TEXT = "Günlük kayıtlardan doldurulacak miktar bulunamadı.";

/** Uç hata verdiğinde basılan Türkçe varsayılan (çağıran `backendErrorMessage` ile birleştirir). */
export const DIARY_FILL_ERROR_FALLBACK = "Günlük önerisi alınamadı.";

/**
 * Uygulama sonucunun kullanıcıya görünen özeti. Dört dürüstlük korkuluğu da
 * BURADA metinleşir: atlanan (köprülenmemiş) poz, formda karşılığı olmayan
 * satır, boş öneri ve üzerine yazma. Hiçbiri sessizce yutulmaz.
 */
export function buildDiaryFillNotice(
  plan: DiaryFillPlan,
  meta: { lineCount: number; skippedUnbridgedCount: number; reason: string | null },
): DiaryFillNotice {
  const parts: string[] = [];

  if (meta.lineCount === 0) {
    parts.push(DIARY_FILL_EMPTY_TEXT);
  } else if (plan.fillCount === 0) {
    parts.push("Günlük önerisi mevcut miktarlarla aynı; hiçbir satır değişmedi.");
  } else {
    parts.push(`${plan.fillCount} satır günlük kayıtlardan dolduruldu.`);
  }

  if (plan.overwriteCount > 0) {
    parts.push(`Bunlardan ${plan.overwriteCount} satırda elle girdiğiniz miktarın üzerine yazıldı.`);
  }
  if (meta.skippedUnbridgedCount > 0) {
    parts.push(
      `${meta.skippedUnbridgedCount} günlük pozu sözleşme kalemine bağlı olmadığı için atlandı; bu miktarlar hakedişe aktarılmadı.`,
    );
  }
  if (plan.unmatchedCount > 0) {
    parts.push(
      `Öneriden ${plan.unmatchedCount} satır bu formda karşılık bulamadı (poz bu hakedişte düzenlenemiyor).`,
    );
  }
  if (meta.reason) {
    parts.push(meta.reason);
  }

  const isWarning =
    meta.lineCount === 0 ||
    plan.fillCount === 0 ||
    meta.skippedUnbridgedCount > 0 ||
    plan.unmatchedCount > 0;

  return {
    variant: isWarning ? "warning" : "success",
    text: parts.join(" "),
  };
}

/** Üzerine yazma onay penceresinin Türkçe metni (mevcut `ConfirmDialog` deseni). */
export function diaryOverwriteConfirmMessage(overwriteCount: number): string {
  return `${overwriteCount} satırda elle girdiğiniz sıfırdan farklı miktar var. Günlük önerisi bu miktarların ÜZERİNE yazılacak. Devam edilsin mi?`;
}
