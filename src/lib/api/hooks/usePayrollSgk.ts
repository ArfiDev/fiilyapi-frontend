import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { PAYROLL_PERIOD_QUERY_KEY, PAYROLL_PERIODS_QUERY_KEY } from "./usePayroll";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-BOR T4 · `/bordro/sgk` (SGK Bildirimi) ekranının İKİ ucu. Yorumlardaki
 * sayılar `SGK Bildirimi.dc.html` ("SGK") dosyasının SATIR numaralarıdır.
 *
 * Tipler `pnpm gen:api` çıktısından TAKMA AD olarak alınır (`usePayroll.ts`
 * kanonu) — elle arayüz yazmak YASAK.
 *
 * 🔴 Dosya AYRIDIR (T2'nin `usePayroll.ts`/`usePayrollMutations.ts` dosyalarına
 * eklenmedi): bu iki uç YALNIZ SGK ekranının işidir ve o iki dosyanın
 * başlıkları kendilerini açıkça `/bordro` ekranına bağlar.
 */
export type PayrollSgkSummaryResponse = DeepScale<components["schemas"]["PayrollSgkSummaryResponse"]>;
export type PayrollSgkSubmitResult = components["schemas"]["PayrollSgkSubmitResult"];

export const PAYROLL_SGK_SUMMARY_QUERY_KEY = "payroll-sgk-summary";

/**
 * `GET /payroll/periods/{id}/sgk-summary` — SGK:54-93'ün TEK veri kaynağı:
 * dört KPI kartı, iki sütunlu prim tablosu, ödenecek prim kutusu ve iki
 * fail-closed sayaç hepsi bu yanıttan türer.
 *
 * `periodId` `undefined` iken sorgu KOŞMAZ (`enabled`): dönem listesi henüz
 * gelmemişken ya da hiç dönem yokken boş bir yola istek atmak 404 üretirdi ve
 * ekran "hata" derdi — oysa doğru cevap "dönem yok" boş durumudur (K3).
 */
export function usePayrollSgkSummary(
  periodId: string | undefined,
): UseQueryResult<PayrollSgkSummaryResponse, Error> {
  return useQuery({
    queryKey: [PAYROLL_SGK_SUMMARY_QUERY_KEY, periodId],
    enabled: periodId !== undefined,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/payroll/periods/{period_id}/sgk-summary", {
          // `enabled` sayesinde buraya yalnız tanımlı kimlikle gelinir.
          params: { path: { period_id: periodId as string } },
        }),
      ),
  });
}

/**
 * `POST /payroll/periods/{id}/sgk-submit` — 🔴 **SGK:50 "SGK'ya Gönder"**.
 *
 * 🔴 Bu uç DIŞ SİSTEME HİÇBİR ŞEY GÖNDERMEZ: şema açıklaması birebir
 * "Dış sistem entegrasyonu YOKTUR. Bu uç hiçbir yere istek atmaz." der —
 * yanıt bir "gönderim sonucu" değil, DAMGANIN ZAMANIDIR. Ekran metni bu
 * yüzden dosya/kuyruk/entegrasyon İMA ETMEZ.
 *
 * 🔴 İdempotent DEĞİLDİR (ikinci damga 409) ⇒ tek-uçuş şart: çağıran ekran
 * `isPending` boyunca düğmeyi kilitler (K7).
 *
 * Damga dönem DETAYINDA da görünür (`PayrollPeriodDetailResponse.
 * sgk_submitted_at`), bu yüzden üç sorgu birden tazelenir — yalnız SGK
 * özetini tazelemek kardeş ekranı bayat bırakırdı.
 */
export function useSubmitPayrollSgk(): UseMutationResult<
  PayrollSgkSubmitResult,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (periodId) =>
      unwrap(
        await backendClient.POST("/payroll/periods/{period_id}/sgk-submit", {
          params: { path: { period_id: periodId } },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PAYROLL_SGK_SUMMARY_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [PAYROLL_PERIOD_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [PAYROLL_PERIODS_QUERY_KEY] });
    },
  });
}
