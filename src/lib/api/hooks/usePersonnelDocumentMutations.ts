import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import {
  HR_DOCUMENTS_SUMMARY_QUERY_KEY,
  PERSONNEL_DOCUMENTS_QUERY_KEY,
  type PersonnelDocumentResponse,
} from "./useHrDocuments";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-BLG T2c · `POST /personnel/{personnel_id}/documents` — personel belge
 * takip kaydı (`Form - Personel Belgesi.dc.html`).
 *
 * ⚠️ Uç **JSON** alır, DOSYA ALMAZ: gövdede `file` YOKTUR. Dosya iki adımlı
 * akışın BİRİNCİ adımında `POST /documents` (arşiv) ile yüklenir ve dönen
 * künye `document_id` olarak buraya bağlanır (mockup tasarım notu 30-39).
 *
 * ⚠️ `type_id` XOR `free_label` — TAM BİRİ (şema `model_validator`); ikisi de
 * dolu ya da ikisi de boş gövde 422 döner. İstemci tarafı da doğrular
 * (`validate.ts`) ki sunucuya bilerek 422 attırılmasın.
 *
 * Başarıda İKİ liste tazelenir: personelin belge listesi (PD kartı) ve İK
 * belge özeti (BT ekranı + bu formun tip kataloğu aynı uçtan besleniyor).
 */
export type PersonnelDocumentCreate = DeepScale<components["schemas"]["PersonnelDocumentCreate"]>;

export function useCreatePersonnelDocument(
  personnelId: string,
): UseMutationResult<PersonnelDocumentResponse, Error, PersonnelDocumentCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/personnel/{personnel_id}/documents", {
          params: { path: { personnel_id: personnelId } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PERSONNEL_DOCUMENTS_QUERY_KEY, personnelId] });
      queryClient.invalidateQueries({ queryKey: [HR_DOCUMENTS_SUMMARY_QUERY_KEY] });
    },
  });
}

export type PersonnelDocumentUpdate = DeepScale<components["schemas"]["PersonnelDocumentUpdate"]>;

/**
 * `PATCH /personnel/documents/{document_id}` — yanlış girilen künyeyi DÜZELTİR
 * (`personnel:full`). Yol personelsizdir; `personnelId` YALNIZ geçersiz kılma
 * anahtarı için alınır (`useUpdateBoqItem` deseni).
 *
 * ⚠️ `type_id`/`free_label` DEĞİŞMEZ (şema `PersonnelDocumentUpdate`): belgenin
 * KİMLİĞİ sabittir, yanlış tiple açılan kayıt silinip yeniden açılır.
 *
 * ⚠️ İKİ liste tazelenir — `HR_DOCUMENTS_SUMMARY_QUERY_KEY` atlanırsa "süresi
 * doldu" KPI'sı ve kritik bandı düzeltmeden sonra da eski sayıyı gösterir.
 */
export function useUpdatePersonnelDocument(
  personnelId: string,
): UseMutationResult<
  PersonnelDocumentResponse,
  Error,
  { documentId: string; body: PersonnelDocumentUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, body }) =>
      unwrap(
        await backendClient.PATCH("/personnel/documents/{document_id}", {
          params: { path: { document_id: documentId } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PERSONNEL_DOCUMENTS_QUERY_KEY, personnelId] });
      queryClient.invalidateQueries({ queryKey: [HR_DOCUMENTS_SUMMARY_QUERY_KEY] });
    },
  });
}

/**
 * `DELETE /personnel/documents/{document_id}` — İK TAKİP KAYDINI siler
 * (`personnel:admin`; `full` silmeyi KAPSAMAZ → çağıran taraf `canWrite` değil
 * `canDelete` kapısını kullanmalıdır).
 *
 * ⚠️ Anlam: bağlı BC arşiv dosyasına DOKUNULMAZ (sunucuda SET NULL — dosya
 * arşivde kalır). Çağıran yüzeyin metni "belgeyi sil" değil "takip kaydını sil"
 * anlamını vermelidir.
 *
 * Başarı `204 No Content` — gövde yoktur; `unwrap` yalnız `response.ok`'a bakar.
 */
export function useDeletePersonnelDocument(
  personnelId: string,
): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      unwrap(
        await backendClient.DELETE("/personnel/documents/{document_id}", {
          params: { path: { document_id: documentId } },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PERSONNEL_DOCUMENTS_QUERY_KEY, personnelId] });
      queryClient.invalidateQueries({ queryKey: [HR_DOCUMENTS_SUMMARY_QUERY_KEY] });
    },
  });
}
