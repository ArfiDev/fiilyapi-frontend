import { sumDecimalStrings } from "@/lib/decimal";
import type { SiteSubcontractorPaymentItem } from "@/lib/api/hooks/useSiteSubcontractorPayments";

/**
 * Şantiyeye süzülmüş taşeron hakedişi öğelerinden KPI şeridinin türetilmiş
 * değerleri (`totals.ts`/`computeProgressPaymentsTotals` deseninin taşeron
 * karşılığı — saf fonksiyon, bileşenden ayrı test edilir).
 */
export interface SiteSubcontractorTotals {
  /** Kuruş hassasiyetli brüt toplam (`sumDecimalStrings`, `Number` toplamı YASAK). `null` = bir kalem gizli (IZN-F4b.2). */
  grossTotal: string | null;
  /** Mockup satır 84 alt metni "12 taşeron" — `contract_id` DEĞİL, taşeron
   * KİMLİĞİNE (`subcontractorName`) göre tekilleştirilir (aynı taşeronun
   * birden çok sözleşmesi tek taşeron sayılır). */
  distinctSubcontractorCount: number;
  /** Onay Bekleyen KPI'ının taşeron payı (`pending_approval` durumundakiler). */
  pendingApprovalCount: number;
}

export function computeSiteSubcontractorTotals(
  items: SiteSubcontractorPaymentItem[],
): SiteSubcontractorTotals {
  return {
    grossTotal: sumDecimalStrings(items.map((item) => item.grossTotal)),
    distinctSubcontractorCount: new Set(items.map((item) => item.subcontractorName)).size,
    pendingApprovalCount: items.filter((item) => item.status === "pending_approval").length,
  };
}
