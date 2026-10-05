import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

import { INVOICES_QUERY_KEY, INVOICE_SUMMARY_QUERY_KEY } from "./useInvoices";
import {
  INVOICE_DETAIL_QUERY_KEY,
  INVOICE_PAYMENTS_QUERY_KEY,
  type InvoiceDetailResponse,
  type PaymentResponse,
} from "./useInvoiceDetail";

export type InvoiceCreateRequest = DeepScale<components["schemas"]["InvoiceCreate"]>;
export type InvoiceLineCreate = DeepScale<components["schemas"]["InvoiceLineCreate"]>;
export type PaymentCreateRequest = DeepScale<components["schemas"]["PaymentCreate"]>;

/** Durum damgalayan dört ucun ortak adı — `useInvoiceAction` bunu alır. */
export type InvoiceActionKind = "send" | "approve" | "dispute" | "mark-collected";

/**
 * Fatura KİMLİĞİ hook parametresi DEĞİL, mutation değişkenidir: liste ekranı
 * satır başına ayrı hook AÇAMAZ (Rules of Hooks) ama her satırın kendi
 * faturasını onaylaması gerekir.
 */
export interface InvoiceActionVars {
  invoiceId: string;
  action: InvoiceActionKind;
}

/** Liste + KPI + detay: bir faturayı oynatan her yazma bu üçünü tazeler. */
function invalidateInvoiceScope(
  queryClient: ReturnType<typeof useQueryClient>,
  invoiceId?: string,
): void {
  queryClient.invalidateQueries({ queryKey: [INVOICES_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: [INVOICE_SUMMARY_QUERY_KEY] });
  if (invoiceId !== undefined) {
    queryClient.invalidateQueries({ queryKey: [INVOICE_DETAIL_QUERY_KEY, invoiceId] });
  }
}

/**
 * `POST /invoices` — FK formunun kaydı: başlık + kalemler TEK gövde, ATOMİK.
 *
 * 🔴 Gövde `status`, `line_total`, `sort_order` ve HESAPLANMIŞ para alanlarını
 * TAŞIYAMAZ (422); oranlar (`advance_rate`/`retention_rate`/`withholding_rate`)
 * taşır. Hook gövdeyi sessizce DÜZELTMEZ — hata çağırana ulaşır ve form Türkçe
 * `detail` metnini basar (`useCreateEquipment` deseni).
 */
export function useCreateInvoice(): UseMutationResult<
  InvoiceDetailResponse,
  Error,
  InvoiceCreateRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/invoices", { body })),
    onSuccess: (created) => invalidateInvoiceScope(queryClient, created.id),
  });
}

/**
 * Durum damgalayan dört uç TEK hook'ta toplandı: gövdeleri YOKTUR, yanıtları
 * aynı şemadır ve hepsi aynı geçersizleştirmeyi ister. Dördü ayrı yazılsaydı
 * aynı `invalidate` bloğu dört kez kopyalanırdı.
 *
 * Yön dışı çağrı (giden faturaya `approve`) sunucuda **409**'dur; ekran
 * düğmeyi zaten yöne göre basar, ama hook bunu ikinci kez doğrulamaz —
 * matrisin tek sahibi sunucudur.
 */
export function useInvoiceAction(): UseMutationResult<
  InvoiceDetailResponse,
  Error,
  InvoiceActionVars
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, action }) => {
      const params = { path: { invoice_id: invoiceId } } as const;
      if (action === "send") {
        return unwrap(await backendClient.POST("/invoices/{invoice_id}/send", { params }));
      }
      if (action === "approve") {
        return unwrap(await backendClient.POST("/invoices/{invoice_id}/approve", { params }));
      }
      if (action === "dispute") {
        return unwrap(await backendClient.POST("/invoices/{invoice_id}/dispute", { params }));
      }
      return unwrap(
        await backendClient.POST("/invoices/{invoice_id}/mark-collected", { params }),
      );
    },
    onSuccess: (_data, { invoiceId }) => invalidateInvoiceScope(queryClient, invoiceId),
  });
}

/**
 * `POST /invoices/{id}/payments` — FGI:220-247 tahsilat formu (K4: tahsilat DA
 * ödeme DE aynı uçtur, yön faturadan okunur ve gövdeye YAZILMAZ).
 *
 * 🔴 K6: `Σ payments + yeni > total` → **422**. İstemci bu kapıyı KOPYALAMAZ
 * (sunucu kuruş bazında karşılaştırır); form yalnız sunucunun metnini basar.
 * Başarıda fatura DURUMU da değişebilir (`sent → collected`, K5) — bu yüzden
 * detay + liste + KPI birlikte tazelenir.
 */
export function useCreateInvoicePayment(
  invoiceId: string,
): UseMutationResult<PaymentResponse, Error, PaymentCreateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/invoices/{invoice_id}/payments", {
          params: { path: { invoice_id: invoiceId } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INVOICE_PAYMENTS_QUERY_KEY, invoiceId] });
      invalidateInvoiceScope(queryClient, invoiceId);
    },
  });
}
