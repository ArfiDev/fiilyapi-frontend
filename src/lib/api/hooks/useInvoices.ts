import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-FAT2 T2 · Fatura Yönetimi (FY) liste + KPI okumaları.
// Tipler `pnpm gen:api` çıktısından takma ad olarak alınır — elle arayüz
// yazmak yasak (`useEquipment.ts` / `useBankAccounts.ts` deseni).
export type InvoiceListResponse = DeepScale<components["schemas"]["InvoiceListResponse"]>;
export type InvoiceResponse = DeepScale<components["schemas"]["InvoiceResponse"]>;
export type InvoiceSummaryResponse = DeepScale<components["schemas"]["InvoiceSummaryResponse"]>;
export type InvoiceSummaryMetric = DeepScale<components["schemas"]["InvoiceSummaryMetric"]>;
export type InvoiceDirection = components["schemas"]["InvoiceDirection"];
export type InvoiceStatus = components["schemas"]["InvoiceStatus"];
export type InvoiceDocumentType = components["schemas"]["InvoiceDocumentType"];
export type InvoicePaymentMethod = components["schemas"]["InvoicePaymentMethod"];

export const INVOICES_QUERY_KEY = "invoices";
export const INVOICE_SUMMARY_QUERY_KEY = "invoice-summary";

/**
 * `GET /invoices` `limit` tavanı (openapi.json: `maximum: 200`). Sunucu
 * varsayılanı 50'dir ve aşım **422**'dir (kırpma DEĞİL) — TB3/F-TH kırpma
 * korkuluğu: çağıran `limit`i AÇIKÇA gönderir, eksiklik `total` üzerinden
 * `buildListTruncation` ile GÖRÜNÜR kılınır.
 */
export const INVOICE_LIST_MAX_LIMIT = 200;

/** `GET /invoices` süzgeçleri — openapi.json query parametrelerinin BİREBİR kopyası. */
export interface InvoiceListFilter {
  direction?: InvoiceDirection;
  status?: InvoiceStatus;
  projectId?: string;
  siteId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  /** `false` ⇒ ağa çıkılmaz (sekme pasifken boşuna istek atılmaz). */
  enabled?: boolean;
}

export function useInvoices(filter: InvoiceListFilter = {}): UseQueryResult<
  InvoiceListResponse,
  Error
> {
  return useQuery({
    enabled: filter.enabled ?? true,
    queryKey: [
      INVOICES_QUERY_KEY,
      filter.direction ?? null,
      filter.status ?? null,
      filter.projectId ?? null,
      filter.siteId ?? null,
      filter.q ?? null,
      filter.dateFrom ?? null,
      filter.dateTo ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/invoices", {
          params: {
            query: {
              ...(filter.direction ? { direction: filter.direction } : {}),
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.projectId ? { project_id: filter.projectId } : {}),
              ...(filter.siteId ? { site_id: filter.siteId } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.dateFrom ? { date_from: filter.dateFrom } : {}),
              ...(filter.dateTo ? { date_to: filter.dateTo } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * `GET /invoices/summary` — FY:69-75 KPI şeridi (BEŞ kart).
 *
 * Süzgeç PARAMETRESİ YOKTUR (openapi.json'da uç hiç query parametresi
 * tanımlamaz): kapsam süzgeci sunucudadır. İstemci uydurma bir `project_id`
 * göndermez, 422 alırdı.
 */
export function useInvoiceSummary(): UseQueryResult<InvoiceSummaryResponse, Error> {
  return useQuery({
    queryKey: [INVOICE_SUMMARY_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/invoices/summary", {})),
  });
}
