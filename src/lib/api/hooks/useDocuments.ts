import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-BC T1 · Belge Arşivi — belge listesi okuma sorgusu.
export type DocumentListResponse = DeepScale<components["schemas"]["DocumentListResponse"]>;
export type DocumentRead = DeepScale<components["schemas"]["DocumentRead"]>;

export const DOCUMENTS_QUERY_KEY = "documents";

/**
 * `GET /documents` süzgeçleri.
 *
 * ⚠️ Yanıtta TOPLAM SAYI ALANI YOKTUR (sayfalama yok) — `documents.length`
 * gerçek sayıdır; F-TH'nin `total` tuzağı burada GEÇERSİZDİR.
 * "Son Eklenenler" sıralaması İSTEMCİDE yapılır (backend sıralama parametresi
 * yok — bilinçli sınır, spec §3).
 */
export interface DocumentListFilter {
  /** Bkz. `useDocumentFolders` — geçmemek "hepsi" değil, "proje düzeyi"dir. */
  siteId?: string;
  folderId?: string;
  q?: string;
}

export function useDocuments(
  projectId: string,
  filter: DocumentListFilter = {},
): UseQueryResult<DocumentListResponse, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [
      DOCUMENTS_QUERY_KEY,
      projectId,
      filter.siteId ?? null,
      filter.folderId ?? null,
      filter.q ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/documents", {
          params: {
            query: {
              project_id: projectId,
              ...(filter.siteId !== undefined ? { site_id: filter.siteId } : {}),
              ...(filter.folderId !== undefined ? { folder_id: filter.folderId } : {}),
              ...(filter.q ? { q: filter.q } : {}),
            },
          },
        }),
      ),
  });
}
