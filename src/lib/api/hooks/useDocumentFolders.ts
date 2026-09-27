import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-BC T1 · Belge Arşivi — klasör paneli okuma sorgusu. `useSitePlan.ts`
// deseniyle AYNI: tipler `pnpm gen:api` çıktısından takma ad olarak alınır,
// elle arayüz yazmak yasak.
export type DocumentFolderListResponse = DeepScale<components["schemas"]["DocumentFolderListResponse"]>;
export type DocumentFolderRead = DeepScale<components["schemas"]["DocumentFolderRead"]>;

export const DOCUMENT_FOLDERS_QUERY_KEY = "document-folders";

/**
 * Klasör listesi (`GET /projects/{project_id}/document-folders`).
 *
 * ⚠️ KAPSAM SEMANTİĞİ (backend BC kuralı, spec §2): `site_id` bir SÜZGEÇTİR ve
 * GEÇMEMEK "hepsi" DEMEK DEĞİLDİR — parametresiz istek YALNIZ proje düzeyi
 * (`site_id IS NULL`) klasörleri getirir. Bu bilinçlidir: E12 genel arşiv
 * ekranı proje düzeyini gösterir, şantiye kırılımı ŞB ekranının işidir.
 * Bu yüzden `siteId` verilmediğinde parametre gövdeye BOŞ DİZE olarak da
 * eklenmez (boş dize gerçek backend'de 422 döner).
 *
 * Yanıt DÜZ listedir; iki seviyeli ağacı ekran `parent_id`den kurar.
 */
export function useDocumentFolders(
  projectId: string,
  siteId?: string,
): UseQueryResult<DocumentFolderListResponse, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [DOCUMENT_FOLDERS_QUERY_KEY, projectId, siteId ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/document-folders", {
          params: {
            path: { project_id: projectId },
            query: { ...(siteId !== undefined ? { site_id: siteId } : {}) },
          },
        }),
      ),
  });
}
