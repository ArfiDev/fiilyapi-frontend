import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-BOR T2 · `/bordro` (Aylık Bordro) ekranının İKİ okuma ucu. Yorumlardaki
 * sayılar `Bordro Yönetimi.dc.html` ("BY") dosyasının SATIR numaralarıdır.
 *
 * Tipler `pnpm gen:api` çıktısından TAKMA AD olarak alınır (`useLeaves.ts`
 * kanonu) — elle arayüz yazmak YASAK.
 *
 * 🔴 İki istek ZORUNLUDUR ve bu bilinçlidir: BY:50-54 ay gezgini dönemler
 * ARASINDA dolaşır (liste ucu), BY:61-330 ise TEK dönemin detayıdır. Detay
 * ucu `year`/`month` sorgu parametresi ALMAZ — yalnız `period_id` ile
 * çağrılır; bu yüzden gezginin adımladığı dizin liste ucundan gelir.
 */
export type PayrollPeriodListResponse = components["schemas"]["PayrollPeriodListResponse"];
export type PayrollPeriodListRow = components["schemas"]["PayrollPeriodListRow"];
export type PayrollPeriodDetailResponse =
  components["schemas"]["PayrollPeriodDetailResponse"];
export type PayrollSectionResponse = components["schemas"]["PayrollSectionResponse"];
export type PayrollLineResponse = components["schemas"]["PayrollLineResponse"];
export type PayrollSummaryResponse = DeepScale<components["schemas"]["PayrollSummaryResponse"]>;
export type PayrollLineStatus = components["schemas"]["PayrollLineStatus"];
export type PayrollPeriodStatus = components["schemas"]["PayrollPeriodStatus"];
export type WorkerSource = components["schemas"]["WorkerSource"];

export const PAYROLL_PERIODS_QUERY_KEY = "payroll-periods";
export const PAYROLL_PERIOD_QUERY_KEY = "payroll-period";

/** İzin matrisi modül anahtarı — backend kapısı `payroll:view` / `payroll:full`. */
export const PAYROLL_PERMISSION_MODULE = "payroll";

/**
 * 🔴 Ay gezgini (BY:50-54) SUNUCUDA bir `year`/`month` parametresine
 * DAYANMAZ: `GET /payroll/periods` yalnız `limit`/`offset` alır. Uydurma
 * parametre göndermek yerine CÖMERT bir `limit` ile çekilir ve adımlama
 * istemcide yapılır (F-BOR briefi K6 ile aynı karar).
 *
 * 🔴🔴 **TAVAN ÜRÜNÜN DEĞİL, SÖZLEŞMENİN KARARIDIR.** Burası eskiden `240`
 * yazıyordu ("20 yıllık ay" gerekçesiyle) ve bu, MODÜLÜ CANLIDA TAMAMEN
 * ÇALIŞMAZ HÂLE GETİRİYORDU: `GET /payroll/periods` `limit` tavanı **200**dür
 * (TB3 sayfalama standardı, `payroll/router.py`) ve backend aşımı *sessizce
 * KIRPMAZ, 422 döner*. Kullanıcının gördüğü hata birebir şuydu:
 * `Input should be less than or equal to 200`. Üç bordro ekranı da bu tek
 * hook'a bağlı olduğu için hepsi birden ölüyordu — kenar durum DEĞİL.
 *
 * Değer bir ürün tercihi olarak SEÇİLMEZ; sözleşmenin tavanına eşitlenir ve
 * `query-limits.contract.test.ts` bunu `openapi.json`ı OKUYARAK bekçiler.
 * (Sabiti tekrar yazan bir test hiçbir şey bekçilemezdi.)
 *
 * 200 ay ≈ 16,6 yıl. Gerçek bir kurulumda dönem sayısı bunun çok altında
 * kalır; yine de aşılırsa kırpılma `buildListTruncation` ile GÖRÜNÜR kılınır
 * (çağıran ekranın işi, `bordro-truncation`), sessizce yutulmaz.
 */
export const PAYROLL_PERIODS_LIMIT = 200;

export function usePayrollPeriods(): UseQueryResult<PayrollPeriodListResponse, Error> {
  return useQuery({
    queryKey: [PAYROLL_PERIODS_QUERY_KEY, PAYROLL_PERIODS_LIMIT],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/payroll/periods", {
          params: { query: { limit: PAYROLL_PERIODS_LIMIT } },
        }),
      ),
  });
}

/**
 * `GET /payroll/periods/{id}` — BY:61-330'un TEK veri kaynağı: uyarı bandı,
 * dört KPI kartı (BY:67-93), tip sekmelerinin sayıları (BY:97-103) ve gruplu
 * tablo (BY:106-307) hepsi bu yanıttan türer.
 *
 * `periodId` `undefined` iken sorgu KOŞMAZ (`enabled`): dönem listesi henüz
 * gelmemişken ya da hiç dönem yokken boş bir yola istek atmak 404 üretirdi ve
 * ekran "hata" derdi — oysa doğru cevap "dönem yok" boş durumudur (K3).
 */
export function usePayrollPeriod(
  periodId: string | undefined,
): UseQueryResult<PayrollPeriodDetailResponse, Error> {
  return useQuery({
    queryKey: [PAYROLL_PERIOD_QUERY_KEY, periodId],
    enabled: periodId !== undefined,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/payroll/periods/{period_id}", {
          // `enabled` sayesinde buraya yalnız tanımlı kimlikle gelinir.
          params: { path: { period_id: periodId as string } },
        }),
      ),
  });
}
