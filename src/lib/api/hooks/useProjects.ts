import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { ProjectAccessResponse } from "@/lib/api/models";
import type { DeepScale } from "@/lib/api/scale";

// NOT: Plan "ProjectResponse" adini varsayiyordu; gercek semada oge tipi
// "ProjectListItem" (bkz. src/lib/api/schema.d.ts). Gercek adi kullaniyoruz.
export type ProjectListResponse = components["schemas"]["ProjectListResponse"];
export type ProjectListItem = DeepScale<components["schemas"]["ProjectListItem"]>;
export type ProjectDetail = DeepScale<components["schemas"]["ProjectDetailResponse"]>;
export type ProjectCounts = ProjectListResponse["counts"];
/**
 * Proje türü enum'u — `ProjectDetailResponse.project_type` ve
 * `ProjectCostsResponse.project_type` alanlarının tipi (F-PKK spec §2: proje
 * türü ayrımını yapan alan BUDUR, `contracting`/`investment`/`land_share`
 * kartları yalnız ipucudur).
 */
export type ProjectType = components["schemas"]["ProjectType"];
/**
 * Liste süzgeci ile TÜRÜN KENDİSİ bugün AYNI kümedir; elle yazılmış birleşim
 * yerine şemadan türetilir — şemaya dördüncü bir tür eklendiğinde süzgeç
 * sessizce eksik kalmaz (F-PKK T1).
 */
export type ProjectTypeFilter = ProjectType;

export interface ProjectListFilter {
  type?: ProjectTypeFilter;
  status?: "completed";
  limit?: number;
  offset?: number;
  /**
   * `useSites`teki (useSites.ts:32) boş-id kapısıyla aynı desen: `false`
   * verildiğinde sorgu AĞA ÇIKMAZ. Varsayılan `true` — mevcut çağıranların
   * davranışı değişmez. Görüntüleme izni olmayan çağıranlar (ör. AiPanel)
   * bunu KOŞULSUZ `false` geçmeli; üçlü işleçle yalnız süzgeci boşaltmak
   * sorguyu KAPATMAZ (KAYIT NO 22).
   */
  enabled?: boolean;
}

export const PROJECTS_QUERY_KEY = "projects";
export const PROJECT_ACCESS_QUERY_KEY = "project-access";

/**
 * `GET /projects` `limit` tavanı (openapi.json: `le=200`). Sunucu varsayılanı
 * 50'dir — F-FIN (`useFinancialInstruments.ts`) emsaliyle AYNI sayı: çağıran
 * `limit`i AÇIKÇA gönderir, eksik kalan kayıtlar `total` üzerinden
 * `buildListTruncation` ile GÖRÜNÜR kılınır (sessiz kırpma YOK).
 */
export const PROJECT_LIST_MAX_LIMIT = 200;

export function useProjects(
  filter: ProjectListFilter = { limit: PROJECT_LIST_MAX_LIMIT },
): UseQueryResult<ProjectListResponse, Error> {
  return useQuery({
    enabled: filter.enabled ?? true,
    queryKey: [
      PROJECTS_QUERY_KEY,
      filter.type ?? null,
      filter.status ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects", {
          params: {
            query: {
              ...(filter.type ? { type: filter.type } : {}),
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

export const PROJECT_QUERY_KEY = "project";

// Proje Detay (P2) — hero seridi + sekmeler icin tekil proje.
// KAYIT 456: `useSites.ts`teki boş-id kapısıyla AYNI desen — id boşsa ağa
// ÇIKILMAZ (422 sınıfı kusura kapalı).
export function useProject(projectId: string): UseQueryResult<ProjectDetail, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [PROJECT_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}

// KAYIT 456: aynı boş-id kapısı.
export function useProjectAccess(userId: string): UseQueryResult<ProjectAccessResponse, Error> {
  return useQuery({
    enabled: userId.length > 0,
    queryKey: [PROJECT_ACCESS_QUERY_KEY, userId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/users/{user_id}/project-access", {
          params: { path: { user_id: userId } },
        }),
      ),
  });
}
