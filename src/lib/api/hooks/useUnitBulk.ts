import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import type { UnitListResponse } from "./useProjectUnits";
import { invalidateUnitDerived } from "./useUnitMutations";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-UNIT2 T2a · TU ("Toplu Ünite Üretimi") ekranının YAZMA yüzeyi — İKİ uç.
 *
 * ⚠️ BFF İZİN LİSTESİ: İKİ UÇ DA `projects` segmentiyle başlar ve o kök
 * `ALLOWED_ROOTS`ta ZATEN tanımlıdır (`src/app/api/backend/[...path]/route.ts`).
 * 🔴 YENİ KÖK EKLENMEZ — ne `units` ne `blocks`. Çağıranı olmayan kök
 * BEKÇİSİZDİR (F-MT2 kanonu) ve buradaki uçların hiçbirinin ihtiyacı yoktur.
 *
 * ⚠️ ÜRETİLMİŞ TİP TUZAĞI: `roof_floor` · `numbering` · `prefix` ·
 * `start_number` şemada varsayılanlıdır ama `openapi-typescript` çıktısında
 * ZORUNLU görünür. Gövdeyi kuran `bulk-unit-form/build-body.ts` dördünü de
 * AÇIKÇA verir; buradaki hook'lar gövdeye HİÇ dokunmaz (iki uç AYNI gövdeyi
 * alır, tek kurucu vardır).
 *
 * 🔴 İKİ UCUN ÇAKIŞMA SEMANTİĞİ AYRIDIR ve bu fark yük taşır
 * (`schema.d.ts`, uç açıklamaları):
 *
 *   · `POST …/units/bulk/preview` → **200**. *"Cakisma HATA DEGILDIR (TU 177)
 *     — satirlar `conflict=true` ile 200 doner"*. Yani çakışan satır bir
 *     UYARI yüzeyidir; istek başarılıdır ve ekran tabloyu basar.
 *   · `POST …/units/bulk` → **409 HEP-YA-HİÇ**. *"uretilen numaralardan biri
 *     bile blokta varsa HICBIRI yazilmaz"*. Yani 409 kısmi yazma DEĞİLDİR;
 *     ekran bunu "bir kısmı yazıldı" diye göstermemeli.
 */
export type UnitBulkCreate = DeepScale<components["schemas"]["UnitBulkCreate"]>;
export type UnitBulkPreview = DeepScale<components["schemas"]["UnitBulkPreview"]>;
export type UnitBulkPreviewRow = DeepScale<components["schemas"]["UnitBulkPreviewRow"]>;

/** İki ucun da girdisi AYNIDIR: proje PATH'te, gövde `UnitBulkCreate`. */
export interface BulkUnitVariables {
  projectId: string;
  body: UnitBulkCreate;
}

/**
 * TU 182 "Önizlemeyi Yenile" — `POST /projects/{project_id}/units/bulk/preview`.
 *
 * 🔴 **HİÇBİR ŞEY YAZMAZ ve DENETİM ÜRETMEZ.** Uç açıklaması bunu kendi
 * yazıyor: *"Burada `session.add`, `flush`, `commit` ya da herhangi bir
 * `UPDATE` YOKTUR … Denetim satiri da yazilmaz: onizleme bir OKUMA ucudur"*.
 * Dolayısıyla bu mutasyon **HİÇBİR ÖNBELLEĞİ GEÇERSİZ KILMAZ**: önizleme
 * sunucuda tek bir satır bile oynatmadığı için blok listesi, ünite ızgarası ve
 * satış özeti BAYATLAMAZ. `invalidateUnitDerived` çağırmak üç sorguyu bedava
 * yeniden çektirir ve "önizleme yazan bir uçtur" yanılgısını koda yazardı.
 *
 * `useMutation` (query değil) seçildi çünkü uç POST'tur ve YALNIZ kullanıcı
 * düğmeye basınca çalışır — TU 182 açıkça elle tetiklenen bir eylemdir.
 */
export function useBulkUnitPreview(): UseMutationResult<
  UnitBulkPreview,
  Error,
  BulkUnitVariables
> {
  return useMutation({
    mutationFn: async ({ projectId, body }) =>
      unwrap(
        await backendClient.POST("/projects/{project_id}/units/bulk/preview", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
  });
}

/**
 * TU 40/183 "N Üniteyi Oluştur" — `POST /projects/{project_id}/units/bulk` (201).
 *
 * 🔴 HEP-YA-HİÇ: uç açıklaması *"uretilen numaralardan biri bile blokta varsa
 * HICBIRI yazilmaz (409)"* der. Hata çağırana AYNEN iletilir; ekran 409'u
 * "hiçbiri yazılmadı" anlamıyla basar (`BULK_CONFLICT_HINT`).
 *
 * Yanıt `UnitListResponse`tur — *"guncel tam listedir"*. Yine de üç türev
 * geçersiz kılınır: bu ekran listeyi çizmez, listeye DÖNER; blok kartlarındaki
 * `estimated_unit_count`/`counts`, ünite ızgarası ve satış KPI özeti 24 yeni
 * üniteden sonra bayattır.
 */
export function useCreateBulkUnits(): UseMutationResult<
  UnitListResponse,
  Error,
  BulkUnitVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, body }) =>
      unwrap(
        await backendClient.POST("/projects/{project_id}/units/bulk", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    onSuccess: () => invalidateUnitDerived(queryClient),
  });
}
