import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";

import { invalidateAccountingScope } from "./accounting-invalidate";
import { type JournalEntryDetailResponse } from "./useJournalEntries";

// F-MU1 T2 · Taslak Fişler panelinin YAZMA uçları.
//
// 🔴 Ortak geçersizleştirme kapsamı `accounting-invalidate.ts`e TAŞINDI (T3):
// hesap mutasyonları da aynı dört okumayı bayatlatır, formül iki yerde yaşamaz.

/**
 * `POST /journal-entries/{id}/post` — `draft → posted`, fişi MALİ İZE sokar.
 *
 * Fiş KİMLİĞİ hook parametresi DEĞİL, mutation DEĞİŞKENİDİR: panel satır
 * başına hook AÇAMAZ (Rules of Hooks) ama her satırın kendi fişini
 * kayıtlaştırması gerekir (`useInvoiceAction` deseni).
 *
 * 🔴 İstemci K1 kapısını (Σ borç = Σ alacak · en az iki satır · yalnız yaprak
 * hesap) KOPYALAMAZ — tek sahibi sunucudur; hata YUTULMAZ, Türkçe `detail`
 * metni ekrana basılır.
 */
export function usePostJournalEntry(): UseMutationResult<
  JournalEntryDetailResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId) =>
      unwrap(
        await backendClient.POST("/journal-entries/{entry_id}/post", {
          params: { path: { entry_id: entryId } },
        }),
      ),
    onSuccess: () => invalidateAccountingScope(queryClient),
  });
}

/**
 * `POST /journal-entries/{id}/reverse` — `posted → reversed` + YENİ bir storno
 * fişi (**201**). Yanıt STORNONUN detayıdır, orijinalin değil.
 *
 * 🔴 K3: orijinal `reversed` olur ama defterden ÇIKMAZ — ikisi birlikte
 * bakiyeyi tam sıfıra götürür. Bu yüzden defter de tazelenir.
 */
export function useReverseJournalEntry(): UseMutationResult<
  JournalEntryDetailResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId) =>
      unwrap(
        await backendClient.POST("/journal-entries/{entry_id}/reverse", {
          params: { path: { entry_id: entryId } },
        }),
      ),
    onSuccess: () => invalidateAccountingScope(queryClient),
  });
}
