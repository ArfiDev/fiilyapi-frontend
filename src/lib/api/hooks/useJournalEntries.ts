import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MU1 T2 · fiş BAŞLIĞI listesi (`/journal-entries`). Defterle (`/journal`)
// KARIŞTIRILMAZ: defter SATIR bazlıdır ve `draft` fişleri HİÇ göstermez.
export type JournalEntryListResponse = DeepScale<components["schemas"]["JournalEntryListResponse"]>;
export type JournalEntryResponse = DeepScale<components["schemas"]["JournalEntryResponse"]>;
export type JournalEntryDetailResponse = DeepScale<components["schemas"]["JournalEntryDetailResponse"]>;
export type JournalEntryStatus = components["schemas"]["JournalEntryStatus"];

export const JOURNAL_ENTRIES_QUERY_KEY = "journal-entries";

/** `limit` tavanı 200, aşım **422** (kırpma DEĞİL) — `useLedger` ile aynı korkuluk. */
export const JOURNAL_ENTRIES_MAX_LIMIT = 200;

export interface JournalEntryListFilter {
  status?: JournalEntryStatus;
  year?: number;
  month?: number;
  limit?: number;
  offset?: number;
}

/**
 * `GET /journal-entries` — 🔴 **ONAYLI SAPMA (K-Ş4):** mockup'ta fiş listesi
 * ekranı YOKTUR. Yine de gerekir: `draft` fişler deftere GİRMEDİĞİ için, bu
 * uç olmasaydı açılan bir taslağı bulup kayıtlaştırmanın BAŞKA HİÇBİR YOLU
 * kalmazdı (şema notunun kendi gerekçesi).
 */
export function useJournalEntries(
  filter: JournalEntryListFilter = {},
): UseQueryResult<JournalEntryListResponse, Error> {
  return useQuery({
    queryKey: [
      JOURNAL_ENTRIES_QUERY_KEY,
      filter.status ?? null,
      filter.year ?? null,
      filter.month ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/journal-entries", {
          params: {
            query: {
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.year !== undefined ? { year: filter.year } : {}),
              ...(filter.month !== undefined ? { month: filter.month } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
