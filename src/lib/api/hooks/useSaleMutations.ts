import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import { SALES_QUERY_KEY, SALE_QUERY_KEY, type UnitSaleResponse } from "./useSales";
import { SALES_SUMMARY_QUERY_KEY } from "./useSalesSummary";
import { SALE_INSTALLMENTS_QUERY_KEY, type SalePlanResponse } from "./useSaleInstallments";
import type { DeepScale } from "@/lib/api/scale";

// F-P8 T1 · Satış YAZMA yüzeyi — bu dilimde ÜÇ mutasyon vardır:
// satış oluşturma (DS formu), plan üretimi (`generate-plan`) ve plan
// DEĞİŞTİRME (`PUT installments`).
//
// ⚠️ KALICI SINIR (spec §2 + K3): satış DETAY ekranının mockup'ı YOKTUR, bu
// yüzden `POST /sales/{id}/activate`, `.../transfer-deed`, `.../cancel`,
// `POST /sales/installments/{id}/pay`, `PATCH /sales/{id}` ve
// `DELETE /sales/{id}` için hook YAZILMAZ. Uçlar backend'de durur ve BFF
// `sales` kökü tanımlıdır (kapı testleriyle bağlı) — eksik olan BİLEREK
// eksiktir. Buraya bir durum aksiyonu / tahsilat hook'u eklemek = ekran icadı
// ve review bulgusu.
// ⚠️ ÜRETİLMİŞ TİP TUZAĞI (F-ST T1'de de ısırdı, burada TEKRAR ısırdı):
// openapi şemasında VARSAYILANI olan alanlar `openapi-typescript` çıktısında
// ZORUNLU görünür. `UnitSaleCreate`te bunlar `has_condominium_easement`
// (default `false`) ve `has_mortgage` (default `false`) — gövdeyi kuran kod
// ikisini de AÇIKÇA vermelidir; "varsayılanı var, göndermesem de olur"
// varsayımı `tsc` hatasıdır.
export type UnitSaleCreate = DeepScale<components["schemas"]["UnitSaleCreate"]>;
export type SaleInstallmentsSave = components["schemas"]["SaleInstallmentsSave"];
export type SaleInstallmentInput = components["schemas"]["SaleInstallmentInput"];

/**
 * Bir satış yazıldığında ya da planı değiştiğinde SUNUCU TÜREVİ taşıyan her şey
 * bayatlar: liste (`totals` dahil), KPI özeti, tek satış kaydı ve plan.
 * Dördü birlikte geçersiz kılınır — biri unutulursa ekran eski tutarı basmaya
 * devam eder (`useStockMutations.invalidateStockDerived` deseni).
 */
function invalidateSaleDerived(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: [SALES_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: [SALES_SUMMARY_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: [SALE_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: [SALE_INSTALLMENTS_QUERY_KEY] });
}

export interface CreateSaleVariables {
  projectId: string;
  body: UnitSaleCreate;
}

/**
 * Yeni satış (`POST /projects/{project_id}/sales`, DS formu).
 *
 * Gövdenin ZORUNLU alanları `unit_id` · `customer_id` · `sale_type` ·
 * `sale_price`tir; kalan her şey opsiyoneldir (openapi `UnitSaleCreate`).
 * `min_sale_price` zorlaması HİÇBİR katmanda yoktur (P8 kararı) — istemci de
 * eklemez, yalnız bilgi basar.
 *
 * Ünite `landowner` tarafındaysa sunucu 422, ünitenin açık bir satışı varsa 409
 * döndürür; ikisi de YUTULMAZ, `BackendError` çağırana aynen iletilir.
 */
export function useCreateSale(): UseMutationResult<UnitSaleResponse, Error, CreateSaleVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, body }) =>
      unwrap(
        await backendClient.POST("/projects/{project_id}/sales", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    // Ünitenin `sales_status`u da sunucuda değişir; ünite listesini tüketen
    // ekranlar ayrı anahtar kullandığı için burada satış türevleri tazelenir.
    onSuccess: () => invalidateSaleDerived(queryClient),
  });
}

/**
 * Ödeme planı ÜRETİMİ (`POST /sales/{sale_id}/generate-plan`).
 *
 * Gövde YOKTUR (openapi'de `requestBody` tanımlı değil) — plan, satış kaydının
 * kendi alanlarından (`payment_plan_type`, `down_payment`, `installment_count`,
 * `first_installment_date`, `term_interest_pct`) SUNUCUDA üretilir. İstemci
 * taksit tutarı HESAPLAMAZ: **kuruş dengelemesi son taksitte yapılır ve
 * Σ = `sale_price`** (P8 kararı). Yanıt planın tamamını döndürür.
 */
export function useGenerateSalePlan(): UseMutationResult<SalePlanResponse, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (saleId) =>
      unwrap(
        await backendClient.POST("/sales/{sale_id}/generate-plan", {
          params: { path: { sale_id: saleId } },
        }),
      ),
    onSuccess: () => invalidateSaleDerived(queryClient),
  });
}

export interface SaveSaleInstallmentsVariables {
  saleId: string;
  items: SaleInstallmentInput[];
}

/**
 * Ödeme planı DEĞİŞTİRME (`PUT /sales/{sale_id}/installments`).
 *
 * 🛑 **DEĞİŞTİRME (replace) SEMANTİĞİ — spec K5, hakediş `PUT lines` emsali:**
 * gövde planın TAMAMINI taşır. Gövdede geçmeyen taksit SİLİNİR; kısmi gönderim
 * satır kaybettirir. Bu, POZ dağılımının BİRLEŞTİRME davranışının
 * (`contract-distribution-save.ts`) TAM TERSİDİR — iki ucu karıştırmak veri
 * kaybıdır. Çağıran ekran (T3) tabloyu her zaman BÜTÜN olarak gönderir ve
 * kullanıcıya görünür uyarı basar.
 *
 * Σ = `sale_price` kuralı SUNUCUDA zorlanır (ihlal → 422); istemci kuruş
 * dengelemesi YAPMAZ.
 */
export function useSaveSaleInstallments(): UseMutationResult<
  SalePlanResponse,
  Error,
  SaveSaleInstallmentsVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ saleId, items }) =>
      unwrap(
        await backendClient.PUT("/sales/{sale_id}/installments", {
          params: { path: { sale_id: saleId } },
          body: { items } satisfies SaleInstallmentsSave,
        }),
      ),
    onSuccess: () => invalidateSaleDerived(queryClient),
  });
}
