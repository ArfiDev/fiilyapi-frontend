import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { invalidateAccountingScope } from "./accounting-invalidate";
import type { ChartAccountResponse } from "./useChartOfAccounts";
import type { DeepScale } from "@/lib/api/scale";

export type ChartAccountCreate = DeepScale<components["schemas"]["ChartAccountCreate"]>;
export type ChartAccountUpdate = DeepScale<components["schemas"]["ChartAccountUpdate"]>;

/** `PATCH` iki parça ister; mutation TEK değişken alır, ikisi bir zarfta gider. */
export interface ChartAccountUpdateVariables {
  readonly accountId: string;
  readonly body: ChartAccountUpdate;
}

/**
 * F-MU1 T3 · Hesap Planı (HP) YAZMA uçları.
 *
 * 🔴 İstemci sunucunun kapılarını KOPYALAMAZ: kod biçimi (`K4` deseni), kod
 * değişim kilidi (409, fiş satırı olan hesapta), silme kapısı (yalnız `admin`,
 * bağlı satırda 409) tek sahibi SUNUCUdur. Hata YUTULMAZ — Türkçe `detail`
 * metni ekrana basılır (`backendErrorMessage`).
 */

/** `POST /chart-of-accounts` — HP:50 `+ Hesap Ekle`. Gövde T4'ün diyaloğundan gelir. */
export function useCreateChartAccount(): UseMutationResult<
  ChartAccountResponse,
  Error,
  ChartAccountCreate
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(await backendClient.POST("/chart-of-accounts", { body })),
    onSuccess: () => invalidateAccountingScope(queryClient),
  });
}

/**
 * `PATCH /chart-of-accounts/{id}` — KISMİ gövde.
 *
 * 🔴 Satırın BİRİNCİL eylemi budur, silme DEĞİL (yönetim kararı 3): kullanımdan
 * kaldırma yolu `{"is_active": false}`tır. Silme yalnız `admin` yüzeyindedir ve
 * bağlı fiş satırı varsa 409 döner.
 */
export function useUpdateChartAccount(): UseMutationResult<
  ChartAccountResponse,
  Error,
  ChartAccountUpdateVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, body }) =>
      unwrap(
        await backendClient.PATCH("/chart-of-accounts/{account_id}", {
          params: { path: { account_id: accountId } },
          body,
        }),
      ),
    onSuccess: () => invalidateAccountingScope(queryClient),
  });
}

/**
 * `DELETE /chart-of-accounts/{id}` — **204**, gövdesiz.
 *
 * 🔴 `full` seviyeli muhasebeci 403 alır (uç `admin` kapısındadır) — bu yüzden
 * düğme `canDelete` ile korunur; ekran yine de 409/403'ü zarifçe basar (kapıyı
 * istemcide ikinci kez KURMAK yerine sunucunun cevabını göstermek doğrudur).
 */
export function useDeleteChartAccount(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId) => {
      unwrap(
        await backendClient.DELETE("/chart-of-accounts/{account_id}", {
          params: { path: { account_id: accountId } },
        }),
      );
    },
    onSuccess: () => invalidateAccountingScope(queryClient),
  });
}
