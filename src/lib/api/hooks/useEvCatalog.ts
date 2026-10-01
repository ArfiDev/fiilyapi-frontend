import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type {
  EvCatalogItemCreate,
  EvCatalogItemRead,
  EvCatalogItemUpdate,
} from "@/lib/api/models";

// Yalnız anahtar SABİTİ (saf dize) — çekirdek katalog hook'una davranış bağı YOK.
import { CATALOG_ITEMS_QUERY_KEY, EV_CATALOG_QUERY_KEY, EV_DISCIPLINES_QUERY_KEY } from "./catalog-query-keys";

/**
 * PLN-F1.5 · Birim Oran Kataloğu (şirket geneli, K2/K4) — okuma + yazma uçları.
 *
 * Anahtar ÖNEKİ `["ev-catalog"]`: süzgeçli her okuma bunun altına düşer, yazma
 * sonrası tek `invalidateQueries` hepsini tazeler. Disiplin mutasyonları da
 * bu öneki tazeler (katalog satırı disiplin adını/rengini gömer).
 *
 * TKL-F1.2: her yazma çekirdek `["catalog-items"]` önbelleğini de tazeler — aynı
 * kayıtlar yeni İş Kalemi Kataloğu'nda poz no + fiyatla görünür ve KAT'tan disiplin
 * değiştiren PATCH yeni poz no üretir (T22); tazelenmezse eski numara kalır.
 */
export { EV_CATALOG_QUERY_KEY };

export interface EvCatalogFilters {
  disciplineId?: string;
  /** İş tipi adında harf duyarsız arama (backend `q`). Boş/boşluk → gönderilmez. */
  q?: string;
}

interface CatalogQuery {
  discipline_id?: string;
  q?: string;
}

function toQuery({ disciplineId, q }: EvCatalogFilters): CatalogQuery {
  const trimmed = q?.trim() ?? "";
  return {
    ...(disciplineId ? { discipline_id: disciplineId } : {}),
    ...(trimmed ? { q: trimmed } : {}),
  };
}

export function useEvCatalog(filters: EvCatalogFilters = {}): UseQueryResult<EvCatalogItemRead[], Error> {
  const query = toQuery(filters);
  return useQuery({
    queryKey: [EV_CATALOG_QUERY_KEY, query],
    queryFn: async () =>
      unwrap(await backendClient.GET("/earned-value/catalog", { params: { query } })),
  });
}

/**
 * KAT yazması sonrası: KAT'ın kendi önbelleği + çekirdek katalog (çapraz) + disiplin
 * listesi (`used_by_item_count` — ÜS-13b kod uyarısı bayat kalem sayısına bakmasın).
 */
function invalidateCatalogViews(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: [EV_CATALOG_QUERY_KEY] }),
    qc.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] }),
    qc.invalidateQueries({ queryKey: [EV_DISCIPLINES_QUERY_KEY] }),
  ]);
}

export interface UpdateEvCatalogItemVars {
  id: string;
  body: EvCatalogItemUpdate;
}

export function useCreateEvCatalogItem(): UseMutationResult<EvCatalogItemRead, Error, EvCatalogItemCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: EvCatalogItemCreate) =>
      unwrap(await backendClient.POST("/earned-value/catalog", { body })),
    onSuccess: () => invalidateCatalogViews(qc),
  });
}

export function useUpdateEvCatalogItem(): UseMutationResult<
  EvCatalogItemRead,
  Error,
  UpdateEvCatalogItemVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: UpdateEvCatalogItemVars) =>
      unwrap(
        await backendClient.PATCH("/earned-value/catalog/{item_id}", {
          params: { path: { item_id: id } },
          body,
        }),
      ),
    onSuccess: () => invalidateCatalogViews(qc),
  });
}

/**
 * KAT:159 "Standart yap". ⚠️ B1'de gerçekleşen hiç yoktur → uç PLN-B3'e kadar
 * HER ZAMAN 409 döner (`CATALOG_NO_ACTUAL`); çağıran hatayı kullanıcıya basar.
 */
export function useAdoptEvCatalogActual(): UseMutationResult<EvCatalogItemRead, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await backendClient.POST("/earned-value/catalog/{item_id}/adopt-actual", {
          params: { path: { item_id: id } },
        }),
      ),
    onSuccess: () => invalidateCatalogViews(qc),
  });
}
