import { formatAmount, formatCurrencyPrecise, formatPercent } from "@/lib/format";
import type { Percent } from "@/lib/api/scale";

// F-TH T3 · İşveren `PaymentCalculationCard`in tfoot/kart mantığı BURAYA
// çıkarıldı (brief §Belirsizlik çözümü 2 — "ikinci bir toplam mantığı
// yazma"): TEK hesap kaynağı backend'in `calculation` bloğudur, bu dosya
// SADECE onu satır listesine dönüştürür (biçimlendirme), YENİ bir toplama/
// çarpma YAPMAZ. İşveren ve Taşeron ekranları yalnız "Brüt/Net" satır
// ETİKETLERİNDE ayrışır (mockup'lar farklı kelime kullanıyor: "Brüt
// Hakediş"/"Net Tahsil" vs "TOPLAM HAKEDİŞ"/"NET ÖDENECEK") — KDV/Avans/
// Teminat satırlarının etiket kalıbı ve ton'u (positive/negative) HER İKİ
// ekranda da birebir aynı, tek yerde üretilir.
export interface PaymentCalculationAmounts {
  gross: string;
  vat: string;
  advance_deduction: string;
  retention: string;
  net: string;
}

export interface PaymentCalculationPercents {
  vat_pct: Percent;
  advance_pct: Percent;
  retainage_pct: Percent;
}

export interface PaymentCalculationLabels {
  /** "Brüt Hakediş" (İşveren) / "TOPLAM HAKEDİŞ" (Taşeron). */
  grossLabel: string;
  /** "Net Tahsil" (İşveren) / "NET ÖDENECEK" (Taşeron). */
  netLabel: string;
}

export type PaymentCalculationRowTone = "positive" | "negative";

export interface PaymentCalculationRow {
  key: "gross" | "vat" | "advance" | "retention" | "net";
  label: string;
  /** Zaten biçimlendirilmiş metin (`₺`/`+`/`-` önekleri dahil) — çağıran taraf YENİDEN biçimlendirmez. */
  value: string;
  tone?: PaymentCalculationRowTone;
  /** Net satırı diğerlerinden vurgu bakımından ayrılır (kart/tfoot kendi stilini seçer). */
  emphasis?: boolean;
}

/**
 * `calculation` + `*_pct` + ekrana özel etiketler → beş satırlık liste
 * (Brüt/KDV/Avans/Teminat/Net). Sıra mockup'lara göre SABİT.
 */
export function buildPaymentCalculationRows(
  amounts: PaymentCalculationAmounts,
  percents: PaymentCalculationPercents,
  labels: PaymentCalculationLabels,
): PaymentCalculationRow[] {
  return [
    { key: "gross", label: labels.grossLabel, value: formatAmount(amounts.gross) },
    {
      key: "vat",
      label: `KDV (${formatPercent(percents.vat_pct)})`,
      value: `+ ${formatAmount(amounts.vat)}`,
      tone: "positive",
    },
    {
      key: "advance",
      label: `Avans Kesintisi (${formatPercent(percents.advance_pct)})`,
      value: `- ${formatAmount(amounts.advance_deduction)}`,
      tone: "negative",
    },
    {
      key: "retention",
      label: `Teminat Kesintisi (${formatPercent(percents.retainage_pct)})`,
      value: `- ${formatAmount(amounts.retention)}`,
      tone: "negative",
    },
    {
      key: "net",
      label: labels.netLabel,
      value: formatCurrencyPrecise(amounts.net),
      emphasis: true,
    },
  ];
}
