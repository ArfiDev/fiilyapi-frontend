import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { RolePagesResponse } from "@/lib/api/models";

export const ROLE_PAGES_QUERY_KEY = "role-pages";

/**
 * IZN-F2 — bir rolün 100 sayfalık izin matrisi + gizli alanları (`GET /roles/{id}/pages`).
 * `roleId` null iken sorgu hiç çalışmaz (`enabled`; skipToken DEĞİL — gözlemcisiz okuma kuralı).
 */
export function useRolePageAccess(roleId: string | null): UseQueryResult<RolePagesResponse, Error> {
  return useQuery({
    queryKey: [ROLE_PAGES_QUERY_KEY, roleId],
    enabled: roleId !== null,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/roles/{role_id}/pages", {
          params: { path: { role_id: roleId as string } },
        }),
      ),
  });
}
