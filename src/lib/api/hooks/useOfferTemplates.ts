import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

import { offerTemplateKey, offerTemplatesKey } from "./offer-query-keys";

// TKL-F4.4 · Teklif ŞABLONU OKUMA hook'ları (`/offers/templates*`). Okuma `contracts:view` + kısıtsız
// kapısıdır (R5/T40 birleşince kısıtlı kullanıcıya 403 → ekran `AccessDenied`); yazmalar
// `useOfferTemplateMutations.ts`te, anahtarlar `offer-query-keys.ts`te.
//
// Şablon FİYAT/MİKTAR/a-s taşımaz (T12): "Katalog son fiyat" ve "A-s / birim" katalogdan birleştirilir.

export type OfferTemplateListResponse = DeepScale<components["schemas"]["TemplateListResponse"]>;
export type OfferTemplateListItem = DeepScale<components["schemas"]["TemplateListItem"]>;
export type OfferTemplateDetail = DeepScale<components["schemas"]["TemplateDetailRead"]>;
export type OfferTemplateGroupRead = DeepScale<components["schemas"]["TemplateGroupRead"]>;
export type OfferTemplateItemRead = DeepScale<components["schemas"]["TemplateItemRead"]>;

/** Şablon listesi: varsayılan ÖNCE, sonra ada göre; `total` = sekme sayacı. Uçta `q` YOK (arama istemcide). */
export function useOfferTemplates(): UseQueryResult<OfferTemplateListResponse, Error> {
  return useQuery({
    queryKey: offerTemplatesKey(),
    queryFn: async () => unwrap(await backendClient.GET("/offers/templates", {})),
  });
}

/**
 * Şablon detayı (gruplar + katalog bağlı kalemler). `templateId` null/undefined/boşken sorgu KAPALIDIR
 * (istek atılmaz). `skipToken` KULLANILMAZ: skipToken'lı gözlemci paylaşılan sorgu seçeneklerini ezer
 * (retry "Missing queryFn", 404/403 dalı ölür) — `enabled` kullanılır.
 */
export function useOfferTemplate(
  templateId: string | null | undefined,
): UseQueryResult<OfferTemplateDetail, Error> {
  return useQuery({
    queryKey: offerTemplateKey(templateId ?? ""),
    enabled: templateId !== null && templateId !== undefined && templateId !== "",
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/offers/templates/{template_id}", {
          params: { path: { template_id: templateId as string } },
        }),
      ),
  });
}
