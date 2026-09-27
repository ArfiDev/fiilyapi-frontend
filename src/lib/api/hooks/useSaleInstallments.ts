import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-P8 T1 · DS (Daire Satışı) formundaki ödeme planı tablosu —
// `GET /sales/{sale_id}/installments`.
export type SalePlanResponse = DeepScale<components["schemas"]["SalePlanResponse"]>;
export type SaleInstallmentResponse = DeepScale<components["schemas"]["SaleInstallmentResponse"]>;
export type InstallmentPaymentMethod = components["schemas"]["InstallmentPaymentMethod"];

export const SALE_INSTALLMENTS_QUERY_KEY = "sale-installments";

/**
 * Ödeme planı okuması. Yanıt (`SalePlanResponse`) planın SUNUCU türevlerini de
 * taşır ve tablonun toplam satırı (DS 145) BUNLARDAN basılır, istemci
 * `items`ten yeniden toplamaz:
 *   · `sale_price`           → satış bedeli
 *   · `total_amount`         → plan toplamı (**Σ = `sale_price` kuralı**; P8
 *     kararı gereği `term_interest_pct` planı ŞİŞİRMEZ)
 *   · `paid_amount`          → tahsil edilen
 *   · `term_interest_amount` → vade farkı BİLGİ alanı
 *
 * ⚠️ `payment_method` satır alanı ŞEMADA GERÇEKTEN VARDIR
 * (`InstallmentPaymentMethod`: `transfer` · `cash` · `cheque` ·
 * `auto_payment`) — spec §1/DS'nin "backend şemasında yoksa pending hücre"
 * ihtimali GERÇEKLEŞMEDİ, satır seçicisi gerçek veriye bağlanır (T3).
 * `is_overdue` de sunucu türevidir; istemci `due_date` karşılaştırmaz.
 */
export function useSaleInstallments(saleId: string): UseQueryResult<SalePlanResponse, Error> {
  return useQuery({
    enabled: saleId.length > 0,
    queryKey: [SALE_INSTALLMENTS_QUERY_KEY, saleId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sales/{sale_id}/installments", {
          params: { path: { sale_id: saleId } },
        }),
      ),
  });
}
