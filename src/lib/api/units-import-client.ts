import { guardedFetch } from "@/lib/api/app-build";
import { BackendError } from "@/lib/api/unwrap";
import { downloadAttachment } from "@/lib/api/download";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-UNIT2 T2b · EI ("Excel'den Ünite İçe Aktarma") — ŞEMADA olan ama
// `openapi-fetch` ile geçilemeyen ÜÇ uç: iki multipart yükleme
// (`POST …/units/import/validate`, `POST …/units/import`) ve bir ikili indirme
// (`GET …/units/import/template`). `documents-client.ts` kanonu BİREBİR
// izlenir (o da `boq-client.ts`/`timesheet-client.ts`'i izler); yeni yükleme
// ya da indirme deseni İCAT EDİLMEZ.
//
// ⚠️ BFF İZİN LİSTESİ: üç ucun da ilk path segmenti `projects`tır ve o kök
// `ALLOWED_ROOTS`ta ZATEN tanımlıdır. 🔴 `units` diye YENİ BİR KÖK EKLENMEZ —
// çağıranı olmayan kök bekçisizdir (F-MT2 kanonu).
//
// ⚠️ ŞABLON İNDİRMESİNİN İKİLİ DALI ZATEN ÇALIŞIR ve BFF'te değişiklik
// GEREKTİRMEZ (ölçüldü, `route.ts::isBinaryResponse`): son segment `template`
// bir `download` segmenti DEĞİLDİR ve `.xlsx` ile BİTMEZ, dolayısıyla karar
// **Content-Type** dalına düşer. Backend `XLSX_MEDIA_TYPE`
// (`application/vnd.openxmlformats-…sheet`) döner; bu `TEXTUAL_CONTENT_TYPES`
// listesinde YOKTUR → ikili sayılır ve gövde ham geçer.

export type UnitImportValidation = DeepScale<components["schemas"]["UnitImportValidation"]>;
export type UnitImportResult = DeepScale<components["schemas"]["UnitImportResult"]>;

const PROJECTS_PATH = "/api/backend/projects";

/** Şablon `Content-Disposition` başlığı okunamazsa kullanılan ad. */
export const IMPORT_TEMPLATE_FALLBACK_NAME = "unite-sablonu.xlsx";

async function toBackendError(response: Response): Promise<BackendError> {
  const body = await response.json().catch(() => null);
  return new BackendError(response.status, body);
}

/** `projectId` UUID beklenir ama URL parçası olduğu için yine de kaçırılır. */
function importPath(projectId: string, suffix: string): string {
  return `${PROJECTS_PATH}/${encodeURIComponent(projectId)}/units/import${suffix}`;
}

export interface UnitImportUploadInput {
  /**
   * 🔴 SEÇİLEN `File` NESNESİNİN KENDİSİ. Sunucu dosyayı SAKLAMAZ
   * (`router.py`: *"DOSYA SAKLANMADIGI ICIN … 'Yeniden Doğrula → Aktar'
   * akisinda dosya IKI KEZ yuklenir … Frontend dilimi bunu bilerek yazar."*),
   * bu yüzden çağıran aynı `File`ı hem doğrulamaya hem aktarıma verir.
   */
  file: File;
  /**
   * EI 61 "Hedef Şantiye". Verilmezse gövdeye HİÇ eklenmez — backend
   * semantiğinde "geçmemek" `site_id=None` demektir, BOŞ DİZE DEĞİL (boş dize
   * sunucuda anlamsız bir UUID ayrıştırma hatası üretir). `documents-client.ts`
   * kendi `site_id`si için AYNI kuralı yazar.
   */
  siteId?: string;
  /** EI 192 kutucuğu. Şema varsayılanı `true`; mockup'ta da `checked`. */
  includeWarnings: boolean;
}

/**
 * İki multipart ucun ORTAK gövdesi — tek kurucu vardır.
 *
 * ⚠️ `Content-Type` başlığı ELLE KURULMAZ: `FormData` verildiğinde boundary'yi
 * tarayıcı üretir; elle `multipart/form-data` yazmak boundary'siz bir başlık
 * üretir ve backend gövdeyi ayrıştıramaz (HER yükleme 422). BFF gövdeyi ham
 * geçirir (bkz. `route.ts` `rawBody`).
 *
 * 🔴 `include_warnings` bir multipart ALANIDIR: `FormData.append` değeri dizeye
 * çevirir, bu yüzden `"true"`/`"false"` AÇIKÇA yazılır. Ham `false` boolean'ı
 * `append`e vermek `"false"` üretir ama tür sözü belirsiz kalırdı; FastAPI
 * `bool` alanı `"false"` dizesini `False` olarak okur.
 */
function buildImportForm(input: UnitImportUploadInput): FormData {
  const form = new FormData();
  form.append("file", input.file);
  if (input.siteId !== undefined) form.append("site_id", input.siteId);
  form.append("include_warnings", input.includeWarnings ? "true" : "false");
  return form;
}

/**
 * Ortak POST gövdesi. Token yalnızca httpOnly cookie'de kalır — URL'e imzalı
 * token/parametre KOYULMAZ, istek `credentials: "same-origin"` ile gider.
 *
 * 413 (boyut sınırı) ve 422 (uzantı reddi, eksik başlık, "hiç geçerli satır
 * yok") gövdeleri YUTULMAZ — ekran Türkçe `detail` mesajını basar.
 */
async function postImportForm<T>(path: string, input: UnitImportUploadInput): Promise<T> {
  const response = await guardedFetch(path, {
    method: "POST",
    credentials: "same-origin",
    body: buildImportForm(input),
  });
  if (!response.ok) throw await toBackendError(response);
  return (await response.json()) as T;
}

/**
 * EI 201 "Yeniden Doğrula" — `POST …/units/import/validate`.
 *
 * 🔴 **HİÇBİR ŞEY YAZMAZ**: uç `_audit` çağırmaz, `Request` parametresi bile
 * ALMAZ. Yanıt `UnitImportValidation`dır (`UnitImportResult` DEĞİL) ve iki uç
 * BİLEREK ayrıdır — tek uç + `dry_run` bayrağı `response_model`i bir `Union`a
 * zorlar ve üretilmiş istemcide sessiz `undefined` sınıfı doğururdu.
 */
export async function validateUnitsImport(
  projectId: string,
  input: UnitImportUploadInput,
): Promise<UnitImportValidation> {
  return postImportForm<UnitImportValidation>(importPath(projectId, "/validate"), input);
}

/**
 * EI 38/202 "N Geçerli Satırı Aktar" — `POST …/units/import`.
 *
 * 🔴 KISMİ AKTARIM BİLİNÇLİ DAVRANIŞTIR (`router.py`: *"gecerli satirlar
 * yazilir, hatalilar raporlanir. Hic gecerli satir yoksa 422 — `created=0` ile
 * 200 donmek kullanicinin 'aktarildi' sanmasina yol acardi."*). Yani bu
 * fonksiyonun 422'si BAŞARISIZLIK DEĞİL "hiçbiri yazılamadı" bilgisidir ve
 * çağıran onu AÇIKÇA basar.
 *
 * 🔴 Dosya İKİNCİ KEZ yüklenir; `validate` çağrısındaki `File` nesnesinin
 * AYNISI verilir (sunucu dosyayı saklamaz).
 */
export async function importUnits(
  projectId: string,
  input: UnitImportUploadInput,
): Promise<UnitImportResult> {
  return postImportForm<UnitImportResult>(importPath(projectId, ""), input);
}

/**
 * EI 37/87 "Şablon İndir" — `GET …/units/import/template` (12 başlıklı boş
 * `.xlsx`).
 *
 * 🔴 EXPORT-XLSX · gövde `@/lib/api/download` TEK kaynağındadır: blob →
 * objectURL → `<a download>` → `revokeObjectURL` bir `finally` içinde
 * (tarayıcı indirmeyi reddetse bile obje URL'i sızdırılmaz). Ad
 * `attachmentFilename` ile
 * `Content-Disposition`tan okunur — backend proje koduyla adlandırır
 * (`unite-sablonu-{code}.xlsx`), yol ayracı/kontrol karakteri taşıyan bir ad
 * reddedilip varsayılana düşülür.
 *
 * ⚠️ İZİN `view`tir (sunucu kararı): şablon hiçbir proje verisi taşımaz ve
 * `full`a kapatmak veri GİRECEK kullanıcıyı akışın İLK adımından mahrum
 * bırakırdı. Yine de görünürlük kapısı vardır (görünmeyen proje 404).
 */
export async function downloadUnitsImportTemplate(projectId: string): Promise<void> {
  await downloadAttachment(importPath(projectId, "/template"), IMPORT_TEMPLATE_FALLBACK_NAME);
}
