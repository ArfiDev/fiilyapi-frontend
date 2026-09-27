import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-HZ T2 · Hazine (E9:69-85) — banka/kasa kartı şeridinin TEK kaynağı.
// `useEquipment.ts` deseniyle AYNI: tipler `pnpm gen:api` çıktısından takma ad
// olarak alınır, elle arayüz yazılmaz.
export type BankAccountListResponse = DeepScale<components["schemas"]["BankAccountListResponse"]>;
export type BankAccountResponse = DeepScale<components["schemas"]["BankAccountResponse"]>;
export type BankAccountType = components["schemas"]["BankAccountType"];

export const BANK_ACCOUNTS_QUERY_KEY = "bank-accounts";

/**
 * `GET /bank-accounts` `limit` tavanı (openapi.json: `maximum: 200`). Sunucu
 * varsayılanı `50`dir ve aşım **422**'dir (kırpma değil) — TB3/F-TH kırpma
 * korkuluğu dersi: çağıran `limit`i AÇIKÇA gönderir, `total` ile kırpılma
 * `buildListTruncation` üzerinden GÖRÜNÜR kılınır.
 */
export const BANK_ACCOUNT_LIST_MAX_LIMIT = 200;

/** `GET /bank-accounts` süzgeçleri (openapi.json query parametreleri). */
export interface BankAccountListFilter {
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export function useBankAccounts(
  filter: BankAccountListFilter = {},
): UseQueryResult<BankAccountListResponse, Error> {
  return useQuery({
    queryKey: [
      BANK_ACCOUNTS_QUERY_KEY,
      filter.isActive ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/bank-accounts", {
          params: {
            query: {
              ...(filter.isActive !== undefined ? { is_active: filter.isActive } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
