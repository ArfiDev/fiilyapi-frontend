import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

export type ContractDistributionSave = DeepScale<components["schemas"]["ContractDistributionSave"]>;
export type ContractAllocationInput = DeepScale<components["schemas"]["ContractAllocationInput"]>;

/**
 * F-P5 · POZ dağılımı kaydetme gövdesi — **BİRLEŞTİRME (merge) semantiği**.
 *
 * ⚠️ Bu uç, hakediş (`PUT /progress-payments/{id}/lines`) ve puantaj
 * PUT'larının TAM TERSİDİR. Orada gövde KAPSAMIN TAMAMINI basar ve gövdede
 * geçmeyen kayıt SİLİNİR. Burada ise:
 *
 *   1. yalnız **KİRLİ** (kullanıcının dokunduğu) hücreler gövdeye girer;
 *   2. **boşaltılan** hücre `quantity: null` ile gider → bağ KOPARILIR
 *      (satır silinmez, SET NULL);
 *   3. **dokunulmamış** hücre GÖNDERİLMEZ ve sunucuda AYNEN KORUNUR;
 *   4. **`0` ASLA gönderilmez** — backend 422 döner. "Boş = null" kuralı
 *      tektir; `0` yazan kullanıcıya görünür hata gösterilir, sessizce `null`a
 *      ÇEVRİLMEZ (bu, kullanıcının niyetini sessizce değiştirmek olurdu).
 *
 * Bu modül SAFtır (React yok): mutasyon hook'u da (`useSaveContractDistribution`)
 * dağılım ızgarası da aynı üreticiyi kullanır, kural iki yerde yazılmaz.
 */

/** Kullanıcının bir hücreye yazdığı HAM metin — ızgaranın kirli-hücre kaydı. */
export interface DistributionCellEdit {
  contractItemId: string;
  siteId: string;
  /** Ham girdi metni. Boş/yalnız boşluk ⇒ bağ koparma (`quantity: null`). */
  value: string;
}

/** Gövdeye GİRMEYEN hücrenin gerekçesi — çağıran görünür hata basar. */
export type DistributionCellRejectionReason =
  /** `0` yazıldı — backend 422 verirdi; boşaltmak isteniyorsa hücre BOŞ bırakılır. */
  | "zero"
  /** Sayıya çevrilemedi ya da negatif. */
  | "invalid";

export interface DistributionCellRejection {
  edit: DistributionCellEdit;
  reason: DigitLimitedRejectionReason;
}

/**
 * Şemada `allocations` isteğe bağlıdır (varsayılanı boş dizi); bu üretici onu
 * HER ZAMAN basar, böylece çağıran tarafta `undefined` kontrolü gerekmez.
 */
export type DistributionSaveBody = ContractDistributionSave &
  Required<Pick<ContractDistributionSave, "allocations">>;

export interface DistributionSaveBuild {
  /** `PUT /projects/{id}/contract/distribution` gövdesi — YALNIZ kirli hücreler. */
  body: DistributionSaveBody;
  /** Gövdeye alınmayan hücreler; boş değilse kaydetme AKIŞI DURDURULUR. */
  rejections: DistributionCellRejection[];
  /** true ⇒ kirli hücre sayısı tavanı aştı; gövde KURULMADI (`allocations` boş). */
  cellLimitExceeded: boolean;
}

/** Izgaranın kirli-hücre haritası için tek anahtar üreticisi. */
export function distributionCellKey(contractItemId: string, siteId: string): string {
  return `${contractItemId}|${siteId}`;
}

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

type ParsedCell<R extends string = DistributionCellRejectionReason> =
  | { kind: "clear" }
  | { kind: "quantity"; quantity: string }
  | { kind: "rejected"; reason: R };

/**
 * OPSİYONEL hane sınırı (BDG: `Numeric(14, 3)` = en çok 11 tam + 3 ondalık).
 * Verilmezse sınır YOK — sözleşme ucunun davranışı aynen kalır.
 */
export interface CellDigitLimits {
  maxWholeDigits: number;
  maxDecimalDigits: number;
}

/** Hane sınırı verildiğinde eklenen ret gerekçesi (aşım ya da bilimsel gösterim). */
export type DigitLimitedRejectionReason = DistributionCellRejectionReason | "digits";

/**
 * Backend miktar sütunları `Numeric(14, 3)` (openapi: max_digits 14, decimal 3)
 * ⇒ en çok 11 tam + 3 ondalık hane. Bölüm dağılımı, sözleşme POZ dağılımı ve
 * BOQ tahsis girişi AYNI sınırı paylaşır — TEK kopya burasıdır.
 */
export const QUANTITY_DIGIT_LIMITS: CellDigitLimits = {
  maxWholeDigits: 11,
  maxDecimalDigits: 3,
};

/** `QUANTITY_DIGIT_LIMITS` aşımının tek ekran metni (BDG ile aynı). */
export const QUANTITY_DIGIT_LIMIT_MESSAGE = "En çok 11 tam ve 3 ondalık hane girilebilir.";

/** openapi `ContractDistributionSave.allocations.maxItems` ile AYNI değer (bkz. test). */
export const CONTRACT_DISTRIBUTION_MAX_CELLS = 20000;

const SCIENTIFIC_PATTERN = /^\d*[.,]?\d*e[+-]?\d+$/i;

function exceedsDigitLimits(normalized: string, limits: CellDigitLimits): boolean {
  const [whole, fraction = ""] = normalized.split(".");
  // Backend deseni baştaki ve sondaki sıfırları saymaz (`0*` ... `0*$`).
  return (
    whole.replace(/^0+/, "").length > limits.maxWholeDigits ||
    fraction.replace(/0+$/, "").length > limits.maxDecimalDigits
  );
}

/**
 * `QUANTITY_DIGIT_LIMITS` aşımı — `normalizeDecimalInput` çıktısı gibi ZATEN
 * normalleşmiş ("1234.5") metin için. `parseCellValue` kullanamayan çağıranlar
 * (BOQ tahsis kartı: `0` ve işaret kuralı farklıdır) ikinci bir sayaç yazmasın
 * diye aynı sayaç buradan açılır.
 */
export function exceedsQuantityDigitLimits(normalized: string): boolean {
  return exceedsDigitLimits(normalized.replace(/^[-+]/, ""), QUANTITY_DIGIT_LIMITS);
}

/**
 * Ham metni gövde değerine çevirir. Ondalık ayırıcı olarak virgül de kabul
 * edilir (Türkçe klavye), backend'e her zaman nokta gider. Sayı `Number`a
 * ÇEVRİLİP geri basılmaz — kullanıcının yazdığı ondalık basamaklar kayıpsız
 * korunsun diye string olarak taşınır (`decimal.ts` disiplini).
 *
 * 🔴 KAYIT 426: `decimal.ts::normalizeDecimalInput` ile AYNI kural — virgül
 * VARSA ondan önceki noktalar TR binlik ayıracı sayılır ve silinir
 * ("1.234,56" → "1234.56"); virgül yoksa nokta ondalık ayıracı olarak KALIR.
 *
 * `limits` verilmezse sınır yoktur (sözleşme çağrısı). Verilirse aşım ve
 * bilimsel gösterim ("1e30") tek `"digits"` gerekçesiyle reddedilir.
 */
export function parseCellValue(rawValue: string): ParsedCell;
export function parseCellValue(
  rawValue: string,
  limits: CellDigitLimits,
): ParsedCell<DigitLimitedRejectionReason>;
export function parseCellValue(
  rawValue: string,
  limits?: CellDigitLimits,
): ParsedCell<DigitLimitedRejectionReason> {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return { kind: "clear" };

  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  if (!DECIMAL_PATTERN.test(normalized)) {
    if (limits && SCIENTIFIC_PATTERN.test(normalized)) {
      return { kind: "rejected", reason: "digits" };
    }
    return { kind: "rejected", reason: "invalid" };
  }
  if (Number(normalized) === 0) return { kind: "rejected", reason: "zero" };
  if (limits && exceedsDigitLimits(normalized, limits)) {
    return { kind: "rejected", reason: "digits" };
  }

  return { kind: "quantity", quantity: normalized };
}

/**
 * Kirli hücrelerden BİRLEŞTİRME gövdesi üretir.
 *
 * Aynı hücre birden çok kez geçerse SON düzenleme kazanır (ızgara kirli
 * haritasını sırayla boşaltırsa çift kayıt oluşmasın diye).
 */
export function buildDistributionSaveBody(
  edits: readonly DistributionCellEdit[],
): DistributionSaveBuild {
  if (edits.length > CONTRACT_DISTRIBUTION_MAX_CELLS) {
    return { body: { allocations: [] }, rejections: [], cellLimitExceeded: true };
  }
  const allocationsByCell = new Map<string, ContractAllocationInput>();
  const rejectionsByCell = new Map<string, DistributionCellRejection>();

  for (const edit of edits) {
    const key = distributionCellKey(edit.contractItemId, edit.siteId);
    // Son düzenleme kazanır — önceki sonucu (kabul ya da ret) temizle.
    allocationsByCell.delete(key);
    rejectionsByCell.delete(key);

    const parsed = parseCellValue(edit.value, QUANTITY_DIGIT_LIMITS);
    if (parsed.kind === "rejected") {
      rejectionsByCell.set(key, { edit, reason: parsed.reason });
      continue;
    }
    allocationsByCell.set(key, {
      contract_item_id: edit.contractItemId,
      site_id: edit.siteId,
      // Boşaltılan hücre: `null` ⇒ bağ koparma. `0` BURAYA HİÇ ULAŞMAZ.
      quantity: parsed.kind === "clear" ? null : parsed.quantity,
    });
  }

  return {
    body: { allocations: [...allocationsByCell.values()] },
    rejections: [...rejectionsByCell.values()],
    cellLimitExceeded: false,
  };
}

/** Ekranda basılacak Türkçe ret metni (tek kaynak — kopya cümle yazılmaz). */
export function distributionRejectionMessage(reason: DigitLimitedRejectionReason): string {
  if (reason === "zero") {
    return "Miktar 0 olamaz — dağılımı kaldırmak için hücreyi boş bırakın.";
  }
  if (reason === "digits") return QUANTITY_DIGIT_LIMIT_MESSAGE;
  return "Miktar geçerli bir sayı olmalı (negatif değer kabul edilmez).";
}

export function distributionCellLimitMessage(): string {
  return `Tek seferde en çok ${CONTRACT_DISTRIBUTION_MAX_CELLS.toLocaleString("tr-TR")} hücre kaydedilebilir.`;
}
