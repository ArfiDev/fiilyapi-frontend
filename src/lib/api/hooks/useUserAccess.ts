import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { UserAccessInput, UserAccessResponse } from "@/lib/api/models";

import { USERS_QUERY_KEY } from "./useUsers";
import { ROLES_QUERY_KEY } from "./useRoles";
import { EV_DISCIPLINES_QUERY_KEY } from "./useEvDisciplines";

export const USER_ACCESS_QUERY_KEY = "user-access";

/** IZN-B3 · Kullanıcının ana rolü + proje ekibi (`GET /users/{id}/access`). Boş id ağa çıkmaz. */
export function useUserAccess(userId: string): UseQueryResult<UserAccessResponse, Error> {
  return useQuery({
    enabled: userId.length > 0,
    queryKey: [USER_ACCESS_QUERY_KEY, userId],
    queryFn: async () =>
      unwrap(await backendClient.GET("/users/{user_id}/access", { params: { path: { user_id: userId } } })),
  });
}

/**
 * `PUT /users/{id}/access` — TAM DEĞİŞTİRME, ATOMİK (hata → hiçbir şey kaydedilmez). Başarıda: uçuştaki
 * GET iptal edilir (bayat yanıt kaydı ezmesin), yanıt kullanıcının erişim önbelleğine yazılır; kullanıcı
 * listesi (`project_count`/`all_projects`/rol), rol listesi (`user_count`) ve disiplin listesi
 * (`user_count`) tazelenir.
 */
export function useSetUserAccess(): UseMutationResult<
  UserAccessResponse,
  Error,
  { id: string; body: UserAccessInput }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }) =>
      unwrap(await backendClient.PUT("/users/{user_id}/access", { params: { path: { user_id: id } }, body })),
    onSuccess: async (data, { id }) => {
      const key = [USER_ACCESS_QUERY_KEY, id];
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData(key, data);
      await Promise.all([
        qc.invalidateQueries({ queryKey: [USERS_QUERY_KEY] }),
        qc.invalidateQueries({ queryKey: [ROLES_QUERY_KEY] }),
        qc.invalidateQueries({ queryKey: [EV_DISCIPLINES_QUERY_KEY] }),
      ]);
    },
  });
}
