import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale, WithPlainProgressPct } from "@/lib/api/scale";

/**
 * F-PKK T1 · Proje Özeti (`/projeler/[projectId]/ozet`) maliyet katmanı —
 * `GET /projects/{project_id}/costs`.
 *
 * 🏆 Bu uç canlıdır ama BUGÜNE KADAR FRONTEND'DEN HİÇ ÇAĞRILMAMIŞTIR; ilk
 * çağıranı burasıdır. Desen `useProjectUnits.ts` / `useLandShare.ts`ten
 * KOPYALANIR (`backendClient` + `unwrap`, `enabled` bekçisi, anahtarda proje
 * kimliği) — yeni bir okuma deseni İCAT EDİLMEZ.
 *
 * ⚠️ BFF İZİN LİSTESİ: ucun ilk segmenti `projects`tır ve o kök
 * `ALLOWED_ROOTS`ta ZATEN tanımlıdır (`src/app/api/backend/[...path]/route.ts`).
 * 🔴 `costs` diye YENİ BİR KÖK EKLENMEZ — çağıranı olmayan kök bekçisizdir
 * (F-MT2 kanonu).
 *
 * 🔴 SALT OKUMA TÜREVİ: şema açıklaması *"Hicbir maliyet saklanmaz, hepsi
 * mevcut veriden turer; bu yuzden uc audit de YAZMAZ (okuma ucu)"* der. Yani
 * bu hook'un bir yazma ikizi YOKTUR ve önbelleği hiçbir mutasyon geçersiz
 * kılmaz — tazelik React Query'nin kendi penceresinden gelir.
 *
 * 🔴 `breakdown`ın DÖRT alanı (`permits`, `financing`, `marketing` ve
 * `construction_progress` türevleri) `MetricPlaceholder` ZARFIDIR: `available`
 * `false` olabilir ve o hâlde HAM BASILMAZ — çağıran `pendingModuleLabel` ile
 * görünür gerekçe basar (spec §4A).
 */
export type ProjectCostsResponse = DeepScale<components["schemas"]["ProjectCostsResponse"]>;
export type ProjectCostBreakdown = DeepScale<components["schemas"]["ProjectCostBreakdown"]>;
export type ProjectProfitProjection = DeepScale<components["schemas"]["ProjectProfitProjection"]>;
// 🔴 `progress_pct` madde 8 istisnası (bkz. `scale.ts` `WithPlainProgressPct`)
// — bu şemada da düz string PERCENT'tir, ad-tabanlı DeepScale eşlemesine
// GİRMEZ. `ProjectCostsResponse.breakdown.subcontractors[]`in İÇİNDEKİ satır
// bu sarmalayıcıya GİRMEZ (yalnız düz takma ad elle düzeltildi).
export type SubcontractorCostRow = WithPlainProgressPct<
  DeepScale<components["schemas"]["SubcontractorCostRow"]>
>;
export type SubcontractorCostSummary = DeepScale<components["schemas"]["SubcontractorCostSummary"]>;

export const PROJECT_COSTS_QUERY_KEY = "project-costs";

export function useProjectCosts(projectId: string): UseQueryResult<ProjectCostsResponse, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [PROJECT_COSTS_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/costs", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}
