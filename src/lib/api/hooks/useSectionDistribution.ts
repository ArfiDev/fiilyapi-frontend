import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";
import type { SectionDistributionSave } from "@/lib/section-distribution-save";

import { BOQ_QUERY_KEY } from "./useBoq";

// BDG · Bölüm Dağılımı (kalem x bölüm matrisi). Tipler `pnpm gen:api`
// çıktısından takma ad olarak alınır.
export type SectionDistributionResponse = DeepScale<components["schemas"]["SectionDistributionResponse"]>;
export type SectionDistributionGroup = DeepScale<components["schemas"]["SectionDistributionGroup"]>;
export type SectionDistributionItem = DeepScale<components["schemas"]["SectionDistributionItem"]>;
export type SectionDistributionSection = DeepScale<components["schemas"]["SectionDistributionSection"]>;
export type SectionDistributionAllocation =
  DeepScale<components["schemas"]["SectionDistributionAllocation"]>;
export type SectionDistributionSectionSummary =
  DeepScale<components["schemas"]["SectionDistributionSectionSummary"]>;
export type SectionDistributionSectionItem =
  DeepScale<components["schemas"]["SectionDistributionSectionItem"]>;

export const SECTION_DISTRIBUTION_QUERY_KEY = "section-distribution";

/** `siteId` boşken ağa çıkılmaz (useBoq deseni). */
export function useSectionDistribution(
  siteId: string,
): UseQueryResult<SectionDistributionResponse, Error> {
  return useQuery({
    enabled: siteId.length > 0,
    queryKey: [SECTION_DISTRIBUTION_QUERY_KEY, siteId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/boq/section-distribution", {
          params: { path: { site_id: siteId } },
        }),
      ),
  });
}

/**
 * Matris kaydı (BİRLEŞTİRME — gövde `buildSectionDistributionSaveBody`den gelir).
 * Yanıt tam matristir: `setQueryData` ile yazılır (ikinci GET yok). BOQ ekranı
 * ve kartları allocated/unallocated okuduğu için `[boq, siteId]` öneki
 * geçersiz kılınır; önek hem site hem site+section varyantını kapsar.
 *
 * `onSuccess` geçersiz kılma sözünü DÖNDÜRÜR: `mutateAsync` tazelenmiş
 * önbellek gelene dek bitmez (SZK-F1 dersi).
 */
export function useSaveSectionDistribution(
  siteId: string,
): UseMutationResult<SectionDistributionResponse, Error, SectionDistributionSave> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PUT("/sites/{site_id}/boq/section-distribution", {
          params: { path: { site_id: siteId } },
          body,
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData([SECTION_DISTRIBUTION_QUERY_KEY, siteId], data);
      return queryClient.invalidateQueries({ queryKey: [BOQ_QUERY_KEY, siteId] });
    },
  });
}
