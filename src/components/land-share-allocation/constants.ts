/**
 * F-UNIT2 · PG (`Form - Paylasim Girisi.dc.html`) — "Kat Karşılığı Paylaşım
 * Girişi" ekranının sabitleri. Parantez içi `PG nn` O DOSYANIN satırıdır.
 */

import { SALES_LIST_HREF } from "@/components/unit-shell/routes";
import type { LandShareCountBalance, LandShareShareholderRow } from "@/lib/api/hooks/useLandShare";
import { formatPercent } from "@/lib/format";
import type { Percent } from "@/lib/api/scale";

export const ALLOCATION_FORM_TITLE = "Kat Karşılığı Paylaşım Girişi"; // PG 53
export const ALLOCATION_FORM_SUBTITLE =
  "Her üniteyi arsa sahibi veya yüklenici payı olarak işaretleyin — toplu seçim yapabilirsiniz"; // PG 54

export const ALLOCATION_TARGET_CARD_TITLE = "Sözleşme & Hedef"; // PG 58
export const ALLOCATION_BULK_BAR_TITLE = "Toplu İşlem"; // PG 88
export const ALLOCATION_BALANCE_CARD_TITLE = "Paylaşım Denge Kontrolü"; // PG 245

export const ALLOCATION_PROJECT_LABEL = "Proje"; // PG 60 — PATH parametresi
export const ALLOCATION_CONTRACT_LABEL = "Kat Karşılığı Sözleşmesi"; // PG 61 — SALT OKUNUR
export const ALLOCATION_BLOCK_FILTER_LABEL = "Blok Filtresi"; // PG 62 — SÜZGEÇ

export const ALLOCATION_CONTRACT_RATIO_TITLE = "Sözleşme Oranı"; // PG 66
export const ALLOCATION_CURRENT_STATE_TITLE = "Mevcut Atama Durumu"; // PG 74

export const ALLOCATION_ASSIGN_SELECTED_LABEL = "Seçilenleri şuna ata:"; // PG 91
export const ALLOCATION_ASSIGN_CONTRACTOR_LABEL = "Yüklenici (Biz)"; // PG 92
export const ALLOCATION_ASSIGN_LANDOWNER_LABEL = "Arsa Sahibi"; // PG 93
export const ALLOCATION_SHAREHOLDER_PLACEHOLDER = "Hissedar seç (arsa payı için)"; // PG 96
export const ALLOCATION_SELECT_ALL_LABEL = "Tümünü Seç"; // PG 109

/** PG 112-115 — üç enum üyesi + süzgeçsiz "Tümü". */
export const ALLOCATION_FILTER_UNASSIGNED_LABEL = "Atanmayan"; // PG 112
export const ALLOCATION_FILTER_ALL_LABEL = "Tümü"; // PG 113
export const ALLOCATION_FILTER_CONTRACTOR_LABEL = "Bizim"; // PG 114
export const ALLOCATION_FILTER_LANDOWNER_LABEL = "Arsa"; // PG 115

/** PG 126 — bu ekranın ASIL sütunu; başlığı VURGULU basılır (mockup 700/teal). */
export const ALLOCATION_OWNERSHIP_COLUMN_LABEL = "Sahiplik Ataması"; // PG 126

/** PG 121-127 tablo başlıkları — `LandShareUnitRow` alanlarıyla BİREBİR. */
export const ALLOCATION_ROW_COLUMN_LABELS: readonly string[] = [
  "Ünite", // PG 121
  "Kat", // PG 122
  "Tip", // PG 123
  "Brüt m²", // PG 124
  "Rayiç Değer", // PG 125 — `appraisal_value`
  ALLOCATION_OWNERSHIP_COLUMN_LABEL, // PG 126
  "Hissedar", // PG 127
];

/** PG 140/141 satır içi ikili düğme; PG 144/190 sağdaki durum metinleri. */
export const ALLOCATION_CONTRACTOR_LABEL = "Biz"; // PG 140
export const ALLOCATION_LANDOWNER_LABEL = "Arsa"; // PG 141
export const ALLOCATION_UNASSIGNED_LABEL = "Atanmadı"; // PG 144
export const ALLOCATION_CONTRACTOR_ROW_NOTE = "Yüklenici payı"; // PG 190

/** PG 248-252 · 256-260 denge kartları. */
export const ALLOCATION_COUNT_BALANCE_TITLE = "Ünite Sayısı Dengesi"; // PG 248
export const ALLOCATION_VALUE_BALANCE_TITLE = "Değer Dengesi (Rayiç)"; // PG 256
export const ALLOCATION_ASSIGNED_NOW_LABEL = "Şu an atanan"; // PG 251
export const ALLOCATION_MISSING_LABEL = "Eksik"; // PG 252
export const ALLOCATION_OUR_VALUE_LABEL = "Bize atanan değer"; // PG 258
export const ALLOCATION_OWNER_VALUE_LABEL = "Arsa sahibine atanan"; // PG 259
export const ALLOCATION_ACTUAL_RATIO_LABEL = "Gerçekleşen oran"; // PG 260

export const ALLOCATION_SUBMIT_LABEL = "Paylaşımı Kaydet"; // PG 276
export const ALLOCATION_CANCEL_LABEL = "İptal"; // PG 275

/**
 * PG 275'in hedefi `Kat Karşılığı - Paylaşım.dc.html`tır — O EKRAN AYRIDIR ve
 * bu dilimin kapsamı dışındadır (F-PKK'nın işi). Rota henüz yok, bu yüzden
 * kabuk canonuna dönülür (F-UNIT1 emsali).
 */
export const ALLOCATION_CANCEL_HREF = SALES_LIST_HREF;

/**
 * 🔴 PG 101 "Otomatik Dağıt (%55/%45)" — ORAN ÖRNEK VERİDİR, SABİT DEĞİL.
 * Mockup'ın sayıları kopyalanıp sabitlenirse %60/%40 sözleşmeli bir projede
 * düğme YANLIŞ oran vaat eder. Etiket `LandShareContract.our_share_pct` /
 * `.owner_share_pct` alanlarından TÜRETİLİR.
 */
export function autoDistributeLabel(ourPct: Percent, ownerPct: Percent): string {
  return `Otomatik Dağıt (${formatPercent(ourPct)}/${formatPercent(ownerPct)})`;
}

/**
 * 🔴 PG 270-272 "Paylaşım tutanağı PDF olarak oluştur" — SUNUCUDA KARŞILIĞI
 * YOKTUR (ne `UnitAllocationRequest` gövdesinde ne ayrı bir uçta; ölçüldü).
 * Kanon: rotası/ucu olmayan mockup öğesi SİLİNMEZ — devre dışı + işaretsiz +
 * GÖRÜNÜR gerekçeyle basılır. `allocation-state.ts`te karşılığı OLMADIĞI için
 * gövdeye sızması yapısal olarak imkânsızdır (F-UNIT1'in BE 109 kutucuğuyla
 * aynı muamele).
 */
export const ALLOCATION_PDF_LABEL =
  "Paylaşım tutanağı PDF olarak oluştur (arsa sahibi imzası için)"; // PG 272
export const ALLOCATION_PDF_PENDING_REASON =
  "Paylaşım tutanağı çıktısı henüz yok — sunucuda tutanak üreten bir uç açılmadı";

/** `schemas.py::_MAX_ALLOCATION_ITEMS` — tek istekte en fazla bu kadar satır. */
export const ALLOCATION_MAX_ITEMS = 500;

/**
 * 🔴 `LandShareValueBalance`ın dört alanı `None` olabilir ve bu
 * "HESAPLANAMAZ"dır, "sıfır" DEĞİL: `0` basmak ekrana "denge uygun"
 * yazdırırdı (sunucunun kendi yorumu). Eşik (`tolerance_pct`) de SUNUCUDAN
 * gelir; istemci onu KOPYALAMAZ — bir eşik iki yerde yaşarsa ayrışır.
 */
export const ALLOCATION_UNCOMPUTABLE = "—";

/**
 * `UnitAllocationRequest.items` sunucuda `min_length=1`dir: değişmemiş bir
 * ekrandan boş liste göndermek 422 üretirdi. Kaydet düğmesi kapalı basılır ve
 * sebebi GÖRÜNÜR olur.
 */
export const ALLOCATION_NO_CHANGES_MESSAGE =
  "Kaydedilecek bir değişiklik yok — önce ünitelerin sahiplik atamasını değiştirin";

/** Rayiç değeri olmayan üniteler otomatik dağıtıma GİREMEZ (bkz. `auto-distribute.ts`). */
export const ALLOCATION_SKIPPED_WITHOUT_VALUE_MESSAGE =
  "Rayiç değeri girilmemiş üniteler otomatik dağıtıma alınmadı — bunları elle atayın";

/** Hedefler dolduğu için dağıtılamayan üniteler. */
export const ALLOCATION_LEFT_UNASSIGNED_MESSAGE =
  "Sözleşme oranı doldu — kalan üniteler atanmadan bırakıldı";

/* ══════════════════════════════════════════════════════════════════════════
   T2c — EKRAN KATMANININ SABİTLERİ
   T1'in üstüne YAZILMAZ, EKLENİR: yukarıdaki sabitler saf katmanın (durum ·
   otomatik dağıtım · gövde) sözleşmesidir, aşağıdakiler ekranın kendi
   yüzeyleridir. İkinci bir sabit dosyası açmak ikisini ayrıştırırdı.
   ══════════════════════════════════════════════════════════════════════════ */

/** PG 60 proje seçicisinin boş seçeneği — TU/EI ile AYNI metin. */
export const ALLOCATION_PLACEHOLDER = "Seçiniz...";

/**
 * Sözleşme oranları henüz gelmemişken PG 101 düğmesinin etiketi. Oran
 * UYDURULMAZ: `autoDistributeLabel` yalnız gerçek oranlarla çağrılır.
 */
export const ALLOCATION_AUTO_DISTRIBUTE_PLAIN_LABEL = "Otomatik Dağıt";

/** PG 62 blok süzgecinin süzgeçsiz hâli. */
export const ALLOCATION_ALL_BLOCKS = "Tüm Bloklar";

/**
 * PG 61 kutusu SALT OKUNURDUR (mockup `<div>` çizer, `<select>` değil) ve
 * kaynağı `LandShareContract.contract_no`dur. O alan `null` OLABİLİR
 * (*"sözleşme kademeli girilir ve boş alan 'bilinmiyor'dur"*) — boş dize
 * basmak kutuyu "hiç yokmuş" gibi gösterirdi.
 */
export const ALLOCATION_CONTRACT_NO_EMPTY = "Sözleşme numarası girilmemiş";

/** PG 109 solundaki kutucuk hepsini seçer; ikinci tıklama seçimi BOŞALTIR. */
export const ALLOCATION_CLEAR_SELECTION_LABEL = "Seçimi Temizle";

/** PG 221 satır içi hissedar seçicisinin boş seçeneği (mockup'ta hep dolu çizilir). */
export const ALLOCATION_ROW_SHAREHOLDER_PLACEHOLDER = "Hissedar seç";

/** PG 190 karşılığı olmayan satırlar için: hissedar sütununun BİZ/atanmadı hâli. */
export const ALLOCATION_UNITS_CARD_LABEL = "Ünite listesi";

/** PG 264-266 hüküm şeridi — ÜÇ hâl (bkz. `value-balance.ts`). */
export const ALLOCATION_VERDICT_OK_TITLE = "Değer dengesi uygun"; // PG 265
export const ALLOCATION_VERDICT_OFF_TITLE = "Değer dengesi sözleşme oranından sapıyor";
/**
 * 🔴 ÜÇÜNCÜ HÂL — DERLEYİCİNİN GÖRMEDİĞİ SINIF. `is_within_tolerance` `null`
 * iken "denge uygun" (yeşil) basmak da `%0` basmak da GERÇEK BİR HATADIR:
 * sunucu "hesaplanamadı" diyor, "sıfır" ya da "uygun" DEMİYOR. Tip sistemi
 * yalnız alanın VAR olduğunu zorlar, ne ANLAMA geldiğini değil.
 */
export const ALLOCATION_VERDICT_UNCOMPUTABLE_TITLE = "Değer dengesi hesaplanamıyor";
export const ALLOCATION_VERDICT_UNCOMPUTABLE_DETAIL =
  "Atanmış ünitelerin rayiç değer toplamı sıfır — oran ve sapma tanımsızdır. Ünitelere rayiç değer girildiğinde denge kendiliğinden hesaplanır.";

/** PG 66-71 · 74-81 · 244-266 kartlarının kaynağı gelmemişse basılan metin. */
export const ALLOCATION_SUMMARY_LOADING = "Sözleşme özeti yükleniyor…";
export const ALLOCATION_UNITS_LOADING = "Üniteler yükleniyor…";
export const ALLOCATION_UNITS_EMPTY = "Bu süzgeçle eşleşen ünite yok.";

/**
 * 🔴 KAT KARŞILIĞI KAYDI OLMAYAN PROJE 404 ALIR — ekran bunu bir HATA gibi
 * değil, AÇIKLAYICI BOŞ HÂL gibi basar. Boş özet basmak "%0/%0 paylaşım"
 * yazdırır ve kullanıcı verinin kaybolduğunu sanardı.
 */
export const ALLOCATION_NO_CONTRACT_MESSAGE =
  "Bu projede kat karşılığı sözleşmesi tanımlı değil — paylaşım girişi yalnız kat karşılığı projelerinde yapılır. Sözleşmeyi proje kartından tanımlayın.";

export const ALLOCATION_PROJECT_REQUIRED_MESSAGE =
  "Önce bir proje seçin — paylaşım kaydı projenin altına yazılır.";
export const ALLOCATION_SUMMARY_ERROR_FALLBACK = "Sözleşme özeti yüklenemedi.";
export const ALLOCATION_UNITS_ERROR_FALLBACK = "Ünite listesi yüklenemedi.";
export const ALLOCATION_FORBIDDEN_MESSAGE = "Kat karşılığı özeti için proje yetkisi gerekiyor.";
export const ALLOCATION_SAVE_ERROR_FALLBACK = "Paylaşım kaydedilemedi.";

/**
 * 🔴 UÇ ATOMİKTİR: *"tek satir bile reddedilirse hicbiri yazilmaz"*. Sunucu
 * gövdesi bunu SÖYLEMEZ (404 yalnız "kayıt bulunamadı" der); bu cümle
 * eklenmezse kullanıcı bir kısmının yazıldığını sanır ve tabloyu yanlış okur.
 */
export const ALLOCATION_ATOMIC_HINT =
  "Hiçbir satır yazılmadı — uç atomiktir, tek satır bile reddedilirse tamamı geri alınır. Tablo sunucudaki güncel hâli gösteriyor.";

/** PG 118-238 sayfa çubuğu (mockup'ta yok; uç SAYFALIDIR — bkz. `useLandShare`). */
export const ALLOCATION_PREV_PAGE_LABEL = "Önceki";
export const ALLOCATION_NEXT_PAGE_LABEL = "Sonraki";

/** "Sayfa 2 / 5" — sayfa sayısı SUNUCUNUN `total`/`limit` alanlarından türer. */
export function allocationPageLabel(page: number, pageCount: number): string {
  return `Sayfa ${page} / ${pageCount}`;
}

/** PG 90 "6 ünite seçili" — sayı ÇALIŞMA ZAMANINDA gelir. */
export function allocationSelectedBadge(count: number): string {
  return `${count} ünite seçili`;
}

/** PG 96-99 · 221 "Ahmet Yılmaz (%50)" — oran OLDUĞU GİBİ basılır (K2). */
export function shareholderOptionLabel(row: LandShareShareholderRow): string {
  return `${row.name} (${formatPercent(row.share_pct)})`;
}

/** PG 68/69 "Biz %55" · "Arsa %45" — oran SÖZLEŞMEDEN gelir, sabit değil. */
export function contractSideLabel(sideLabel: string, pct: Percent): string {
  return `${sideLabel} ${formatPercent(pct)}`;
}

/**
 * PG 71 "42 ünite → Biz 23 · Arsa Sahibi 19".
 *
 * 🔴 BEKLENEN ADETLER SUNUCUDAN GELİR (`our_expected_count` /
 * `owner_expected_count`) ve orada TEK yuvarlamadan türer (*"owner = toplam −
 * our"*). İstemcide yeniden hesaplamak 42 üniteyi 23+20=43 yapan ikinci bir
 * hesap doğururdu.
 */
export function allocationExpectedNote(balance: LandShareCountBalance): string {
  return `${balance.total_unit_count} ünite → ${ALLOCATION_CONTRACTOR_LABEL} ${balance.our_expected_count} · Arsa Sahibi ${balance.owner_expected_count}`;
}

/**
 * PG 80 "6 ünite henüz atanmadı — 3 bize, 3 arsa sahibine kalmalı".
 *
 * 🔴 `*_missing_count` İŞARETLİDİR: artı = EKSİK atama, eksi = FAZLA atama
 * (`LandShareCountBalance` açıklaması: *"Mutlak degere indirgemek '3 eksik'
 * ile '3 fazla'yi ayni sayi yapardi"*). Bu yüzden cümle işarete göre kurulur;
 * `Math.abs` KULLANILMAZ.
 *
 * Atanmamış ünite yoksa `null` döner — "0 ünite atanmadı" bir uyarı değildir.
 */
export function allocationUnassignedNote(balance: LandShareCountBalance): string | null {
  if (balance.unassigned_count === 0) return null;
  const parts = [
    sideRemainderPhrase(balance.our_missing_count, "bize"),
    sideRemainderPhrase(balance.owner_missing_count, "arsa sahibine"),
  ].filter((part): part is string => part !== null);
  const head = `${balance.unassigned_count} ünite henüz atanmadı`;
  return parts.length === 0 ? head : `${head} — ${parts.join(", ")}`;
}

/** İşaretli eksik/fazla sayısını cümleye çevirir; sıfırda hiç yazılmaz. */
function sideRemainderPhrase(missing: number, who: string): string | null {
  if (missing > 0) return `${missing} ${who} kalmalı`;
  if (missing < 0) return `${-missing} ${who} fazla atandı`;
  return null;
}

/** PG 249 "Sözleşme gereği (Biz %55)" — oran sözleşmeden TÜRER. */
export function allocationContractRequirementLabel(ourPct: Percent): string {
  return `Sözleşme gereği (${ALLOCATION_CONTRACTOR_LABEL} ${formatPercent(ourPct)})`;
}

/** PG 250/251/252 · 264 "23 ünite" — sayı + birim. */
export function allocationUnitCountLabel(count: number): string {
  return `${count} ünite`;
}

/** PG 260 "%55,6 / %44,4" — İKİSİ DE `null` olabilir (hesaplanamaz hâl). */
export function allocationActualRatioLabel(
  ourPct: Percent | null,
  ownerPct: Percent | null,
): string {
  if (ourPct === null || ownerPct === null) return ALLOCATION_UNCOMPUTABLE;
  return `${formatPercent(ourPct)} / ${formatPercent(ownerPct)}`;
}
