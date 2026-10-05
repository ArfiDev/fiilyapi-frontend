/**
 * F-SA T3 · FST (`projedesign/Form - Satinalma Talebi.dc.html`) formunun SABİT
 * metinleri. Parantez içi sayılar O DOSYANIN satır numaralarıdır.
 *
 * Ekran bileşenleri kendi cümlelerini gömmez; hepsi buradan gelir (F-ST/F-P5
 * deseni) — böylece pending gerekçeleri tek yerden okunur ve testler aynı
 * kaynağı iddia eder.
 *
 * ⚠️ ONAY EŞİĞİ METNİ BURADA YOKTUR: tek kaynağı
 * `purchase-request-approval.ts`tir (spec K6). Buraya "500K" yazmak bulgudur.
 */

import type { DocumentPlaceholderItem } from "@/components/form-shell";
import type { PurchasePriority } from "@/lib/api/hooks/usePurchaseRequests";
import { pendingModuleLabel } from "@/lib/pending-modules";

/** Boş/─ hücre işareti — SAT/E3 tablolarıyla aynı. */
export const EMPTY_VALUE = "—";

export const PURCHASE_REQUEST_FORM_TITLE = "Satın Alma Talebi"; // 47
export const PURCHASE_REQUEST_FORM_SUBTITLE =
  "Talep onaylandıktan sonra tedarikçilerden teklif toplanır"; // 48

/** 36 — kırıntı yolunun son parçası. */
export const PURCHASE_REQUEST_FORM_BREADCRUMB = "Yeni Talep";

/**
 * 53 "Talep No" — SUNUCU üretir. Form açılırken değer YOKTUR ve istemci
 * numara UYDURMAZ (mockup'ın "SAT-2026-0058"i ÖRNEK VERİDİR). Kutu yerinde
 * durur, salt-okunurdur ve bu yer tutucuyu gösterir.
 */
export const PURCHASE_REQUEST_NO_PLACEHOLDER = "Kaydedince atanır";
export const PURCHASE_REQUEST_NO_HINT =
  "Talep numarasını sunucu üretir — kayıttan sonra burada görünür.";

/** 58 alt ipucu (mockup'ın kendi cümlesi). */
export const NEEDED_BY_HINT = "Bu tarihe kadar sahada olmalı";

/** 62 yer tutucusu (mockup'ın kendi cümlesi). */
export const JUSTIFICATION_PLACEHOLDER = "Neden gerekiyor, hangi iş için...";

/** 130 — mockup'ın kendi tavsiyesi. */
export const SUPPLIER_HINT = "En az 3 tedarikçiden teklif alınması önerilir";

export const SELECT_PLACEHOLDER = "Seçiniz...";

/** `PurchasePriority` KAPALI kümedir; üçünün üçü de eşlenir (55). */
export interface PriorityOption {
  value: PurchasePriority;
  label: string;
}

/**
 * 55 — mockup üç seçenek çizer: "Normal" · "Acil" · "Kritik — Stok Bitti".
 * Üçüncüsünün ŞEMA karşılığı `critical`tir; mockup'ın açıklayıcı son eki
 * ("— Stok Bitti") o kalemin durumuna dair bir İDDİADIR ve talebe ait bir veri
 * değildir → etiket `purchasing-labels.ts`teki kanonla aynı kalır.
 */
export const PURCHASE_PRIORITY_OPTIONS: readonly PriorityOption[] = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Acil" },
  { value: "critical", label: "Kritik" },
];

/** openapi `PurchaseRequestCreate` / `PurchaseRequestLineCreate` uzunluk tavanları. */
export const MAX_LENGTH = {
  freeTextName: 200,
  freeTextUnit: 20,
  justification: 2000,
} as const;

/* ── PENDING YÜZEYLER ─────────────────────────────────────────────────────
 * ORTAK kural (WORKFLOW §3 · F-ST/F-P5 deseni): mockup'taki alan/kutu
 * SİLİNMEZ, yerinde devre dışı + GÖRÜNÜR gerekçeyle basılır ve gövdeye
 * HİÇBİR anahtar eklemez. Yapısal güvencesi `purchase-request-form-state.ts`
 * tedir: bu yüzeylerin form durumunda KARŞILIĞI YOK.
 * ---------------------------------------------------------------------- */

/**
 * 125-128 "Teklif İstenecek Tedarikçiler" — şemada KOLON YOKTUR
 * (`PurchaseRequestCreate` açıklaması: "FST'nin 'Teklif Istenecek
 * Tedarikciler' listesi ve 'Odeme Vadesi Tercihi' burada YOKTUR").
 * Tedarikçiler GERÇEK listeden basılır (uydurma ad yok) ama kutucuklar
 * seçilemez: seçili bir kutu "bu tedarikçilerden teklif istenecek" derdi.
 */
export const QUOTE_SUPPLIERS_PENDING_REASON = pendingModuleLabel("purchase_quote_suppliers");

/** 134 "Ödeme Vadesi Tercihi" — aynı gerekçe, ayrı alan. */
export const PAYMENT_TERMS_PENDING_REASON = pendingModuleLabel("purchase_payment_terms");

/** 135 "Teklif isteme e-postası otomatik gönderilsin" — bildirim yüzeyi yok. */
export const SUPPLIER_EMAIL_LABEL = "Teklif isteme e-postası otomatik gönderilsin"; // 135
export const SUPPLIER_EMAIL_PENDING_REASON = pendingModuleLabel("purchase_supplier_email");

/** 140-153 "Ekler" — BC (belge arşivi) form-slot bağı henüz YOK. */
export const PURCHASE_REQUEST_DOCUMENTS_TITLE = "📎 Ekler"; // 141
export const PURCHASE_REQUEST_DOCUMENTS_PENDING_REASON = pendingModuleLabel("documents");

export const PURCHASE_REQUEST_DOCUMENTS: readonly DocumentPlaceholderItem[] = [
  {
    emoji: "📋",
    iconBg: "var(--color-primary-soft)", // #dbeafe (145)
    title: "Teknik Şartname", // 146
    subtitle: "Malzeme özellikleri", // 146
  },
  {
    emoji: "📷",
    iconBg: "var(--color-success-tint)", // #f0fdf4 (150)
    title: "Görsel / Numune Fotoğrafı", // 151
    subtitle: "Referans görseller", // 151
  },
];

/* ── LİSTE DURUM CÜMLELERİ ────────────────────────────────────────────────
 * Sessiz boş açılır liste YASAK: her durum görünür bir cümleyle anlatılır
 * (F-ST `itemsNote` deseni).
 * ---------------------------------------------------------------------- */

export const PROJECTS_LOAD_ERROR = "Proje listesi yüklenemedi — sayfayı tazeleyip tekrar deneyin.";
export const SITES_LOAD_ERROR = "Şantiye listesi yüklenemedi — sayfayı tazeleyip tekrar deneyin.";
export const SECTIONS_LOAD_ERROR = "Bölüm listesi yüklenemedi — sayfayı tazeleyip tekrar deneyin.";
export const SITE_NEEDS_PROJECT = "Önce proje seçin.";
export const SECTION_NEEDS_SITE = "Önce şantiye seçin.";
export const SITE_LIST_EMPTY = "Bu projeye tanımlı şantiye yok.";
export const SECTION_LIST_EMPTY = "Bu şantiyeye tanımlı bölüm yok.";
export const STOCK_ITEMS_LOAD_ERROR =
  "Stok kartı listesi yüklenemedi — kalemi “serbest malzeme” olarak girebilirsiniz.";
export const STOCK_ITEMS_EMPTY =
  "Hiç stok kartı yok — kalemi “serbest malzeme” olarak girebilirsiniz.";
export const SUPPLIERS_LOAD_ERROR = "Tedarikçi listesi yüklenemedi.";
export const SUPPLIERS_EMPTY = "Kayıtlı tedarikçi yok.";

/**
 * 75 "Mevcut Stok" — değer SUNUCUDAN gelir (`GET /stock/summary` satırının
 * `balance` alanı; talep kaydedildikten sonra aynı türev
 * `PurchaseRequestLineResponse.current_stock` olarak da döner).
 *
 * ⚠️ KATALOGSUZ (serbest) kalemde bakiye **YOKTUR** ve `0` YAZILMAZ: şema
 * açıklaması bunu açıkça gerekçelendirir — "stok karti yoksa bakiye de yoktur
 * ve 0 yazmak 'stokta yok' ile 'stok karti bile yok'u ayni gosterirdi".
 */
export const CURRENT_STOCK_FREE_TEXT_REASON =
  "Serbest kalemin stok kartı yok — bakiye de yok (“0” demek DEĞİLDİR).";
export const CURRENT_STOCK_UNKNOWN_REASON = "Stok bakiyesi yüklenemedi.";
export const CURRENT_STOCK_UNSELECTED_REASON = "Önce stok kartı seçin.";

/* ── SONUÇ / HATA CÜMLELERİ ─────────────────────────────────────────────── */

export const DRAFT_SAVE_ERROR_FALLBACK = "Talep kaydedilemedi.";
export const SUBMIT_ERROR_FALLBACK = "Talep onaya gönderilemedi.";

/**
 * 🔴 İKİ ADIMLI GÖNDERİM UYARISI (F-SD "iki adımlı kaydetme" emsali):
 * "Onaya Gönder" önce `POST /purchase-requests` (talep DOĞAR), sonra
 * `POST /{id}/submit` çağırır. Aradaki hata KULLANICIYI KAYBETMEZ — talep
 * TASLAK olarak durur ve bu cümle numarasıyla birlikte basılır. Yeniden
 * denemek İKİNCİ bir talep AÇMAZ (form oluşan talebin kimliğini tutar ve
 * bir sonraki denemede `PATCH` + `submit` yolunu kullanır).
 */
export function submitAfterCreateNotice(requestNo: string, detail: string): string {
  // Sunucu metni (`detail`) OLDUĞU GİBİ taşınır; yalnız cümle sonu noktası eksikse eklenir.
  const sentence = /[.!?]$/.test(detail) ? detail : `${detail}.`;
  return `Talep ${requestNo} TASLAK olarak kaydedildi ama onaya gönderilemedi: ${sentence} Talebiniz kaybolmadı — düzeltip “Onaya Gönder”e yeniden basabilir ya da taslak olarak bırakabilirsiniz.`;
}
