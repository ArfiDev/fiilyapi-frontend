import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-P8 T2 · SY "Blok Doluluk Haritası" (mockup 63-140) — ünite ızgarasının
// kaynağı `GET /projects/{project_id}/units`. Yanıt ZATEN BLOK BLOK gruplu
// gelir (`blocks[].units[]`), yani harita için istemcide gruplama yapılmaz.
export type UnitListResponse = components["schemas"]["UnitListResponse"];
export type UnitBlockGroup = components["schemas"]["UnitBlockGroup"];
export type UnitResponse = DeepScale<components["schemas"]["UnitResponse"]>;
export type UnitSalesStatus = components["schemas"]["UnitSalesStatus"];
// F-PKK T1 · Proje Özeti/Paylaşım ekranlarının okuduğu ALT ŞEKİLLER. Yanıtın
// kendi parçalarıdır, ayrı bir uç DEĞİL — bu yüzden burada, yanıtın yanında
// takma ad alırlar (`UnitListResponse` emsali).
export type UnitTotals = components["schemas"]["UnitTotals"];
export type UnitSideSummary = DeepScale<components["schemas"]["UnitSideSummary"]>;
export type UnitKindBreakdown = components["schemas"]["UnitKindBreakdown"];
export type UnitKind = components["schemas"]["UnitKind"];
export type UnitOwnerSide = components["schemas"]["UnitOwnerSide"];

export const PROJECT_UNITS_QUERY_KEY = "project-units";

/**
 * ⚠️ Bu uç KPI şeridini BESLEMEZ: "Boş Ünite" kartının sayısı ve stok tutarı
 * `GET /projects/{id}/sales/summary` yanıtının `available_units` alanından
 * gelir (T1 notu) — burada ünite SAYILMAZ.
 *
 * ⚠️ İZİN AYRIMI: ünite uçlarının kapısı `projects` modülüdür (`sales` DEĞİL).
 * Yalnız `sales` izni olan kullanıcı burada 403 alır; ekran bunu ölümcül
 * saymaz, harita kartı görünür bir gerekçeyle boş kalır (satış tablosu ve
 * KPI'lar çalışmaya devam eder).
 */
export function useProjectUnits(projectId: string): UseQueryResult<UnitListResponse, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [PROJECT_UNITS_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/units", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}
