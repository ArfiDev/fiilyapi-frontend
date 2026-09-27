import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { SUPPLIERS_QUERY_KEY } from "./useSuppliers";
import type { DeepScale } from "@/lib/api/scale";

// F-SA T1 · Tedarikçi yazma uçları — TED "+ Tedarikçi Ekle" türetilmiş
// minimal diyaloğu (spec K5, ONAYLI SAPMA) ve kart üzerinden pasifleştirme.
// `useSubcontractorMutations` / `useEmployerMutations` deseni.
//
// ⚠️ `DELETE /suppliers/{id}` UCU YOKTUR (SA kararı: tedarikçi mali ize
// bağlıdır, silinmez — pasifleştirilir). Kart üzerinde "Sil" basılmaz;
// buraya bir silme hook'u eklemek = review bulgusu.
export type SupplierCreate = DeepScale<components["schemas"]["SupplierCreate"]>;
export type SupplierUpdate = DeepScale<components["schemas"]["SupplierUpdate"]>;
export type SupplierResponse = DeepScale<components["schemas"]["SupplierResponse"]>;

/**
 * `POST /suppliers` — zorunlu alanlar `name` ve `payment_terms`tır
 * (`payment_terms` KAPALI kümedir: `cash` · `days_15` · `days_30` ·
 * `days_60`). `is_active` şemada varsayılanlıdır ama üretilmiş tipte ZORUNLU
 * görünür (F-ST'de ısıran "üretilmiş tip tuzağı") → gövde kurulurken AÇIKÇA
 * verilir.
 */
export function useCreateSupplier(): UseMutationResult<SupplierResponse, Error, SupplierCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/suppliers", { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUPPLIERS_QUERY_KEY] });
    },
  });
}

/**
 * `PATCH /suppliers/{supplier_id}` — KISMİ günceller.
 *
 * ⚠️ F-PT2 kararı 5 emsali: gövdeye YALNIZ kullanıcının gerçekten değiştirdiği
 * anahtarlar konur. Değişmeyen bir alanı "güvenli olsun" diye mevcut değeriyle
 * göndermek de, değişeni atlamak da veri yalanı üretir — ikisi de yasak.
 */
export function useUpdateSupplier(
  supplierId: string,
): UseMutationResult<SupplierResponse, Error, SupplierUpdate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/suppliers/{supplier_id}", {
          params: { path: { supplier_id: supplierId } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUPPLIERS_QUERY_KEY] });
    },
  });
}
