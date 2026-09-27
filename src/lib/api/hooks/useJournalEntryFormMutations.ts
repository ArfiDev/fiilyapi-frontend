import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { invalidateAccountingScope } from "./accounting-invalidate";
import { type JournalEntryDetailResponse } from "./useJournalEntries";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-MU1 T4 · Yevmiye fişi FORM uçları (oluştur · başlık düzelt · satırları
 * toptan yaz).
 *
 * 🔴 Durum GEÇİŞLERİ (`post`/`reverse`/`delete`) kardeş dosyada
 * (`useJournalEntryMutations`) kalır: orası bir fişin YAŞAM DÖNGÜSÜdür, burası
 * içeriğidir. Aynı dosyaya konsaydı, geçişleri mock'layan mevcut ekran testleri
 * form uçlarını da sessizce mock'lar ve gerçek çağrı yolu test edilmemiş
 * kalırdı.
 *
 * 🔴 Geçersizleştirme İKİNCİ KEZ yazılmaz: üçü de
 * `invalidateAccountingScope`u koşar (defter · KPI · fiş listesi · hesap planı).
 */

export type JournalEntryCreate = DeepScale<components["schemas"]["JournalEntryCreate"]>;
export type JournalEntryUpdate = DeepScale<components["schemas"]["JournalEntryUpdate"]>;
export type JournalLineInput = DeepScale<components["schemas"]["JournalLineInput"]>;

/** `PATCH`/`PUT` iki parça ister; mutation TEK değişken alır, ikisi bir zarfta gider. */
export interface JournalEntryUpdateVariables {
  readonly entryId: string;
  readonly body: JournalEntryUpdate;
}

export interface JournalLinesReplaceVariables {
  readonly entryId: string;
  readonly lines: readonly JournalLineInput[];
}

/**
 * `POST /journal-entries` — **201**, fiş `draft` doğar.
 *
 * 🔴 İstemci K1 kapısını (Σ borç = Σ alacak · en az iki satır · yalnız yaprak
 * hesap) SAHİPLENMEZ; diyalog kapıyı kullanıcıya ÖNCEDEN göstermek için tekrar
 * eder, ama sunucunun 422'si yine ekrana basılır — istemci doğrulaması
 * sunucununkinin YERİNE geçmez.
 */
export function useCreateJournalEntry(): UseMutationResult<
  JournalEntryDetailResponse,
  Error,
  JournalEntryCreate
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/journal-entries", { body })),
    onSuccess: () => invalidateAccountingScope(queryClient),
  });
}

/**
 * `PATCH /journal-entries/{id}` — KISMİ gövde, **yalnız `draft`** (aksi 409).
 *
 * Satır kümesi buradan DEĞİŞMEZ (şema notu): toplamlar ancak kümenin TAMAMI
 * bilinirken tutarlı yazılabilir, o yüzden satırların tek yolu `PUT …/lines`tir.
 */
export function useUpdateJournalEntry(): UseMutationResult<
  JournalEntryDetailResponse,
  Error,
  JournalEntryUpdateVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, body }) =>
      unwrap(
        await backendClient.PATCH("/journal-entries/{entry_id}", {
          params: { path: { entry_id: entryId } },
          body,
        }),
      ),
    onSuccess: () => invalidateAccountingScope(queryClient),
  });
}

/**
 * `PUT /journal-entries/{id}/lines` — kümeyi **TOPTAN** yazar.
 *
 * 🔴 Kısmi satır güncellemesi YOKTUR: `sort_order` dizinin indeksidir ve başlık
 * toplamları aynı kümeden yeniden yazılır. Boş küme "en az iki satır" engeline
 * takılır ve **422** döner (silme yolu değildir).
 */
export function useReplaceJournalLines(): UseMutationResult<
  JournalEntryDetailResponse,
  Error,
  JournalLinesReplaceVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, lines }) =>
      unwrap(
        await backendClient.PUT("/journal-entries/{entry_id}/lines", {
          params: { path: { entry_id: entryId } },
          body: { lines: [...lines] },
        }),
      ),
    onSuccess: () => invalidateAccountingScope(queryClient),
  });
}
