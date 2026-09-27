import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import { CUSTOMERS_QUERY_KEY, type CustomerResponse } from "./useCustomers";
import type { DeepScale } from "@/lib/api/scale";

// F-P8 T1 · Satış ekranlarının müşteri YAZMA yüzeyi — bu dilimde TEK mutasyon
// vardır: DS formundaki "yeni müşteri" (`POST /customers`).
//
// ⚠️ KALICI SINIR (P8 backend kararı + spec §2): müşteri DELETE ucu HİÇ YOKTUR
// (backend'de de yok). `PATCH /customers/{id}` uç olarak vardır ama bu dilimde
// EKRANA BAĞLANMAZ — müşteri düzenleme yüzeyi mockup'ta çizilmemiştir. Buraya
// bir güncelleme/silme hook'u eklemek = review bulgusu.
export type CustomerCreate = DeepScale<components["schemas"]["CustomerCreate"]>;

/**
 * Yeni müşteri (`POST /customers`, DS mockup'ındaki "yeni müşteri" akışı).
 *
 * Gövdenin ZORUNLU alanları yalnız `customer_type` + `name`tir; TCKN/VKN,
 * telefon, e-posta ve adres opsiyoneldir (openapi `CustomerCreate.required`).
 * Doğrulama sunucudadır — istemci `person` ⇄ `company` için TCKN/VKN
 * zorunluluğu UYDURMAZ.
 *
 * Hata YUTULMAZ: `BackendError` çağırana aynen iletilir.
 */
export function useCreateCustomer(): UseMutationResult<CustomerResponse, Error, CustomerCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/customers", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CUSTOMERS_QUERY_KEY] }),
  });
}
