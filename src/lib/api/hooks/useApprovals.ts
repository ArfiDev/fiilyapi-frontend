import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { PROGRESS_PAYMENTS_QUERY_KEY, PROGRESS_PAYMENT_QUERY_KEY } from "./useProgressPayments";
import { PURCHASE_REQUESTS_QUERY_KEY, PURCHASE_REQUEST_QUERY_KEY } from "./usePurchaseRequests";
import { PURCHASING_SUMMARY_QUERY_KEY } from "./usePurchasingSummary";
import {
  SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY,
  SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY,
} from "./useSubcontractorProgressPayments";
import type { DeepScale } from "@/lib/api/scale";

// F-OK T5 · Onay Kutusu (`/onay-kutusu`) veri katmanı — OK-1A'nın açtığı
// `GET /approvals` + `GET /approvals/settings` OKUMA uçları ve üç evrak
// ailesinin MEVCUT onay/ret uçları.
//
// Tipler `pnpm gen:api` çıktısından takma ad olarak alınır; elle arayüz yazmak
// yasaktır (`useFinancialInstruments.ts` deseni).
export type ApprovalInboxResponse = DeepScale<components["schemas"]["ApprovalInboxResponse"]>;
export type ApprovalInboxItem = DeepScale<components["schemas"]["ApprovalInboxItem"]>;
export type ApprovalStepRead = DeepScale<components["schemas"]["ApprovalStepRead"]>;
export type ApprovalRole = components["schemas"]["ApprovalRole"];
export type ApprovalDocumentType = components["schemas"]["ApprovalDocumentType"];
export type ApprovalHistoryResponse = DeepScale<components["schemas"]["ApprovalHistoryResponse"]>;
export type ApprovalHistoryItem = DeepScale<components["schemas"]["ApprovalHistoryItem"]>;
export type ApprovalHistoryDecision = components["schemas"]["HistoryDecision"];
/** `GET /approvals/history?decision=` süzgeci (`pending` süzgeç DEĞİL, yalnız kart durumudur). */
export type ApprovalHistoryFilter = "approved" | "rejected" | "all";
export type ApprovalSettingsRead = DeepScale<components["schemas"]["ApprovalSettingsRead"]>;

export const APPROVALS_QUERY_KEY = "approvals";
export const APPROVAL_SETTINGS_QUERY_KEY = "approval-settings";

/**
 * `GET /approvals` `limit` tavanı (openapi.json: `le=200`, varsayılan 50).
 * TB3/F-TH kırpma korkuluğu: çağıran `limit`i AÇIKÇA gönderir, eksik kalan
 * kayıtlar `total` üzerinden `buildListTruncation` ile GÖRÜNÜR kılınır —
 * sessiz kırpma bir imzanın kaybolması demektir.
 */
export const APPROVAL_INBOX_MAX_LIMIT = 200;

/**
 * 🔴 RET GEREKÇESİNİN TAVANI AİLEYE GÖRE DEĞİŞİR — tek sabit YAZILAMAZ.
 * `schema.d.ts`ten ölçülmüştür: `RejectBody`/`SubcontractorRejectBody` 500,
 * `PurchaseRequestRejection` 2000 (min 1). Üçünde de `reason` ZORUNLUdur.
 */
export const APPROVAL_REJECT_REASON_MAX_LENGTH: Record<ApprovalDocumentType, number> = {
  progress_payment: 500,
  subcontractor_progress_payment: 500,
  purchase_request: 2000,
};

export interface ApprovalInboxFilter {
  limit?: number;
  offset?: number;
}

/**
 * 🔴 AYRI BİR YETKİ KAPISI YOKTUR ve OLMAMALIDIR (uç açıklaması, openapi.json):
 * dönen küme zaten "bu adım SANA düştü" olgusuyla sınırlıdır; `approvals` izni
 * düşük olan bir rol de kendine düşen imzayı görmek zorundadır (matriste
 * şef/saha/İK = `_OWN`). Bu yüzden çağıran taraf `useModulePermission`
 * ÖN KAPISI KURMAZ — yalnız gerçek bir 403 `AccessDenied`e düşer.
 */
export function useApprovalInbox(
  filter: ApprovalInboxFilter = {},
): UseQueryResult<ApprovalInboxResponse, Error> {
  return useQuery({
    queryKey: [APPROVALS_QUERY_KEY, filter.limit ?? null, filter.offset ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/approvals", {
          params: {
            query: {
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

export interface ApprovalHistoryParams {
  decision: ApprovalHistoryFilter;
  limit?: number;
  offset?: number;
}

/**
 * OKT-F1.2 · `GET /approvals/history` — Onay Kutusu'nun Tümü / Onay Verildi /
 * Reddedildi sekmeleri. Sorgu anahtarı `["approvals", "history", ...]`: kök
 * `["approvals"]` öneki sayesinde onay/ret mutasyonlarının mevcut
 * invalidation'ı geçmişi de tazeler.
 *
 * `enabled`: yalnız AKTİF sekmenin sorgusu istek atar; ziyaret edilmiş sekmenin
 * önbelleği sayaç için okunmaya devam eder (ekstra istek yok).
 */
export function useApprovalHistory(
  { decision, limit, offset }: ApprovalHistoryParams,
  options: { enabled?: boolean } = {},
): UseQueryResult<ApprovalHistoryResponse, Error> {
  return useQuery({
    queryKey: [APPROVALS_QUERY_KEY, "history", decision, limit ?? null, offset ?? null],
    enabled: options.enabled ?? true,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/approvals/history", {
          params: {
            query: {
              decision,
              ...(limit !== undefined ? { limit } : {}),
              ...(offset !== undefined ? { offset } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * Rol akışı şeridindeki EŞİK (mockup `:62` `:65`) tek kaynağı. Ayrı bir
 * sorgudur çünkü ayrı bir uçtur: biri patlarken öteki yaşamaya devam eder ve
 * ekran "yüklendi" iddiasını KAYNAK BAŞINA kurar (F-İK dersi).
 */
export function useApprovalSettings(): UseQueryResult<ApprovalSettingsRead, Error> {
  return useQuery({
    queryKey: [APPROVAL_SETTINGS_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/approvals/settings", {})),
  });
}

export interface ApprovalApproveInput {
  documentType: ApprovalDocumentType;
  documentId: string;
}

export interface ApprovalRejectInput extends ApprovalApproveInput {
  /** Sunucuya BUDANMIŞ gider — çağıran `trim()`ler, boş gövde 422'dir. */
  reason: string;
}

/**
 * Onay/ret sonrası BAYATLAYAN her şey: onay kutusunun kendisi (kalem artık
 * bana düşmüyor) VE mutasyona uğrayan evrağın kendi liste/detay sorguları.
 * İkincisi unutulursa hakediş/talep ekranları eski durumu basmaya devam eder.
 *
 * 🔴 Mockup'ın `onclick` "satırı DOM'dan sil" animasyonu (`:110`) TAKLİT
 * EDİLMEZ: kaynak sunucudan gelen kümedir, istemcinin sildiği satır değil.
 */
function useInvalidateApprovalDecision(): (input: ApprovalApproveInput) => void {
  const queryClient = useQueryClient();
  return ({ documentType, documentId }) => {
    queryClient.invalidateQueries({ queryKey: [APPROVALS_QUERY_KEY] });
    switch (documentType) {
      case "progress_payment":
        queryClient.invalidateQueries({ queryKey: [PROGRESS_PAYMENTS_QUERY_KEY] });
        queryClient.invalidateQueries({ queryKey: [PROGRESS_PAYMENT_QUERY_KEY, documentId] });
        return;
      case "subcontractor_progress_payment":
        queryClient.invalidateQueries({ queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY] });
        queryClient.invalidateQueries({
          queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY, documentId],
        });
        return;
      case "purchase_request":
        queryClient.invalidateQueries({ queryKey: [PURCHASE_REQUESTS_QUERY_KEY] });
        queryClient.invalidateQueries({ queryKey: [PURCHASE_REQUEST_QUERY_KEY, documentId] });
        queryClient.invalidateQueries({ queryKey: [PURCHASING_SUMMARY_QUERY_KEY] });
        return;
    }
  };
}

/**
 * 🔴 TEK BİR `/approvals/{id}/approve` UCU YOKTUR — onay/ret uçları evrak
 * ailesine göre AYRIŞIR ve yol parametre adları bile farklıdır (`payment_id`
 * vs `request_id`). `switch` `ApprovalDocumentType` üzerinde TÜKETİCİdir:
 * enuma yeni bir üye eklendiğinde `pnpm typecheck` burada kırmızı döner
 * (sessiz "desteklenmiyor" dalı YOK).
 *
 * ÜÇÜ DE GÖVDESİZDİR (`requestBody` yok).
 *
 * ⚠️ Satınalma onay/ret hook'u bugüne kadar BİLEREK yazılmamıştı
 * (`usePurchaseRequestMutations.ts` K6: "onay/red EKRANI ayrı bir dilimdir") —
 * o dilim BUDUR ve tek evi burasıdır; kopya formül açılmaz.
 */
export function useApproveApprovalItem(): UseMutationResult<void, Error, ApprovalApproveInput> {
  const invalidate = useInvalidateApprovalDecision();
  return useMutation({
    mutationFn: async ({ documentType, documentId }) => {
      switch (documentType) {
        case "progress_payment":
          unwrap(
            await backendClient.POST("/progress-payments/{payment_id}/approve", {
              params: { path: { payment_id: documentId } },
            }),
          );
          return;
        case "subcontractor_progress_payment":
          unwrap(
            await backendClient.POST("/subcontractor-progress-payments/{payment_id}/approve", {
              params: { path: { payment_id: documentId } },
            }),
          );
          return;
        case "purchase_request":
          unwrap(
            await backendClient.POST("/purchase-requests/{request_id}/approve", {
              params: { path: { request_id: documentId } },
            }),
          );
          return;
      }
    },
    onSuccess: (_data, input) => invalidate(input),
  });
}

/** Ret — üç ailede de `reason` ZORUNLUdur (boş/yalnız boşluk ⇒ 422). */
export function useRejectApprovalItem(): UseMutationResult<void, Error, ApprovalRejectInput> {
  const invalidate = useInvalidateApprovalDecision();
  return useMutation({
    mutationFn: async ({ documentType, documentId, reason }) => {
      switch (documentType) {
        case "progress_payment":
          unwrap(
            await backendClient.POST("/progress-payments/{payment_id}/reject", {
              params: { path: { payment_id: documentId } },
              body: { reason },
            }),
          );
          return;
        case "subcontractor_progress_payment":
          unwrap(
            await backendClient.POST("/subcontractor-progress-payments/{payment_id}/reject", {
              params: { path: { payment_id: documentId } },
              body: { reason },
            }),
          );
          return;
        case "purchase_request":
          unwrap(
            await backendClient.POST("/purchase-requests/{request_id}/reject", {
              params: { path: { request_id: documentId } },
              body: { reason },
            }),
          );
          return;
      }
    },
    onSuccess: (_data, input) => invalidate(input),
  });
}

/* ------------------------------------------------------------------------ *
 * Onay Eşiği YÖNETİM ucu (`Ayarlar > Onay Eşiği`). IZN-B3b: rol atama uçları *
 * KALKTI (backend 410) — onay rolü projedeki kullanıcı erişiminden gelir.   *
 * ------------------------------------------------------------------------ */

/**
 * `PUT /approvals/settings` — eşiği yazar. Gövde ONDALIK STRING gider
 * (`anyOf` `number | string`): `number` dalı seçilseydi 16 haneli bir eşik
 * IEEE-754'e uğrar ve kuruş kaybederdi.
 *
 * 🔴 Sözleşme kısıtları (`ge=0`, `max_digits=18`, `decimal_places=2`) TS
 * tipinde YAŞAMAZ — çağıran `checkApprovalThreshold` korkuluğundan geçmiş
 * değeri gönderir.
 *
 * Onay kutusu da bayatlar: eşik değiştikten sonra onay şeridi eski eşikle karar vermeye devam ederdi
 * (KAYIT 446).
 */
export function useUpdateApprovalSettings(): UseMutationResult<
  ApprovalSettingsRead,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (threshold) =>
      unwrap(
        await backendClient.PUT("/approvals/settings", {
          body: { approval_threshold_try: threshold },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPROVAL_SETTINGS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [APPROVALS_QUERY_KEY] });
    },
  });
}
