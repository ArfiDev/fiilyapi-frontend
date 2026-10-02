import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

import { OFFER_TEMPLATE_QUERY_KEY, offerTemplateKey, offerTemplatesKey } from "./offer-query-keys";
import type { OfferTemplateDetail } from "./useOfferTemplates";

// TKL-F4.4 · Teklif ŞABLONU YAZMA hook'ları. TÜM yazmalar `contracts:full` + kısıtsız kapısıdır;
// kapı ekranda `canWrite` ile kurulur. Hata gövdesi OLDUĞU GİBİ fırlar (`unwrap`): 409 bayat şablon
// ("Şablon başka biri tarafından değiştirildi; sayfayı yenileyin") metnini UI (F4.5) basar.
//
// 🔴 GEÇERSİZLEME KÜMESİ (testle kilitli — `useOfferTemplateMutations.test.tsx`):
//   · oluştur · tekliften · kopya · künye (PATCH) · içerik (PUT) ... yanıt (TemplateDetailRead) →
//                              `setQueryData(["offer-template", yanıt.id])` + `["offer-templates"]`
//                              (sayaç/updated_at). Kopya/oluştur başka şablonun detayını DEĞİŞTİRMEZ.
//   · varsayılan yap .......... `["offer-templates"]` + ÖN EK `["offer-template"]`: sunucu eski varsayılanı
//                              AYNI işlemde düşürür → o şablonun önbellekteki detayı da bayatlar
//                              (`exact` olsa yalnız yenisi tazelenirdi). PATCH `is_default: true` aynı etkiyi
//                              yapar → o gövdede aynı ön ek tazelenir.
//   · sil ..................... `["offer-templates"]` + `removeQueries(["offer-template", id])`; bu şablonla
//                              oluşan tekliflerin `template_id`'si NULL olur ama teklif sorguları tazelenmez
//                              (şablon adı teklif ekranında gösterilmez).
// PATCH/PUT gövdesinde `expected_updated_at` ZORUNLUDUR (iyimser kilit, B5.4) ve ÇAĞIRANDAN gelir: hook onu
// uydurmaz — ekran okuduğu `updated_at` metnini AYNEN geri yollar.
// `onSuccess` söz DÖNDÜRÜR: `mutateAsync` tazeleme settle olana kadar bekler (art arda yazma bayat
// tabandan gövde kurmasın — F4.5 `useTemplateContentEditor` tek uçuş + sıra).

type Schemas = components["schemas"];

export type OfferTemplateCreateBody = DeepScale<Schemas["TemplateCreate"]>;
export type OfferTemplateFromOfferBody = DeepScale<Schemas["TemplateFromOffer"]>;
export type OfferTemplateCopyBody = DeepScale<Schemas["TemplateCopy"]>;
export type OfferTemplateUpdateBody = DeepScale<Schemas["TemplateUpdate"]>;
export type OfferTemplateContentBody = DeepScale<Schemas["TemplateContentReplace"]>;

type Mutation<TData, TVariables> = UseMutationResult<TData, Error, TVariables>;

function invalidateTemplateList(queryClient: QueryClient): Promise<unknown> {
  return queryClient.invalidateQueries({ queryKey: offerTemplatesKey() });
}

/** ÖN EK (exact YOK): TÜM şablon detaylarını tazeler; liste (`offer-templates`, çoğul) bu önekin altında DEĞİLDİR. */
function invalidateAllTemplateDetails(queryClient: QueryClient): Promise<unknown> {
  return queryClient.invalidateQueries({ queryKey: [OFFER_TEMPLATE_QUERY_KEY] });
}

/** Yanıt = güncel detay: önbelleğe yaz (ek GET yok) + liste sayaçlarını tazele. */
function storeDetail(queryClient: QueryClient, detail: OfferTemplateDetail): Promise<unknown> {
  queryClient.setQueryData(offerTemplateKey(detail.id), detail);
  return invalidateTemplateList(queryClient);
}

/** `POST /offers/templates` — BOŞ şablon (içerik `PUT …/content` ile). */
export function useCreateOfferTemplate(): Mutation<OfferTemplateDetail, OfferTemplateCreateBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/offers/templates", { body })),
    onSuccess: (detail) => storeDetail(queryClient, detail),
  });
}

/** `POST …/from-offer` — gruplar + katalog bağları + revizyon GG/kâr; fiyat/miktar KOPYALANMAZ. */
export function useCreateTemplateFromOffer(): Mutation<OfferTemplateDetail, OfferTemplateFromOfferBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/offers/templates/from-offer", { body })),
    onSuccess: (detail) => storeDetail(queryClient, detail),
  });
}

/** `POST …/{id}/copy` — ad verilmezse sunucu "`<ad> (kopya)`" yazar (varsayılan DEĞİL). Gövdesiz çağrı gövde GÖNDERMEZ. */
export function useCopyOfferTemplate(
  templateId: string,
): Mutation<OfferTemplateDetail, OfferTemplateCopyBody | undefined> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/offers/templates/{template_id}/copy", {
          params: { path: { template_id: templateId } },
          ...(body === undefined ? {} : { body }),
        }),
      ),
    onSuccess: (detail) => storeDetail(queryClient, detail),
  });
}

/** `PATCH …/{id}` — ad/açıklama/oranlar (`null` = temizle) + `is_default`; `expected_updated_at` ZORUNLU. */
export function useUpdateOfferTemplate(
  templateId: string,
): Mutation<OfferTemplateDetail, OfferTemplateUpdateBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/offers/templates/{template_id}", {
          params: { path: { template_id: templateId } },
          body,
        }),
      ),
    onSuccess: async (detail, body) => {
      await storeDetail(queryClient, detail);
      // `is_default: true` eski varsayılanı da düşürür: başka detayların önbelleği bayatladı.
      if (body.is_default === true) await invalidateAllTemplateDetails(queryClient);
    },
  });
}

/** `PUT …/{id}/content` — TAM değiştirme (sıra = gövde sırası); `expected_updated_at` ZORUNLU. */
export function useReplaceTemplateContent(
  templateId: string,
): Mutation<OfferTemplateDetail, OfferTemplateContentBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PUT("/offers/templates/{template_id}/content", {
          params: { path: { template_id: templateId } },
          body,
        }),
      ),
    onSuccess: (detail) => storeDetail(queryClient, detail),
  });
}

/** `POST …/{id}/default` — varsayılan yap; eski varsayılan AYNI işlemde düşer (tek varsayılan). */
export function useSetDefaultTemplate(templateId: string): Mutation<OfferTemplateDetail, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await backendClient.POST("/offers/templates/{template_id}/default", {
          params: { path: { template_id: templateId } },
        }),
      ),
    onSuccess: () => Promise.all([invalidateTemplateList(queryClient), invalidateAllTemplateDetails(queryClient)]),
  });
}

/** `DELETE …/{id}` — bağlı teklifler korunur (`template_id` NULL). Şablon kimliği ÇAĞRI ANINDA (listede satır başına tek hook). */
export function useDeleteOfferTemplate(): Mutation<void, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId) => {
      unwrap(
        await backendClient.DELETE("/offers/templates/{template_id}", {
          params: { path: { template_id: templateId } },
        }),
      );
    },
    onSuccess: async (_data, templateId) => {
      // Silinen şablonun detayı geçersiz DEĞİL, artık YOKTUR.
      queryClient.removeQueries({ queryKey: offerTemplateKey(templateId) });
      await invalidateTemplateList(queryClient);
    },
  });
}
