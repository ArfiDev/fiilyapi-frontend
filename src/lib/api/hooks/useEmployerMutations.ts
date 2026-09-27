import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import { EMPLOYERS_QUERY_KEY, type EmployerListItem } from "./useEmployers";
import type { DeepScale } from "@/lib/api/scale";

export type EmployerCreateRequest = DeepScale<components["schemas"]["EmployerCreate"]>;

// Task F4 — Yeni Proje formunun "İşveren ekle" akışı (spec §3.2). useCreateProject
// deseniyle ayni: govde aynen backend'e gecirilir. 409 (ayni VKN) burada
// yutulmaz — BackendError olarak cagirana ulasir; modal (F7) status===409'u
// yakalayip Turkce mesaji (backend'in dondurdugu detail) gosterir.
export function useCreateEmployer(): UseMutationResult<EmployerListItem, Error, EmployerCreateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/employers", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [EMPLOYERS_QUERY_KEY] }),
  });
}
