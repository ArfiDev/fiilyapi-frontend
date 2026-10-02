import { divideDecimalStrings, multiplyDecimalStrings, toDecimalString } from "@/lib/decimal";
import type { Percent } from "@/lib/api/scale";

const LOCALE = "tr-TR";

/**
 * Bos hucre — urunun kanonik gosterimi (`settings/audit-format` ile AYNI).
 *
 * 🔴 Kapsam maskesi (backend `core/field_scope`, kullanici karari 2026-09-19)
 * para ve metraj alanlarini `null` dondurur: `limited` rol tutari, `finance`
 * rol metraji GOREMEZ. Bicimlendiriciler bunu islemek ZORUNDADIR cunku
 * `Number(null)` **0**'dir — null-toleranssiz bir bicimlendirici gizlenmis bir
 * tutari ekranda "₺ 0,00" diye basar ve kullanici SAHTE bir sayiya dayanarak
 * karar verir. Bu, gizlemekten daha kotudur.
 *
 * 🔴 SIFIR maskelenmis DEGILDIR: `0` gercek bir degerdir ve "₺ 0,00" basilir.
 * Ayrimi `Maskeli` tipi tasir (`null`/`undefined` maskeli, `0` degil).
 */
export const EMPTY_CELL = "—";

/** Maskelenebilir sayisal deger. */
export type Maskeli = string | number | null | undefined;

function maskeli(value: Maskeli): value is null | undefined {
  return value === null || value === undefined;
}
const MILLION = 1_000_000;
const THOUSAND = 1_000;

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

/** Sondaki sifirlari atarak en fazla bir ondalik basar: 1,5 · 8 · 42,5 */
function short(value: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value);
}

/** Kart tutarlari: mockup'taki "₺ 8,4M" gosterimi. */
export function formatCompactCurrency(value: Maskeli): string {
  if (maskeli(value)) return EMPTY_CELL;
  const n = toNumber(value);
  if (Math.abs(n) >= MILLION) return `₺ ${short(n / MILLION)}M`;
  if (Math.abs(n) >= THOUSAND) return `₺ ${short(n / THOUSAND)}B`;
  return `₺ ${short(n)}`;
}

/** `formatCompactCurrencyTight` ondalik tavani — E9:103-104 IKI basamak yazar. */
const COMPACT_TIGHT_FRACTION_DIGITS = 2;

/** En fazla IKI ondalik, sondaki sifirlar atilir: 4,12 · 3,84 · 4 */
function shortTight(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: COMPACT_TIGHT_FRACTION_DIGITS,
  }).format(value);
}

/**
 * Nakit akisi aciklama seridi (F-HZ T3.0 · E9:103 `₺4,12M` · E9:104 `₺3,84M`).
 *
 * `formatCompactCurrency`den IKI farki vardir: `₺` ile sayi arasinda BOSLUK
 * YOKTUR ve ondalik tavani BIR degil IKIdir. E9 kendi icinde tutarlidir —
 * BOSLUKLU bicim yalniz kart bakiyelerinindir (E9:72/77/82 `₺ 2.840.500`),
 * geri kalan her para BOSLUKSUZ yazilir (E9:103/104/114/118/122). Ayni okuma
 * `formatCurrencyTight`i (E9:114) da dogurmustu.
 *
 * 🔴 `formatCompactCurrency` DEGISTIRILMEZ: `/makine` KPI'i ("₺ 144,2B") ve 20+
 * cagiran ona baglidir; tek ondalikli/bosluklu bicimi oynatmak o ekranlarin
 * baseline'larini sessizce kirardi. Bu yuzden AYRI bir varyant acildi.
 */
export function formatCompactCurrencyTight(value: Maskeli): string {
  if (maskeli(value)) return EMPTY_CELL;
  const n = toNumber(value);
  if (Math.abs(n) >= MILLION) return `₺${shortTight(n / MILLION)}M`;
  if (Math.abs(n) >= THOUSAND) return `₺${shortTight(n / THOUSAND)}B`;
  return `₺${shortTight(n)}`;
}

/**
 * Ondalik basmayan para bicimleyicileri `maximumFractionDigits: 0` ile
 * `Intl.NumberFormat`e verilirse Intl kurusu KESMEZ, YARIM-YUKARI YUVARLAR:
 * 1.200.000,50 → "1.200.001" basardi — sunucudaki tutardan BUYUK, var
 * olmayan bir kurusu var gosterirdi (O5a-111/362). Form katmani kurusu
 * ZORUNLU tutarken (financial-instrument-form.ts) ekran onu gostermeden
 * USTE yuvarlarsa tutar YALAN olur — bu yuzden basmadan ONCE `Math.trunc`
 * ile sifira dogru kesilir (negatifte de buyuklugu ABARTMAZ).
 */
function truncateToWhole(n: number): number {
  return Math.trunc(n);
}

/** Portfoy tutari: mockup'taki "24.870.500" gosterimi. */
export function formatCurrency(value: Maskeli): string {
  if (maskeli(value)) return EMPTY_CELL;
  const formatted = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(
    truncateToWhole(toNumber(value)),
  );
  return `₺ ${formatted}`;
}

/**
 * Yaklasan odeme satirinin tutari (F-HZ T2 · E9:114 `₺1.016.800`).
 * `formatCurrency`den TEK farki: `₺` ile sayi arasinda BOSLUK YOKTUR. Mockup
 * ayni ekranda iki farkli bicim kullanir — kart bakiyesi bosluklu (E9:72
 * `₺ 2.840.500`), odeme satiri bosluksuz (E9:114) — ikisi de birebir uygulanir.
 */
export function formatCurrencyTight(value: Maskeli): string {
  if (maskeli(value)) return EMPTY_CELL;
  return `₺${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(truncateToWhole(toNumber(value)))}`;
}

/** Ilerleme yuzdesi: "%42,5" · "%75" */
export function formatPercent(value: Percent | null | undefined): string {
  if (maskeli(value)) return EMPTY_CELL;
  return `%${short(toNumber(value))}`;
}

/**
 * Ekran 13 · Is Kalemleri (BOQ) tablo sayilari (spec §3.4).
 * ₺ YOK — mockup 114–116 ve 176'da sembol basilmiyor; `formatCurrency` bastigi
 * icin bu ekranda kullanilamaz. tr-TR binlik ayrac, sondaki sifirlar atilir.
 * Backend Decimal alanlari string gonderir (`quantity: "1240.000"`).
 */
export function formatDecimal(value: Maskeli, maxFractionDigits: number): string {
  if (maskeli(value)) return EMPTY_CELL;
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxFractionDigits }).format(
    toNumber(value),
  );
}

/** `formatDays` ondalik tavani — yarim gun (`,5`) korunur, daha incesi yuvarlanir. */
const DAY_FRACTION_DIGITS = 1;

/** Miktar sutunu: en fazla 3 ondalik — numeric(14,3) (mockup 114). */
export function formatQuantity(value: Maskeli): string {
  if (maskeli(value)) return EMPTY_CELL;
  return formatDecimal(value, 3);
}

/**
 * ADAM-GUN sayisi — `formatQuantity`/`formatAmount` ile AYNI aile, tavan BIR
 * ondalik: gun YARIM olabilir ama yarimdan ince okunmaz.
 *
 * NEDEN BURADA (BOR-GUN, 2026-08-30): bu yardimci `components/leaves/
 * leaves-derive.ts` icinde dogmustu ve IZIN ekranlarinin altisi onu
 * kullaniyordu. PUAN-SAAT-3 `PayrollLine.days`i `int` -> `Decimal` yapinca
 * BORDRO satiri da ayni bicime muhtac kaldi (`"23.00"` basiyordu). Iki secenek
 * olculdu:
 *   - bordronun `leaves`ten import etmesi -> iki KARDES ozellik klasoru
 *     arasinda bagimlilik; izin ekranini degistiren biri bordroyu sessizce
 *     oynatabilirdi,
 *   - bordroya IKINCI bir gun bicimleyicisi yazmak -> ayni sayi iki ekranda
 *     farkli okunabilirdi.
 * Ucuncusu secildi: yardimci PAYLASILAN bicim katmanina tasindi, `leaves`
 * onu buradan RE-EXPORT eder (o dosya `formatDateDots`i zaten boyle tasir).
 * Davranis izin ekranlarinda BIREBIR aynidir.
 *
 * ACIK BORC: adam-gun artik `saat / 9` turevidir (PUAN-SAAT-1), yani
 * `22.444...` gibi ucte-bir kalintilar uretebilir ve bu tavan onu `22,4`e
 * yuvarlar. Gun sutunu BILGIdir, para sunucudan gelir — yuvarlama hicbir
 * tutari oynatmaz. Sunucu gun sayisini ikiden ince quantize etmeye baslarsa
 * tavan BURADA, tek yerde degisir.
 */
export function formatDays(value: Maskeli): string {
  if (maskeli(value)) return EMPTY_CELL;
  return formatDecimal(value, DAY_FRACTION_DIGITS);
}

/** Birim fiyat / tutar / genel toplam: en fazla 2 ondalik (mockup 115, 116, 176). */
export function formatAmount(value: Maskeli): string {
  if (maskeli(value)) return EMPTY_CELL;
  return formatDecimal(value, 2);
}

/**
 * Kart tarihleri: mockup'taki "Mar 2025" gosterimi. Girdi `YYYY-MM-DD` ISO
 * tarihidir ve STRING olarak ayrıştırılır.
 *
 * 🔴 KAYIT 428 (2026-09-23): bu fonksiyon ÖNCEDEN `new Date(iso)` +
 * `Intl.DateTimeFormat` kullanıyordu — dosyadaki `formatDayMonth`/
 * `formatDateLong`/`formatDayMonthShort`/`formatPeriod`/`formatPeriodShort`
 * yorumlarının AÇIKÇA yasakladığı desen (UTC yorumlanır, TR saatinde bir gün
 * geri kayar; `Intl.DateTimeFormat` de jsdom/CI'da ICU verisi eksikse
 * güvenilmez). `TR_MONTHS_SHORT` tek kaynağından türetilerek aynı ortam-
 * bağımsız desene getirildi.
 */
export function formatMonthYear(iso: string): string {
  const [year, month] = iso.split("-");
  const name = TR_MONTHS_SHORT[Number(month) - 1];
  if (year === undefined || name === undefined) return iso;
  return `${name} ${year}`;
}

/**
 * Hakediş liste tutarı (P7 T2, spec §S6: `gross_total` — brüt). Kuruş
 * hassasiyetli: `formatAmount` gibi en fazla 2 ondalık basar, sondaki
 * sıfırlar atılır — ama burada `₺` öneki de vardır (mockup 99, 103'te tutar
 * `₺` ile başlar). `toLocaleString("tr-TR")` gibi ortam-bağımlı bir çağrı
 * DEĞİL; `Intl.NumberFormat` ile aynı desen (`formatCurrency`/`formatAmount`).
 */
export function formatCurrencyPrecise(value: Maskeli): string {
  if (maskeli(value)) return EMPTY_CELL;
  return `₺ ${formatDecimal(value, 2)}`;
}

const THOUSANDS_GROUP = /\B(?=(\d{3})+(?!\d))/g;
const MONEY_TL_DIGITS = 2;

/**
 * Dize tabanlı sabit haneli tr-TR biçimi: binlik nokta, virgül ondalık, HALF_UP (sıfırdan uzağa) —
 * `Number()` YOK, kayıpsız. Girdi geçerli ondalık dizedir (`toDecimalString` çıktısı).
 */
export function formatFixedDecimal(value: string, digits: number): string {
  const rounded = divideDecimalStrings(value, "1", digits) ?? value;
  const negative = rounded.startsWith("-");
  const [whole = "0", fraction = ""] = rounded.replace(/^-/, "").split(".");
  const grouped = whole.replace(THOUSANDS_GROUP, ".");
  const sign = negative ? "-" : "";
  return fraction === "" ? `${sign}${grouped}` : `${sign}${grouped},${fraction}`;
}

/**
 * TKL · mockup `tl(v)` = "₺" + `nf(v,2)`: boşluksuz, kuruşlu ("₺73.982.140,00"). Teklif detayı + PDF ortak.
 * Maskeli (null/undefined) ya da geçersiz → EMPTY_CELL.
 */
export function formatMoneyTl(value: string | null | undefined): string {
  const decimal = value === null || value === undefined ? null : toDecimalString(value);
  return decimal === null ? EMPTY_CELL : `₺${formatFixedDecimal(decimal, MONEY_TL_DIGITS)}`;
}

/** Türkçe ay adları. */
const TR_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

/**
 * Dönem seçici seçenekleri (P7 T5): hakediş oluştur/düzenle formunun ay
 * `Select`i BUNU kullanır — `TR_MONTHS`i KOPYALAMAZ, aynı diziden türetir
 * (brief §Form üst bölümü: "T2'de yazılmış ay yardımcısını YENİDEN KULLAN").
 */
export const PERIOD_MONTHS: readonly { value: number; label: string }[] = TR_MONTHS.map(
  (label, index) => ({ value: index + 1, label }),
);

/**
 * Hakediş dönemi (P7 T2 brief): "Mayıs 2026". `month` 1-12 aralığında
 * beklenir; `Intl.DateTimeFormat`/`toLocaleString("tr-TR")` kullanılmaz —
 * jsdom/CI'da ICU verisi eksik olabilir, ortam-bağımsız sabit dizi tercih
 * edilir.
 */
export function formatPeriod(year: number, month: number): string {
  const name = TR_MONTHS[month - 1];
  return name ? `${name} ${year}` : `${month}/${year}`;
}

/**
 * `TR_MONTHS`in standart 3 harfli kısaltmaları — `formatPeriodShort` bundan
 * türer. İHRAÇ EDİLİR (PLN-F3.0-borç, lider denetimi): başka modüllerin
 * KENDİ kopyasını yazması yerine TEK kaynaktan alması için — bkz. bu dosyanın
 * en altındaki "TEK KAYNAK" notu.
 */
export const TR_MONTHS_SHORT = TR_MONTHS.map((name) => name.slice(0, 3));

/**
 * Hakediş listesi dönem hücresi (F-TH T2, Ekran 2 satır 143: "Tem 2026",
 * "Haz 2026", "May 2026"). `formatPeriod`in kısaltılmış hâli — `Intl.
 * DateTimeFormat`/`toLocaleString` KULLANMAZ (aynı ortam-bağımsızlık
 * gerekçesi: `formatPeriod`'un üstündeki not).
 */
export function formatPeriodShort(year: number, month: number): string {
  const name = TR_MONTHS_SHORT[month - 1];
  return name ? `${name} ${year}` : `${month}/${year}`;
}

/**
 * Ay adı tek başına (F-SD T3, GK388: "💰 Temmuz Hakediş Birikimi"). `month`
 * 1-12; aralık dışında sayı basılır. `formatPeriod` ile AYNI diziden türer —
 * ay adları kopyalanmaz.
 */
export function formatMonthName(month: number): string {
  return TR_MONTHS[month - 1] ?? String(month);
}

/**
 * Ay KISALTMASI tek başına, yılsız (F-TKV T3, Proje Takvimi mockup 123-146:
 * ızgara başlığında "Oca"/"Şub"… yazar, yıl AYRI bir sütundadır — 121).
 * `formatPeriodShort`in yılsız kardeşi; ay adları `TR_MONTHS_SHORT` tek
 * kaynağından gelir, kopyalanmaz.
 */
export function formatMonthShort(month: number): string {
  return TR_MONTHS_SHORT[month - 1] ?? String(month);
}

/**
 * Gün + ay (F-SD T3, GK360: "16 Temmuz"). Girdi `YYYY-MM-DD` ISO tarihidir ve
 * STRING olarak ayrıştırılır — `new Date(iso)` UTC yorumlar, TR saatinde bir
 * gün geri kayardı (`derive.ts/isoDate`in aynı gerekçesi). ICU'ya da bağlı
 * değildir (`formatPeriod` notu).
 */
export function formatDayMonth(iso: string): string {
  const [year, month, day] = iso.split("-");
  const name = TR_MONTHS[Number(month) - 1];
  if (year === undefined || day === undefined || name === undefined) return iso;
  return `${Number(day)} ${name}`;
}

/**
 * Gün + ay + yıl (F-MK T2, M1 112/149: "19 Temmuz 2026"). `formatDayMonth`in
 * yıl eklenmiş hâli — aynı gerekçeyle `new Date(iso)` KULLANILMAZ (UTC
 * yorumlanır, TR saatinde bir gün geri kayardı).
 */
export function formatDateLong(iso: string): string {
  const [year, month, day] = iso.split("-");
  const name = TR_MONTHS[Number(month) - 1];
  if (year === undefined || day === undefined || name === undefined) return iso;
  return `${Number(day)} ${name} ${year}`;
}

/**
 * UTC bir zaman damgasını (backend `created_at`/`occurred_at` gibi) Europe/Istanbul
 * takvim gününe çevirir, `YYYY-MM-DD` döner — `formatDateLong`/`formatDayMonth` gibi
 * yalnız ISO TARİH kabul eden fonksiyonların girdisidir.
 *
 * 🔴 KAYIT NO 24 — `isoTimestamp.slice(0, 10)` UTC gününü verir, yerel güne ÇEVİRMEZ:
 * 21:00Z sonrası oluşan kayıtlar (00:00-02:59 TR) bir gün GERİDE görünür. `en-CA`
 * locale'i doğrudan `YYYY-MM-DD` üretir (audit-format.ts'teki `AUDIT_TIME_ZONE`
 * deseniyle aynı sabit saat dilimi).
 */
export function toIstanbulDateOnly(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(
    new Date(isoTimestamp),
  );
}

/**
 * PLN-F3.0-borç-2 · zaman damgası çözücünün TEK kaynağı.
 *
 * Ofset TAŞIMAYAN (naive) zaman damgaları UTC kabul edilir — backend UTC
 * saklar, dolayısıyla ofsetsiz bir değeri tarayıcının yerel saati saymak
 * kullanıcının bulunduğu zaman dilimine göre KAYAN bir sonuç üretirdi.
 *
 * ÖLÇÜLDÜ: bu teknik (regex + `Z` ekleme) üç yerde AYRI AYRI yazılmıştı
 * (`settings/audit-format.ts formatAuditTime`, `earned-value/reports/kit/
 * report-date-format.ts` — B, `earned-value/reports/daily/daily-datetime.ts`
 * — C); üçü de BAYT BAYT aynı `HAS_OFFSET` deseni + `parseX(value)`
 * fonksiyonunu taşıyordu. `EXPORT_XLSX` kanonuyla AYNI sınıf (`lib/api/
 * download.ts` üstündeki not) — TEK gerçek fark biçim ÇIKTISI (saat mi,
 * tarih+saat mi), çözücünün KENDİSİ hiç değişmiyordu.
 */
const TIMESTAMP_HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

export function parseUtcOrOffsetTimestamp(value: string): Date {
  return new Date(TIMESTAMP_HAS_OFFSET.test(value) ? value : `${value}Z`);
}

const DATE_TIME_DOTS_PARTS = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  // h23: gece yarısı "24:xx" değil "00:xx" yazılır.
  hourCycle: "h23",
});

/**
 * ISO zaman damgası → "gg.aa.yyyy ss:dd" (Europe/Istanbul, 24 saat) — GİR
 * mockup biçimi (GİR:97 "Onaylandı — Mehmet Kaya, 25.09.2026 09:12", GİR:133,
 * GİR:280). Boş/geçersiz → `EMPTY_CELL`.
 *
 * `toLocaleString("tr-TR")`/başka bir yerel `Intl.DateTimeFormat` biçimi
 * DOĞRUDAN KULLANILMAZ — bu dosyanın env-bağımsızlık notu geçerli; burada
 * `formatToParts` + SABİT `timeZone`/`hourCycle` ile `formatAuditTime`in
 * AYNI güvenli tekniği kullanılır.
 */
export function formatDateTimeDots(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return EMPTY_CELL;
  const date = parseUtcOrOffsetTimestamp(iso);
  if (Number.isNaN(date.getTime())) return EMPTY_CELL;
  const parts = Object.fromEntries(DATE_TIME_DOTS_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}

/**
 * Gün + KISA ay (F-PL T2, Planlama ızgarasının gün başlıkları — P111-117:
 * "21 Tem"). `formatDayMonth`in kısaltılmış hâli; ay adları `TR_MONTHS_SHORT`
 * tek kaynağından gelir (`formatPeriodShort` ile AYNI dizi).
 *
 * `new Date(iso)` KULLANILMAZ — UTC yorumlanır, TR saatinde bir gün geri
 * kayardı (`derive.ts/isoDate`in aynı gerekçesi).
 */
export function formatDayMonthShort(iso: string): string {
  const [year, month, day] = iso.split("-");
  const name = TR_MONTHS_SHORT[Number(month) - 1];
  if (year === undefined || day === undefined || name === undefined) return iso;
  return `${Number(day)} ${name}`;
}

/**
 * `YYYY-MM-DD` → "01.04.2025" (F-P5 T2 · SZL 58-59 Başlangıç/Bitiş hücreleri).
 *
 * `new Date(iso)` KULLANILMAZ — UTC yorumlanır, TR saatinde bir gün geri
 * kayardı (`formatDayMonth`in aynı gerekçesi). Ayrıştırılamayan girdi olduğu
 * gibi geri döner.
 */
export function formatDateDots(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (year === undefined || month === undefined || day === undefined) return iso;
  return `${day}.${month}.${year}`;
}

/**
 * `formatDateDots`in TERSİ: "01.04.2025" → `YYYY-MM-DD` (F-DATE T2).
 *
 * `ui/date-input` primitive'i BUNU kullanır — TR gösterimden ISO değere dönüş
 * tek kaynaktan gelir, ay/gün ayrıştırma kopyalanmaz.
 *
 * `new Date(...)` ile ayrıştırma KULLANILMAZ: `new Date("31.02.2026")` ortama
 * göre ya `Invalid Date` verir ya da 3 Mart'a TAŞAR — sessiz veri kayması.
 * Bunun yerine kalıp sıkı bir regexle okunur ve gün, AYIN GERÇEK uzunluğuna
 * karşı doğrulanır (`Date.UTC(yıl, ay, 0)` = o ayın son günü; UTC seçildi ki
 * yerel saat/DST gün sayısını kaydırmasın — `formatWeekdayShort` ile aynı
 * gerekçe).
 *
 * Ayrıştırılamayan girdi BOŞ döner (yarım girdi gövdeye sızmamalı) — bu,
 * `formatDateDots` ailesinin "girdiyi aynen geri ver" üslubundan BİLEREK
 * ayrılır: burada dönen değer bir SUNUCU DEĞERİDİR, ekran metni değil.
 */
export function parseDateDots(display: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(display.trim());
  if (match === null) return "";
  const [, day, month, year] = match;
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return "";
  const dayNumber = Number(day);
  const lastDayOfMonth = new Date(Date.UTC(Number(year), monthNumber, 0)).getUTCDate();
  if (dayNumber < 1 || dayNumber > lastDayOfMonth) return "";
  return `${year}-${month}-${day}`;
}

/** Haftanın günleri — dizinin sırası `Date.getUTCDay()` ile aynıdır (0 = Pazar). */
const TR_WEEKDAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/**
 * Haftanın günleri, TAM ad — dizinin sırası `Date.getUTCDay()` ile aynıdır
 * (0 = Pazar). İHRAÇ EDİLİR (PLN-F3.0-borç, lider denetimi): `site-diary/
 * derive.ts` ve `earned-value/reports/kit/report-date-format.ts` aynı diziyi
 * KENDİ private kopyalarında taşıyordu — TEK kaynak burası.
 */
export const TR_WEEKDAYS_LONG = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"] as const;

/**
 * `YYYY-MM-DD` → "Pzt" (F-SD GK327 · F-PL P111-117). TEK KAYNAK: hem günlük
 * kaydın gömülü planlama bloğu hem Planlama ızgarası bunu kullanır.
 *
 * `Date` YALNIZ haftanın gününü vermek üzere UTC olarak kurulur — yerel saat
 * kullanılsaydı DST/gece yarısı kayması gün adını bir gün kaydırabilirdi.
 * `Intl.DateTimeFormat` kullanılmaz (jsdom/CI'da ICU verisi eksik olabilir).
 */
export function formatWeekdayShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  return TR_WEEKDAYS_SHORT[date.getUTCDay()] ?? "";
}

/**
 * `MM/YYYY` → "Temmuz 2026" (F-OK T5 · `Onay Kutusu.dc.html:127` `:220`
 * "Temmuz 2026" yazar).
 *
 * 🔴 NEDEN AYRI BİR YARDIMCI: `ApprovalInboxItem`ta YAPILANDIRILMIŞ dönem alanı
 * YOKTUR (`period_year`/`period_month` yok). Backend dönemi `subtitle` metnine
 * `MM/YYYY` olarak GÖMER (`approvals/inbox.py`) ve modül docstring'i bunu
 * bilinçli sapma olarak yazar: *"backend'de Türkçe AY ADI sözlüğü YOKTUR"*.
 * Türkçeleştirme bu yüzden istemcidedir.
 *
 * `TR_MONTHS` TEK KAYNAK kalır — `formatPeriod`a devredilir, ay adı sözlüğü
 * KOPYALANMAZ. Kalıba uymayan girdi (ya da 1-12 dışındaki ay) AYNEN geri döner:
 * `formatDateDots`/`formatDayMonth` ailesinin düşüş üslubu — alt başlık dönem
 * TAŞIMAYABİLİR ve o hâlde metne dokunulmamalıdır.
 */
export function formatPeriodLabel(period: string): string {
  const match = /^(\d{2})\/(\d{4})$/.exec(period);
  if (match === null) return period;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return period;
  return formatPeriod(Number(match[2]), month);
}

/** m/s → km/sa çarpanı (kayıpsız ondalık). */
const MS_TO_KMH = "3.6";

/**
 * Rüzgâr m/s → "18 km/sa" (İ:707 tam sayı, ROUND_HALF_UP · K22 etiket "km/sa").
 *
 * PLN-F2.1: `lib/earned-value/format`tan buraya taşındı — çekirdek günlük
 * ekranının hava kartı kullanır ve çekirdek planlamayı import EDEMEZ (spec
 * §2.7). `lib/earned-value` aynı fonksiyonu buradan yeniden ihraç eder.
 */
export function formatWindKmh(metersPerSecond: Maskeli): string {
  const decimal = toDecimalString(metersPerSecond);
  if (decimal === null) return EMPTY_CELL;
  const kmh = divideDecimalStrings(multiplyDecimalStrings(decimal, MS_TO_KMH), "1", 0);
  if (kmh === null) return EMPTY_CELL;
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(Number(kmh))} km/sa`;
}
