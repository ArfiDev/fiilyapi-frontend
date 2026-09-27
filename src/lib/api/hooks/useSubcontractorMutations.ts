import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { SUBCONTRACTORS_QUERY_KEY } from "./useSubcontractors";
import type { DeepScale } from "@/lib/api/scale";

// F-P5 T1 · Taşeron FİRMA yazma uçları — TL ("+ Taşeron Ekle" modalı) ve FSO
// ("+ Yeni Taşeron Ekle") aynı modalı paylaşır, o modal da bu hook'ları.
// Okuma tarafı (`useSubcontractors`) yerinde bırakıldı; `useEmployers` /
// `useEmployerMutations` ikilisinin emsali izlendi.
//
// ⚠️ openapi'de `GET /subcontractors/{subcontractor_id}` YOKTUR (yalnız
// `PATCH` ve `DELETE`). Tek bir taşeronun detayı ancak LİSTE ucundan süzülerek
// elde edilir — T7 (TSD başlık kartındaki VKN) bunu bilmelidir.
export type SubcontractorCreateRequest = DeepScale<components["schemas"]["SubcontractorCreate"]>;
export type SubcontractorUpdateRequest = DeepScale<components["schemas"]["SubcontractorUpdate"]>;
export type SubcontractorResponse = DeepScale<components["schemas"]["SubcontractorResponse"]>;

export function useCreateSubcontractor(): UseMutationResult<
  SubcontractorResponse,
  Error,
  SubcontractorCreateRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/subcontractors", { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUBCONTRACTORS_QUERY_KEY] });
    },
  });
}

export function useUpdateSubcontractor(
  subcontractorId: string,
): UseMutationResult<SubcontractorResponse, Error, SubcontractorUpdateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/subcontractors/{subcontractor_id}", {
          params: { path: { subcontractor_id: subcontractorId } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUBCONTRACTORS_QUERY_KEY] });
    },
  });
}
