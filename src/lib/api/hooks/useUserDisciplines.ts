import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { UserDisciplinesInput, UserDisciplinesRead } from "@/lib/api/models";

import { EV_CATALOG_QUERY_KEY } from "./useEvCatalog";
import { EV_DISCIPLINES_QUERY_KEY } from "./useEvDisciplines";

/**
 * DSC-F1.2 · Kullanıcının atanmış disiplinleri (`/users/{id}/disciplines`).
 *
 * Boş liste = kısıtsız kullanıcı. Yol `users` altındadır ama modül Planlama
 * (EV) olduğundan kanca `useProjectAccess` (users hook'ları) yanında değil
 * burada, disiplin kancalarının yanında yaşar.
 */
export const USER_DISCIPLINES_QUERY_KEY = "user-disciplines";

export function useUserDisciplines(userId: string): UseQueryResult<UserDisciplinesRead, Error> {
  return useQuery({
    queryKey: [USER_DISCIPLINES_QUERY_KEY, userId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/users/{user_id}/disciplines", {
          params: { path: { user_id: userId } },
        }),
      ),
  });
}

/**
 * TAM DEĞİŞTİRME (backend sözleşmesi). Başarıda: uçuştaki GET iptal edilir
 * (montaj sırasındaki bayat yanıt kaydı ezmesin), kullanıcının kendi listesi
 * yanıttan yazılır (ek istek yok); disiplin listesi `user_count`u ve katalog
 * satırları (disiplin gömer) tazelenir. `/auth/me.disciplines` react-query'de
 * değildir (kabuk oturumu): kendi disiplinini düzenleyen yönetici için
 * `DisciplineAssignmentModal` `useSession().refresh`i çağırır.
 */
export function useSetUserDisciplines(
  userId: string,
): UseMutationResult<UserDisciplinesRead, Error, UserDisciplinesInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UserDisciplinesInput) =>
      unwrap(
        await backendClient.PUT("/users/{user_id}/disciplines", {
          params: { path: { user_id: userId } },
          body,
        }),
      ),
    onSuccess: async (data) => {
      const key = [USER_DISCIPLINES_QUERY_KEY, userId];
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData(key, data);
      await Promise.all([
        qc.invalidateQueries({ queryKey: [EV_DISCIPLINES_QUERY_KEY] }),
        qc.invalidateQueries({ queryKey: [EV_CATALOG_QUERY_KEY] }),
      ]);
    },
  });
}
