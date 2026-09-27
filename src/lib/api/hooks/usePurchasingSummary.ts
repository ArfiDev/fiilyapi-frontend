import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-SA T1 · Satınalma — KPI şeridinin TEK kaynağı (SAT 69-86 + SIP 38-43).
export type PurchasingSummaryResponse = DeepScale<components["schemas"]["PurchasingSummaryResponse"]>;

export const PURCHASING_SUMMARY_QUERY_KEY = "purchasing-summary";

/**
 * ⚠️ `GET /purchasing/summary` ucunun ilk path segmenti `purchasing`tir —
 * `purchase-requests`in ALTINDA DEĞİLDİR. BFF izin listesinde AYRI bir kök
 * ister; eksikse ekranlar açılır ama dört kart sonsuza dek boş kalır.
 *
 * TEK süzgeci `project_id`dir (openapi). Durum/öncelik süzgeci ALMAZ: KPI'lar
 * sekme şeridinden BAĞIMSIZDIR — "Onay Bekleyen" kartı, kullanıcı "Taslak"
 * sekmesindeyken de tüm bekleyenleri sayar (aksi hâlde kart kendi sekmesinde
 * her zaman kendi sayısını basar ve şerit anlamsızlaşır).
 *
 * Yanıtta `MetricPlaceholder` ZARFI YOKTUR (şema açıklaması): bu ucun tüm
 * alanlarının veri kaynağı vardır, `0` gerçek bir cevaptır ("hiç açık talep
 * yok") — "pending" ile karıştırılmaz.
 */
export function usePurchasingSummary(
  projectId?: string,
): UseQueryResult<PurchasingSummaryResponse, Error> {
  return useQuery({
    queryKey: [PURCHASING_SUMMARY_QUERY_KEY, projectId ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/purchasing/summary", {
          params: { query: { ...(projectId ? { project_id: projectId } : {}) } },
        }),
      ),
  });
}
