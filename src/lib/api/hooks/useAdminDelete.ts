import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";
import { LAND_SHARE_UNITS_QUERY_KEY } from "./useLandShare";
import { PROJECT_BLOCKS_QUERY_KEY } from "./useProjectBlocks";
import { PROJECT_UNITS_QUERY_KEY } from "./useProjectUnits";
import { PROJECTS_QUERY_KEY, PROJECT_QUERY_KEY } from "./useProjects";
import { SECTION_QUERY_KEY } from "./useSection";
import { SITE_SECTIONS_QUERY_KEY } from "./useSiteSections";
import { SITES_QUERY_KEY, SITE_QUERY_KEY } from "./useSites";

export type DeleteKind = components["schemas"]["DeleteKind"];
export type DeletePreview = DeepScale<components["schemas"]["DeletePreviewResponse"]>;
export type DeletePreviewGroup = DeepScale<components["schemas"]["DeletePreviewGroup"]>;

export const DELETE_PREVIEW_QUERY_KEY = "delete-preview";

/**
 * SIL-F1.2 · `GET /admin/silme/{kind}/{id}/onizleme`.
 *
 * Önizleme token'ı DELETE'e AYNEN verilir; bu yüzden önbellekte TUTULMAZ
 * (`gcTime: 0`, `staleTime: 0`) ve pencere her açılışta taze ağaç çeker.
 * `retry: false`: 403/404 yeniden denemekle düzelmez.
 */
export function useDeletePreview(
  kind: DeleteKind,
  id: string,
  { enabled = true }: { enabled?: boolean } = {},
): UseQueryResult<DeletePreview, Error> {
  return useQuery({
    enabled: enabled && id.length > 0,
    queryKey: [DELETE_PREVIEW_QUERY_KEY, kind, id],
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DeletePreview> =>
      unwrap(
        await backendClient.GET("/admin/silme/{kind}/{record_id}/onizleme", {
          params: { path: { kind, record_id: id } },
        }),
      ),
  });
}

export interface AdminDeleteVars {
  kind: DeleteKind;
  id: string;
  previewToken: string;
}

/**
 * Silinen kayıt ağacı birden çok sorgu ailesinde yaşar (şantiye → bölüm →
 * blok → ünite). Ağaç türüne göre dar liste tutmak bayat kalmaya açıktır;
 * hepsi işaretlenir. `refetchType: "none"`: silinen kaydın KENDİ detay sorgusu
 * ekranda hâlâ etkindir ve yeniden çekilirse 404 hata ekranı yanıp söner —
 * çağıran listeye yönlendirir, hedef ekran açılışta bayat sorguyu çeker.
 */
const INVALIDATED_QUERY_KEYS = [
  SITES_QUERY_KEY,
  SITE_QUERY_KEY,
  SITE_SECTIONS_QUERY_KEY,
  SECTION_QUERY_KEY,
  PROJECTS_QUERY_KEY,
  PROJECT_QUERY_KEY,
  PROJECT_BLOCKS_QUERY_KEY,
  PROJECT_UNITS_QUERY_KEY,
  LAND_SHARE_UNITS_QUERY_KEY,
] as const;

/**
 * SIL-F1.2 · `DELETE /admin/silme/{kind}/{id}?preview_token=`.
 * Hata sınıflandırması `classifyDeleteError`tadır (`@/lib/api/delete-error`).
 */
export function useAdminDelete(): UseMutationResult<void, Error, AdminDeleteVars> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id, previewToken }) => {
      unwrap(
        await backendClient.DELETE("/admin/silme/{kind}/{record_id}", {
          params: {
            path: { kind, record_id: id },
            query: { preview_token: previewToken },
          },
        }),
      );
    },
    onSuccess: () => {
      for (const key of INVALIDATED_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: [key], refetchType: "none" });
      }
    },
  });
}
