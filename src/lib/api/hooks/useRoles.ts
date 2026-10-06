import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { RoleResponse } from "@/lib/api/models";

export const ROLES_QUERY_KEY = "roles";

/**
 * `enabled=false` → istek ATILMAZ (GET /roles = rol_yonetimi/sayfa_izinleri Görür VEYA kullanicilar Düzenler;
 * yetkisiz kişide 403). Varsayılan `true`: mevcut çağıranlar değişmez. `skipToken` KULLANILMAZ (paylaşılan
 * sorgu seçeneklerini ezer).
 */
export function useRoles(enabled = true): UseQueryResult<RoleResponse[], Error> {
  return useQuery({
    enabled,
    queryKey: [ROLES_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/roles", {})),
  });
}
