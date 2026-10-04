import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

export type PageCatalogEntry = DeepScale<components["schemas"]["PageResponse"]>;

export const PAGES_QUERY_KEY = "pages";

/** Katalog bir kod sabitidir (kiracı verisi değil): oturum boyunca değişmez. */
const PAGES_STALE_TIME_MS = 60 * 60 * 1000;

/** IZN-F1.2 — sayfa kataloğu (`GET /pages`, 100 satır, menü sırası). */
export function usePages(): UseQueryResult<PageCatalogEntry[], Error> {
  return useQuery({
    queryKey: [PAGES_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/pages", {})),
    staleTime: PAGES_STALE_TIME_MS,
  });
}
