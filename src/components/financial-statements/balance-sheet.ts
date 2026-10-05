import type { BalanceSheetResponse } from "@/lib/api/hooks/useBalanceSheet";
import { subtractDecimalStrings } from "@/lib/decimal";
import { formatDateLong } from "@/lib/format";

/**
 * F-MT T2 · Bilanço ekranının SAF katmanı. Kanonik mockup `Mali Tablo -
 * Bilanço.dc.html` (BL); yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 * Bu modülde AĞ ve DOM yoktur; testi `balance-sheet.test.ts`te yaşar.
 */

/**
 * BL:38 `PDF` düğmesinin devre-dışı gerekçesinin anahtarı.
 *
 * Uçta hiçbir dışa aktarma yolu YOKTUR (şema açıklaması kapsam dışını adıyla
 * sayar: "`PDF` düğmesi (BL:38 — düğme dışında hiçbir şey söylemiyor)").
 * Mizan'ın `trial_balance_export` anahtarı PAYLAŞILMAZ: o metin adıyla
 * "mizan" der ve bu ekranda YANLIŞ yüzeyi işaret ederdi (F-MU2 K6 kanonu).
 */
export const BALANCE_SHEET_EXPORT_REASON = "balance_sheet_export";

export interface BalanceSheetAsOfOption {
  /** `GET /balance-sheet?as_of=` değeri — `YYYY-MM-DD`. */
  readonly value: string;
  /** BL:37 `<option>` metni — "31 Temmuz 2026". */
  readonly label: string;
}

/**
 * BL:37 tarih seçicisinin seçenekleri.
 *
 * 🔴 **NOKTA-ZAMAN**: mockup üç ayrı TEK GÜN sunar, bir aralık değil. Üçü de
 * bugünden TÜRETİLİR (mockup'ın sabit tarihleri kopyalanmaz — ekran 2027'de de
 * doğru kalmalıdır):
 *   1. içinde bulunulan ayın son günü  → BL:37 `31 Temmuz 2026`
 *   2. önceki ayın son günü            → BL:37 `30 Haziran 2026`
 *   3. önceki yılın son günü           → BL:37 `31 Aralık 2025`
 *
 * 🔴 OCAK'ta 2 ile 3 AYNI gündür; liste TEKİLLEŞTİRİLİR. Aynı günü iki kez
 * sunmak kullanıcıya iki farklı pencere varmış gibi görünürdü.
 */
export function balanceSheetAsOfOptions(today: Date): readonly BalanceSheetAsOfOption[] {
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12
  const values = [
    endOfMonth(year, month),
    endOfMonth(year, month - 1), // month === 1 ⇒ önceki yılın Aralık'ı
    endOfMonth(year - 1, 12),
  ];
  const unique: string[] = [];
  for (const value of values) {
    if (!unique.includes(value)) unique.push(value);
  }
  return unique.map((value) => ({ value, label: formatDateLong(value) }));
}

/** Listenin İLK seçeneği varsayılandır (BL:37'de de ilk `<option>` seçilidir). */
export function defaultBalanceSheetAsOf(today: Date): string {
  // Küme hiçbir zaman boş olamaz (en az bir ay sonu vardır); yine de
  // `??` ile tipin `undefined`ı taşınmaz — sessiz bir `""` isteği bozardı.
  const [first] = balanceSheetAsOfOptions(today);
  return first?.value ?? endOfMonth(today.getFullYear(), today.getMonth() + 1);
}

/**
 * 🔴 K3 · BL mockup'ı DENGESİZ dalı ÇİZMEMİŞTİR (onaylı sapma). Fark
 * `|AKTİF TOPLAM − PASİF TOPLAM|`dır ve **`subtractDecimalStrings` ile**
 * hesaplanır.
 *
 * 🔴 `Number(a) - Number(b)` YASAK: bilanço toplamları kurumsal ölçekte
 * 2⁵³'ü (9.007.199.254.740.992) aşabilir ve IEEE-754 çift duyarlık orada
 * TAMSAYI çözünürlüğünü kaybeder — iki farklı toplam aynı `double`a düşer ve
 * ekran "dengesiz" derken **sıfır fark** basar (ya da tersi: gerçek bir kuruş
 * farkı yutulur). Ayrışma noktası testi `balance-sheet.test.ts`tedir.
 *
 * Bu fark YALNIZ GÖSTERİMDİR. Denge KARARININ tek sahibi sunucunun
 * `is_balanced` alanıdır — istemci onu YENİDEN HESAPLAMAZ.
 */
export function balanceSheetImbalance(data: BalanceSheetResponse): string | null {
  const difference = subtractDecimalStrings(data.assets.total, data.liabilities.total);
  // IZN-F4b.2 — toplamlardan biri gizliyse (null) fark BİLİNMEZ; 0 sayılmaz.
  if (difference === null) return null;
  // Mutlak değer: işaret STRING düzeyinde atılır (`Math.abs(Number(...))`
  // yukarıdaki taşma tuzağını geri getirirdi).
  return difference.startsWith("-") ? difference.slice(1) : difference;
}

/**
 * `year`/`month` (1-12) çiftinin SON gününü `YYYY-MM-DD` olarak verir.
 * `month === 0` geçerlidir ve önceki yılın Aralık'ını gösterir.
 *
 * 🔴 YEREL takvim: `new Date(y, m, 0)` ayın son gününü yerel saatte kurar ve
 * alanlar yine yerel okunur. `toISOString()` UTC'ye çevirir ve TR saatinde
 * ayın son gününü bir gün geri kaydırırdı (TB5 dersi).
 */
function endOfMonth(year: number, month: number): string {
  const last = new Date(year, month, 0);
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
