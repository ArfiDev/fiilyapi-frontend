import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

import {
  offerDetailKey,
  offerListKey,
  offerRevisionKey,
  offerSettingsKey,
  type OfferListFilter,
} from "./offer-query-keys";

// TKL-F3.2 · Teklif Hazırlama OKUMA hook'ları (`/offers*`). Okuma `contracts:view` kapısıdır;
// TÜM yazmalar `contracts:full` + kısıtsız (SO-19: kısıtlı kullanıcı tüm uçlarda 403 alır).
// Yazma hook'ları `useOfferMutations.ts`te, anahtarlar `offer-query-keys.ts`te.

export type OfferListResponse = DeepScale<components["schemas"]["OfferListResponse"]>;
export type OfferListItem = DeepScale<components["schemas"]["OfferListItem"]>;
export type OfferDetailRead = DeepScale<components["schemas"]["OfferDetailRead"]>;
export type OfferRevisionRead = DeepScale<components["schemas"]["OfferRevisionRead"]>;
export type OfferItemRead = DeepScale<components["schemas"]["OfferItemRead"]>;
export type OfferGroupRead = DeepScale<components["schemas"]["OfferGroupRead"]>;
export type OfferGroupBasicRead = DeepScale<components["schemas"]["OfferGroupBasicRead"]>;
export type OfferItemsBulkResponse = DeepScale<components["schemas"]["OfferItemsBulkResponse"]>;
export type OfferSettingsRead = DeepScale<components["schemas"]["OfferSettingsRead"]>;
export type OfferRevisionStatus = components["schemas"]["OfferRevisionStatus"];

export type { OfferListFilter };

/**
 * Teklif listesi + özet kartları (`summary` durum süzgecinden BAĞIMSIZDIR; `q`, işveren ve tarih
 * aralığı uygulanır). Boş süzgeç alanları sorguya girmez.
 */
export function useOffers(filter: OfferListFilter = {}): UseQueryResult<OfferListResponse, Error> {
  return useQuery({
    queryKey: offerListKey(filter),
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/offers", {
          params: {
            query: {
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.conversion ? { conversion: filter.conversion } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.employerId ? { employer_id: filter.employerId } : {}),
              ...(filter.dateFrom ? { offer_date_from: filter.dateFrom } : {}),
              ...(filter.dateTo ? { offer_date_to: filter.dateTo } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

/** Künye + revizyon özetleri + geçmiş. `offerId` yokken sorgu KAPALIDIR (kırıntı adı çözümü). */
export function useOffer(offerId: string | undefined): UseQueryResult<OfferDetailRead, Error> {
  return useQuery({
    queryKey: offerDetailKey(offerId ?? ""),
    enabled: offerId !== undefined && offerId !== "",
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/offers/{offer_id}", {
          params: { path: { offer_id: offerId as string } },
        }),
      ),
  });
}

/** Revizyon: koşullar + gruplar + kalemler (hesaplı) + toplamlar (müşteri / iç ayrı). */
export function useOfferRevision(
  offerId: string | undefined,
  revNo: number | undefined,
): UseQueryResult<OfferRevisionRead, Error> {
  return useQuery({
    queryKey: offerRevisionKey(offerId ?? "", revNo ?? -1),
    enabled: offerId !== undefined && offerId !== "" && revNo !== undefined,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/offers/{offer_id}/revisions/{rev_no}", {
          params: { path: { offer_id: offerId as string, rev_no: revNo as number } },
        }),
      ),
  });
}

/** Teklif ayarları: varsayılan GG / kâr / KDV %, geçerlilik günü, ödeme metni. */
export function useOfferSettings(): UseQueryResult<OfferSettingsRead, Error> {
  return useQuery({
    queryKey: offerSettingsKey(),
    queryFn: async () => unwrap(await backendClient.GET("/offers/settings", {})),
  });
}
