/**
 * F-UNIT2 · EI 94-196 doğrulama/sonuç yüzeylerinin SAF yardımcıları.
 *
 * 🔴 SESSİZ BAŞARISIZLIK YASAK. Bu modülün var oluş gerekçesi üç ölçülmüş
 * sunucu kararıdır:
 *
 * 1. `UnitImportSummary` DEĞİŞMEZİ: `valid + warning + error == total_rows`.
 *    Tutmuyorsa tablo da güvenilmezdir; `checkImportSummary` bunu BİLDİRİR,
 *    ekran sayaçları sessizce çizmez.
 * 2. **HİÇ GEÇERLİ SATIR YOKSA SUNUCU 422 DÖNER.** `router.py`/`importer.py`:
 *    *"Hic gecerli satir yoksa 422 — `created=0` ile 200 donmek kullanicinin
 *    'aktarildi' sanmasina yol acardi."* Bu beklenti `serverWillReject`
 *    bayrağıyla TİPTE kodlanır; ekran "Aktar" düğmesini o hâlde açmaz.
 * 3. `messages` bir **LİSTEDİR**, tek metin değil (EI 161 bir satırda İKİ
 *    mesaj gösterir). Bu modül onları HİÇBİR YERDE birleştirmez — birleştiren
 *    tek metin, mesajları ayrı gösterme imkânını kalıcı olarak yok ederdi.
 *
 * Satır süzgeci `status` üzerinden çalışır ve satır başına TEK durum vardır
 * (`UnitImportRowStatus` docstring'i: hatalı satır ayrıca "uyarılı" OLMAZ).
 */

import type { components } from "@/lib/api/schema";

import {
  IMPORT_EMPTY_FILE_MESSAGE,
  IMPORT_NOTHING_IMPORTABLE_MESSAGE,
  IMPORT_SUMMARY_INCONSISTENT_MESSAGE,
} from "./constants";
import type { DeepScale } from "@/lib/api/scale";

export type UnitImportRowReport = DeepScale<components["schemas"]["UnitImportRowReport"]>;
export type UnitImportRowStatus = components["schemas"]["UnitImportRowStatus"];
export type UnitImportSummary = DeepScale<components["schemas"]["UnitImportSummary"]>;
export type UnitImportValidation = DeepScale<components["schemas"]["UnitImportValidation"]>;
export type UnitImportResult = DeepScale<components["schemas"]["UnitImportResult"]>;

/** EI 110-112 — üç düğme. "Tümü" süzgeçsiz hâldir. */
export type ImportRowFilter = "all" | "error" | "warning";

export interface ImportFilterCounts {
  all: number;
  error: number;
  warning: number;
}

export interface ImportSummaryCheck {
  consistent: boolean;
  /** Tutarsızlığın kullanıcıya GÖRÜNEN gerekçesi; tutarlıysa `null`. */
  message: string | null;
}

/**
 * Doğrulamanın ayrık sonucu. `serverWillReject` sunucunun 422 döneceğini
 * ÖNCEDEN söyler — ekran boşuna bir yükleme yaptırmaz ve "aktarıldı"
 * izlenimini asla üretmez.
 */
export type ImportValidationOutcome =
  | { kind: "inconsistent"; message: string; serverWillReject: boolean }
  | { kind: "empty"; message: string; serverWillReject: true }
  | { kind: "nothing_importable"; message: string; serverWillReject: true }
  | { kind: "ready"; importableCount: number; serverWillReject: false };

export interface BlocksToCreate {
  count: number;
  names: readonly string[];
}

export type ImportResultOutcome =
  | { kind: "nothing_created"; created: 0; skipped: number; message: string }
  | { kind: "partial"; created: number; skipped: number; blocksCreated: number }
  | { kind: "all_created"; created: number; blocksCreated: number };

/** Yeni dizi döner; girdi dizisi MUTASYONA UĞRAMAZ. */
export function filterImportRows(
  rows: readonly UnitImportRowReport[],
  filter: ImportRowFilter,
): readonly UnitImportRowReport[] {
  if (filter === "all") return [...rows];
  const wanted: UnitImportRowStatus = filter === "error" ? "error" : "warning";
  return rows.filter((row) => row.status === wanted);
}

/**
 * Rozet sayıları ÖZETTEN gelir, satır listesinden değil.
 *
 * 🔴 GEREKÇE DÜZELTİLDİ (F-UNIT2 final review): burada önce *"yanıt hataların
 * yalnız ilk 50'sini taşıyabilir (`MAX_REPORTED_ERRORS`)"* yazıyordu. ÖLÇÜLDÜ:
 * `MAX_REPORTED_ERRORS` `importer.py:31`de TANIMLI ama backend'in HİÇBİR
 * yerinde KULLANILMIYOR; `batch.py` `rows`u EKSİKSİZ döndürüyor. Uydurulmuş
 * bir gerekçe, doğru koddan daha tehlikelidir: bir sonraki ajan onu veri
 * sayarak "kırpma" mantığı yazmaya kalkardı.
 *
 * GERÇEK gerekçe: `summary` sunucunun KENDİ sayımıdır ve tek otoritedir.
 * Rozetleri `rows`tan saymak, rozeti istemcinin O AN elinde tuttuğu alt kümeye
 * bağlardı — süzgeç sekmeleri (EI 110-112) listeyi zaten daraltıyor ve uç
 * SAYFALANIRSA (bugün değil) sayı sessizce yanlışa döner. Değişmez
 * `valid + warning + error == total_rows` da `summary` üzerinde denetlenir
 * (`checkImportSummary`), yani iki sayı iki kaynaktan gelmez.
 */
export function importFilterCounts(summary: UnitImportSummary): ImportFilterCounts {
  return { all: summary.total_rows, error: summary.error, warning: summary.warning };
}

export function checkImportSummary(summary: UnitImportSummary): ImportSummaryCheck {
  const consistent = summary.valid + summary.warning + summary.error === summary.total_rows;
  return { consistent, message: consistent ? null : IMPORT_SUMMARY_INCONSISTENT_MESSAGE };
}

/**
 * EI 192 kutucuğu aktarılacak satır sayısını DEĞİŞTİRİR: `include_warnings`
 * kapalıyken uyarılı satırlar yazılmaz. EI 202'nin sayısı ("22 Geçerli Satırı
 * Aktar") buradan çıkar.
 */
export function deriveValidationOutcome(
  validation: UnitImportValidation,
  options: { includeWarnings: boolean },
): ImportValidationOutcome {
  const { summary } = validation;

  // Güvenilmez sayaçların üstüne hiçbir sınıflandırma kurulmaz.
  const check = checkImportSummary(summary);
  if (!check.consistent) {
    return {
      kind: "inconsistent",
      message: IMPORT_SUMMARY_INCONSISTENT_MESSAGE,
      // Sayaçlar tutmuyorsa sunucunun ne yapacağı BİLİNEMEZ; "reddedecek"
      // demek de bir iddiadır ve uydurulmaz.
      serverWillReject: summary.total_rows === 0,
    };
  }

  if (summary.total_rows === 0) {
    return { kind: "empty", message: IMPORT_EMPTY_FILE_MESSAGE, serverWillReject: true };
  }

  const importableCount = summary.valid + (options.includeWarnings ? summary.warning : 0);
  if (importableCount === 0) {
    return {
      kind: "nothing_importable",
      message: IMPORT_NOTHING_IMPORTABLE_MESSAGE,
      serverWillReject: true,
    };
  }

  return { kind: "ready", importableCount, serverWillReject: false };
}

/**
 * `blocks_to_create` EI'de kutusu OLMAYAN bir alandır ama gösterilir: içe
 * aktarma projede olmayan blokları AÇAR ve bunu söylememek sessiz sürpriz
 * olurdu (kullanıcı yazım hatası yüzünden "D Blok" açtığını sonradan fark eder).
 */
export function describeBlocksToCreate(validation: UnitImportValidation): BlocksToCreate | null {
  const names = validation.blocks_to_create;
  if (names.length === 0) return null;
  return { count: names.length, names: [...names] };
}

/**
 * EI 202 sonrası. `created` / `skipped` AÇIKÇA basılır — kısmi aktarım
 * sunucunun bilinçli davranışıdır (*"gecerli satirlar yazilir, hatalilar
 * raporlanir"*).
 *
 * 🔴 `created === 0` ile gelen bir 200 SÖZLEŞME DIŞIDIR (sunucu o hâlde 422
 * döner). Yine de "hepsi yazıldı" dalına düşürülmez: beklenmeyen yanıt
 * BAŞARI diye gösterilirse kullanıcı hiçbir şey yazılmadığını asla öğrenemez.
 */
export function deriveImportResultOutcome(result: UnitImportResult): ImportResultOutcome {
  if (result.created === 0) {
    return {
      kind: "nothing_created",
      created: 0,
      skipped: result.skipped,
      message: IMPORT_NOTHING_IMPORTABLE_MESSAGE,
    };
  }
  if (result.skipped > 0) {
    return {
      kind: "partial",
      created: result.created,
      skipped: result.skipped,
      blocksCreated: result.blocks_created,
    };
  }
  return { kind: "all_created", created: result.created, blocksCreated: result.blocks_created };
}
