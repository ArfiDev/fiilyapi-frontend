/**
 * F-UNIT2 · `POST …/units/import` ve `…/units/import/validate` gövdelerinin
 * DOSYA DIŞI alanlarını kuran SAF katman. İki uç AYNI alan kümesini alır.
 *
 * 🔴 `site_id` BURAYA AİTTİR — TU'nun tam TERSİ. Toplu üretimde (TU 62)
 * şantiye YALNIZ blok listesini daraltan bir süzgeçtir ve gövdeye GİRMEZ;
 * içe aktarmada ise gerçek bir gövde alanıdır çünkü dosyada geçen ama projede
 * OLMAYAN bloklar AÇILIR ve yeni bloğun şantiyesi buradan gelir (`router.py`:
 * *"YALNIZ yeni blok acarken kullanilir"*). İki ekranı aynı sanmak sessiz
 * hata olurdu — her ikisinin de adlı testi vardır.
 *
 * 🔴 `file` BU KATMANDA TAŞINMAZ. `import/validate` dosyayı SAKLAMAZ
 * (docstring: *"DOSYA SAKLANMADIGI ICIN … 'Yeniden Doğrula → Aktar' akisinda
 * dosya IKI KEZ yuklenir. Tarayicida bu bedavadir: `File` nesnesi zaten
 * istemcinin bellegindedir. Frontend dilimi bunu bilerek yazar."*) — seçilen
 * `File` bileşen durumunda TUTULUR ve iki istekte de yeniden gönderilir.
 * Saf katmanın `File`a dokunmaması bu modülü DOM'suz test edilebilir kılar.
 *
 * ⚠️ Çağıran `FormData`yı kurarken `Content-Type` başlığını ELLE KURMAZ
 * (`documents-client.ts::uploadDocument` emsali): sınır (boundary) dizesini
 * tarayıcı üretir.
 */

import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

type ImportBody =
  DeepScale<components["schemas"]["Body_import_units_endpoint_projects__project_id__units_import_post"]>;

/** Gövdenin `file` DIŞINDAKİ alanları. */
export type ImportFormFields = Omit<ImportBody, "file">;

export interface UnitImportFormValues {
  /** EI 60 — PATH parametresi (`{project_id}`). Gövdeye GİRMEZ. */
  projectId: string;
  /** EI 61 — GERÇEK gövde alanı (`site_id`). */
  siteId: string;
  /** EI 192 — `include_warnings`; mockup'ta `checked`, şema varsayılanı `true`. */
  includeWarnings: boolean;
}

export function emptyUnitImportFormValues(): UnitImportFormValues {
  return { projectId: "", siteId: "", includeWarnings: true };
}

export function buildImportFields(values: UnitImportFormValues): ImportFormFields {
  const siteId = values.siteId.trim();
  return {
    // `include_warnings` üretilmiş tipte ZORUNLUDUR ve `false` MEŞRU bir
    // değerdir — doğruluk kontrolüyle düşürülmez.
    include_warnings: values.includeWarnings,
    // `site_id` opsiyoneldir: yeni blok açılmayan bir dosyada gereksizdir ve
    // boş dize göndermek sunucuda anlamsız bir UUID ayrıştırma hatası üretirdi.
    ...(siteId === "" ? {} : { site_id: siteId }),
  };
}
