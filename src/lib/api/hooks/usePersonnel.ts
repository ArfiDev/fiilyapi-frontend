import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-PT T1 · Puantaj — personel liste sorgusu. `useSiteDiary.ts` /
// `useEmployers.ts` deseniyle AYNI: tipler `pnpm gen:api` ciktisindan takma ad
// olarak alinir, elle arayuz yazmak yasak.
export type PersonnelListResponse = DeepScale<components["schemas"]["PersonnelListResponse"]>;
export type PersonnelListItem = DeepScale<components["schemas"]["PersonnelResponse"]>;
export type WorkerSource = components["schemas"]["WorkerSource"];

export const PERSONNEL_QUERY_KEY = "personnel";

/** Backend `limit` tavani (openapi: `le=200`). Ustunu istemek 422 dondurur. */
export const PERSONNEL_MAX_LIMIT = 200;

/**
 * `GET /personnel` filtreleri (openapi.json query parametreleri).
 *
 * ⚠️ TUZAK (F-TH dersi): yanittaki `total` SAYFALAMA TAVANIDIR — o dönemde
 * KAC kayit oldugunu soyler, `items.length` ile ayni DEGILDIR. Matris
 * "kac personel var" sorusunu `total`den, "hangi personeli cizecegim"
 * sorusunu `items`ten cevaplar; `limit` her zaman ACIKCA gecirilir
 * (varsayilan 50'ye guvenip 51. personeli kaybetmek en kolay hatadir).
 */
export interface PersonnelListFilter {
  q?: string;
  source?: WorkerSource;
  subcontractorId?: string;
  isActive?: boolean;
  /** İK-1 ile geldi: `GET /personnel?project_id=` — atanan proje süzgeci (P 122). */
  projectId?: string;
  /**
   * Kayıt 101: gönderilmezse backend süzgeci HİÇ UYGULAMAZ (varsayılan
   * `None`) ve "Taslak Kaydet" ile oluşturulan eksik personel kayıtları
   * varsayılan listeye karışır. `isActive` emsali gibi `false` de dahil
   * AÇIKÇA gönderilir.
   */
  isDraft?: boolean;
  limit?: number;
  offset?: number;
}

export function usePersonnel(
  filter: PersonnelListFilter = {},
): UseQueryResult<PersonnelListResponse, Error> {
  return useQuery({
    queryKey: [
      PERSONNEL_QUERY_KEY,
      filter.q ?? null,
      filter.source ?? null,
      filter.subcontractorId ?? null,
      filter.isActive ?? null,
      filter.projectId ?? null,
      filter.isDraft ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/personnel", {
          params: {
            query: {
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.source !== undefined ? { source: filter.source } : {}),
              ...(filter.subcontractorId !== undefined
                ? { subcontractor_id: filter.subcontractorId }
                : {}),
              ...(filter.isActive !== undefined ? { is_active: filter.isActive } : {}),
              ...(filter.projectId !== undefined ? { project_id: filter.projectId } : {}),
              ...(filter.isDraft !== undefined ? { is_draft: filter.isDraft } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
