import { sumDecimalStrings } from "@/lib/decimal";
import type { ProgressPaymentListItem } from "@/lib/api/hooks/useProgressPayments";

export interface ProgressPaymentsTotals {
  /** Kuruş hassasiyetli toplam (ondalık string) — `formatCompactCurrency`
   * BURADA çağrılmaz, çağıran taraf biçimlendirir. `Number()` toplama ile
   * karıştırılmaz: bkz. `sumDecimalStrings` (spec: kuruş hassasiyeti).
   * 🔴 IZN-F4b.2: kalemlerden biri gizliyse (`null`) toplam `null` — eksik toplam basılmaz. */
  grossTotal: string | null;
  pendingApprovalCount: number;
}

/**
 * KPI şeridinin veri-kaynaklı iki kartı için türetilmiş değerler (coordinator
 * review T6 fix). Saf fonksiyon — bileşenden ayrı test edilir.
 */
export function computeProgressPaymentsTotals(
  items: ProgressPaymentListItem[],
): ProgressPaymentsTotals {
  return {
    grossTotal: sumDecimalStrings(items.map((item) => item.gross_total)),
    pendingApprovalCount: items.filter((item) => item.status === "pending_approval").length,
  };
}
