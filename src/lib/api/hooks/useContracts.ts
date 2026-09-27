import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-P5 T1 · SZL (`/sozlesmeler`) sekmeli listesinin TEK kaynağı:
// `GET /contracts?type=employer|subcontractor` — 4 KPI (`summary`) + tablo
// (`items`) aynı yanıttan gelir.
//
// Neden `useContract.ts`e değil AYRI dosyaya: `useContract.ts` PROJE BAŞINA
// işveren sözleşmesi okuma ailesidir (`/projects/{id}/contract*`, hepsi
// `projectId` anahtarlı). Bu uç ise iki sözleşme TÜRÜNÜ birden kapsayan
// repo-geneli bir listedir ve `type` zorunlu parametresiyle farklı bir önbellek
// ailesi kurar; aynı dosyada durursa iki ayrı sorgu ailesi tek dosyada
// karışırdı.
//
// ⚠️ Bu uçta SAYFALAMA YOKTUR — `ContractListResponse` yalnız `summary`+`items`
// taşır, `limit`/`offset`/`total` alanı ve parametresi openapi'de YOK. Bu
// yüzden `buildListTruncation` korkuluğu burada UYGULANMAZ (kırpılma kavramı
// tanımsız). `GET /subcontractor-contracts` (U1) ile KARIŞTIRILMAMALIDIR: o uç
// TB3'ten beri sayfalıdır.
export type ContractListResponse = components["schemas"]["ContractListResponse"];
export type ContractListItem = DeepScale<components["schemas"]["ContractListItem"]>;
export type ContractSummary = components["schemas"]["ContractSummary"];
export type ContractStatus = components["schemas"]["ContractStatus"];
export type ContractType = "employer" | "subcontractor";

export const CONTRACTS_QUERY_KEY = "contracts";

export interface ContractsFilter {
  /** Zorunlu — uçta varsayılanı YOK, sekme seçimi doğrudan buraya bağlanır. */
  type: ContractType;
  project_id?: string;
  status?: ContractStatus;
  q?: string;
}

export function useContracts(
  filter: ContractsFilter,
): UseQueryResult<ContractListResponse, Error> {
  return useQuery({
    queryKey: [
      CONTRACTS_QUERY_KEY,
      filter.type,
      filter.project_id ?? null,
      filter.status ?? null,
      filter.q ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/contracts", {
          params: {
            query: {
              type: filter.type,
              ...(filter.project_id ? { project_id: filter.project_id } : {}),
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.q ? { q: filter.q } : {}),
            },
          },
        }),
      ),
  });
}
