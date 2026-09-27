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
  reason: DistributionCellRejectionReason;
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
}

/** Izgaranın kirli-hücre haritası için tek anahtar üreticisi. */
export function distributionCellKey(contractItemId: string, siteId: string): string {
  return `${contractItemId}|${siteId}`;
}

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

type ParsedCell =
  | { kind: "clear" }
  | { kind: "quantity"; quantity: string }
  | { kind: "rejected"; reason: DistributionCellRejectionReason };

/**
 * Ham metni gövde değerine çevirir. Ondalık ayırıcı olarak virgül de kabul
 * edilir (Türkçe klavye), backend'e her zaman nokta gider. Sayı `Number`a
 * ÇEVRİLİP geri basılmaz — kullanıcının yazdığı ondalık basamaklar kayıpsız
 * korunsun diye string olarak taşınır (`decimal.ts` disiplini).
 *
 * 🔴 KAYIT 426: `decimal.ts::normalizeDecimalInput` ile AYNI kural — virgül
 * VARSA ondan önceki noktalar TR binlik ayıracı sayılır ve silinir
 * ("1.234,56" → "1234.56"); virgül yoksa nokta ondalık ayıracı olarak KALIR.
 */
function parseCellValue(rawValue: string): ParsedCell {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return { kind: "clear" };

  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  if (!DECIMAL_PATTERN.test(normalized)) return { kind: "rejected", reason: "invalid" };
  if (Number(normalized) === 0) return { kind: "rejected", reason: "zero" };

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
  const allocationsByCell = new Map<string, ContractAllocationInput>();
  const rejectionsByCell = new Map<string, DistributionCellRejection>();

  for (const edit of edits) {
    const key = distributionCellKey(edit.contractItemId, edit.siteId);
    // Son düzenleme kazanır — önceki sonucu (kabul ya da ret) temizle.
    allocationsByCell.delete(key);
    rejectionsByCell.delete(key);

    const parsed = parseCellValue(edit.value);
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
  };
}

/** Ekranda basılacak Türkçe ret metni (tek kaynak — kopya cümle yazılmaz). */
export function distributionRejectionMessage(reason: DistributionCellRejectionReason): string {
  if (reason === "zero") {
    return "Miktar 0 olamaz — dağılımı kaldırmak için hücreyi boş bırakın.";
  }
  return "Miktar geçerli bir sayı olmalı (negatif değer kabul edilmez).";
}
