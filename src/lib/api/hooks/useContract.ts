import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// P7 T5 · İşveren sözleşmesi okuma uçları — hakediş oluştur/düzenle formunun
// satır kaynağı (poz dağılımı) ve Fiyat Farkı bandı (sözleşme detayı) için.
// T1'in `useProgressPayments.ts`/`useProgressPaymentMutations.ts`i bu iki ucu
// SARMIYOR (brief §Belirsizlik çözümü 1) — `useBoq.ts` deseniyle burada
// eklendi. Tipler `pnpm gen:api` çıktısından takma ad olarak alınır; elle
// arayüz yazmak yasak.
export type ContractDistributionResponse = DeepScale<components["schemas"]["ContractDistributionResponse"]>;
export type ContractDistributionGroup = DeepScale<components["schemas"]["ContractDistributionGroup"]>;
export type ContractDistributionItem = DeepScale<components["schemas"]["ContractDistributionItem"]>;
export type ContractDistributionSite = DeepScale<components["schemas"]["ContractDistributionSite"]>;
export type ContractDistributionAllocation =
  DeepScale<components["schemas"]["ContractDistributionAllocation"]>;
// F-P5 T4 · POZ 168-187 şantiye kota özeti kartlarının satır tipi.
export type ContractDistributionSiteSummary =
  DeepScale<components["schemas"]["ContractDistributionSiteSummary"]>;
export type ContractDistributionSiteItem =
  DeepScale<components["schemas"]["ContractDistributionSiteItem"]>;
export type EmployerContractDetail = DeepScale<components["schemas"]["EmployerContractDetail"]>;

// F-P5 T1 · E14 "İş Kalemleri" sekmesi — gruplar + kalemler
// (`distributed_quantity`/`remaining_quantity` kolonlarıyla). Bu ekleme
// `useContract.ts`e YAPILDI çünkü uç aynı aileden (`/projects/{id}/contract*`,
// `projectId` anahtarlı, aynı boş-id kapısı).
export type EmployerContractItemsResponse =
  DeepScale<components["schemas"]["EmployerContractItemsResponse"]>;
export type EmployerContractGroupItems = DeepScale<components["schemas"]["EmployerContractGroupItems"]>;
export type EmployerContractItemResponse = DeepScale<components["schemas"]["EmployerContractItemResponse"]>;

export const CONTRACT_DISTRIBUTION_QUERY_KEY = "contract-distribution";
export const EMPLOYER_CONTRACT_QUERY_KEY = "employer-contract";
export const EMPLOYER_CONTRACT_ITEMS_QUERY_KEY = "employer-contract-items";

/**
 * Poz dağılımı (satır kaynağı — spec `POZ` ekranı). `useBoq` deseni: `siteId`
 * yerine `projectId` boşken ağa çıkılmaz — hakediş formu proje seçilmeden
 * (create kipinde `?project=` yoksa) bu hook boş id ile çağrılabilir.
 */
export function useContractDistribution(
  projectId: string,
): UseQueryResult<ContractDistributionResponse, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [CONTRACT_DISTRIBUTION_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/contract/distribution", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}

/**
 * Sözleşme detayı — hakediş formunun Fiyat Farkı bandı (`has_price_escalation`,
 * SALT OKUNUR) ve İşveren adı için (brief §Form üst bölümü). Aynı bos-id
 * kapısı.
 */
export function useEmployerContract(
  projectId: string,
): UseQueryResult<EmployerContractDetail, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [EMPLOYER_CONTRACT_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/contract", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}

/**
 * İşveren sözleşmesinin iş kalemleri (E14 "İş Kalemleri" sekmesi). Dağılım
 * ucundan FARKLIDIR: burada şantiye kolonları yok, kalem başına toplam
 * `distributed_quantity`/`remaining_quantity` var. Aynı boş-id kapısı.
 */
export function useEmployerContractItems(
  projectId: string,
): UseQueryResult<EmployerContractItemsResponse, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/contract/items", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}
