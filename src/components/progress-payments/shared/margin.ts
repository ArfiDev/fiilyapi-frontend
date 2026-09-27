// F-TH T5 · KULLANICI KARARI S2 (bağlayıcı) — backend'de çapraz-modül bir
// kâr ucu YOK. Frontend "Brüt Kar Marjı" KPI'ını İKİ ayrı toplamdan türetir:
//
//   marj% = (işveren brüt toplamı − taşeron brüt toplamı) / işveren brüt toplamı × 100
//
// Bu türetme BİLEREK tek bu saf fonksiyonda yaşar — bileşenlerin içine
// dağıtılmaz, testlidir (brief §Brüt Kar Marjı).
//
// Sınır durumları:
// - işveren toplamı `0` ya da sayıya çevrilemiyorsa → sıfıra bölme olurdu,
//   yüzde BASILMAZ (`null` döner).
// - taşeron toplamı KISMİ/hatalı ise (`isSubcontractorTotalComplete=false`,
//   ör. bazı sözleşme detayları yüklenemedi) → marj BASILMAZ — yanlış bir
//   sayı basmaktansa boş bas (brief §sınır durumları).
import { sumDecimalStrings } from "@/lib/decimal";
import { asPercent, type Percent } from "@/lib/api/scale";

export function computeGrossMargin(
  employerGrossTotal: string,
  subcontractorGrossTotal: string,
  isSubcontractorTotalComplete: boolean,
): Percent | null {
  if (!isSubcontractorTotalComplete) return null;

  const employer = Number(employerGrossTotal);
  if (!Number.isFinite(employer) || employer === 0) return null;

  const subcontractor = Number(subcontractorGrossTotal);
  if (!Number.isFinite(subcontractor)) return null;

  const marginPct = ((employer - subcontractor) / employer) * 100;
  return asPercent(marginPct.toFixed(2));
}

/**
 * F-SD T3 · GK410 "Brüt Kar (Bu Ay)" — mockup YÜZDE değil TUTAR ister:
 *
 *   brüt kâr ₺ = işveren brüt toplamı − taşeron brüt toplamı
 *
 * `computeGrossMargin`in yanında yaşar çünkü KORKULUKLARI AYNIDIR (F-TH
 * kararı S2): taşeron toplamı kısmi/güvenilmezse (`isSubcontractorTotal
 * Complete=false`) sayı BASILMAZ (`null`) — yanlış bir kâr basmaktansa
 * görünür pending gösterilir. Yüzdeden farklı olarak işveren toplamının `0`
 * olması burada meşrudur (o ay işveren hakedişi kesilmemiş olabilir; kâr
 * negatif çıkar ve OLDUĞU GİBİ basılır — sıfıra kırpılmaz).
 *
 * Çıkarma `Number` ile DEĞİL `sumDecimalStrings` ile yapılır: kuruş
 * hassasiyeti korunur (`decimal.ts`in gerekçesi).
 */
export function computeGrossProfit(
  employerGrossTotal: string,
  subcontractorGrossTotal: string,
  isSubcontractorTotalComplete: boolean,
): string | null {
  if (!isSubcontractorTotalComplete) return null;
  if (!Number.isFinite(Number(employerGrossTotal))) return null;
  if (!Number.isFinite(Number(subcontractorGrossTotal))) return null;
  return sumDecimalStrings([employerGrossTotal, negateDecimalString(subcontractorGrossTotal)]);
}

/** `"840.00"` → `"-840.00"`, `"-840.00"` → `"840.00"` (işaret çevirme). */
function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("-")) return trimmed.slice(1);
  return `-${trimmed.replace(/^\+/, "")}`;
}
