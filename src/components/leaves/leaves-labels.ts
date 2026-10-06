/**
 * F-IZN T3 · İZ — `/personel/izinler` (İzin Yönetimi) ekranının METİN sabitleri.
 * Yorumlardaki sayılar `İK - İzin Yönetimi.dc.html`in SATIR numaralarıdır.
 *
 * Türetme YOKTUR (o `leaves-derive.ts`tedir); burada yalnız sabit metin durur.
 */

/** Sekme şeridindeki bu ekranın adı (34). */
export const LEAVES_TAB_LABEL = "İzin Yönetimi";

/** Sayfa başlığı (19 breadcrumb'ın son parçası). */
export const LEAVES_PAGE_TITLE = "İzin Yönetimi";
export const LEAVES_EYEBROW = "İnsan Kaynakları";

/**
 * 🔴 K4/K9 AYRIMI — "—" bu dilimde YALNIZ "BİLİNMİYOR" demektir.
 *
 * Bakiyesi bulunamayan ya da `remaining` NULL olan talep satırında basılır
 * (77). `0` BASILMAZ: 0 "hakkı bitti" der, "bilinmiyor" demez — bu, NULL-EŞİK
 * kanonunun görüntü hâlidir.
 */
export const UNKNOWN_VALUE = "—";

/**
 * 🔴 K9 (ŞEF KARARI · onaylı sapma) — `deducts_from_annual === false` satırın
 * "Kalan Hak" hücresi.
 *
 * Mockup 87'de "Rapor" yazar; ama o sözcük YALNIZ hastalık iznine özgüdür ve
 * aynı hücreye "Ücretsiz İzin" satırında basılsa YANLIŞ olurdu (ücretsiz izin
 * rapor değildir). Tipten BAĞIMSIZ, anlamı koruyan sözcük seçildi: yıllık
 * bakiye bu satır için "düşmez". `—` ile KARIŞMAZ — o "bilinmiyor"a ayrıldı.
 */
export const NOT_DEDUCTED_LABEL = "Düşmez";

/** 166 · `remaining` NULL — hak HESAPLANAMAZ (kıdem<1 ya da `hire_date` yok). */
export const NO_ENTITLEMENT_LABEL = "Hak yok";

/** 167 · aynı satırın "Kullanım" sütunu (`usage_pct` NULL). */
export const NO_ENTITLEMENT_HINT = "1 yıl dolunca hak kazanır";

/** 158 · devreden günü yıl sonunda yanma riski taşıyan satır. */
export const CARRYOVER_RISK_LABEL = "Devreden yanma riski";

/* ── KPI şeridi (45-51) ─────────────────────────────────────────────────── */
export const KPI_PENDING_LABEL = "Bekleyen Talep";
export const KPI_ON_LEAVE_LABEL = "Bugün İzinli";
export const KPI_USED_LABEL = "Bu Ay Kullanılan";
export const KPI_DEBT_LABEL = "Toplam İzin Borcu";
export const KPI_CARRYOVER_RISK_LABEL = "Devreden Risk";
/** 50 · risk kartının alt satırı. */
export const KPI_CARRYOVER_RISK_HINT = "Yıl sonu yanacak";
/** 48-50 · sayıların birimi ("82 gün" · "8 kişi"). */
export const UNIT_DAYS = "gün";
export const UNIT_PEOPLE = "kişi";

/* ── Tablo 1 — onay bekleyen talepler (54-113) ──────────────────────────── */
export const PENDING_TABLE_TITLE = "Onay Bekleyen İzin Talepleri";
/**
 * 57 · ipucu. 🔴 K7: mockup'taki `→` (U+2192) yazı tipi alt kümesinin DIŞINDA
 * kalır (28 `@font-face` kuralı ayrıştırıldı) — ok GLİF olarak basılmaz,
 * anlamı sözcüğe çevrilir.
 */
export const PENDING_TABLE_HINT = "Şantiye şefi ardından İK onayı";
/** 98 · hak aşan satırın açıklama hücresi. */
export const OVERRUN_NOTE_PREFIX = "Hak aşımı";
/** 88 · `document_id` dolu satırın eki (📎 yerine ikon + bu erişilebilir ad). */
export const ATTACHMENT_LABEL = "belge ekli";

/** 79 · satır eylemleri — erişilebilir adlar ZORUNLU (ikonun tek metni budur). */
export const APPROVE_ACTION_LABEL = "Onayla";
export const REJECT_ACTION_LABEL = "Reddet";

/** 99 · hak aşımında onay PASİFtir; red HER ZAMAN aktiftir (şema kanonu). */
export const APPROVE_BLOCKED_REASON =
  "Talep yıllık hakkı aşıyor — onaylanamaz, ancak reddedilebilir.";

/**
 * 🔴 K3 İSTİSNASI (onaylı sapma) — mockup boş durumu ÇİZMEZ ama bekleyen talep
 * olmaması NORMAL işletme hâlidir; boş kart kullanıcıya hata gibi görünürdü.
 * Emsal: `muhasebe-bos-donem` karesindeki `mu-ledger-empty` / `mu-drafts-empty`.
 */
export const PENDING_EMPTY_TEXT = "Onay bekleyen izin talebi yok.";
export const PENDING_LOADING_TEXT = "İzin talepleri yükleniyor...";

/* ── Tablo 2 — izin bakiyeleri (116-171) ────────────────────────────────── */
export const BALANCES_TABLE_TITLE = "İzin Bakiyeleri";
/** 119 · `·` (U+00B7) alt küme İÇİNDEdir, glif kısıtına takılmaz. */
export const BALANCES_TABLE_HINT = "4857 sayılı İş Kanunu · Kıdeme göre hesaplanır";
export const BALANCES_EMPTY_TEXT = "Bu yıl için bakiye kaydı yok.";
export const BALANCES_LOADING_TEXT = "İzin bakiyeleri yükleniyor...";
/** 120 · yıl seçici. */
export const YEAR_SELECT_LABEL = "Bakiye yılı";

/** Ekranın iki ucundan biri düştüğünde basılan önek. */
export const SUMMARY_ERROR_PREFIX = "İzin özeti yüklenemedi";
export const REQUESTS_ERROR_PREFIX = "İzin talepleri yüklenemedi";

/**
 * 🔴 T4 devri — karar diyalogları (onay/red) T4'ün işidir. Bu ekran düğmeleri
 * BASAR ve erişilebilir kılar; karar akışı `onApproveRequest`/`onRejectRequest`
 * geri çağrılarıyla dışarıdan bağlanır. Bağlanmadığı sürece düğmeler devre-dışı
 * kalır ve gerekçe EKRANDA okunur (`title`da saklanmaz) — "hiçbir şey yapmayan
 * düğme" bırakılmaz.
 */
export const DECISION_PENDING_REASON =
  "Onay ve red diyalogları henüz bağlanmadı — düğmeler bir işlem başlatmaz.";

/* ═══ F-IZN T4 · iki form diyaloğunun METİNLERİ ═════════════════════════════
 * (T) = `Form - Izin Talebi.dc.html` · (R) = `Form - Izin Reddi.dc.html`
 */

/**
 * F-IZN T5 · şef ölçümü: İZ ekranındaki tetikleyici mockup'ta VARDIR
 * (`İK - İzin Yönetimi.dc.html:21` — `+ İzin Talebi`); T4'ün "mockup çizmez"
 * varsayımı yanlıştı. Diyaloğun BAŞLIĞI ayrı sabittir (`REQUEST_FORM_TITLE`,
 * `Form - Izin Talebi.dc.html:71` — "Yeni İzin Talebi") ve DEĞİŞMEZ.
 */
export const NEW_REQUEST_ACTION_LABEL = "+ İzin Talebi";

/** Not/gerekçe alanlarının tavanı (T 180 · R 106). */
export const MAX_TEXT_LENGTH = 500;

/* ── Talep formu (T) ────────────────────────────────────────────────────── */
export const REQUEST_FORM_TITLE = "Yeni İzin Talebi"; // T 71
export const REQUEST_FORM_SUBTITLE = "Talep şantiye şefi ardından İK onay akışına girer"; // T 72
export const REQUEST_PERSONNEL_LABEL = "Personel"; // T 81
export const REQUEST_PERSONNEL_PLACEHOLDER = "Personel seçiniz..."; // T 83
export const REQUEST_TYPE_LABEL = "İzin Tipi"; // T 110
export const REQUEST_TYPE_PLACEHOLDER = "Tip seçiniz..."; // T 112
export const REQUEST_START_LABEL = "Başlangıç"; // T 134
export const REQUEST_END_LABEL = "Bitiş"; // T 138
export const REQUEST_DAYS_LABEL = "Gün"; // T 142
/** T 144 · gün alanının ipucu metni — KARAR 1'in kullanıcıya söylenmiş hâli. */
export const REQUEST_DAYS_HINT = "Türetilir";
export const REQUEST_NOTE_LABEL = "Açıklama"; // T 178
export const REQUEST_NOTE_PLACEHOLDER = "İzin gerekçesi, iletişim bilgisi..."; // T 179
export const REQUEST_NOTE_HINT = "Maks 500 karakter"; // T 180
export const REQUEST_SENIORITY_PREFIX = "Kıdem:"; // T 97
export const REQUEST_ENTITLEMENT_LABEL = "Yıllık Hak"; // T 101
export const REQUEST_CARRIED_LABEL = "Devreden"; // T 102
export const REQUEST_USED_LABEL = "Kullanılan"; // T 103
export const REQUEST_REMAINING_LABEL = "Kalan"; // T 104
/** Seçili personelin bakiye satırı YOKSA kart sahte sayı basmaz, bunu yazar. */
export const REQUEST_NO_BALANCE_NOTE = "Bu personel için bu yıla ait bakiye kaydı yok.";
export const REQUEST_SUBMIT_LABEL = "Onaya Gönder"; // T 187
export const CANCEL_LABEL = "Vazgeç"; // T 186 · R 127

/** T 161-174 · KARAR 3 — belge kartı. */
export const REQUEST_DOCUMENT_LABEL = "Rapor / Belge Eki"; // T 162
export const REQUEST_DOCUMENT_DROP_TITLE = "Belgeyi yükleyin"; // T 167
export const REQUEST_DOCUMENT_DROP_HINT = "PDF veya fotoğraf"; // T 168
export const REQUEST_DOCUMENT_ACCEPT = ".pdf,image/*"; // T 164
/** T 171-173 · alanın neden zorunlu (ya da opsiyonel) olduğunu SÖYLER. */
export const REQUEST_DOCUMENT_REQUIRED_HINT =
  "Seçilen izin tipi belge zorunlu tutuyor. Belge istemeyen tiplerde bu alan opsiyoneldir.";
export const REQUEST_DOCUMENT_OPTIONAL_HINT =
  "Seçilen izin tipi belge zorunlu tutmuyor — dosya eklemek isteğe bağlıdır.";
/**
 * 🔴 İKİ ADIMLI AKIŞ (F-BLG `PersonnelDocumentFormModal` emsali): gövde dosya
 * DEĞİL `document_id` alır. Dosya önce arşive (`POST /documents`) yüklenir,
 * dönen künye talebe bağlanır. Kullanıcı bunu bilmeli — sessiz sihir yok.
 */
export const REQUEST_DOCUMENT_TWO_STEP_NOTE =
  "Yüklediğiniz dosya önce genel arşive kaydedilir, ardından bu izin talebine bağlanır.";
/**
 * 🔴 Arşiv yüklemesi PROJE zorunlu tutuyor; projesi olmayan personelde birinci
 * adım koşamaz. Sessiz atlama YOK — form durur ve gerekçeyi basar.
 */
export const REQUEST_NO_PROJECT_UPLOAD_REASON =
  "Personelin projesi yok ya da görme yetkiniz dışında; dosya arşive yüklenemiyor.";

/** T 149-158 · hak aşımı bandı. */
export const OVERRUN_TITLE = "Hak aşımı — talep kaydedilemez"; // T 152

/** T 185 · footer uyarısı + düğme kapısının gerekçeleri. */
export const BLOCK_REASON_MISSING_FIELDS = "Personel, izin tipi ve iki tarih zorunludur.";
export const BLOCK_REASON_DATE_ORDER = "Bitiş tarihi başlangıçtan önce olamaz.";
export const BLOCK_REASON_OVERRUN = "Hak aşımı düzeltilmeden gönderilemez.";
export const BLOCK_REASON_DOCUMENT_REQUIRED = "Seçilen izin tipi için belge eki zorunludur.";

export const REQUEST_ERROR_FALLBACK = "İzin talebi oluşturulamadı.";
export const UPLOAD_ERROR_FALLBACK = "Dosya arşive yüklenemedi.";
/**
 * 🔴 Birinci adım BAŞARILI + ikinci adım BAŞARISIZ: arşivde ÖKSÜZ belge kalır.
 * Künye durumda TUTULUR (tekrar denemede ikinci kopya doğmaz) ve kullanıcı
 * dosyanın nerede olduğunu ÖĞRENİR (F-BLG emsali).
 */
export function buildOrphanFileMessage(fileName: string, detail: string): string {
  return `Dosya (${fileName}) arşive YÜKLENDİ ama izin talebine bağlanamadı: ${detail} Dosya Belge Arşivi'nde duruyor; tekrar kaydettiğinizde aynı dosya kullanılır, ikinci kopya oluşmaz.`;
}

/** Personel/tip listesi düşerse form boş seçenekle sessizce durmaz. */
export const PERSONNEL_LIST_ERROR = "Personel listesi yüklenemedi — seçim yapılamıyor.";
export const TYPE_LIST_ERROR = "İzin tipi kataloğu yüklenemedi — seçim yapılamıyor.";

/* ── Red diyaloğu (R) ───────────────────────────────────────────────────── */
export const REJECT_FORM_TITLE = "İzin Talebini Reddet"; // R 62
export const REJECT_FORM_SUBTITLE = "Gerekçe personele bildirim olarak gönderilir"; // R 63
export const REJECT_SUMMARY_TITLE = "Reddedilen Talep"; // R 72
export const REJECT_START_LABEL = "Başlangıç"; // R 83
export const REJECT_END_LABEL = "Bitiş"; // R 87
export const REJECT_DAYS_LABEL = "Gün"; // R 91
export const REJECT_REASON_LABEL = "Red Gerekçesi"; // R 104
export const REJECT_REASON_PLACEHOLDER =
  "Talebin neden reddedildiğini açıklayın — personele bu metin iletilir"; // R 105
export const REJECT_REASON_HINT = "Maks 500 karakter · Zorunlu alan"; // R 106
export const REJECT_PRESET_TITLE = "Hazır gerekçeler"; // R 111
export const REJECT_PRESET_HINT = "Tıklayınca gerekçe alanına yazılır, düzenleyebilirsiniz"; // R 119
export const REJECT_REASON_REQUIRED = "Gerekçe zorunlu"; // R 125
export const REJECT_SUBMIT_LABEL = "Reddet"; // R 128
export const REJECT_ERROR_FALLBACK = "İzin talebi reddedilemedi.";
/** R 95-99 · sistem notu; YALNIZ aşım gerçekten hesaplanabiliyorsa basılır. */
export const REJECT_SYSTEM_NOTE_PREFIX = "Sistem notu:"; // R 97

/** R 113-117 · beş hazır gerekçe, mockup'tan BİREBİR. */
export const REJECT_PRESETS: readonly string[] = [
  "Kalan izin hakkı yetersiz",
  "Kritik iş programı çakışması",
  "Aynı dönemde yeterli personel yok",
  "Belge eksik",
  "Tarih revizesi gerekli",
];

/** Onay akışı (diyalogsuz) — 409 gövdesi yoksa basılan yedek metin. */
export const APPROVE_ERROR_FALLBACK = "İzin talebi onaylanamadı.";
