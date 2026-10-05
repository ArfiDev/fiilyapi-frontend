import type { PageKey } from "@/lib/api/models";

/**
 * IZN-F2.x — düğme kapılarının sayfa kümeleri. Kaynak: backend "düğme → eşik" tablosu ve
 * `tests/modules/test_izn_b2_sayfa_bayragi_bekcisi.py` sabitleri (`EDIT_GATE_PAGES`,
 * `APPROVE_ROUTE_PAGES`, `PAGE_EDIT_ROUTES`). Bir kapıyı açan sayfalar VEYA'dır: kümedeki
 * herhangi bir sayfada Düzenler (E) / Onaylar (A) yeterlidir. Backend kümesi değişirse BU
 * dosya tek yerde güncellenir; ekranlar küme adıyla çağırır.
 */
const keys = <const T extends readonly PageKey[]>(list: T): T => list;

// ── Görür (V) kapıları (`AccessDenied` / sorgu açma) ─────────────────────────────────
// Kaynak: backend `VIEW_GATE_PAGES` (GÖRME eşiği tam `(modül, view)` olan sayfalar).
export const ACCOUNTING_VIEW = keys([
  "mali.yevmiye",
  "mali.hesap_plani",
  "mali.mizan",
  "mali.kdv_beyani",
  "mali.banka_mutabakati",
  "mali.donem_kapanisi",
  "mali.gelir_tablosu",
  "mali.bilanco",
  "mali.nakit_akisi",
]);
export const AI_VIEW = keys(["genel.fiil_ai"]);
export const CONTRACTS_VIEW = keys([
  "teklif.teklif_hazirlama",
  "teklif.sablonlar",
  "teklif.sozlesmeler",
  "teklif.taseron_firmalar",
  "teklif.isveren_sozlesme",
  "teklif.poz_dagilimi",
  "teklif.taseron_sozlesme",
  "teklif.is_kalemi_katalogu",
  "proje.is_kalemleri",
]);
export const DOCUMENTS_VIEW = keys(["mali.belge_arsivi", "proje.belgeler", "santiye.belgeler"]);
export const EV_VIEW = keys([
  "planlama.panel",
  "planlama.adam_saat_butcesi",
  "planlama.gunluk_rapor",
  "planlama.haftalik_qurr",
  "planlama.birim_oran_katalogu",
  "planlama.disiplin_yonetimi",
  "santiye.adam_saat_butcesi",
  "santiye.planlama_paneli",
  "santiye.gunluk_ilerleme_raporu",
  "santiye.haftalik_qurr",
  "ayarlar.planlama",
]);
export const EQUIPMENT_VIEW = keys([
  "saha.makine_ekipman",
  "saha.makine_calisma",
  "saha.makine_yakit",
  "saha.makine_kira",
]);
export const INVOICING_VIEW = keys(["mali.fatura"]);
export const PERSONNEL_VIEW = keys(["ik.personel", "ik.izin_yonetimi", "ik.belge_sertifika"]);
export const PROJECTS_VIEW = keys(["genel.projeler", "genel.proje_takvimi", "proje.ozet", "proje.paylasim_tablosu"]);
export const TREASURY_VIEW = keys(["mali.hazine", "mali.cek_odeme"]);

// ── Düzenler (E) kapıları ─────────────────────────────────────────────────────────────
export const ACCOUNTING_EDIT = keys(["mali.yevmiye", "mali.hesap_plani", "mali.donem_kapanisi"]);
export const BOQ_EDIT = keys(["santiye.is_kalemleri", "santiye.bolum_dagilimi"]);
export const CONTRACTS_EDIT = keys([
  "teklif.teklif_hazirlama",
  "teklif.sablonlar",
  "teklif.sozlesmeler",
  "teklif.taseron_firmalar",
  "teklif.isveren_sozlesme",
  "teklif.poz_dagilimi",
  "teklif.taseron_sozlesme",
  "teklif.is_kalemi_katalogu",
  "proje.is_kalemleri",
]);
export const DOCUMENTS_EDIT = keys(["mali.belge_arsivi", "proje.belgeler", "santiye.belgeler"]);
/** Adam-saat bütçesi / oran / dağılım / ayar yazma kapısı (earned_value draft). */
export const EV_BUDGET_EDIT = keys(["planlama.adam_saat_butcesi", "santiye.adam_saat_butcesi", "ayarlar.planlama"]);
/** Birim oran kataloğu + disiplin yönetimi yazma kapısı (earned_value full). */
export const EV_CATALOG_EDIT = keys(["planlama.birim_oran_katalogu", "planlama.disiplin_yonetimi"]);
export const EQUIPMENT_EDIT = keys([
  "saha.makine_ekipman",
  "saha.makine_calisma",
  "saha.makine_yakit",
  "saha.makine_kira",
]);
export const INVENTORY_EDIT = keys(["stok.stok_depo", "santiye.stok"]);
export const INVOICING_EDIT = keys(["mali.fatura"]);
export const PAYROLL_EDIT = keys(["mali.bordro", "mali.sgk_bildirimi"]);
export const PERSONNEL_EDIT = keys(["ik.personel", "ik.izin_yonetimi", "ik.belge_sertifika"]);
/** Satınalma talebi oluştur/düzenle/Onaya Gönder (procurement request). */
export const PURCHASE_REQUEST_EDIT = keys(["stok.satinalma_talepleri"]);
/** Sipariş / tedarikçi / teklif karşılaştırma yazma kapısı (procurement full). */
export const PROCUREMENT_EDIT = keys(["stok.siparisler", "stok.tedarikciler", "stok.teklif_karsilastirma"]);
export const PROGRESS_PAYMENTS_EDIT = keys([
  "mali.hakedis_isveren",
  "mali.hakedis_taseron",
  "proje.isveren_hakedis",
  "proje.taseron_hakedis",
  "santiye.hakedisler",
]);
/** Blok / ünite / toplu üretim / Excel / paylaşım yazma kapısı (projects full). */
export const PROJECT_UNITS_EDIT = keys([
  "mali.satis_blok",
  "mali.satis_unite",
  "mali.satis_toplu_uretim",
  "mali.satis_excel",
  "mali.satis_paylasim",
]);
export const SALES_EDIT = keys(["mali.satis"]);
export const COMPANY_EDIT = keys(["ayarlar.sirket_bilgileri"]);
export const SITE_DIARY_EDIT = keys([
  "saha.gunluk_kayit",
  "santiye.gunluk_kayit",
  "santiye.gunluk_planlama",
  "bolum.gunluk_kayit_detay",
]);
export const SITES_EDIT = keys(["santiye.bolumler", "bolum.detay"]);
export const TIMESHEET_EDIT = keys(["saha.puantaj", "santiye.puantaj"]);
export const TREASURY_EDIT = keys(["mali.hazine", "mali.cek_odeme"]);
export const USERS_EDIT = keys(["ayarlar.kullanicilar"]);

// §2.4 sayfa kapılı (Düzenler bayraklı) uçlar
export const PROJECT_CREATE_EDIT = keys(["genel.projeler"]);
export const TAX_BRACKETS_EDIT = keys(["ayarlar.bordro_oranlari"]);
export const APPROVAL_ROLES_EDIT = keys(["ayarlar.onay_rolleri"]);
export const ROLES_EDIT = keys(["ayarlar.rol_yonetimi"]);
export const PAGE_ACCESS_EDIT = keys(["ayarlar.sayfa_izinleri"]);

// ── Onaylar (A) kapıları ──────────────────────────────────────────────────────────────
export const LEAVE_APPROVE = keys(["ik.izin_yonetimi"]);
export const JOURNAL_APPROVE = keys(["mali.yevmiye"]);
export const INVOICE_APPROVE = keys(["mali.fatura"]);
export const PAYROLL_APPROVE = keys(["mali.bordro"]);
export const SGK_APPROVE = keys(["mali.sgk_bildirimi"]);
export const INSTRUMENT_APPROVE = keys(["mali.cek_odeme"]);
export const SALES_APPROVE = keys(["mali.satis"]);
export const RENTAL_APPROVE = keys(["saha.makine_kira"]);
export const QUOTE_ORDER_APPROVE = keys(["stok.teklif_karsilastirma"]);
export const PURCHASE_REQUEST_APPROVE = keys(["stok.satinalma_talepleri"]);
export const EMPLOYER_PAYMENT_APPROVE = keys(["mali.hakedis_isveren", "proje.isveren_hakedis", "santiye.hakedisler"]);
export const SUBCONTRACTOR_PAYMENT_APPROVE = keys(["mali.hakedis_taseron", "proje.taseron_hakedis", "santiye.hakedisler"]);
/** Günlük "Yeniden Aç" YALNIZ kök sayfada (73/88 ikizleri B3'e kadar işlevsiz). */
export const DIARY_REOPEN_APPROVE = keys(["saha.gunluk_kayit"]);
export const PERIOD_REOPEN_APPROVE = keys(["mali.donem_kapanisi"]);
/** Baseline Dondur (bütçe). */
export const EV_FREEZE_APPROVE = keys(["planlama.adam_saat_butcesi", "santiye.adam_saat_butcesi"]);
/** Günü Onayla (günlük rapor). */
export const EV_DAILY_APPROVE = keys(["planlama.gunluk_rapor", "santiye.gunluk_ilerleme_raporu"]);
/** Gün Kilidi Aç = bütçe + günlük rapor Onaylar sayfalarının birleşimi. */
export const EV_UNLOCK_APPROVE = keys([...EV_FREEZE_APPROVE, ...EV_DAILY_APPROVE]);
export const OFFER_CONVERT_APPROVE = keys(["teklif.teklif_hazirlama"]);

/* IZN-F5-ön · GÖRÜNTÜLEME kümeleri (Ajan B) — backend `VIEW_GATE_PAGES` ile birebir. */
export const INVENTORY_VIEW_PAGES = keys(["stok.stok_depo", "santiye.stok", "bolum.malzeme"]);
export const PAYROLL_VIEW_PAGES = keys([
  "mali.bordro",
  "mali.bordro_gecmis",
  "mali.sgk_bildirimi",
  "ayarlar.bordro_oranlari",
]);
export const PROCUREMENT_VIEW_PAGES = keys([
  "stok.satinalma_talepleri",
  "stok.siparisler",
  "stok.tedarikciler",
  "stok.teklif_karsilastirma",
]);
export const SALES_VIEW_PAGES = keys(["mali.satis"]);
export const SITE_DIARY_VIEW_PAGES = keys([
  "saha.gunluk_kayit",
  "santiye.gunluk_kayit",
  "santiye.gunluk_ozet",
  "santiye.gunluk_planlama",
  "bolum.gunluk_kayit",
  "bolum.gunluk_kayit_detay",
]);
export const SITES_VIEW_PAGES = keys(["santiye.bolumler", "bolum.detay"]);
export const TIMESHEET_VIEW_PAGES = keys(["saha.puantaj", "santiye.puantaj", "bolum.puantaj"]);
