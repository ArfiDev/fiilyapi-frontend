import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { isScopePending } from "@/lib/api/pending-scope";
import type { DeepScale } from "@/lib/api/scale";

// F-TH T1 · Taşeron Hakedişi ekranları — okuma sorguları. `useProgressPayments.ts`
// deseniyle AYNI (isimlendirme/hata-unwrap yardımcıları). Tipler `pnpm gen:api`
// çıktısından takma ad olarak alınır; elle arayüz yazmak yasak.
export type SubcontractorProgressPaymentListResponse =
  components["schemas"]["SubcontractorProgressPaymentListResponse"];
export type SubcontractorProgressPaymentListItem =
  components["schemas"]["SubcontractorProgressPaymentListItem"];
export type SubcontractorProgressPaymentDetail =
  DeepScale<components["schemas"]["SubcontractorProgressPaymentDetail"]>;
export type SubcontractorProgressPaymentLineRead =
  components["schemas"]["SubcontractorProgressPaymentLineRead"];
export type SubcontractorProgressPaymentSummary =
  components["schemas"]["SubcontractorProgressPaymentSummary"];
export type SubcontractorPaymentStatus = components["schemas"]["SubcontractorPaymentStatus"];
export type SubcontractorContractDetail = DeepScale<components["schemas"]["SubcontractorContractDetail"]>;
export type SubcontractorContractListItem = components["schemas"]["SubcontractorContractListItem"];
export type SubcontractorContractListResponse =
  components["schemas"]["SubcontractorContractListResponse"];

// Liste ve özet uçlarının ORTAK filtre alanları (openapi.json GET
// /subcontractor-progress-payments + .../summary query parametreleri).
// `site_id` TB2/U2 ile eklendi — sözleşme üzerinden süzer, hakedişin kendi
// şantiye kolonu yoktur.
export interface SubcontractorProgressPaymentFilter {
  project_id?: string;
  site_id?: string;
  period_year?: number;
  period_month?: number;
  status?: SubcontractorPaymentStatus;
  q?: string;
}

// Liste ucu ayrıca sayfalama alır — `limit`/`offset` özet ucunda YOKTUR.
export interface SubcontractorProgressPaymentListFilter extends SubcontractorProgressPaymentFilter {
  limit?: number;
  offset?: number;
}

// TB2 U1 (`GET /subcontractor-contracts`) filtreleri.
//
// ⚠️ TB3 GÜNCELLEMESİ (2026-08-08): bu uç ARTIK SAYFALANIYOR — `limit`/`offset`
// parametreleri ve yanıtta `total` vardır (openapi.json, `list_subcontractor_
// contracts_endpoint_subcontractor_contracts_get`). Eski "sayfalama YOK" notu
// GEÇERSİZDİR. Sunucu varsayılanı `limit=50`; açık `limit` göndermeyen çağıran
// SESSİZCE ilk 50 kaydı alır. Bu yüzden liste tüketen her hook açık `limit`
// gönderir ve `total` ile kırpılmayı GÖRÜNÜR kılar (bkz.
// `useSubcontractorContractOptions`).
export interface SubcontractorContractListFilter {
  project_id?: string;
  site_id?: string;
  status?: components["schemas"]["ContractStatus"];
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * TB3 · `GET /subcontractor-contracts` ŞEMA TAVANI (openapi.json `limit`
 * parametresi: `maximum: 200`). Daha büyük değer 422 döner — "hepsini çek"
 * mümkün DEĞİLDİR, kırpılma görünür kılınır (`buildListTruncation`).
 */
export const SUBCONTRACTOR_CONTRACT_LIST_MAX_LIMIT = 200;

export const SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY = "subcontractor-progress-payments";
export const SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY = "subcontractor-progress-payment";
export const SUBCONTRACTOR_PROGRESS_PAYMENT_SUMMARY_QUERY_KEY = "subcontractor-progress-payment-summary";
export const SUBCONTRACTOR_CONTRACT_QUERY_KEY = "subcontractor-contract";
// F-P5 T1 — ARTIK EXPORT EDİLİYOR: bu dilimde taşeron sözleşmesi
// oluşturma/güncelleme uçları geldi (`useSubcontractorContractMutations`), o
// yüzden listeyi geçersiz kılacak bir mutasyon VAR. (Eski gerekçe — "tüketen
// yok" — F-TH dilimine aitti.)
export const SUBCONTRACTOR_CONTRACTS_LIST_QUERY_KEY = "subcontractor-contracts-list";

function filterQuery(
  filter: SubcontractorProgressPaymentFilter,
): Record<string, string | number> {
  return {
    ...(filter.project_id ? { project_id: filter.project_id } : {}),
    ...(filter.site_id ? { site_id: filter.site_id } : {}),
    ...(filter.period_year !== undefined ? { period_year: filter.period_year } : {}),
    ...(filter.period_month !== undefined ? { period_month: filter.period_month } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.q ? { q: filter.q } : {}),
  };
}

function contractListFilterQuery(
  filter: SubcontractorContractListFilter,
): Record<string, string | number> {
  return {
    ...(filter.project_id ? { project_id: filter.project_id } : {}),
    ...(filter.site_id ? { site_id: filter.site_id } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
    ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
  };
}

/**
 * Taşeron hakedişi listesi. Filtresiz çağrıda tüm hakedişler döner —
 * `useProgressPayments` deseniyle ayni, bos filtre alanlari govdeye eklenmez.
 */
export function useSubcontractorProgressPayments(
  filter: SubcontractorProgressPaymentListFilter = {},
  // F-P5 T7 · TSD'nin "Hakediş Geçmişi" bölümü sözleşmenin PROJESİNİ filtre
  // olarak kullanır (uçta `contract_id` filtresi YOK, aşağıdaki nota bak) —
  // proje kimliği sözleşme detayı gelene kadar BİLİNMEZ. Boş `project_id`
  // ile çağırmak TÜM projelerin hakedişlerini çeker ve `total` tabanlı
  // kırpılma korkuluğunu anlamsız kılardı; bu yüzden çağıran taraf sorguyu
  // kapatabilir. Varsayılan `true` — mevcut çağıranlar etkilenmez.
  options: { enabled?: boolean } = {},
): UseQueryResult<SubcontractorProgressPaymentListResponse, Error> {
  return useQuery({
    // 🔴 URL-3 — yukaridaki notun ANLATTIGI kusur artik SLUG YOLUNDA da dogar:
    // URL slug tasidigi icin ekran once kanonik kimligi cozer ve o cozulene
    // kadar `project_id`/`site_id` BOS gelir. Bos deger suzgec kurucusunda
    // dusuyordu, yani "sozlesme detayi gelmeden cagirma" korkulugu ayni
    // sebeple burada da gerekli. `undefined` (bilerek suzgecsiz) ile `""`
    // (henuz cozulmedi) AYRILIR — ikisini esitlemek suzgecsiz cagiranlari
    // sonsuza kadar bos birakirdi.
    enabled: (options.enabled ?? true) && !isScopePending(filter.project_id, filter.site_id),
    queryKey: [
      SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY,
      filter.project_id ?? null,
      filter.site_id ?? null,
      filter.period_year ?? null,
      filter.period_month ?? null,
      filter.status ?? null,
      filter.q ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/subcontractor-progress-payments", {
          params: {
            query: {
              ...filterQuery(filter),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * Taşeron hakedişi detayı. `useProgressPayment` deseni: bos id ile aga
 * cikilmaz.
 */
export function useSubcontractorProgressPayment(
  paymentId: string,
): UseQueryResult<SubcontractorProgressPaymentDetail, Error> {
  return useQuery(subcontractorPaymentQueryOptions(paymentId));
}

/**
 * Aynı detay sorgusunun `useQueries` ile PARALEL kullanılabilen hâli
 * (`sitesQueryOptions`/`rolePermissionsQueryOptions` deseni). F-P5 T7'de
 * TSD'nin "Hakediş %" kolonu sözleşmenin hakedişlerinin SATIRLARINA ihtiyaç
 * duyar; satırlar yalnız DETAY şemasında vardır (liste öğesi taşımaz) ve
 * toplulaştıran bir uç yoktur (openapi teyidi). Önbellek anahtarı
 * `useSubcontractorProgressPayment` ile AYNIdır — aynı hakediş iki kez
 * çekilmez.
 */
export function subcontractorPaymentQueryOptions(paymentId: string) {
  return {
    enabled: paymentId.length > 0,
    queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY, paymentId],
    queryFn: async (): Promise<SubcontractorProgressPaymentDetail> =>
      unwrap(
        await backendClient.GET("/subcontractor-progress-payments/{payment_id}", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
  };
}

/**
 * KPI özeti (`GET /subcontractor-progress-payments/summary`). İşveren
 * tarafından FARKLI: tek `projectId` yerine liste ucuyla ayni filtre
 * kümesini alır (openapi'de summary de proje/dönem/durum/arama filtrelenir).
 */
export function useSubcontractorProgressPaymentSummary(
  filter: SubcontractorProgressPaymentFilter = {},
): UseQueryResult<SubcontractorProgressPaymentSummary, Error> {
  return useQuery({
    queryKey: [
      SUBCONTRACTOR_PROGRESS_PAYMENT_SUMMARY_QUERY_KEY,
      filter.project_id ?? null,
      filter.site_id ?? null,
      filter.period_year ?? null,
      filter.period_month ?? null,
      filter.status ?? null,
      filter.q ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/subcontractor-progress-payments/summary", {
          params: { query: filterQuery(filter) },
        }),
      ),
  });
}

/**
 * Taşeron sözleşmesi detayı (T2-T5'in sözleşme başlığı/kalemleri okuması
 * için). `useEmployerContract` deseni: bos id ile aga cikilmaz.
 */
export function useSubcontractorContract(
  contractId: string,
): UseQueryResult<SubcontractorContractDetail, Error> {
  return useQuery({
    enabled: contractId.length > 0,
    queryKey: [SUBCONTRACTOR_CONTRACT_QUERY_KEY, contractId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/subcontractor-contracts/{contract_id}", {
          params: { path: { contract_id: contractId } },
        }),
      ),
  });
}

/**
 * TB2 U1 (`GET /subcontractor-contracts`) — sözleşme LİSTE ucu. TB3'ten beri
 * SAYFALIDIR (`limit`/`offset` + yanıtta `total`); sıralama sunucuda
 * deterministiktir. Açık `limit` göndermeyen çağıran sunucu varsayılanı olan
 * ilk 50 kaydı alır — kırpılma `total` ile GÖRÜNÜR kılınmalıdır.
 */
export function useSubcontractorContractsList(
  filter: SubcontractorContractListFilter = {},
): UseQueryResult<SubcontractorContractListResponse, Error> {
  return useQuery({
    queryKey: [
      SUBCONTRACTOR_CONTRACTS_LIST_QUERY_KEY,
      filter.project_id ?? null,
      filter.site_id ?? null,
      filter.status ?? null,
      filter.q ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/subcontractor-contracts", {
          params: { query: contractListFilterQuery(filter) },
        }),
      ),
  });
}
