import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { isScopePending } from "@/lib/api/pending-scope";
import type { DeepScale, WithPlainProgressPct } from "@/lib/api/scale";

// P7 · İşveren Hakedişi ekranları — okuma sorguları. Tipler `pnpm gen:api`
// çıktısından takma ad olarak alınır; elle arayüz yazmak yasak.
export type ProgressPaymentListResponse = DeepScale<components["schemas"]["ProgressPaymentListResponse"]>;
export type ProgressPaymentListItem = DeepScale<components["schemas"]["ProgressPaymentListItem"]>;
export type ProgressPaymentDetail = DeepScale<components["schemas"]["ProgressPaymentDetail"]>;
// P7 T5 eklemesi: `ProgressPaymentDetail.lines[]`in eleman tipi zaten
// üretilmişti ama takma ad olarak dışa aktarılmamıştı — hakediş formunun
// pivot modülü (`pivot.ts`) mevcut satırları önceden doldururken kullanır.
export type ProgressPaymentLineDetail = DeepScale<components["schemas"]["ProgressPaymentLineDetail"]>;
// 🔴 `progress_pct` madde 8 istisnası (bkz. `scale.ts` `WithPlainProgressPct`).
export type ProgressPaymentSummary = WithPlainProgressPct<
  DeepScale<components["schemas"]["ProgressPaymentSummary"]>
>;
export type ProgressPaymentStatus = components["schemas"]["ProgressPaymentStatus"];

// `useProjects` deseniyle ayni (ProjectListFilter): backend'in kabul ettigi
// ucteki uc opsiyonel filtre uydurulmadan aynen kopyalanir (openapi.json'daki
// GET /progress-payments query parametreleri).
export interface ProgressPaymentListFilter {
  project_id?: string;
  site_id?: string;
  status?: ProgressPaymentStatus;
}

export const PROGRESS_PAYMENTS_QUERY_KEY = "progress-payments";
export const PROGRESS_PAYMENT_QUERY_KEY = "progress-payment";
export const PROGRESS_PAYMENT_SUMMARY_QUERY_KEY = "progress-payment-summary";

/**
 * Hakediş listesi (Ekran 14). Filtresiz çağrıda tüm hakedişler döner —
 * `useProjects` deseniyle ayni, bos filtre alanlari govdeye eklenmez.
 */
export function useProgressPayments(
  filter: ProgressPaymentListFilter = {},
): UseQueryResult<ProgressPaymentListResponse, Error> {
  return useQuery({
    // 🔴 URL-3 — kimlik COZULENE kadar aga cikilmaz. Asagidaki suzgec kurucusu
    // bos degeri DOGRULUK TESTIYLE atar, yani `project_id: ""` "suzgec yok"a
    // donusur ve uc TUM projelerin hakedislerini dondurur; ekran o yaniti tek
    // projenin verisi sanip TOPLAR. `undefined` (bilerek suzgecsiz liste
    // ekrani) ile `""` (henuz cozulmedi) bu yuzden AYRILIR.
    enabled: !isScopePending(filter.project_id, filter.site_id),
    queryKey: [
      PROGRESS_PAYMENTS_QUERY_KEY,
      filter.project_id ?? null,
      filter.site_id ?? null,
      filter.status ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/progress-payments", {
          params: {
            query: {
              ...(filter.project_id ? { project_id: filter.project_id } : {}),
              ...(filter.site_id ? { site_id: filter.site_id } : {}),
              ...(filter.status ? { status: filter.status } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * Hakediş detayı (Ekran 15). `useBoq` deseni: bos id ile aga cikilmaz —
 * drill kabugu henuz bir hakedis secmediginde hook bos id ile cagrilabilir.
 */
export function useProgressPayment(paymentId: string): UseQueryResult<ProgressPaymentDetail, Error> {
  return useQuery({
    enabled: paymentId.length > 0,
    queryKey: [PROGRESS_PAYMENT_QUERY_KEY, paymentId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/progress-payments/{payment_id}", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
  });
}

/**
 * Proje bazli hakedis ozeti (spec §9.6, E14 127-147 + SHK 82-84). `useBoq`
 * deseni: bos id ile aga cikilmaz.
 */
export function useProgressPaymentSummary(
  projectId: string,
): UseQueryResult<ProgressPaymentSummary, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [PROGRESS_PAYMENT_SUMMARY_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/progress-payments/summary", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}
