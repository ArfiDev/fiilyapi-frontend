import { guardedFetch } from "@/lib/api/app-build";
import { BackendError } from "@/lib/api/unwrap";
import { attachmentFilename, exportFilename } from "@/lib/api/export-filename";

/**
 * İkili (blob) indirmenin TEK KAYNAĞI.
 *
 * EXPORT-XLSX ölçümü: aşağıdaki gövde DOKUZ istemcide birebir kopyalanmıştı
 * (`audit` · `boq` · `documents` · `equipment-documents` · `payroll` ·
 * `purchase-quote` · `timesheet` · `units-export` · `units-import`). Aralarındaki
 * tek gerçek fark dosya adını hangi çözücünün okuduğuydu; geri kalan her satır
 * aynıydı. Altı yeni dışa aktarma ucu bu kopyaların üstüne yazılsaydı sayı
 * on beşe çıkacaktı.
 *
 * Kopya bir üslup sorunu değil: `revokeObjectURL`u bir kopyada `finally`
 * dışına almak SESSİZ bir bellek sızıntısıdır ve hiçbir ekran testi görmez.
 * Burada tek yerde durur.
 *
 * ## Neden ham `fetch`
 *
 * Uç şemada olsa da `openapi-fetch` KULLANILMAZ: yanıtı içerik tipine göre
 * JSON/metin olarak çözer ve ikili gövde (xlsx) için `Blob` vermez.
 *
 * ## BFF sözleşmesi
 *
 * BFF ikili/JSON kararını `Content-Type`tan verir ve `status >= 400` HER ZAMAN
 * JSON dalına gider — 403/404/422 gövdeleri bu yüzden `BackendError` olarak
 * okunabilir. Token yalnız httpOnly çerezdedir: URL'e imzalı token/parametre
 * KOYULMAZ, istek `credentials: "same-origin"` ile gider.
 */

/** Sorgu dizesini yola ekler; boş sorguda yol değişmez. */
export function withQuery(path: string, query: Record<string, string>): string {
  const qs = new URLSearchParams(query).toString();
  return qs ? `${path}?${qs}` : path;
}

async function toBackendError(response: Response): Promise<BackendError> {
  const body = await response.json().catch(() => null);
  return new BackendError(response.status, body);
}

/**
 * Blob'u tarayıcıya indirtir.
 *
 * `finally` ŞARTTIR: tarayıcı indirmeyi reddetse bile obje URL'i sızdırılmaz.
 */
function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchBinary(path: string): Promise<Response> {
  const response = await guardedFetch(path, {
    method: "GET",
    credentials: "same-origin",
  });
  if (!response.ok) throw await toBackendError(response);
  return response;
}

/**
 * Excel dışa aktarımını indirir. Ad `exportFilename` ile çözülür — uzantı
 * `.xlsx` olmak ZORUNDADIR, aksi hâlde `fallbackName`e düşer. Çözülen ad döner
 * (başarı bildirimi için).
 */
export async function downloadExport(path: string, fallbackName: string): Promise<string> {
  const response = await fetchBinary(path);
  const blob = await response.blob();
  const filename = exportFilename(response.headers.get("content-disposition"), fallbackName);
  saveBlob(blob, filename);
  return filename;
}

/**
 * Arşiv/belge ekini indirir. `downloadExport`tan TEK farkı ad çözücüsüdür:
 * arşivde uzantı kullanıcının yüklediği herhangi bir şey olabilir.
 */
export async function downloadAttachment(path: string, fallbackName: string): Promise<void> {
  const response = await fetchBinary(path);
  const blob = await response.blob();
  saveBlob(blob, attachmentFilename(response.headers.get("content-disposition"), fallbackName));
}
