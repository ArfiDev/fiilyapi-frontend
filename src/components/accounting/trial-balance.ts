import type { TrialBalanceTotals } from "@/lib/api/hooks/useTrialBalance";
import { subtractDecimalStrings } from "@/lib/decimal";
import { formatPeriod } from "@/lib/format";

import type { Period } from "./accounting-labels";

/**
 * F-MU2 · Mizan ekranının SAF katmanı. Kanonik mockup `Muhasebe -
 * Mizan.dc.html` (MZ); yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 * Bu modülde AĞ ve DOM yoktur; testi `trial-balance.test.ts`te yaşar.
 */

/** MZ:45 — `Ocak–Temmuz 2026` aralık ayracı (U+2013, boşluksuz). */
const RANGE_DASH = "–";

/**
 * MZ:45 — dönem gezgininin etiketi. 🔴 **BİRİKİMLİ ARALIK, tek ay DEĞİL:**
 * uç `year`+`month` alır ama pencere "1 Ocak → seçilen ayın son günü"dür.
 * `formatPeriod` tek başına ("Temmuz 2026") kullanıcıya YALNIZ Temmuz'un
 * gösterildiğini söylerdi.
 *
 * `month === 1` ise aralığın iki ucu AYNI aydır; "Ocak–Ocak 2026" yazmak
 * yerine kısa yazım ("Ocak 2026") basılır — aynı pencerenin adıdır.
 */
export function trialBalanceRangeLabel(period: Period): string {
  const end = formatPeriod(period.year, period.month);
  if (period.month === 1) return end;
  return `Ocak${RANGE_DASH}${end}`;
}

/**
 * 🔴 K2 · MZ mockup'ı DENGESİZ dalı ÇİZMEMİŞTİR (onaylı sapma). Fark
 * `|closing_debit − closing_credit|`dir ve **`subtractDecimalStrings` ile**
 * hesaplanır.
 *
 * 🔴 `Number(a) - Number(b)` YASAK: mizan kapanış toplamları kurumsal ölçekte
 * 2⁵³'ü (9.007.199.254.740.992) aşabilir ve IEEE-754 çift duyarlık orada
 * TAMSAYI çözünürlüğünü kaybeder — iki farklı toplam aynı `double`a düşer,
 * fark `0` çıkar ve ekran "dengesiz" derken **sıfır fark** basar (ya da tersi:
 * gerçek bir kuruş farkı yutulur). Ayrışma noktası testi
 * `trial-balance.test.ts`tedir.
 *
 * Bu fark YALNIZ GÖSTERİMDİR: sunucuya geri gönderilmez, başka bir hesaba
 * girdi olmaz. Denge KARARININ tek sahibi sunucunun `is_balanced` alanıdır
 * (istemci onu YENİDEN HESAPLAMAZ) — burada üretilen yalnız kullanıcıya
 * gösterilecek büyüklüktür.
 */
export function trialBalanceImbalance(totals: TrialBalanceTotals): string | null {
  const difference = subtractDecimalStrings(totals.closing_debit, totals.closing_credit);
  // IZN-F4b.2 — girdi maskeliyse (null) fark BİLİNMEZ; null'ı 0 sayıp "fark 0" basmak YASAK.
  if (difference === null) return null;
  // Mutlak değer: işaret STRING düzeyinde atılır. `Math.abs(Number(...))`
  // yukarıdaki taşma tuzağını geri getirirdi.
  return difference.startsWith("-") ? difference.slice(1) : difference;
}
