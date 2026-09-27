import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-UNIT1 T2 · UE 65 "Blok" seçicisinin kaynağı `GET /projects/{project_id}/blocks`.
// Uç açıklaması bu çağıranı ADIYLA sayar: *"Blok seciciler (unite formu, toplu
// uretim formu) bu ucu kullanir."*
//
// ⚠️ `useProjectUnits` DEĞİL: o uç ünite ızgarasını döndürür ve ÜNİTESİ OLMAYAN
// bloğu göstermeyebilir — yeni açılmış bir bloğa ilk üniteyi eklemek tam olarak
// bu formun işi olduğu için blok listesi KENDİ ucundan okunur.
//
// ⚠️ İZİN AYRIMI (`useProjectUnits` ile aynı): blok/ünite uçlarının kapısı
// `projects` modülüdür (`sales` DEĞİL). Yalnız `sales` izni olan kullanıcı
// burada 403 alır.
//
// ⚠️ ŞANTİYE SÜZGECİ İSTEMCİDEDİR: uç `site_id` sorgu parametresi ALMAZ
// (openapi'de yalnız `project_id` path parametresi var), ama `BlockResponse`
// her satırda `site_id` + `site_name` taşır — UE 64'ün daralttığı liste bu
// alandan süzülür, ikinci bir istek AÇILMAZ.
export type BlockListResponse = DeepScale<components["schemas"]["BlockListResponse"]>;
export type BlockResponse = DeepScale<components["schemas"]["BlockResponse"]>;

export const PROJECT_BLOCKS_QUERY_KEY = "project-blocks";

export function useProjectBlocks(projectId: string): UseQueryResult<BlockListResponse, Error> {
  return useQuery({
    // Boş id ile ağa ÇIKILMAZ: `/projects//blocks` fetch tarafından
    // `/projects/blocks`e normalize edilir ve backend 422 döner (F-P5'te
    // CANLI SMOKE'ta yakalanan kusur sınıfı — jsdom testleri GÖRMEZ).
    enabled: projectId.length > 0,
    queryKey: [PROJECT_BLOCKS_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/blocks", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}
