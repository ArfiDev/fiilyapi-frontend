"use client";

/**
 * 🔴 GEÇİCİ (F3.2 hook'u): `lib/api/hooks/useOffers.ts` yazılınca bu dosya SİLİNİR ve
 * `OffersScreen` oradaki `useOffers`ı ithal eder. Sorgu anahtarı TKL-F3 §2.1 ile AYNI
 * (`["offers", {status, q, employerId}]`) — F3.2'nin mutasyonlarının `["offers"]` geçersiz
 * kılması bu geçici sorguyu da tazeler.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";

import type { OfferFilter, OfferListResponse } from "./offer-types";

/** Backend `limit` tavanı (1..200) — liste kırpılırsa Σ basılmaz. */
export const OFFERS_LIST_LIMIT = 200;

export function useOffersList(filter: OfferFilter) {
  return useQuery<OfferListResponse, Error>({
    queryKey: ["offers", { status: filter.status, q: filter.q, employerId: filter.employerId }],
    // Süzgeç değişirken eski liste ekranda kalır; arama kutusu/kartlar sönmez.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/offers", {
          params: {
            query: {
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.employerId ? { employer_id: filter.employerId } : {}),
              limit: OFFERS_LIST_LIMIT,
            },
          },
        }),
      ),
  });
}

/** 🔴 GEÇİCİ (F3.2: `useCreateOfferRevision`) — "Kopyala (yeni rev)". Yeni revizyon no'sunu döner. */
export function useCreateOfferRevisionFromList() {
  const queryClient = useQueryClient();
  return useMutation<{ latestRevNo: number }, Error, { offerId: string }>({
    mutationFn: async ({ offerId }) => {
      const created = unwrap(
        await backendClient.POST("/offers/{offer_id}/revisions", { params: { path: { offer_id: offerId } } }),
      );
      return { latestRevNo: created.rev_no };
    },
    onSuccess: async (_result, { offerId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["offers"] }),
        queryClient.invalidateQueries({ queryKey: ["offer", offerId] }),
      ]);
    },
  });
}

/** 🔴 GEÇİCİ (F3.2: `useDeleteOffer`) — "Taslağı sil" (yalnız tek revizyonlu taslak; numara geri verilmez). */
export function useDeleteOfferFromList() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { offerId: string }>({
    mutationFn: async ({ offerId }) => {
      unwrap(await backendClient.DELETE("/offers/{offer_id}", { params: { path: { offer_id: offerId } } }));
    },
    onSuccess: async (_result, { offerId }) => {
      queryClient.removeQueries({ queryKey: ["offer", offerId] });
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
  });
}
