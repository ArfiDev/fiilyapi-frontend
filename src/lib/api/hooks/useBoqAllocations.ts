import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { BOQ_QUERY_KEY } from "./useBoq";
import type { DeepScale } from "@/lib/api/scale";

export type BoqItemAllocation = DeepScale<components["schemas"]["BoqItemAllocation"]>;
export type BoqItemAllocationInput = DeepScale<components["schemas"]["BoqItemAllocationInput"]>;
export type BoqItemAllocationsResponse = DeepScale<components["schemas"]["BoqItemAllocationsResponse"]>;

/**
 * 🔴 BOQ-SEC K4 — POZUN BÜTÜN BÖLÜM PAYLARINI TEK ÇAĞRIDA OKUR.
 *
 * Bu okuma İSTEĞE BAĞLI DEĞİLDİR. `PUT .../allocations` TAM KÜME
 * DEĞİŞTİRMEDİR: gövdeye konmayan her bölüm payı SESSİZCE SİLİNİR. Bölüm
 * formu yalnız KENDİ payını görür, yani kısmi görüşe sahiptir — kaydetmeden
 * hemen önce kümenin TAMAMI buradan okunup öbür bölümlerin payları gövdeye
 * geri konur.
 *
 * ⚠️ `useQuery` DEĞİL, düz `async` fonksiyondur ve BİLEREK öyledir: okuma
 * kaydetme ANINDA, kalem kalem yapılır. Önbellekten okunsaydı bayat bir küme
 * üzerine yazılır ve arada başka bir kullanıcının eklediği pay silinirdi.
 */
export async function fetchBoqItemAllocations(
  itemId: string,
): Promise<BoqItemAllocationsResponse> {
  return unwrap(
    await backendClient.GET("/boq/items/{item_id}/allocations", {
      params: { path: { item_id: itemId } },
    }),
  );
}

export interface ReplaceAllocationsVars {
  readonly itemId: string;
  /**
   * 🔴 KÜMENİN TAMAMI. Boş dizi `[]` "hepsini kaldır" demektir; alanı hiç
   * göndermemek 422'dir. "Dokunma" anlamı YOKTUR.
   */
  readonly allocations: readonly BoqItemAllocationInput[];
}

/**
 * Tahsis yazma ucu. `siteId` YALNIZ geçersiz kılma anahtarı için alınır —
 * ucun yolu şantiyesizdir (`useUpdateBoqItem` deseninin birebiri).
 *
 * Geçersiz kılma ÖNEK eşleşmesiyledir (`[boq, siteId]`): hem süzgeçsiz şantiye
 * listesini hem `[boq, siteId, sectionId]` süzgeçli girdilerini birlikte
 * tazeler. Yalnız biri tazelenseydi kart yeni payı, şantiye ekranı eski
 * `allocated_quantity`yi gösterirdi.
 */
export function useReplaceBoqItemAllocations(
  siteId: string,
): UseMutationResult<BoqItemAllocationsResponse, Error, ReplaceAllocationsVars> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, allocations }) =>
      unwrap(
        await backendClient.PUT("/boq/items/{item_id}/allocations", {
          params: { path: { item_id: itemId } },
          body: { allocations: [...allocations] },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BOQ_QUERY_KEY, siteId] });
    },
  });
}
