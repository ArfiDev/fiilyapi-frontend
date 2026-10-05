import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { UserListResponse } from "@/lib/api/models";

export const USERS_QUERY_KEY = "users";
export const PAGE_SIZE = 20;

/**
 * IZN-B3 · `q` SUNUCUDA aranır (ad, e-posta, ana rol adı; Türkçe/büyük-küçük harf duyarsız). Boş/boşluk
 * `q` gönderilmez (süzgeç yok). `q` anahtarda durur: her arama kendi önbellek girdisini kullanır.
 */
export function useUsers(params: {
  limit: number;
  offset: number;
  q?: string;
}): UseQueryResult<UserListResponse, Error> {
  const q = params.q?.trim() ?? "";
  return useQuery({
    queryKey: [USERS_QUERY_KEY, params.limit, params.offset, q],
    // Arama yazılırken liste (ve arama kutusu) yükleniyor ekranına DÖNMEZ: önceki sonuç yenisi gelene dek durur.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/users", {
          params: { query: { limit: params.limit, offset: params.offset, ...(q ? { q } : {}) } },
        }),
      ),
  });
}
