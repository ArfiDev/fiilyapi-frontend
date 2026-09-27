import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import {
  PAYROLL_PERIOD_QUERY_KEY,
  PAYROLL_PERIODS_QUERY_KEY,
  type PayrollLineResponse,
} from "./usePayroll";
import { PAYROLL_SGK_SUMMARY_QUERY_KEY } from "./usePayrollSgk";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-BOR T2 · `/bordro` ekranının ÜÇ yazma ucu (BY:56 · BY:142-147 · BY:303).
 *
 * 🔴 Üçü de AYNI ÜÇ sorguyu tazeler: dönem DETAYI (satırlar + özet kartları),
 * dönem LİSTESİ (ay gezgininin durum bilgisi) ve SGK ÖZETİ. Yalnız detayı
 * tazelemek gezginin durum etiketini bayat bırakırdı — onay/ödeme dönemin
 * `status`unu oynatır ve o alan liste satırında da vardır. SGK özeti
 * (`usePayrollSgk.ts::usePayrollSgkSummary`) `compute`/`approve`/`pay`in
 * ÜRETTİĞİ satırlardan türer (dört KPI kartı + prim tablosu); bu üçü onu
 * tazelemezse SGK ekranı yeniden mount edilene kadar ESKİ primleri gösterir
 * (kayıt no 158 — `useSubmitPayrollSgk` zaten üçünü BİRDEN tazeliyordu, bu
 * asimetriyi kapatır).
 */
export type PayrollLineUpdate = DeepScale<components["schemas"]["PayrollLineUpdate"]>;
export type PayrollPeriodApproveResult =
  DeepScale<components["schemas"]["PayrollPeriodApproveResult"]>;
export type PayrollPeriodPayResult = DeepScale<components["schemas"]["PayrollPeriodPayResult"]>;
export type PayrollPeriodCreate = DeepScale<components["schemas"]["PayrollPeriodCreate"]>;
export type PayrollPeriodDetailResponse =
  DeepScale<components["schemas"]["PayrollPeriodDetailResponse"]>;
export type PayrollComputeResult = DeepScale<components["schemas"]["PayrollComputeResult"]>;

function usePayrollInvalidator(): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [PAYROLL_PERIOD_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [PAYROLL_PERIODS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [PAYROLL_SGK_SUMMARY_QUERY_KEY] });
  };
}

/**
 * F-BORDRO T2 · `POST /payroll/periods` — **DÖNEM AÇ**.
 *
 * 🔴 Modülün BAŞLANGIÇ ucudur ve bugüne kadar hiç çağrılmıyordu: canlıda
 * `payroll_periods` tablosuna satır basan bir migration YOKTUR (bilinçli —
 * dönemi kullanıcı açar), ama kullanıcının açacağı yüzey çizilmemişti. Üç
 * bordro ekranı bu yüzden kalıcı olarak boş kalıyordu.
 *
 * 🔴 Ay AÇAR, DOLDURMAZ: dönüş 0 satırlıdır ve satırları `compute` üretir
 * (`useComputePayrollPeriod`). Gövde `status` ALMAZ — yeni dönem her zaman
 * `draft`tır, aksi hâlde istemci bir ayı doğrudan `paid` açıp onay zincirini
 * atlardı (`extra="forbid"`).
 *
 * Var olan ay **409**dur (UQ `(year, month)`); mesaj kullanıcıya BASILIR.
 */
export function useCreatePayrollPeriod(): UseMutationResult<
  PayrollPeriodDetailResponse,
  Error,
  PayrollPeriodCreate
> {
  const invalidate = usePayrollInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(await backendClient.POST("/payroll/periods", { body })),
    onSuccess: invalidate,
  });
}

/**
 * F-BORDRO T3 · `POST /payroll/periods/{id}/compute` — **HESAPLA**.
 *
 * 🔴 Dönemi puantaj + ücret + oranlardan DOLDURUR. Açılmış ama hesaplanmamış
 * bir dönem satırsızdır; bu uç olmadan modül açıldığı yerde donup kalıyordu.
 *
 * 🔴 Durum kapısı ÖLÇÜLDÜ (`service.py:73` `LOCKED_PERIOD_STATUSES`):
 * `draft`/`pending_approval` hesaplanır, `approved`/`paid` **409** döner.
 * Kapı `computeDisabledReason`da yaşar; 409 yine de sessizce YUTULMAZ
 * (yarış: dönem başka bir kullanıcı tarafından bu arada onaylanmış olabilir).
 *
 * Yanıttaki üç koruma sayacı (`skipped_overridden` — elle düzeltilmiş S6 ·
 * `skipped_approved` — onaylı/ödenmiş S5) ve K4 uyarısı
 * (`missing_prior_period_count`) ekranda GÖSTERİLİR.
 */
export function useComputePayrollPeriod(): UseMutationResult<
  PayrollComputeResult,
  Error,
  string
> {
  const invalidate = usePayrollInvalidator();
  return useMutation({
    mutationFn: async (periodId) =>
      unwrap(
        await backendClient.POST("/payroll/periods/{period_id}/compute", {
          params: { path: { period_id: periodId } },
        }),
      ),
    onSuccess: invalidate,
  });
}

export interface PayrollLineSplitInput {
  lineId: string;
  /** Banka payı — ham metin DEĞİL, ekranda ayrıştırılmış değer. */
  bankAmount: string;
  cashAmount: string;
}

/**
 * `PATCH /payroll/lines/{id}` — BY:142-147'deki iki `input`.
 *
 * 🔴 `bank_amount` ve `cash_amount` HER ZAMAN BİRLİKTE gönderilir (şema
 * açıklaması: "İkisi birlikte gönderilir"). Yalnız biri gönderilip öteki
 * sunucuya tamamlatılsaydı bölüşüm bir DOĞRULAMA değil bir HESAP olurdu ve
 * "gerisi elden mi, yoksa yanlış mı yazdım?" ayrımı kaybolurdu.
 *
 * 🔴 `gross_amount` (brüt override) BU EKRANDA GÖNDERİLMEZ: BY tablosunda
 * Brüt sütunu düz metindir (BY:139), `input` DEĞİLDİR. Alanı gövdeye eklemek
 * mockup'ta olmayan bir yazma yüzeyini icat etmek olurdu.
 */
export function useUpdatePayrollLineSplit(): UseMutationResult<
  PayrollLineResponse,
  Error,
  PayrollLineSplitInput
> {
  const invalidate = usePayrollInvalidator();
  return useMutation({
    mutationFn: async ({ lineId, bankAmount, cashAmount }) =>
      unwrap(
        await backendClient.PATCH("/payroll/lines/{line_id}", {
          params: { path: { line_id: lineId } },
          body: { bank_amount: bankAmount, cash_amount: cashAmount },
        }),
      ),
    onSuccess: invalidate,
  });
}

/**
 * `POST /payroll/periods/{id}/approve` — 🔴 **BY:303 "Tümünü Onayla"**.
 * Şema açıklaması bu ucu ADIYLA o düğmeye bağlar ("BY 303 'Tümünü Onayla'").
 * Dönemi TEK ADIM ilerletir (`draft → pending_approval → approved`); üçüncü
 * çağrı 409'dur.
 *
 * Yanıttaki ÜÇ atlama sayacı (`skipped_uncomputed` / `skipped_excluded` /
 * `skipped_already_approved`) ekranda GÖSTERİLİR — sessiz atlama yoktur.
 */
export function useApprovePayrollPeriod(): UseMutationResult<
  PayrollPeriodApproveResult,
  Error,
  string
> {
  const invalidate = usePayrollInvalidator();
  return useMutation({
    mutationFn: async (periodId) =>
      unwrap(
        await backendClient.POST("/payroll/periods/{period_id}/approve", {
          params: { path: { period_id: periodId } },
        }),
      ),
    onSuccess: invalidate,
  });
}

/**
 * `POST /payroll/periods/{id}/pay` — 🔴 **BY:56 "Ödemeyi Onayla"**.
 *
 * KARAR (iki düğme, iki uç): şema `approve`u açıkça BY:303'e bağlıyor, geriye
 * BY:56 için `pay` kalıyor ve anlam da örtüşüyor — `pay` yalnız dönem
 * `approved` iken çalışır (aksi 409), yani başlıktaki YEŞİL düğme onay
 * zincirinin SON adımıdır: "ödemeyi onayla" = ödendi damgasını bas.
 * REDDEDİLEN alternatif: ikisini de `approve`a bağlamak — o zaman ekranda
 * `pay` ucunun HİÇBİR yüzeyi kalmaz ve dönem asla `paid` olamazdı.
 *
 * 🔴 İdempotent DEĞİLDİR (ikinci çağrı 409 = ikinci ödeme) ⇒ tek-uçuş şart.
 * Üç atlama sayacı (`skipped_unapproved` / `skipped_uncomputed` /
 * `skipped_excluded`) ekranda GÖSTERİLİR.
 */
export function usePayPayrollPeriod(): UseMutationResult<
  PayrollPeriodPayResult,
  Error,
  string
> {
  const invalidate = usePayrollInvalidator();
  return useMutation({
    mutationFn: async (periodId) =>
      unwrap(
        await backendClient.POST("/payroll/periods/{period_id}/pay", {
          params: { path: { period_id: periodId } },
        }),
      ),
    onSuccess: invalidate,
  });
}
