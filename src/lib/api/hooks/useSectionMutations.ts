import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import { SITE_QUERY_KEY } from "./useSites";
import { SITE_SECTIONS_QUERY_KEY } from "./useSiteSections";
import { SECTION_QUERY_KEY, type SectionDetailResponse } from "./useSection";
import type { DeepScale } from "@/lib/api/scale";

export type SectionCreateRequest = DeepScale<components["schemas"]["SectionCreate"]>;
export type SectionUpdateRequest = DeepScale<components["schemas"]["SectionUpdate"]>;

// Task 10 — SectionFormModal'in olusturma ucu (T3'te tam sayfa form bu hook'u
// devralacak, SectionFormModal EMEKLI edilecek — bkz. _global-constraints.md).
// useCreateSite (Task 7) deseniyle ayni: siteId hook'a baglanir, mutate
// yalnizca govdeyi alir. Bolum listesi VE hero'daki
// section_count/section_status_counts tek bir sorgudan (useSite) geldigi icin
// SITE_QUERY_KEY'i gecersiz kilmak ikisini de tazeler. Yeni bolumun kendi
// detay sorgusu (SECTION_QUERY_KEY) henuz cache'te YOKTUR (id olusturmadan
// once bilinmez) — gecersiz kilinacak bir sey yok, bu yuzden burada
// dokunulmuyor.
//
// DUZELTME TURU 1 (review bulgusu): donus tipi ONCEDEN `SectionResponse`
// (dar govde) idi ama gercek uc (`POST /sites/{site_id}/sections`,
// schema.d.ts:8632 `create_section_endpoint_sites__site_id__sections_post`)
// `SectionDetailResponse` doner — `is_draft`/`budget_amount`/`section_type`/
// `site_id` dahil TUM P6 kolonlarini tasir. Yapisal alt-kume iliskisi
// yuzunden typecheck bunu yakalamiyordu ama T3'teki "taslak kaydet → olusan
// kaydi duzenleme kipine al" akisi bu alanlari tip duzeyinde okuyamazdi.
// `SectionResponse` alias'i BURADAN kaldirildi (baska hicbir yerden import
// edilmiyordu, bkz. grep) — dar govde SectionCard.tsx'in KENDI alias'inda
// yasamaya devam ediyor (liste ucu icin, ayri kaynak).
export function useCreateSection(
  siteId: string,
): UseMutationResult<SectionDetailResponse, Error, SectionCreateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/sites/{site_id}/sections", {
          params: { path: { site_id: siteId } },
          body,
        }),
      ),
    onSuccess: () => {
      // 🔴 URL-3 · KIMLIK ADLAYAN GECERSIZ KILMA ARTIK EKSIKTIR.
      // Ayni kayit birden cok onbellek anahtari altinda yasar: URL slug de
      // tasiyabildigi icin detay sorgusunun anahtari ADRESTEKI anahtar +
      // KAPSAM'dir (`[SECTION_QUERY_KEY, <slug|uuid>, site, project]`), oysa
      // mutasyonun elinde KANONIK UUID vardir (PATCH yolu onu bekler).
      // `[SECTION_QUERY_KEY, <uuid>]` on eki slug'la onbelleklenmis girdiyi
      // ESLESTIREMEZ ve ekran GUNCELLENMEDEN kalir — kullanici kaydettigi
      // degeri goremez, hata da almaz.
      // 🔴 BU KUSUR GERCEKTEN OLDU (`section-form.spec.ts` yakaladi: kaydedilen
      // bolum bedeli detayda "—" kaliyordu; `origin/main`de ayni test geciyordu,
      // yani goc kirdi).
      // Cozum: TIP on ekini gecersiz kil. React Query on-ek eslestirmesi yapar,
      // boylece kaydin HANGI anahtarla onbelleklendigi ONEMSIZLESIR.
      queryClient.invalidateQueries({ queryKey: [SITE_QUERY_KEY] });
      // KAYIT 266: SectionForm.tsx bağımlılık seçicisinin (`dependencyOptions`)
      // kaynağı budur — yeni bölüm oluşunca aynı oturumda ikinci bir form
      // açılırsa liste bayat kalmasın.
      queryClient.invalidateQueries({ queryKey: [SITE_SECTIONS_QUERY_KEY] });
    },
  });
}

// P6 · T1 — Bölüm Detay ekranindaki tam sayfa formun guncelleme ucu.
// `SectionUpdate`te `site_id` YOKTUR (bolum baska santiyeye tasinamaz) ama
// yanit govdesi `SectionDetailResponse` `site_id`yi TASIR — hangi santiyenin
// gecersiz kilinacagi caller'dan ayrica istenmeden yanittan turetilir.
// Basaride HEM bolum detay anahtari HEM SITE_QUERY_KEY gecersiz kilinir:
// bolum listesi ve hero'daki section_count/section_status_counts useSite'tan
// geliyor, isim/durum/tarih degisikligi orada da yansimali.
export function useUpdateSection(
  sectionId: string,
): UseMutationResult<SectionDetailResponse, Error, SectionUpdateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/sections/{section_id}", {
          params: { path: { section_id: sectionId } },
          body,
        }),
      ),
    onSuccess: () => {
      // 🔴 URL-3 · KIMLIK ADLAYAN GECERSIZ KILMA ARTIK EKSIKTIR.
      // Ayni kayit birden cok onbellek anahtari altinda yasar: URL slug de
      // tasiyabildigi icin detay sorgusunun anahtari ADRESTEKI anahtar +
      // KAPSAM'dir (`[SECTION_QUERY_KEY, <slug|uuid>, site, project]`), oysa
      // mutasyonun elinde KANONIK UUID vardir (PATCH yolu onu bekler).
      // `[SECTION_QUERY_KEY, <uuid>]` on eki slug'la onbelleklenmis girdiyi
      // ESLESTIREMEZ ve ekran GUNCELLENMEDEN kalir — kullanici kaydettigi
      // degeri goremez, hata da almaz.
      // 🔴 BU KUSUR GERCEKTEN OLDU (`section-form.spec.ts` yakaladi: kaydedilen
      // bolum bedeli detayda "—" kaliyordu; `origin/main`de ayni test geciyordu,
      // yani goc kirdi).
      // Cozum: TIP on ekini gecersiz kil. React Query on-ek eslestirmesi yapar,
      // boylece kaydin HANGI anahtarla onbelleklendigi ONEMSIZLESIR.
      queryClient.invalidateQueries({ queryKey: [SECTION_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SITE_QUERY_KEY] });
      // KAYIT 266: aynı sebep — bölüm adı/durumu değiştikten sonra bağımlılık
      // seçicisi bayat kalmasın.
      queryClient.invalidateQueries({ queryKey: [SITE_SECTIONS_QUERY_KEY] });
    },
  });
}
