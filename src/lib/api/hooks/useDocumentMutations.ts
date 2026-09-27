import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import { uploadDocument, type DocumentUploadInput } from "@/lib/api/documents-client";
import type { components } from "@/lib/api/schema";
import { DOCUMENTS_QUERY_KEY, type DocumentRead } from "./useDocuments";
import { DOCUMENT_FOLDERS_QUERY_KEY, type DocumentFolderRead } from "./useDocumentFolders";
import type { DeepScale } from "@/lib/api/scale";

// F-BC T1 · Belge Arşivi YAZMA yüzeyi — YALNIZ İKİ mutasyon vardır:
// belge yükleme ve klasör oluşturma.
//
// ⚠️ KALICI KARAR (spec §4): belge SİLME (`DELETE /documents/{id}`) ve klasör
// yeniden adlandırma/silme (`PATCH`/`DELETE /document-folders/{id}`) için hook
// YAZILMAZ — mockup'ta bu aksiyonlar yoktur ve ekrana bağlanmayacaktır.
// Uçlar backend'de durur (API'den kullanılabilir), BFF kökü de tanımlıdır;
// eksik olan bilerek eksiktir. Buraya bir silme hook'u eklemek = review bulgusu.

export type DocumentFolderCreate = DeepScale<components["schemas"]["DocumentFolderCreate"]>;

/**
 * Belge yükleme (`POST /documents`, multipart).
 *
 * `openapi-fetch` yerine `documents-client.ts` çağrılır: multipart gövde
 * tarayıcının ürettiği boundary ile gitmelidir (bkz. o modülün notu).
 * Hata YUTULMAZ — 413/422 gövdesi `BackendError` olarak formda basılır.
 *
 * Başarıda İKİ liste tazelenir: belge listesi ve klasör listesi (yeni belge
 * bir klasörün ilk belgesi olabilir; panel boş-durumdan çıkar).
 */
export function useUploadDocument(): UseMutationResult<DocumentRead, Error, DocumentUploadInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => uploadDocument(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DOCUMENTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DOCUMENT_FOLDERS_QUERY_KEY] });
    },
  });
}

/**
 * Klasör oluşturma (`POST /projects/{project_id}/document-folders`).
 *
 * `project_id` YOL parametresidir, gövdede YOKTUR (backend gerekçesi: iki
 * yerden gelseydi kapsam süzgeci atlatılabilirdi). Şantiye klasörü için
 * `site_id` GÖVDEDE taşınır. 409 (ad çakışması) YUTULMAZ.
 */
export function useCreateDocumentFolder(
  projectId: string,
): UseMutationResult<DocumentFolderRead, Error, DocumentFolderCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/projects/{project_id}/document-folders", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [DOCUMENT_FOLDERS_QUERY_KEY] }),
  });
}
