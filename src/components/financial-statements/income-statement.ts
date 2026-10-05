import type { Period } from "@/components/accounting/accounting-labels";
import { currentPeriod } from "@/components/accounting/accounting-labels";
import { isZeroDecimalString, subtractDecimalStrings } from "@/lib/decimal";
import { formatPeriod } from "@/lib/format";

/**
 * F-MT2 T1 · Gelir Tablosu ekranının SAF katmanı. Kanonik mockup
 * `Ekran 11 - Mali Tablo.dc.html` (E11); yorumlardaki sayılar O dosyanın
 * SATIR numaralarıdır. Bu modülde AĞ ve DOM yoktur; testi
 * `income-statement.test.ts`te yaşar.
 *
 * 🔴 ÖLÇÜM (bu dilimde yeniden yapıldı, F-MT T4'ün ölçümü ARTIK BAYAT):
 * `src/lib/api/schema.d.ts` `IncomeStatementResponse`/`IncomeStatementSection`/
 * `IncomeStatementLine` şemalarını ve `GET /income-statement?year&month`
 * yolunu TAŞIYOR. Uç açıldı ⇒ E11'in TABLOSU artık gerçektir; devre dışı
 * kalan yüzeyler yalnız kaynaksız olanlardır (aşağıdaki anahtarlar).
 */

/** E11:37 — `Ocak–Temmuz 2026` aralık ayracı (U+2013, boşluksuz). */
const RANGE_DASH = "–";

/** Yüzdeye çevirme çarpanı — `x / y` bir ORAN, ekranda `%` basılır. */
const PERCENT = 100;

/**
 * E11:71 `PDF İndir` düğmesinin devre-dışı gerekçesinin anahtarı.
 *
 * Uçta hiçbir dışa aktarma yolu YOKTUR. `balance_sheet_export` /
 * `cash_flow_statement_export` PAYLAŞILMAZ: o metinler adıyla "bilanço" /
 * "nakit akış tablosu" der ve bu ekranda YANLIŞ yüzeyi işaret ederlerdi
 * (F-MU2 K6 kanonu: EKRAN BAŞINA ayrı anahtar).
 */
export const INCOME_STATEMENT_EXPORT_REASON = "income_statement_export";

/** E11:82 — proje süzgeci; uç `project_id` parametresi ALMAZ. */
export const PROJECT_FILTER_REASON = "financial_statements_project_filter";

/**
 * 🔴 K2 — E11:99 `↑ %8,3` TREND sütunu.
 *
 * Uç trendi BİLEREK dışladı (`IncomeStatementLine` şema açıklaması: "trend
 * önceki dönem karşılaştırması ister; mockup hangi dönem olduğunu SÖYLEMİYOR
 * ve algoritma İCAT EDİLMEZ"). Sütun SİLİNMEZ (F-TH kanonu), gelir
 * kalemlerinde `—` basar ve gerekçesi BU anahtardan türer.
 */
export const INCOME_STATEMENT_TREND_REASON = "income_statement_trend";

/**
 * 🔴 K2 — E11:151-167 `Performans Özeti`.
 *
 * Kartın ÜÇ satırından yalnız biri (`Brüt Marj %14,1` — ki aslında NET
 * marjdır) hesaplanabilir ve o zaten tablonun `DÖNEM KARI` satırında basılır.
 * `Bütçe Kullanımı` ve `Tahsilat Oranı` HİÇBİR uçtan gelmez. Tek satır için
 * kart doldurulmaz: kalan ikisi uydurulmuş olurdu.
 */
export const PERFORMANCE_SUMMARY_REASON = "financial_performance_summary";

/**
 * 🔴 K2 — E11:169-189 `Proje Bazlı Karlılık`.
 *
 * ÖLÇÜLDÜ: üç mali tablo ucunun HİÇBİRİ `project_id`/`site_id` taşımaz ve
 * muhasebe tabloları proje kırılımı TUTMAZ. Kart bir uç eksikliği değil bir
 * VERİ MODELİ eksikliğidir; MT-2 ile açılmaz.
 */
export const PROJECT_PROFITABILITY_REASON = "project_profitability";

/* ------------------------------------------------------------------ */
/* K1 · MUTABAKAT — `total_revenue − total_expense` ile `period_profit` */
/* ------------------------------------------------------------------ */

/**
 * 🔴 K1 · İKİ SAYI AYRIŞABİLİR VE BU BİLİNÇLİDİR.
 *
 * Gider kalemleri maliyet AKTARIM hesaplarının iki bacağını da dışlar
 * (`income_statement.py:183` — satır BRÜT gideri gösterir); `period_profit()`
 * (`:264`) ise HAM kayıtlardan beslenir ve o hesapları SAYAR. Fark = tam
 * olarak şu 12 hesabın net toplamıdır: 700, 701, 711, 721, 731, 741, 751,
 * 761, 771, 781, 798, 799. Yansıtma fişi atılmamışsa fark `0`dır.
 *
 * 🔴 `Number(a) - Number(b)` YASAK: mutabakat bir EŞİKTİR ve bir kuruşluk
 * kaçak "mutabık" sayılamaz; ayrıca kurumsal ölçekte tutarlar 2⁵³'ü aşabilir
 * ve orada float TAMSAYI çözünürlüğünü kaybeder. Ayrışma noktası testi
 * `income-statement.test.ts`tedir.
 */
export function incomeStatementDifference(
  totalRevenue: string | null,
  totalExpense: string | null,
  periodProfit: string | null,
): string | null {
  return subtractDecimalStrings(subtractDecimalStrings(totalRevenue, totalExpense), periodProfit);
}

/**
 * Fark SIFIR mı? Metin karşılaştırması (`=== "0"`) YETMEZ: aynı sıfır bir
 * dönemde `"0"`, ötekinde `"0.00"` yazılır (`isZeroDecimalString` kanonu).
 */
export function isIncomeStatementReconciled(
  totalRevenue: string | null,
  totalExpense: string | null,
  periodProfit: string | null,
): boolean | null {
  const difference = incomeStatementDifference(totalRevenue, totalExpense, periodProfit);
  // 🔴 IZN-F4b.2: girdilerden biri gizli (`null`) ise mutabakat DOĞRULANAMAZ — `null` döner;
  // "uyuşmuyor" da "uyuşuyor" da denmez (null'ı 0 sayıp sahte "Mutabık" basmak YASAK).
  if (difference === null) return null;
  return isZeroDecimalString(difference);
}

/* ------------------------------------------------------------------ */
/* K1.4 · ORAN / MARJ — E11:117-126 (gider payı) · E11:142 (net marj)   */
/* ------------------------------------------------------------------ */

/**
 * Bir tutarın TOPLAM GELİRE oranı, yüzde olarak. Mockup'ın sağ sütunu bu
 * paydayı kullanır (ÖLÇÜLDÜ: 12.480.000 / 24.994.700 = %49,9 · 42.000 /
 * 24.994.700 = %0,2 · 3.512.700 / 24.994.700 = %14,1 — üçü de tutuyor).
 *
 * 🔴 PAYDA SIFIRSA `null` (K1.4). Backend BİLEREK bölmüyor
 * (`ZeroDivisionError`); guard İSTEMCİDEDİR. `null` "oran yok" demektir ve
 * ekranda `—` basılır — `NaN`/`Infinity` ekrana ASLA sızmaz.
 *
 * 🔴 Sıfır denetimi STRING düzeyinde (`isZeroDecimalString`) yapılır:
 * `Number(value) === 0` ölçek farkını (`"0.00"`) yakalar ama `"abc"` gibi
 * bozuk bir girdiyi `NaN === 0 ⇒ false` diye "geçerli payda" sayardı.
 *
 * ⚠️ BÖLME `Number` üzerinde yapılır ve bu BİLİNÇLİ bir sapmadır (repodaki
 * "float YASAK" kuralı TOPLAM/FARK/EŞİK içindir). Sonuç bir GÖSTERİM
 * değeridir ve ekranda 0,1 punto çözünürlükle basılır; float'ın bağıl hatası
 * (~1e-16) o çözünürlüğün on üç basamak altındadır. Mutabakat farkı ise
 * yukarıda KAYIPSIZ alınır — para kararı orada verilir, burada değil.
 */
export function revenueSharePercent(
  amount: string | null,
  totalRevenue: string | null,
): number | null {
  // IZN-F4b.2 — pay ya da payda gizliyse oran YOK (`Number(null)` = 0 tuzağı → sahte %0).
  if (amount === null || totalRevenue === null) return null;
  if (isZeroDecimalString(totalRevenue)) return null;
  const numerator = Number(amount);
  const denominator = Number(totalRevenue);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return (numerator / denominator) * PERCENT;
}

/* ------------------------------------------------------------------ */
/* E11:76-81 · DÖNEM GEZGİNİ — BİRİKİMLİ aralık                        */
/* ------------------------------------------------------------------ */

/**
 * E11:79 dönem etiketi. 🔴 **BİRİKİMLİ ARALIK, tek ay DEĞİL**: uç `year`+
 * `month` alır ama pencere "1 Ocak → seçilen ayın son günü"dür (nakit
 * akışıyla AYNI semantik, bilançonun NOKTA-ZAMANIYLA değil).
 *
 * `month === 1` ise aralığın iki ucu AYNI aydır; "Ocak–Ocak 2026" yerine kısa
 * yazım basılır — aynı pencerenin adıdır (`cashFlowRangeLabel` emsali).
 *
 * 🔴 Mockup'ın sabit `Ocak – Temmuz 2026` metni KOPYALANMAZ: ekran 2027'de de
 * doğru kalmalıdır ve dönem SUNUCUNUN yanıtından okunur.
 */
export function incomeStatementRangeLabel(period: Period): string {
  const end = formatPeriod(period.year, period.month);
  if (period.month === 1) return end;
  return `Ocak${RANGE_DASH}${end}`;
}

/**
 * 🔴 VARSAYILAN DÖNEM FRONTEND'İN KARARIDIR: sunucu "bugün"ü hiç okumaz,
 * `year`/`month` zorunludur.
 *
 * 🔴 YEREL takvim (`currentPeriod`); `toISOString()` UTC'ye çevirir ve TR
 * saatinde ayın son gününde dönemi bir ay ileri kaydırırdı (TB5 dersi).
 */
export function defaultIncomeStatementPeriod(today: Date): Period {
  return currentPeriod(today);
}

/**
 * Seçili dönem EN SON dönem mi? (E11:80 `›` okunun kapalı olduğu hâl.)
 *
 * Birikimli bir gelir tablosunun GELECEĞİ yoktur: içinde bulunulan aydan
 * ileri gitmek, uçtan yapısal olarak SIFIR bir tablo çeker ve kullanıcıya
 * "bu ay hiç gelir yok" der. İşleyip anlamsız veri getiren bir ok, işlemeyen
 * bir oktan daha kötüdür.
 */
export function isLatestIncomeStatementPeriod(period: Period, today: Date): boolean {
  const now = currentPeriod(today);
  if (period.year !== now.year) return period.year > now.year;
  return period.month >= now.month;
}

