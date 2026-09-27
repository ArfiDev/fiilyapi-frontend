import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import { PROJECTS_QUERY_KEY, type ProjectDetail } from "./useProjects";
import type { DeepScale } from "@/lib/api/scale";

// NOT: Plan "ProjectCreateRequest" adini varsayiyordu; gercek semada istek govdesi
// "ProjectCreate" (bkz. src/lib/api/schema.d.ts). Gercek adi kullaniyoruz.
export type ProjectCreateRequest = DeepScale<components["schemas"]["ProjectCreate"]>;

// Task F4 — spec §3.3: "code" bos birakilirsa sunucu otomatik uretir (§3.5),
// ama bu yalniz alan HIC GONDERILMEZSE calisir — bos string "" gonderilirse
// 1..50 dogrulamasi patlar. Santiye formundaki cagiran-taraf deseninin (spec
// yorumu, satir 58) aksine burada hook seviyesinde normallestiriyoruz: F12
// henuz yazilmadigindan tek cagiran nokta bu, ileride cagiranlar da bos
// string yollarsa gene korunur.
function normalizeProjectCreateBody(body: ProjectCreateRequest): ProjectCreateRequest {
  const normalized: ProjectCreateRequest = { ...body };
  const trimmedCode = typeof body.code === "string" ? body.code.trim() : body.code;
  if (trimmedCode) {
    normalized.code = trimmedCode;
  } else {
    delete normalized.code;
  }
  return normalized;
}

// DUZELTME TURU 2 (kayit no 452 — F-BFF onarim turu): donus tipi ONCEDEN
// `ProjectListItem` (dar govde) idi ama gercek uc (`POST /projects`,
// schema.d.ts:30319 `create_project_endpoint_projects_post`) 201'de
// `ProjectDetailResponse` doner — `site_count` dahil TUM proje detay
// kolonlarini tasir. `useSectionMutations.ts::useCreateSection`teki AYNI
// sinif hatanin (DUZELTME TURU 1) birebir esi.
export function useCreateProject(): UseMutationResult<ProjectDetail, Error, ProjectCreateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(await backendClient.POST("/projects", { body: normalizeProjectCreateBody(body) })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] }),
  });
}
