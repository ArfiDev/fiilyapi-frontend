import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-FIN · Çek & Senet (E10) OKUMA uçları — `GET /financial-instruments` ve
// `GET /financial-instruments/summary`.
//
// Tipler `pnpm gen:api` çıktısından takma ad olarak alınır; elle arayüz yazmak
// yasaktır (`useInvoices.ts` / `useBankAccounts.ts` deseni).
export type FinancialInstrumentListResponse =
  DeepScale<components["schemas"]["FinancialInstrumentListResponse"]>;
export type FinancialInstrumentResponse = DeepScale<components["schemas"]["FinancialInstrumentResponse"]>;
export type FinancialInstrumentSummaryResponse =
  DeepScale<components["schemas"]["FinancialInstrumentSummaryResponse"]>;
export type FinancialInstrumentSummaryCard =
  DeepScale<components["schemas"]["FinancialInstrumentSummaryCard"]>;
export type FinancialInstrumentDirection = components["schemas"]["FinancialInstrumentDirection"];
export type FinancialInstrumentKind = components["schemas"]["FinancialInstrumentKind"];
export type FinancialInstrumentStatus = components["schemas"]["FinancialInstrumentStatus"];

export const FINANCIAL_INSTRUMENTS_QUERY_KEY = "financial-instruments";
export const FINANCIAL_INSTRUMENT_SUMMARY_QUERY_KEY = "financial-instrument-summary";

/**
 * `GET /financial-instruments` `limit` tavanı (openapi.json: `le=200`). Sunucu
 * varsayılanı 50'dir ve aşım **422**'dir (sessiz kırpma DEĞİL) — TB3/F-TH
 * kırpma korkuluğu: çağıran `limit`i AÇIKÇA gönderir, eksik kalan kayıtlar
 * `total` üzerinden `buildListTruncation` ile GÖRÜNÜR kılınır.
 */
export const FINANCIAL_INSTRUMENT_LIST_MAX_LIMIT = 200;

/** Süzgeçler — openapi.json query parametrelerinin BİREBİR kopyası. */
export interface FinancialInstrumentListFilter {
  direction?: FinancialInstrumentDirection;
  instrumentKind?: FinancialInstrumentKind;
  status?: FinancialInstrumentStatus;
  projectId?: string;
  dueBefore?: string;
  dueAfter?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function useFinancialInstruments(
  filter: FinancialInstrumentListFilter = {},
): UseQueryResult<FinancialInstrumentListResponse, Error> {
  return useQuery({
    queryKey: [
      FINANCIAL_INSTRUMENTS_QUERY_KEY,
      filter.direction ?? null,
      filter.instrumentKind ?? null,
      filter.status ?? null,
      filter.projectId ?? null,
      filter.dueBefore ?? null,
      filter.dueAfter ?? null,
      filter.q ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/financial-instruments", {
          params: {
            query: {
              ...(filter.direction ? { direction: filter.direction } : {}),
              ...(filter.instrumentKind ? { instrument_kind: filter.instrumentKind } : {}),
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.projectId ? { project_id: filter.projectId } : {}),
              ...(filter.dueBefore ? { due_before: filter.dueBefore } : {}),
              ...(filter.dueAfter ? { due_after: filter.dueAfter } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * E10:69-90 dört özet kartı. Uç HİÇ parametre almaz — "bu ay" penceresini
 * sunucu kurar ve `as_of` olarak ECHO eder (istemci kendi saatinden bir gün
 * sapmasın).
 */
export function useFinancialInstrumentSummary(): UseQueryResult<
  FinancialInstrumentSummaryResponse,
  Error
> {
  return useQuery({
    queryKey: [FINANCIAL_INSTRUMENT_SUMMARY_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/financial-instruments/summary", {})),
  });
}
