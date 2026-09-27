import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import {
  FINANCIAL_INSTRUMENTS_QUERY_KEY,
  FINANCIAL_INSTRUMENT_SUMMARY_QUERY_KEY,
  type FinancialInstrumentResponse,
} from "./useFinancialInstruments";
import type { DeepScale } from "@/lib/api/scale";

export type FinancialInstrumentCreate = DeepScale<components["schemas"]["FinancialInstrumentCreate"]>;

/**
 * F-CEK · `POST /financial-instruments` — E10:65 **+ Çek Ekle**.
 *
 * 🔴 Modülün TEK yazma ucudur ve bugüne kadar hiç çağrılmıyordu: düğme
 * mockup'ta çizilmişti ama formu ÇİZİLMEMİŞTİ, bu yüzden devre dışı
 * basılıyordu (`FinancialInstrumentsView` eski yorumu). Form geldi
 * (`projedesign/Form - Cek Ekle.dc.html`), düğme açıldı.
 *
 * 🔴 İKİ sorgu birden tazelenir: LİSTE ve ÖZET KARTLARI. Yalnız listeyi
 * tazelemek dört kartı (portföy adedi/tutarı) BAYAT bırakırdı — yeni kayıt
 * `portfolio` doğar ve birinci kartın sayacına ANINDA girer.
 */
export function useCreateFinancialInstrument(): UseMutationResult<
  FinancialInstrumentResponse,
  Error,
  FinancialInstrumentCreate
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(await backendClient.POST("/financial-instruments", { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FINANCIAL_INSTRUMENTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [FINANCIAL_INSTRUMENT_SUMMARY_QUERY_KEY] });
    },
  });
}
