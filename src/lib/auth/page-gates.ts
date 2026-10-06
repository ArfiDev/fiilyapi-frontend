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
/** IZN-F5b · madde 4 — muhasebe yazmaları sayfa başına. */
export const CHART_OF_ACCOUNTS_EDIT = keys(["mali.hesap_plani"]);
export const JOURNAL_EDIT = keys(["mali.yevmiye"]);
export const PERIOD_CLOSE_EDIT = keys(["mali.donem_kapanisi"]);
export const BOQ_EDIT = keys(["santiye.is_kalemleri", "santiye.bolum_dagilimi"]);
/** IZN-F5b · madde 7 — teklif/sözleşme/katalog yazmaları sayfa başına (9 küme). */
export const OFFERS_EDIT = keys(["teklif.teklif_hazirlama"]);
export const OFFER_TEMPLATES_EDIT = keys(["teklif.sablonlar"]);
export const WORK_ITEM_CATALOG_EDIT = keys(["teklif.is_kalemi_katalogu"]);
export const CONTRACT_DISTRIBUTION_EDIT = keys(["teklif.poz_dagilimi"]);
/** ISV — işveren sözleşmesi grup/kalem yazmaları. */
export const EMPLOYER_CONTRACT_EDIT = keys(["teklif.isveren_sozlesme", "proje.is_kalemleri"]);
/** POST /subcontractors — taşeron sözleşme oluşturma formu içinden de firma eklenir. */
export const SUBCONTRACTOR_CREATE_EDIT = keys(["teklif.taseron_firmalar", "teklif.sozlesmeler"]);
/** PATCH /subcontractors/{id}. */
export const SUBCONTRACTOR_FIRM_EDIT = keys(["teklif.taseron_firmalar"]);
/** POST /projects/{id}/subcontractor-contracts — yeni sözleşme formu Sözleşmeler listesinden açılır. */
export const SUBCONTRACTOR_CONTRACT_CREATE_EDIT = keys(["teklif.sozlesmeler", "teklif.taseron_sozlesme"]);
/** PATCH /subcontractor-contracts/{id} + kalemler + load-from-employer. */
export const SUBCONTRACTOR_CONTRACT_EDIT = keys(["teklif.taseron_sozlesme"]);
export const DOCUMENTS_EDIT = keys(["mali.belge_arsivi", "proje.belgeler", "santiye.belgeler"]);
/**
 * IZN-F5b · madde 9 — EVB: adam-saat bütçesi / oran / dağılım / gün dağıtımı yazma kapısı. `ayarlar.planlama`
 * artık YALNIZ ayar ucunu açar (`EV_SETTINGS_EDIT`).
 */
export const EV_BUDGET_EDIT = keys(["planlama.adam_saat_butcesi", "santiye.adam_saat_butcesi"]);
/** PUT /sites/{site_id}/earned-value/settings. */
export const EV_SETTINGS_EDIT = keys(["ayarlar.planlama"]);
/** IZN-F5b · madde 10 — birim oran kataloğu ↔ disiplin yönetimi ayrı. */
export const UNIT_RATE_CATALOG_EDIT = keys(["planlama.birim_oran_katalogu"]);
export const DISCIPLINES_EDIT = keys(["planlama.disiplin_yonetimi"]);
/** IZN-F5b · madde 11 — makine yazmaları sayfa başına. */
export const EQUIPMENT_ASSET_EDIT = keys(["saha.makine_ekipman"]);
export const EQUIPMENT_WORK_EDIT = keys(["saha.makine_calisma"]);
export const EQUIPMENT_FUEL_EDIT = keys(["saha.makine_yakit"]);
export const EQUIPMENT_RENTAL_EDIT = keys(["saha.makine_kira"]);
export const INVENTORY_EDIT = keys(["stok.stok_depo", "santiye.stok"]);
export const INVOICING_EDIT = keys(["mali.fatura"]);
export const PAYROLL_EDIT = keys(["mali.bordro", "mali.sgk_bildirimi"]);
export const PERSONNEL_EDIT = keys(["ik.personel", "ik.izin_yonetimi", "ik.belge_sertifika"]);
/** Satınalma talebi oluştur/düzenle/Onaya Gönder (procurement request). */
export const PURCHASE_REQUEST_EDIT = keys(["stok.satinalma_talepleri"]);
/** Sipariş / tedarikçi / teklif karşılaştırma yazma kapısı (procurement full). */
export const PROCUREMENT_EDIT = keys(["stok.siparisler", "stok.tedarikciler", "stok.teklif_karsilastirma"]);
/** IZN-F5b · madde 5 — HI: işveren hakedişi yazmaları (`santiye.hakedisler` YALNIZ işveren ailesinde). */
export const EMPLOYER_PAYMENT_EDIT = keys(["mali.hakedis_isveren", "proje.isveren_hakedis", "santiye.hakedisler"]);
/** IZN-F5b · madde 5 — HT: taşeron hakedişi yazmaları. */
export const SUBCONTRACTOR_PAYMENT_EDIT = keys(["mali.hakedis_taseron", "proje.taseron_hakedis"]);
/** IZN-F5b · madde 2 — satış alt sekmeleri sekme başına (projects full yerine). */
export const SALES_BLOCK_EDIT = keys(["mali.satis_blok"]);
export const SALES_UNIT_EDIT = keys(["mali.satis_unite"]);
export const SALES_BULK_UNIT_EDIT = keys(["mali.satis_toplu_uretim"]);
export const SALES_UNIT_IMPORT_EDIT = keys(["mali.satis_excel"]);
export const SALES_LAND_SHARE_EDIT = keys(["mali.satis_paylasim"]);
export const SALES_EDIT = keys(["mali.satis"]);
export const COMPANY_EDIT = keys(["ayarlar.sirket_bilgileri"]);
export const SITE_DIARY_EDIT = keys([
  "saha.gunluk_kayit",
  "santiye.gunluk_kayit",
  "santiye.gunluk_planlama",
  "bolum.gunluk_kayit_detay",
]);
/** IZN-F5c — POST /projects/{id}/sites + PATCH /sites/{id}: proje.santiyeler Düzenler. */
export const SITE_EDIT = keys(["proje.santiyeler"]);
/** IZN-F5c — POST /sites/{id}/sections: santiye.bolumler Düzenler. */
export const SECTION_CREATE_EDIT = keys(["santiye.bolumler"]);
/** IZN-F5c — PATCH /sections/{id}: bolum.detay Düzenler. */
export const SECTION_EDIT = keys(["bolum.detay"]);
/** IZN-F5c — POST /section-types: santiye.bolumler VEYA bolum.detay Düzenler. */
export const SECTION_TYPE_CREATE_EDIT = keys(["santiye.bolumler", "bolum.detay"]);
export const TIMESHEET_EDIT = keys(["saha.puantaj", "santiye.puantaj"]);
export const TREASURY_EDIT = keys(["mali.hazine", "mali.cek_odeme"]);
export const USERS_EDIT = keys(["ayarlar.kullanicilar"]);

// §2.4 sayfa kapılı (Düzenler bayraklı) uçlar
export const PROJECT_CREATE_EDIT = keys(["genel.projeler"]);
export const TAX_BRACKETS_EDIT = keys(["ayarlar.bordro_oranlari"]);
export const APPROVAL_ROLES_EDIT = keys(["ayarlar.onay_rolleri"]);
export const ROLES_EDIT = keys(["ayarlar.rol_yonetimi"]);
/** GET /roles, /modules, /roles/{id}/permissions|pages okuma kapısı (IZN-B5a): rol_yonetimi VEYA sayfa_izinleri Görür. */
export const ROLES_VIEW_PAGES = keys(["ayarlar.rol_yonetimi", "ayarlar.sayfa_izinleri"]);
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
/** IZN-F5b · madde 6 — taşeron onayı yalnız HT (`santiye.hakedisler` işveren ailesine bağlandı). */
export const SUBCONTRACTOR_PAYMENT_APPROVE = SUBCONTRACTOR_PAYMENT_EDIT;
/**
 * Günlük "Yeniden Aç" = kök sayfa (12) + proje içi ikizleri (73 şantiye, 88 bölüm detay) Onaylar — backend
 * `site_diary/router_transitions.py` `_ADMIN` (IZN-B3: rol proje başına; ekip rolünde ikizin Onaylar'ı yeter).
 */
export const DIARY_REOPEN_APPROVE = keys(["saha.gunluk_kayit", "santiye.gunluk_kayit", "bolum.gunluk_kayit_detay"]);
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
