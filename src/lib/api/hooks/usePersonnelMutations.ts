import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import { PERSONNEL_QUERY_KEY, type PersonnelListItem } from "./usePersonnel";
import { PERSONNEL_DETAIL_QUERY_KEY } from "./usePersonnelDetail";
import type { DeepScale } from "@/lib/api/scale";

export type PersonnelCreateRequest = DeepScale<components["schemas"]["PersonnelCreate"]>;
export type PersonnelUpdateRequest = DeepScale<components["schemas"]["PersonnelUpdate"]>;

/**
 * Personel olusturma (`POST /personnel`) — `useCreateEmployer` deseniyle AYNI:
 * govde aynen backend'e gecirilir, hata YUTULMAZ (`BackendError` cagirana
 * ulasir; form Turkce `detail` mesajini gosterir).
 *
 * `source` ZORUNLUDUR (`company | subcontractor | general`); `subcontractor`
 * kaynagi icin `subcontractor_id` beklenir — dogrulama backend'dedir, hook
 * govdeyi sessizce duzeltmez.
 */
export function useCreatePersonnel(): UseMutationResult<
  PersonnelListItem,
  Error,
  PersonnelCreateRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/personnel", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PERSONNEL_QUERY_KEY] }),
  });
}

/**
 * Personel guncelleme (`PATCH /personnel/{personnel_id}`) — F-PT2 T3'un
 * "Duzenle" kipi bu ucu kullanir (F-P6 iki-kip emsali: ayni form
 * olusturma/duzenleme arasinda gecis yapar). `useUpdateSection` deseniyle
 * AYNI: basaride HEM liste HEM detay sorgusu gecersiz kilinir — liste
 * `PERSONNEL_QUERY_KEY` altinda filtre bazli anahtarlarla cesitlendigi icin
 * KOK anahtar gecersiz kilinir (React Query alt anahtarlarin TUMUNU kapsar).
 */
export function useUpdatePersonnel(
  personnelId: string,
): UseMutationResult<PersonnelListItem, Error, PersonnelUpdateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/personnel/{personnel_id}", {
          params: { path: { personnel_id: personnelId } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PERSONNEL_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [PERSONNEL_DETAIL_QUERY_KEY, personnelId] });
    },
  });
}
