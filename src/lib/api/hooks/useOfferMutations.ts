import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { BackendError, unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

import { CATALOG_ITEMS_QUERY_KEY } from "./catalog-query-keys";
import {
  OFFERS_QUERY_KEY,
  OFFER_QUERY_KEY,
  OFFER_SETTINGS_QUERY_KEY,
  offerDetailKey,
  offerRevisionKey,
  offerTemplatesKey,
} from "./offer-query-keys";
import { CONTRACTS_QUERY_KEY } from "./useContracts";
import { PROJECT_TIMELINE_QUERY_KEY } from "./useProjectTimeline";
import { PROJECTS_QUERY_KEY } from "./useProjects";
import type {
  OfferDetailRead,
  OfferGroupBasicRead,
  OfferItemRead,
  OfferItemsBulkResponse,
  OfferRevisionRead,
  OfferSettingsRead,
} from "./useOffers";

// TKL-F3.2 · Teklif Hazırlama YAZMA hook'ları. TÜM yazmalar `contracts:full` + kısıtsız kapısıdır
// (SO-19); kapı ekranda `canWrite` ile kurulur, sunucunun 403/409/422'si zarifçe basılır.
//
// 🔴 GEÇERSİZLEME KÜMESİ (testle kilitli — `useOfferMutations.test.tsx`):
//   · oluştur ............ listeler (+ gövdede `template_id` varsa `["offer-templates"]`: `usage_count`, TKL-F4)
//   · künye .............. detay (exact) + listeler
//   · koşul/grup/kalem/geçiş ... revizyon + detay (exact) + listeler
//   · `win` .............. YUKARIDAKİLER + `catalog-items` (TKL son fiyat kaynağı kazanılan teklifin
//                          maliyet B.F.'sinden doğar, T33). Başka hiçbir yazma katalogu tazelemez.
//   · yeni revizyon ...... `["offer", id]` ÖN EKİ (detay + TÜM revizyon okumaları: önceki
//                          revizyonların `is_latest`i değişir) + listeler
//   · sil ................ listeler + silinen teklifin sorguları ÇIKARILIR
//   · ayarlar ............ yalnız `offer-settings`
//   · dönüştür (TKL-F5.1) . `["offer", id]` ÖN EKİ + listeler + `projects` + `project-timeline` + `contracts`
//                          + `catalog-items`; 409'da yalnız ön ek + listeler. Yanıt parasız → `setQueryData` YOK.
// `setQueryData` YOK: kalem/grup yanıtları yalnız kendini döndürür, toplamlar revizyon sorgusunun
// yeniden okunmasıyla gelir. Başka tekliflerin sorguları HİÇBİR yazmada tazelenmez.
//
// `onSuccess` söz DÖNDÜRÜR: `mutateAsync` tazeleme settle olana kadar bekler (art arda iki hızlı
// yazma bayat revizyondan sıra/numara hesaplamasın — `useCreateEmployerContractGroup` emsali).

const HTTP_CONFLICT = 409;

type Schemas = components["schemas"];

export type OfferCreateBody = DeepScale<Schemas["OfferCreate"]>;
export type OfferUpdateBody = DeepScale<Schemas["OfferUpdate"]>;
export type OfferRevisionUpdateBody = DeepScale<Schemas["OfferRevisionUpdate"]>;
export type OfferGroupCreateBody = DeepScale<Schemas["OfferGroupCreate"]>;
export type OfferGroupUpdateBody = DeepScale<Schemas["OfferGroupUpdate"]>;
export type OfferItemCreateBody = DeepScale<Schemas["OfferItemCreate"]>;
export type OfferItemsBulkBody = DeepScale<Schemas["OfferItemsBulkCreate"]>;
export type OfferItemUpdateBody = DeepScale<Schemas["OfferItemUpdate"]>;
export type OfferLoseBody = DeepScale<Schemas["OfferLoseRequest"]>;
export type OfferSettingsUpdateBody = DeepScale<Schemas["OfferSettingsUpdate"]>;

/** TKL-F5.1 · `POST /offers/{id}/convert` gövdesi/yanıtı (yanıt PARASIZ: kapsam maskesi yok, §0). */
export type OfferConvertBody = DeepScale<Schemas["ConvertRequest"]>;
export type OfferConvertResponse = Schemas["ConvertResponse"];

export type OfferTransitionAction = "send" | "win" | "lose" | "withdraw";

type Mutation<TData, TVariables> = UseMutationResult<TData, Error, TVariables>;

function invalidateLists(queryClient: QueryClient): Promise<unknown> {
  return queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });
}

/** Yalnız detay (revizyon okumaları DEĞİL): `exact` — `["offer", id]` revizyonun ön ekidir. */
function invalidateDetail(queryClient: QueryClient, offerId: string): Promise<unknown> {
  return queryClient.invalidateQueries({ queryKey: offerDetailKey(offerId), exact: true });
}

function invalidateRevision(queryClient: QueryClient, offerId: string, revNo: number): Promise<unknown> {
  return queryClient.invalidateQueries({ queryKey: offerRevisionKey(offerId, revNo), exact: true });
}

/** Revizyon içeriği/koşulu/durumu değişti: revizyon + detay özeti (net/fiyatsız) + liste. */
function invalidateRevisionWrite(queryClient: QueryClient, offerId: string, revNo: number): Promise<unknown> {
  return Promise.all([
    invalidateRevision(queryClient, offerId, revNo),
    invalidateDetail(queryClient, offerId),
    invalidateLists(queryClient),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────── teklif

/**
 * `POST /offers` — Rev.0 taslak; koşullar gönderilmezse sunucu ayardan kopyalar. `template_id`
 * (şablondan) verilmişse şablon listesinin `usage_count`u da değişir → o da tazelenir; `copy_from`
 * ve boş başlangıçta şablon listesine DOKUNULMAZ (`template_id` miras alınmaz, SO-23).
 */
export function useCreateOffer(): Mutation<OfferDetailRead, OfferCreateBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/offers", { body })),
    onSuccess: (_offer, body) =>
      Promise.all([
        invalidateLists(queryClient),
        body.template_id ? queryClient.invalidateQueries({ queryKey: offerTemplatesKey() }) : Promise.resolve(),
      ]),
  });
}

/** `PATCH /offers/{id}` — künye (işveren, iş adı, kapsam özeti); yalnız son revizyon taslakken. */
export function useUpdateOffer(offerId: string): Mutation<OfferDetailRead, OfferUpdateBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/offers/{offer_id}", {
          params: { path: { offer_id: offerId } },
          body,
        }),
      ),
    onSuccess: () => Promise.all([invalidateDetail(queryClient, offerId), invalidateLists(queryClient)]),
  });
}

/** `DELETE /offers/{id}` — yalnız tek revizyonlu taslak; numara geri verilmez. */
export function useDeleteOffer(): Mutation<void, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offerId) => {
      unwrap(
        await backendClient.DELETE("/offers/{offer_id}", {
          params: { path: { offer_id: offerId } },
        }),
      );
    },
    onSuccess: async (_data, offerId) => {
      // Silinen teklifin detay + TÜM revizyon okumaları geçersiz DEĞİL, artık YOKTUR.
      queryClient.removeQueries({ queryKey: [OFFER_QUERY_KEY, offerId] });
      await invalidateLists(queryClient);
    },
  });
}

// ──────────────────────────────────────────────────────────────────────── revizyon

/** `PATCH …/revisions/{rev}` — koşullar + oranlar; yalnız son revizyon taslakken. */
export function useUpdateOfferRevision(
  offerId: string,
  revNo: number,
): Mutation<OfferRevisionRead, OfferRevisionUpdateBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/offers/{offer_id}/revisions/{rev_no}", {
          params: { path: { offer_id: offerId, rev_no: revNo } },
          body,
        }),
      ),
    onSuccess: () => invalidateRevisionWrite(queryClient, offerId, revNo),
  });
}

/** `POST …/revisions` — önceki revizyonun KOPYASI; yalnız son revizyon `sent | lost` iken. Teklif kimliği ÇAĞRI ANINDA (liste satırı başına tek hook). */
export function useCreateOfferRevision(): Mutation<OfferRevisionRead, { offerId: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ offerId }) =>
      unwrap(
        await backendClient.POST("/offers/{offer_id}/revisions", {
          params: { path: { offer_id: offerId } },
        }),
      ),
    // ÖN EK (exact YOK): eski revizyonların `is_latest`/`is_editable`i de değişir.
    onSuccess: (_revision, { offerId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [OFFER_QUERY_KEY, offerId] }),
        invalidateLists(queryClient),
      ]),
  });
}

/**
 * `POST …/revisions/{rev}/{send|win|lose|withdraw}` — durum geçişi (yalnız SON revizyon).
 * `lose` gövdesi isteğe bağlıdır (`{lost_reason?, winning_amount?}`); gövdesiz çağrı gövde
 * GÖNDERMEZ. `win` ayrıca katalog son fiyatını tazeler.
 */
export function useOfferTransition(
  offerId: string,
  revNo: number,
  action: OfferTransitionAction,
): Mutation<OfferDetailRead, OfferLoseBody | undefined> {
  const queryClient = useQueryClient();
  const params = { path: { offer_id: offerId, rev_no: revNo } };
  return useMutation({
    mutationFn: async (loseBody) => {
      switch (action) {
        case "send":
          return unwrap(await backendClient.POST("/offers/{offer_id}/revisions/{rev_no}/send", { params }));
        case "win":
          return unwrap(await backendClient.POST("/offers/{offer_id}/revisions/{rev_no}/win", { params }));
        case "withdraw":
          return unwrap(await backendClient.POST("/offers/{offer_id}/revisions/{rev_no}/withdraw", { params }));
        case "lose":
          return unwrap(
            await backendClient.POST("/offers/{offer_id}/revisions/{rev_no}/lose", {
              params,
              ...(loseBody === undefined ? {} : { body: loseBody }),
            }),
          );
      }
    },
    onSuccess: () =>
      Promise.all([
        invalidateRevisionWrite(queryClient, offerId, revNo),
        // T33: TKL son fiyatı YALNIZ kazanılan (`won`) teklifin maliyet B.F.'sinden doğar.
        action === "win"
          ? queryClient.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] })
          : Promise.resolve(),
      ]),
  });
}

// ──────────────────────────────────────────────────────────────────────────── grup

export function useCreateOfferGroup(
  offerId: string,
  revNo: number,
): Mutation<OfferGroupBasicRead, OfferGroupCreateBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/offers/{offer_id}/revisions/{rev_no}/groups", {
          params: { path: { offer_id: offerId, rev_no: revNo } },
          body,
        }),
      ),
    onSuccess: () => invalidateRevisionWrite(queryClient, offerId, revNo),
  });
}

export function useUpdateOfferGroup(
  offerId: string,
  revNo: number,
): Mutation<OfferGroupBasicRead, { groupId: string; body: OfferGroupUpdateBody }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, body }) =>
      unwrap(
        await backendClient.PATCH("/offers/{offer_id}/revisions/{rev_no}/groups/{group_id}", {
          params: { path: { offer_id: offerId, rev_no: revNo, group_id: groupId } },
          body,
        }),
      ),
    onSuccess: () => invalidateRevisionWrite(queryClient, offerId, revNo),
  });
}

/** Grubu içindeki kalemlerle birlikte siler — ekran yalnız BOŞ grupta sunar (§3.2). */
export function useDeleteOfferGroup(offerId: string, revNo: number): Mutation<void, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupId) => {
      unwrap(
        await backendClient.DELETE("/offers/{offer_id}/revisions/{rev_no}/groups/{group_id}", {
          params: { path: { offer_id: offerId, rev_no: revNo, group_id: groupId } },
        }),
      );
    },
    onSuccess: () => invalidateRevisionWrite(queryClient, offerId, revNo),
  });
}

// ─────────────────────────────────────────────────────────────────────────── kalem

/**
 * `POST …/items` — katalogdan TEK kalem. Gövde `buildOfferItemCreateBody` ile kurulur:
 * `cost_unit_price` alan YOK (öneri) / açık null (boş) / değer üç hâli oradadır.
 */
export function useCreateOfferItem(offerId: string, revNo: number): Mutation<OfferItemRead, OfferItemCreateBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/offers/{offer_id}/revisions/{rev_no}/items", {
          params: { path: { offer_id: offerId, rev_no: revNo } },
          body,
        }),
      ),
    onSuccess: () => invalidateRevisionWrite(queryClient, offerId, revNo),
  });
}

/** `POST …/items/bulk` — 1..200 kalem, hep-ya-hiç (çoklu katalog seçicisi). */
export function useCreateOfferItemsBulk(
  offerId: string,
  revNo: number,
): Mutation<OfferItemsBulkResponse, OfferItemsBulkBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/offers/{offer_id}/revisions/{rev_no}/items/bulk", {
          params: { path: { offer_id: offerId, rev_no: revNo } },
          body,
        }),
      ),
    onSuccess: () => invalidateRevisionWrite(queryClient, offerId, revNo),
  });
}

/**
 * `PATCH …/items/{id}` — gönderilmeyen alan dokunulmaz; `cost_unit_price` / `overhead_pct` /
 * `profit_pct` / `offer_unit_price` için açık `null` = temizle. Gövdeyi çağıran (hücre saf
 * modülü) kurar; hook aynen taşır.
 */
export function useUpdateOfferItem(
  offerId: string,
  revNo: number,
): Mutation<OfferItemRead, { itemId: string; body: OfferItemUpdateBody }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, body }) =>
      unwrap(
        await backendClient.PATCH("/offers/{offer_id}/revisions/{rev_no}/items/{item_id}", {
          params: { path: { offer_id: offerId, rev_no: revNo, item_id: itemId } },
          body,
        }),
      ),
    onSuccess: () => invalidateRevisionWrite(queryClient, offerId, revNo),
  });
}

export function useDeleteOfferItem(offerId: string, revNo: number): Mutation<void, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId) => {
      unwrap(
        await backendClient.DELETE("/offers/{offer_id}/revisions/{rev_no}/items/{item_id}", {
          params: { path: { offer_id: offerId, rev_no: revNo, item_id: itemId } },
        }),
      );
    },
    onSuccess: () => invalidateRevisionWrite(queryClient, offerId, revNo),
  });
}

// ──────────────────────────────────────────────────────────────────────────── ayar

/** `PUT /offers/settings` — TAM değiştirme (beş alanın hepsi zorunlu). Mevcut teklifler değişmez. */
export function useUpdateOfferSettings(): Mutation<OfferSettingsRead, OfferSettingsUpdateBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.PUT("/offers/settings", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OFFER_SETTINGS_QUERY_KEY] }),
  });
}

// ──────────────────────────────────────────────────────────────────────── dönüştürme

/** 409 (zaten dönüştürüldü / won değil): sunucudaki teklif durumu istemcinin bildiğinden FARKLI. */
function isConflict(error: unknown): boolean {
  return error instanceof BackendError && error.status === HTTP_CONFLICT;
}

/** Teklif durumu değişti: detay + TÜM revizyon okumaları (`["offer", id]` ön eki) + listeler (`won_not_converted_count`). */
function invalidateOfferState(queryClient: QueryClient, offerId: string): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: offerDetailKey(offerId) }),
    invalidateLists(queryClient),
  ]);
}

/**
 * `POST /offers/{id}/convert` — teklif → proje + sözleşme (+ şantiye). TEK işlem; yanıt PARASIZ
 * (`setQueryData` YOK, hata unwrap ile olduğu gibi). Başarı: teklif durumu + proje/zaman çizelgesi/
 * sözleşme listeleri + katalog (SO-40: son fiyat SZL'ye kayar). 409'da yalnız teklif durumu tazelenir
 * (başkası dönüştürmüş olabilir). Eşzamanlı tek uçuş ekranın işidir (`isPending` kilidi).
 */
export function useConvertOffer(offerId: string): Mutation<OfferConvertResponse, OfferConvertBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/offers/{offer_id}/convert", {
          params: { path: { offer_id: offerId } },
          body,
        }),
      ),
    onSuccess: () =>
      Promise.all([
        invalidateOfferState(queryClient, offerId),
        queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [PROJECT_TIMELINE_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [CONTRACTS_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] }),
      ]),
    onError: (error) => (isConflict(error) ? invalidateOfferState(queryClient, offerId) : undefined),
  });
}
