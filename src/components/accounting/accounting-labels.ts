import type { BadgeVariant } from "@/components/ui";
import type { JournalEntryStatus } from "@/lib/api/hooks/useJournalEntries";
import { routes } from "@/lib/routes";

/**
 * F-MU1 · Muhasebe ekranlarının SAF katmanı: dönem aritmetiği, durum
 * etiketleri, eylem görünürlüğü ve devre-dışı gerekçeleri.
 *
 * Kanonik mockup: `Ekran 8 - Muhasebe.dc.html` (E8). Yorumlardaki sayılar O
 * dosyanın SATIR numaralarıdır. Bu modülde AĞ ve DOM yoktur; testi
 * `accounting-labels.test.ts`te yaşar.
 */

/** İzin matrisi anahtarı — muhasebe uçlarını `accounting` modülü denetler. */
export const ACCOUNTING_PERMISSION_MODULE = "accounting";

export const ACCOUNTING_URL = routes.accounting.root();

// --- Dönem (E8:74-77 `‹ Temmuz 2026 ›`) ----------------------------------

export interface Period {
  year: number;
  /** 1-12. */
  month: number;
}

/**
 * 🔴 YEREL TAKVİM: `getFullYear()/getMonth()` okunur, `toISOString()` İLE
 * DEĞİL — o UTC'ye çevirir ve TR saatinde ayın ilk/son günlerinde dönemi bir
 * ay kaydırırdı (TB5 dersi: üretimde aynı sınıf hata bulundu).
 */
export function currentPeriod(today: Date): Period {
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/** `‹`/`›` düğmeleri: ay taşarsa YIL da döner (Aralık → Ocak). */
export function shiftPeriod(period: Period, delta: number): Period {
  const zeroBased = period.month - 1 + delta;
  return {
    year: period.year + Math.floor(zeroBased / 12),
    month: ((zeroBased % 12) + 12) % 12 + 1,
  };
}

// --- Durum (YÖNETİM KARARI 1: etiketler BİREBİR) -------------------------

/**
 * 🔴 Üç durumun Türkçe karşılığı yönetim kararıyla SABİTLENDİ; mockup'ta fiş
 * listesi hiç çizilmediği için başka bir kaynak YOKTUR.
 */
export const JOURNAL_STATUS_LABELS: Record<JournalEntryStatus, string> = {
  draft: "Taslak",
  posted: "Kayıtlı",
  reversed: "Ters Kayıtlı",
};

export function journalStatusLabel(status: JournalEntryStatus): string {
  return JOURNAL_STATUS_LABELS[status];
}

export function journalStatusVariant(status: JournalEntryStatus): BadgeVariant {
  if (status === "posted") return "success";
  if (status === "reversed") return "danger";
  return "neutral";
}

// --- Eylem görünürlüğü (YÖNETİM KARARI 2) --------------------------------

export interface EntryActions {
  canEdit: boolean;
  canDelete: boolean;
  /** `draft → posted`. */
  canPost: boolean;
  /** `posted → reversed` + storno. */
  canReverse: boolean;
}

/**
 * 🔴 Karar: `posted` fişte düzenle/sil **HİÇ SUNULMAZ**. Sunucu ikisini de
 * **409** ile reddeder; 409'u kullanıcıya hata olarak göstermek yerine eylemi
 * hiç sunmamak doğru davranıştır (tıklanabilir ama her zaman patlayan bir
 * düğme, kullanıcıya var olmayan bir yetenek vaat eder).
 *
 * `reversed` uçtur: ne düzenlenir, ne silinir, ne yeniden stornolanır
 * (sonsuz zincir — sunucu da 409 verir).
 */
export function entryActions(status: JournalEntryStatus): EntryActions {
  if (status === "draft") {
    return { canEdit: true, canDelete: true, canPost: true, canReverse: false };
  }
  if (status === "posted") {
    return { canEdit: false, canDelete: false, canPost: false, canReverse: true };
  }
  return { canEdit: false, canDelete: false, canPost: false, canReverse: false };
}

// --- Para tonları --------------------------------------------------------

export type AmountTone = "success" | "danger" | "neutral";

/**
 * E8:88 Net Bakiye kartı yalnız POZİTİF bir örnek verir (`₺ 277.400` yeşil).
 * `net_balance = ALACAK − BORÇ` pekâlâ negatif olabilir — o hâlde yeşil
 * basmak sayının işaretini GİZLERDİ. Şef kararı: negatif kırmızı, pozitif
 * yeşil, tam sıfır nötr.
 */
export function netBalanceTone(value: string | null): AmountTone {
  // IZN-F4b.2 — `null` (gizli) işaretsizdir → nötr.
  if (value === null) return "neutral";
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "neutral";
  return amount > 0 ? "success" : "danger";
}

/**
 * `carried_balance` pencere ÖNCESİ toplamdır: sıfır değilse ilk satırın
 * `running_balance`ı sıfırdan başlamaz ve açıklanamaz görünür. Bu yüzden
 * tablonun ÜSTÜNDE görünür bir devir satırı basılır.
 */
export function hasCarriedBalance(value: string | null | undefined): boolean {
  // `null` (IZN-F4b.2, rol için gizli) devir satırı BASILMAZ; sütun zaten `—` gösterir.
  if (value === undefined || value === null) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount !== 0;
}

// --- Devre-dışı gerekçeleri (kanon: SİLİNMEZ, gerekçesi GÖRÜNÜR) ---------

export const ACCOUNTING_REASONS = {
  /**
   * E8:66 / MP:146 "Excel" — 🔴 EXPORT-XLSX (2026-08-31) ile UÇ AÇILDI
   * (`GET /journal/export.xlsx`) ve düğme GERÇEK; bu anahtar artık HİÇBİR
   * ekrandan okunmuyor. SİLİNMEDİ çünkü backend'in `pending_module` alanı da
   * bu adı gönderebiliyor; metni `pending-modules.ts`te durur.
   */
  export: "accounting_export",
  /**
   * HP:49 "Excel" — 🔴 EXPORT-XLSX ile UÇ AÇILDI
   * (`GET /chart-of-accounts/export.xlsx`); anahtar aynı gerekçeyle
   * (backend `pending_module` gönderebiliyor) SİLİNMEDİ, ekrandan okunmuyor.
   */
  chartExport: "chart_of_accounts_export",
  /**
   * MZ:49 "PDF" — 🔴 EXPORT-XLSX: MZ:48 "Excel" ARTIK GERÇEK
   * (`GET /trial-balance/export.xlsx`), düğme etkinleştirildi. Geriye YALNIZ
   * PDF kaldı ve o kendi anahtarını okur; eski `trial_balance_export` metni
   * "Excel de PDF de" diyerek yalan söylerdi.
   */
  trialBalancePdfExport: "trial_balance_pdf_export",
  /** KDV:48-49 "XML İndir"/"GİB'e Gönder" — F-MU2 K6. */
  vatReturnGib: "vat_return_gib",
  /** BM:83 "↑ İçe Aktar" — F-MUP: ekstre satırları hiçbir yerde saklanmıyor. */
  bankStatementImport: "bank_statement_import",
  /** BM:90 "Banka Ekstresindeki Bakiye" kartı — F-MUP. */
  bankStatementBalance: "bank_statement_balance",
  /** BM:76 "Mutabakat Yap" + BM:100 "Fark" kartı — F-MUP. */
  bankReconciliationRun: "bank_reconciliation_run",
  /** Yazma yetkisi yoksa. */
  write: "Bu muhasebe sayfasında Düzenler yetkisi gerekir.",
} as const;
