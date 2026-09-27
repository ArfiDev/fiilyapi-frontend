import { guardedFetch } from "@/lib/api/app-build";
import { BackendError } from "@/lib/api/unwrap";
import { downloadAttachment } from "@/lib/api/download";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-BC T1 · Belge Arşivi — ŞEMADA olan ama `openapi-fetch` ile geçilemeyen iki
// uç: multipart yükleme (`POST /documents`) ve ikili indirme
// (`GET /documents/{id}/download`). `boq-client.ts`/`timesheet-client.ts`
// kanonu BİREBİR izlenir; yeni desen icat EDİLMEZ.

export type DocumentRead = DeepScale<components["schemas"]["DocumentRead"]>;

const DOCUMENTS_PATH = "/api/backend/documents";

async function toBackendError(response: Response): Promise<BackendError> {
  const body = await response.json().catch(() => null);
  return new BackendError(response.status, body);
}

/** `documentId` UUID beklenir ama URL parçası olduğu için yine de kaçırılır. */
function downloadPath(documentId: string): string {
  return `${DOCUMENTS_PATH}/${encodeURIComponent(documentId)}/download`;
}

/**
 * Belgeyi BFF üzerinden indirir.
 *
 * İçerik tipi ÖNCEDEN BİLİNMEZ (kullanıcının yüklediği dosya ne ise o), bu
 * yüzden BFF indirme ucunda ikili dalı segment kuralıyla seçer; burada da
 * yanıt her zaman `Blob` olarak okunur. `status >= 400` BFF'te JSON dalına
 * gittiği için Türkçe `detail` gövdesi `BackendError` olarak okunabilir.
 *
 * 🔴 EXPORT-XLSX · gövde `@/lib/api/download` TEK kaynağındadır;
 * `downloadAttachment`ın `downloadExport`tan TEK farkı ad çözücüsüdür
 * (arşivde uzantı kullanıcının yüklediği herhangi bir şey olabilir).
 *
 * Token yalnızca httpOnly cookie'de kalır — URL'e imzalı token/parametre
 * KOYULMAZ, istek `credentials: "same-origin"` ile gider.
 */
export async function downloadDocument(documentId: string, fallbackName: string): Promise<void> {
  await downloadAttachment(downloadPath(documentId), fallbackName);
}

export interface DocumentUploadInput {
  file: File;
  projectId: string;
  /**
   * Verilmezse gövdeye HİÇ eklenmez — backend semantiğinde "geçmemek" proje
   * düzeyi (`site_id IS NULL`) demektir, boş dize DEĞİL.
   */
  siteId?: string;
  folderId?: string;
  description?: string;
}

/**
 * Belge yükler (`POST /documents`, multipart).
 *
 * ⚠️ `Content-Type` başlığı ELLE KURULMAZ: `FormData` verildiğinde tarayıcı
 * boundary'yi kendisi üretir; elle `multipart/form-data` yazmak boundary'siz
 * bir başlık üretir ve backend gövdeyi ayrıştıramaz (her yükleme 422). BFF
 * gövdeyi ham geçirir (bkz. route.ts `rawBody`).
 *
 * 413 (boyut sınırı) ve 422 (uzantı reddi) gövdeleri YUTULMAZ — ekran Türkçe
 * `detail` mesajını basar.
 */
export async function uploadDocument(input: DocumentUploadInput): Promise<DocumentRead> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("project_id", input.projectId);
  if (input.siteId !== undefined) form.append("site_id", input.siteId);
  if (input.folderId !== undefined) form.append("folder_id", input.folderId);
  if (input.description !== undefined) form.append("description", input.description);

  const response = await guardedFetch(DOCUMENTS_PATH, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  if (!response.ok) throw await toBackendError(response);
  return (await response.json()) as DocumentRead;
}
