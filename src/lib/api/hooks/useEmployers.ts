import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// Task F4 — Yeni Proje formunun İşveren seçicisi (spec §3.1). useProjects
// deseniyle ayni: filtre objesi opsiyonel, sorgu anahtari filtreyi tasir.
export type EmployerListResponse = DeepScale<components["schemas"]["EmployerListResponse"]>;
export type EmployerListItem = DeepScale<components["schemas"]["EmployerResponse"]>;

export interface EmployerListFilter {
  q?: string;
  activeOnly?: boolean;
}

export const EMPLOYERS_QUERY_KEY = "employers";

export function useEmployers(
  filter: EmployerListFilter = {},
): UseQueryResult<EmployerListResponse, Error> {
  return useQuery({
    queryKey: [EMPLOYERS_QUERY_KEY, filter.q ?? null, filter.activeOnly ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/employers", {
          params: {
            query: {
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.activeOnly !== undefined ? { active_only: filter.activeOnly } : {}),
            },
          },
        }),
      ),
  });
}
