import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MU1 T2 · E8:101-106 yevmiye defteri (SATIR bazlı, fiş bazlı DEĞİL).
export type LedgerResponse = DeepScale<components["schemas"]["LedgerResponse"]>;
export type LedgerRow = DeepScale<components["schemas"]["LedgerRow"]>;
export type JournalEntryStatus = components["schemas"]["JournalEntryStatus"];

export const LEDGER_QUERY_KEY = "journal-ledger";

/**
 * `GET /journal` `limit` tavanı (openapi: `maximum: 200`). Sunucu varsayılanı
 * 50'dir ve aşım **422**'dir (kırpma DEĞİL) — TB3/F-TH kırpma korkuluğu:
 * çağıran `limit`i AÇIKÇA gönderir, eksiklik `total` üzerinden
 * `buildListTruncation` ile GÖRÜNÜR kılınır.
 */
export const LEDGER_MAX_LIMIT = 200;

/** `GET /journal` süzgeçleri — openapi query parametrelerinin BİREBİR kopyası. */
export interface LedgerFilter {
  year: number;
  month: number;
  /** E8:96 "Tüm Hesaplar" = süzgeç YOK (boş dize gönderilmez). */
  accountId?: string;
  status?: JournalEntryStatus;
  limit?: number;
  offset?: number;
  /**
   * 🔴 F-MUP · sorgunun HİÇ KURULMAMASI gereken hâller için.
   *
   * Banka Mutabakatı ekranında hesap SEÇİLMEDEN defter çağrılırsa uç TÜM
   * hesapların satırlarını döndürür ve ekran onları "102 hesabının
   * hareketleri" başlığı altında basmaya aday olurdu; üstelik `total`
   * üzerinden kurulan kırpma uyarısı da "İlk 0 kayıt gösteriliyor (toplam N)"
   * diye YANLIŞ bir cümle basardı (yerel kadrajda ölçüldü).
   *
   * Varsayılan `true` — mevcut çağıranların davranışı DEĞİŞMEZ.
   */
  enabled?: boolean;
}

/**
 * 🔴 `draft` deftere GİRMEZ, `reversed` GİRER — süzme SUNUCUDADIR
 * (`POSTING_STATUSES`). İstemci ikinci bir süzgeç KOŞMAZ; koşsaydı
 * sayfalanan kümenin dışındaki satırlar sessizce kaybolurdu.
 *
 * 🔴 Yanıtın `carried_balance` alanı pencere ÖNCESİ toplamdır ve
 * `running_balance` zaten onun ÜSTÜNE kurulur — istemci koşan bakiyeyi
 * YENİDEN HESAPLAMAZ.
 */
export function useLedger(filter: LedgerFilter): UseQueryResult<LedgerResponse, Error> {
  return useQuery({
    queryKey: [
      LEDGER_QUERY_KEY,
      filter.year,
      filter.month,
      filter.accountId ?? null,
      filter.status ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    enabled: filter.enabled ?? true,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/journal", {
          params: {
            query: {
              year: filter.year,
              month: filter.month,
              ...(filter.accountId ? { account_id: filter.accountId } : {}),
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
