import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

import {
  SUBCONTRACTOR_CONTRACT_QUERY_KEY,
  SUBCONTRACTOR_CONTRACTS_LIST_QUERY_KEY,
  type SubcontractorContractDetail,
} from "./useSubcontractorProgressPayments";

// F-P5 T1 · Taşeron sözleşmesi YAZMA uçları — FSO (oluştur/taslak) ve TSD
// (şartlar PATCH'i + poz tablosunda Taşeron B.F. düzenleme) buradan beslenir.
// Okuma tarafı (`useSubcontractorContract`, `useSubcontractorContractsList`)
// F-TH'den beri `useSubcontractorProgressPayments.ts`tedir ve TAŞINMADI —
// taşımak F-TH ekranlarının import'larını gereksizce kırardı; `use*Mutations.ts`
// deseni zaten okuma/yazma ayrımını ayrı dosyaya koyuyor.
//
// Her mutasyon HEM sözleşme detayını HEM liste anahtarını geçersiz kılar:
// liste öğesi `contract_no`/`work_category`/`status`/`site_id` taşır, bunların
// hepsi bu uçlarla değişebilir.
export type SubcontractorContractCreateRequest =
  DeepScale<components["schemas"]["SubcontractorContractCreate"]>;
export type SubcontractorContractUpdateRequest =
  DeepScale<components["schemas"]["SubcontractorContractUpdate"]>;
export type SubcontractorContractItemCreateRequest =
  components["schemas"]["SubcontractorContractItemCreate"];
export type SubcontractorContractItemUpdateRequest =
  components["schemas"]["SubcontractorContractItemUpdate"];
export type SubcontractorContractItemResponse =
  components["schemas"]["SubcontractorContractItemResponse"];
export type SubcontractorContractItemsLoadResponse =
  components["schemas"]["SubcontractorContractItemsLoadResponse"];

/** Detay + liste anahtarlarını birlikte tazeler (kural tek yerde). */
function useContractInvalidator(): (contractId: string) => void {
  const queryClient = useQueryClient();
  return (contractId: string) => {
    queryClient.invalidateQueries({ queryKey: [SUBCONTRACTOR_CONTRACT_QUERY_KEY, contractId] });
    queryClient.invalidateQueries({ queryKey: [SUBCONTRACTOR_CONTRACTS_LIST_QUERY_KEY] });
  };
}

/**
 * FSO'nun "Oluştur"/"Taslak Kaydet" ucu. Sözleşme PROJE altında açılır
 * (`POST /projects/{project_id}/subcontractor-contracts`) ve gövde kalemleri
 * de taşıyabilir (`items[]`) — taslak akışında boş dizi gönderilir.
 */
export function useCreateSubcontractorContract(
  projectId: string,
): UseMutationResult<SubcontractorContractDetail, Error, SubcontractorContractCreateRequest> {
  const invalidate = useContractInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/projects/{project_id}/subcontractor-contracts", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/** TSD "Sözleşme Şartları" bölümünün Kaydet'i (kısmi gövde). */
export function useUpdateSubcontractorContract(
  contractId: string,
): UseMutationResult<SubcontractorContractDetail, Error, SubcontractorContractUpdateRequest> {
  const invalidate = useContractInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/subcontractor-contracts/{contract_id}", {
          params: { path: { contract_id: contractId } },
          body,
        }),
      ),
    onSuccess: () => invalidate(contractId),
  });
}

/** Poz tablosuna elle satır ekleme (FSO/TSD). */
export function useCreateSubcontractorContractItem(
  contractId: string,
): UseMutationResult<
  SubcontractorContractItemResponse,
  Error,
  SubcontractorContractItemCreateRequest
> {
  const invalidate = useContractInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/subcontractor-contracts/{contract_id}/items", {
          params: { path: { contract_id: contractId } },
          body,
        }),
      ),
    onSuccess: () => invalidate(contractId),
  });
}

/**
 * Kalem güncelleme — TSD'de tek yazılabilir alan olan Taşeron B.F.
 * (`unit_price`) buradan gider. Uç KALEM kimliğiyle çalışır
 * (`PATCH /subcontractor-contracts/items/{item_id}`), sözleşme kimliğini
 * TAŞIMAZ; geçersiz kılma için sözleşme kimliği hook'a ayrıca bağlanır.
 */
export function useUpdateSubcontractorContractItem(
  contractId: string,
): UseMutationResult<
  SubcontractorContractItemResponse,
  Error,
  { itemId: string; body: SubcontractorContractItemUpdateRequest }
> {
  const invalidate = useContractInvalidator();
  return useMutation({
    mutationFn: async ({ itemId, body }) =>
      unwrap(
        await backendClient.PATCH("/subcontractor-contracts/items/{item_id}", {
          params: { path: { item_id: itemId } },
          body,
        }),
      ),
    onSuccess: () => invalidate(contractId),
  });
}

/** Poz satırı silme (FSO "satır sil"). Uç gövdesiz `204` döner. */
export function useDeleteSubcontractorContractItem(
  contractId: string,
): UseMutationResult<void, Error, string> {
  const invalidate = useContractInvalidator();
  return useMutation({
    mutationFn: async (itemId) => {
      unwrap(
        await backendClient.DELETE("/subcontractor-contracts/items/{item_id}", {
          params: { path: { item_id: itemId } },
        }),
      );
    },
    onSuccess: () => invalidate(contractId),
  });
}

/**
 * FSO "Poz Listesi" kartının işveren sözleşmesinden kalem çekme akışı.
 * Yanıt `created_count`/`skipped_count` taşır — çağıran taraf ikisini de
 * kullanıcıya BİLDİRİR (sessiz atlama yasak).
 */
export function useLoadSubcontractorContractItemsFromEmployer(
  contractId: string,
): UseMutationResult<SubcontractorContractItemsLoadResponse, Error, void> {
  const invalidate = useContractInvalidator();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await backendClient.POST(
          "/subcontractor-contracts/{contract_id}/items/load-from-employer",
          { params: { path: { contract_id: contractId } } },
        ),
      ),
    onSuccess: () => invalidate(contractId),
  });
}
